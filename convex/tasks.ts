import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { getCurrentUser, isAdmin } from "./lib/auth";

type TaskDoc = Doc<"tasks">;

export const list = query({
  args: {
    entityId: v.optional(v.id("entities")),
    status: v.optional(v.union(v.literal("todo"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    if (args.entityId) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId!))
        .take(100);
      if (args.status) {
        return tasks.filter((t) => t.status === args.status);
      }
      return tasks;
    }
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(100);
    }
    return await ctx.db.query("tasks").take(100);
  },
});

export const getActionable = query({
  args: {},
  handler: async (ctx) => {
    const todoTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
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

export const create = mutation({
  args: {
    entityId: v.id("entities"),
    title: v.string(),
    description: v.optional(v.string()),
    blockedBy: v.optional(v.array(v.id("tasks"))),
    agentCreated: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const taskId = await ctx.db.insert("tasks", {
      entityId: args.entityId,
      title: args.title,
      description: args.description,
      status: "todo",
      blockedBy: args.blockedBy || [],
      agentCreated: args.agentCreated || false,
      createdAt: Date.now(),
      createdBy: user._id,
      updatedBy: user._id,
    });
    return taskId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
    return args.id;
  },
});

export const markDone = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "done" });
    return args.id;
  },
});
