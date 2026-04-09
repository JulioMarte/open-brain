import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    entityId: v.optional(v.id("entities")),
    status: v.optional(v.union(v.literal("todo"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("tasks");
    if (args.entityId) {
      q = q.filter((q) => q.eq(q.field("entityId"), args.entityId));
    }
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }
    return await q.collect();
  },
});

export const getActionable = query({
  args: {},
  handler: async (ctx) => {
    const allTasks = await ctx.db.query("tasks").collect();
    const todoTasks = allTasks.filter((t) => t.status === "todo");
    return todoTasks.filter((task) => {
      if (task.blockedBy.length === 0) return true;
      return task.blockedBy.every((blockedId) => {
        const blockedTask = allTasks.find((t) => t._id === blockedId);
        return blockedTask?.status === "done";
      });
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
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", {
      entityId: args.entityId,
      title: args.title,
      description: args.description,
      status: "todo",
      blockedBy: args.blockedBy || [],
      agentCreated: args.agentCreated || false,
      createdAt: Date.now(),
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
    await ctx.db.patch(args.id, {});
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
