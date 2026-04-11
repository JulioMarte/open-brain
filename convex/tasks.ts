import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { getCurrentUser, isAdmin, getCurrentUserFromAgentToken } from "./lib/auth";
import { QueryCtx } from "./_generated/server";

type TaskDoc = Doc<"tasks">;

async function paginatedTake(
  ctx: QueryCtx,
  q: unknown,
  limit: number
): Promise<{ items: TaskDoc[]; cursor: string | null }> {
  const items = await (q as { take: (n: number) => Promise<TaskDoc[]> }).take(limit);
  return {
    items,
    cursor: items.length === limit ? items[items.length - 1]._id : null,
  };
}

async function getUser(ctx: QueryCtx, agentToken?: string) {
  if (agentToken) {
    const result = await getCurrentUserFromAgentToken(ctx, agentToken);
    return result.user;
  }
  return await getCurrentUser(ctx);
}

export const list = query({
  args: {
    entityId: v.optional(v.id("entities")),
    status: v.optional(v.union(v.literal("todo"), v.literal("done"), v.literal("in_progress"), v.literal("cancelled"))),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    agentToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.agentToken);
    const isUserAdmin = isAdmin(user.role);
    const limit = args.limit ?? 100;
    
    if (args.entityId) {
      const entity = await ctx.db.get(args.entityId);
      if (!entity) return { items: [], cursor: null };
      if (!isUserAdmin && entity.ownerId !== user._id) return { items: [], cursor: null };
      
      let q;
      if (args.status) {
        q = ctx.db
          .query("tasks")
          .withIndex("by_entityId_and_status", (q) => q.eq("entityId", args.entityId!).eq("status", args.status!))
          .order("desc");
      } else {
        q = ctx.db
          .query("tasks")
          .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId!))
          .order("desc");
      }
      return paginatedTake(ctx, q, limit);
    }
    
    if (args.status) {
      if (isUserAdmin) {
        return paginatedTake(
          ctx,
          ctx.db.query("tasks").withIndex("by_status", (q) => q.eq("status", args.status!)).order("desc"),
          limit
        );
      }
      return paginatedTake(
        ctx,
        ctx.db.query("tasks").withIndex("by_createdBy_and_status", (q) => q.eq("createdBy", user._id).eq("status", args.status!)).order("desc"),
        limit
      );
    }
    
    if (isUserAdmin) {
      return paginatedTake(ctx, ctx.db.query("tasks").order("desc"), limit);
    }
    
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();
    const accessibleEntityIds = new Set(entities.map(e => e._id));

    const allTasks = await ctx.db.query("tasks").order("desc").take(limit);
    const items = allTasks.filter(t => accessibleEntityIds.has(t.entityId));
    return {
      items,
      cursor: items.length === limit ? items[items.length - 1]._id : null,
    };
  },
});

export const getActionable = query({
  args: {
    agentToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.agentToken);
    const isUserAdmin = isAdmin(user.role);
    
    let accessibleEntityIds: Set<Id<"entities">> | null = null;
    if (!isUserAdmin) {
      accessibleEntityIds = new Set();
      const entities = await ctx.db
        .query("entities")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
        .take(100);
      for (const entity of entities) {
        accessibleEntityIds.add(entity._id);
      }
    }
    
    const todoTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .order("desc")
      .take(100);

    if (todoTasks.length === 0) return [];

    const allBlockedIds = new Set<string>();
    for (const task of todoTasks) {
      for (const blockedId of task.blockedBy) {
        allBlockedIds.add(blockedId);
      }
    }

    const blockedTasks = await Promise.all(
      Array.from(allBlockedIds).map((id) => ctx.db.get(id as Id<"tasks">))
    );
    const blockedTaskMap = new Map<string, boolean>();
    for (const task of blockedTasks) {
      if (task && "status" in task) {
        blockedTaskMap.set(task._id, task.status === "done");
      }
    }

    const actionable = [];
    for (const task of todoTasks) {
      if (!isUserAdmin && (!accessibleEntityIds || !accessibleEntityIds.has(task.entityId))) {
        continue;
      }
      if (task.blockedBy.length === 0) {
        actionable.push(task);
        continue;
      }
      if (task.blockedBy.every((blockedId) => blockedTaskMap.get(blockedId))) {
        actionable.push(task);
      }
    }
    return actionable;
  },
});

export const getSubtasks = query({
  args: { parentTaskId: v.id("tasks"), agentToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.agentToken);
    const userIsAdmin = isAdmin(user.role);

    const parentTask = await ctx.db.get(args.parentTaskId);
    if (!parentTask) {
      throw new Error("Parent task not found");
    }

    const entity = await ctx.db.get(parentTask.entityId);
    if (!entity) {
      throw new Error("Entity not found");
    }
    if (entity.ownerId !== user._id && !userIsAdmin) {
      throw new Error("You do not have access to this task");
    }

    return await ctx.db
      .query("tasks")
      .withIndex("by_parentTaskId", q => q.eq("parentTaskId", args.parentTaskId))
      .order("desc")
      .collect();
  },
});

