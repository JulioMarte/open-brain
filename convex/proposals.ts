import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("proposals");
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }
    return await q.collect();
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("proposals").collect();
    return all.filter((p) => p.status === "pending");
  },
});

export const create = mutation({
  args: {
    type: v.union(v.literal("create_task"), v.literal("update_entity"), v.literal("add_memory")),
    payload: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("proposals", {
      type: args.type,
      payload: args.payload,
      reason: args.reason,
      status: "pending",
      createdAt: Date.now(),
    });
    return id;
  },
});

export const approve = mutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.id);
    if (!proposal) throw new Error("Proposal not found");
    
    const payload = JSON.parse(proposal.payload);
    
    if (proposal.type === "create_task") {
      await ctx.db.insert("tasks", {
        entityId: payload.entityId,
        title: payload.title,
        description: payload.description,
        status: "todo",
        blockedBy: payload.blockedBy || [],
        agentCreated: true,
        createdAt: Date.now(),
      });
    }
    
    await ctx.db.patch(args.id, { status: "approved" });
    return args.id;
  },
});

export const reject = mutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "rejected" });
    return args.id;
  },
});
