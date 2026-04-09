import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getCurrentUser, requireAdmin, isAdmin } from "./lib/auth";

interface CreateTaskPayload {
  entityId: Id<"entities">;
  title: string;
  description?: string;
  blockedBy?: Id<"tasks">[];
}

interface UpdateEntityPayload {
  entityId: Id<"entities">;
  name?: string;
  description?: string;
  status?: "active" | "archived";
  metadata?: unknown;
}

interface AddMemoryPayload {
  text: string;
  linkedEntityIds?: Id<"entities">[];
}

export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.status) {
      return await ctx.db
        .query("proposals")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(100);
    }
    return await ctx.db.query("proposals").take(100);
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("proposals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(100);
  },
});

export const create = mutation({
  args: {
    type: v.union(v.literal("create_task"), v.literal("update_entity"), v.literal("add_memory")),
    payload: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const id = await ctx.db.insert("proposals", {
      type: args.type,
      payload: args.payload,
      reason: args.reason,
      status: "pending",
      createdAt: Date.now(),
      createdBy: user._id,
    });
    return id;
  },
});

export const approve = mutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const proposal = await ctx.db.get(args.id);
    if (!proposal) throw new Error("Proposal not found");

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(proposal.payload);
    } catch {
      throw new Error("Invalid payload JSON");
    }

    if (proposal.type === "create_task") {
      const taskPayload = payload as unknown as CreateTaskPayload;
      if (!taskPayload.entityId) throw new Error("Missing entityId in payload");
      const entity = await ctx.db.get(taskPayload.entityId);
      if (!entity) throw new Error("Entity not found");
      if (!taskPayload.title || typeof taskPayload.title !== "string") throw new Error("Invalid title");

      await ctx.db.insert("tasks", {
        entityId: taskPayload.entityId,
        title: taskPayload.title,
        description: taskPayload.description,
        status: "todo",
        blockedBy: taskPayload.blockedBy || [],
        agentCreated: true,
        createdAt: Date.now(),
        createdBy: user._id,
        updatedBy: user._id,
      });
    } else if (proposal.type === "update_entity") {
      const updatePayload = payload as unknown as UpdateEntityPayload;
      if (!updatePayload.entityId) throw new Error("Missing entityId in payload");
      const entity = await ctx.db.get(updatePayload.entityId);
      if (!entity) throw new Error("Entity not found");

      const updates: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: user._id };
      if (updatePayload.name !== undefined) updates.name = updatePayload.name;
      if (updatePayload.description !== undefined) updates.description = updatePayload.description;
      if (updatePayload.status !== undefined) updates.status = updatePayload.status;
      if (updatePayload.metadata !== undefined) updates.metadata = updatePayload.metadata;
      await ctx.db.patch(updatePayload.entityId, updates);
    } else if (proposal.type === "add_memory") {
      const memoryPayload = payload as unknown as AddMemoryPayload;
      if (!memoryPayload.text || typeof memoryPayload.text !== "string") throw new Error("Invalid text");
      await ctx.scheduler.runAfter(0, api.actions.generateAndStoreMemory, {
        text: memoryPayload.text,
        linkedEntityIds: memoryPayload.linkedEntityIds,
        createdBy: user._id,
      });
    }

    await ctx.db.patch(args.id, { status: "approved", reviewedBy: user._id });
    return args.id;
  },
});

export const reject = mutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    await ctx.db.patch(args.id, { status: "rejected", reviewedBy: user._id });
    return args.id;
  },
});