export const getOverdue = query({
  args: { entityId: v.optional(v.id("entities")), agentToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.agentToken);
    const isUserAdmin = isAdmin(user.role);
    const now = Date.now();
    
    let accessibleEntityIds: Set<Id<"entities">> | null = null;
    if (!isUserAdmin && !args.entityId) {
      accessibleEntityIds = new Set();
      const entities = await ctx.db
        .query("entities")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
        .take(100);
      for (const entity of entities) {
        accessibleEntityIds.add(entity._id);
      }
    }
    
    let tasks;
    if (args.entityId) {
      const entity = await ctx.db.get(args.entityId);
      if (!entity) return [];
      if (!isUserAdmin && entity.ownerId !== user._id) return [];
      
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_entityId", q => q.eq("entityId", args.entityId!))
        .order("desc")
        .collect();
    } else {
      tasks = await ctx.db.query("tasks").order("desc").collect();
    }
    
    return tasks.filter(t => {
      if (!isUserAdmin && args.entityId === undefined && accessibleEntityIds && !accessibleEntityIds.has(t.entityId)) {
        return false;
      }
      if (t.status === "done" || t.status === "cancelled") return false;
      if (!t.dueDate) return false;
      return t.dueDate < now;
    });
  },
});

export const create = mutation({
  args: {
    entityId: v.id("entities"),
    title: v.string(),
    description: v.optional(v.string()),
    blockedBy: v.optional(v.array(v.id("tasks"))),
    agentCreated: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.title.trim()) {
      throw new Error("Title is required");
    }
    const user = await getCurrentUser(ctx);
    const userIsAdmin = isAdmin(user.role);

    const entity = await ctx.db.get(args.entityId);
    if (!entity) {
      throw new Error("Entity not found");
    }
    if (entity.ownerId !== user._id && !userIsAdmin) {
      throw new Error("You do not have access to this entity");
    }
    if (entity.status !== "active") {
      throw new Error("Cannot create tasks in archived entities");
    }

    if (args.blockedBy) {
      for (const blockedId of args.blockedBy) {
        const blockedTask = await ctx.db.get(blockedId);
        if (!blockedTask) {
          throw new Error(`Task ${blockedId} not found`);
        }
      }
    }

    const taskId = await ctx.db.insert("tasks", {
      entityId: args.entityId,
      title: args.title,
      description: args.description,
      status: "todo",
      blockedBy: args.blockedBy || [],
      agentCreated: args.agentCreated || false,
      priority: args.priority,
      parentTaskId: args.parentTaskId,
      dueDate: args.dueDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: user._id,
      updatedBy: user._id,
    });
    return taskId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    
    const entity = await ctx.db.get(task.entityId);
    if (!entity) throw new Error("Entity not found");
    
    if (entity.ownerId !== user._id && !isAdmin(user.role)) {
      throw new Error("You do not have permission to update this task");
    }
    
    const updates: Partial<TaskDoc> = { status: args.status, updatedBy: user._id };
    
    const isDone = args.status === "done";
    const wasDone = task.status === "done";
    
    if (isDone) {
      updates.completedAt = Date.now();
    } else if (wasDone) {
      updates.completedAt = undefined;
    }
    
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const updateTask = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    blockedBy: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    
    const taskEntity = await ctx.db.get(task.entityId);
    if (!taskEntity) throw new Error("Entity not found");
    
    if (taskEntity.ownerId !== user._id && !isAdmin(user.role)) {
      throw new Error("Not authorized to update this task");
    }
    
    if (args.blockedBy !== undefined) {
      const taskIdStr = String(args.id);

      if (args.blockedBy.some(b => String(b) === taskIdStr)) {
        throw new Error("A task cannot block itself");
      }

      const visited = new Set<string>();
      visited.add(taskIdStr);

      for (const blockedId of args.blockedBy) {
        const blockedIdStr = String(blockedId);
        if (visited.has(blockedIdStr)) {
          throw new Error("Circular dependency detected in blockedBy");
        }

        const queue: Id<"tasks">[] = [blockedId];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          const currentIdStr = String(currentId);
          if (currentIdStr === taskIdStr) {
            throw new Error("Circular dependency detected in blockedBy");
          }
          if (visited.has(currentIdStr)) continue;
          visited.add(currentIdStr);

          const currentTask = await ctx.db.get(currentId);
          if (currentTask?.blockedBy) {
            for (const nextBlockedId of currentTask.blockedBy) {
              if (String(nextBlockedId) === taskIdStr) {
                throw new Error("Circular dependency detected in blockedBy");
              }
              if (!visited.has(String(nextBlockedId))) {
                queue.push(nextBlockedId);
              }
            }
          }
        }

        const blockedTask = await ctx.db.get(blockedId);
        if (!blockedTask) {
          throw new Error(`Task ${blockedId} not found`);
        }
      }
    }
    
    const updates: Partial<TaskDoc> = {
      updatedAt: Date.now(),
      updatedBy: user._id,
    };
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    if (args.parentTaskId !== undefined) updates.parentTaskId = args.parentTaskId;
    if (args.blockedBy !== undefined) updates.blockedBy = args.blockedBy;
    
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const markDone = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    
    const entity = await ctx.db.get(task.entityId);
    if (!entity) throw new Error("Entity not found");
    
    if (entity.ownerId !== user._id && !isAdmin(user.role)) {
      throw new Error("You do not have permission to complete this task");
    }
    
    await ctx.db.patch(args.id, { status: "done", updatedBy: user._id, completedAt: Date.now() });
    return args.id;
  },
});
