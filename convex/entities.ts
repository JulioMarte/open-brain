import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, isAdmin, requireAdmin, getCurrentUserFromAgentToken, getCurrentUserFromAgentTokenForMutation } from "./lib/auth";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx, MutationCtx } from "./_generated/server";

type EntityDoc = Doc<"entities">;

async function getUserForEntity(ctx: QueryCtx, agentToken?: string) {
  if (agentToken) {
    const result = await getCurrentUserFromAgentToken(ctx, agentToken);
    return result.user;
  }
  return await getCurrentUser(ctx);
}

export const list = query({
  args: { agentToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserForEntity(ctx, args.agentToken);
    if (isAdmin(user.role)) {
      return await ctx.db.query("entities").order("desc").take(100);
    }
    return await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .take(100);
  },
});

export const getById = query({
  args: { id: v.id("entities"), agentToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserForEntity(ctx, args.agentToken);
    const entity = await ctx.db.get(args.id);

    if (!entity) return null;

    if (isAdmin(user.role) || entity.ownerId === user._id) {
      return entity;
    }

    throw new Error("You do not have access to this entity");
  },
});

export const listByType = query({
  args: {
    type: v.optional(
      v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin"))
    ),
    agentToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserForEntity(ctx, args.agentToken);

    if (isAdmin(user.role)) {
      if (args.type) {
        return await ctx.db
          .query("entities")
          .withIndex("by_type", (q) => q.eq("type", args.type!))
          .order("desc")
          .take(100);
      }
      return await ctx.db.query("entities").order("desc").take(100);
    }

    let baseQuery = ctx.db.query("entities").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).order("desc");

    if (args.type) {
      const byTypeQuery = ctx.db
        .query("entities")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .filter((q) => q.eq(q.field("ownerId"), user._id))
        .order("desc");
      return await byTypeQuery.take(100);
    }

    return await baseQuery.take(100);
  },
});

export const listByStatus = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    agentToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserForEntity(ctx, args.agentToken);

    if (isAdmin(user.role)) {
      if (args.status) {
        return await ctx.db
          .query("entities")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .take(100);
      }
      return await ctx.db.query("entities").order("desc").take(100);
    }

    if (args.status) {
      const filteredQuery = ctx.db
        .query("entities")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("ownerId"), user._id))
        .order("desc");
      return await filteredQuery.take(100);
    }

    return await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(100);
  },
});

export const create = mutation({
  args: {
    type: v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin")),
    name: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
    agentToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) {
      throw new Error("Name is required");
    }
    let user;
    if (args.type === "admin") {
      user = await requireAdmin(ctx);
    } else if (args.agentToken) {
      const result = await getCurrentUserFromAgentToken(ctx, args.agentToken);
      user = result.user;
    } else {
      user = await getCurrentUser(ctx);
    }

    const id = await ctx.db.insert("entities", {
      type: args.type,
      name: args.name,
      description: args.description,
      status: "active",
      metadata: args.metadata,
      updatedAt: Date.now(),
      ownerId: user._id,
      createdBy: user._id,
      updatedBy: user._id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("entities"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    metadata: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
    agentToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user;
    if (args.agentToken) {
      const result = await getCurrentUserFromAgentToken(ctx, args.agentToken);
      user = result.user;
    } else {
      user = await getCurrentUser(ctx);
    }
    const entity = await ctx.db.get(args.id);

    if (!entity) {
      throw new Error("Entity not found");
    }

    if (!isAdmin(user.role) && entity.ownerId !== user._id) {
      throw new Error("You do not have permission to edit this entity");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: user._id };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.status !== undefined) updates.status = args.status;
    if (args.metadata !== undefined) updates.metadata = args.metadata;

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});