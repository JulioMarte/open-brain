import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("entities").take(100);
  },
});

export const getById = query({
  args: { id: v.id("entities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByType = query({
  args: {
    type: v.optional(
      v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin"))
    ),
  },
  handler: async (ctx, args) => {
    if (args.type) {
      return await ctx.db
        .query("entities")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .take(100);
    }
    return await ctx.db.query("entities").take(100);
  },
});

export const listByStatus = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("entities")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(100);
    }
    return await ctx.db.query("entities").take(100);
  },
});

export const create = mutation({
  args: {
    type: v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin")),
    name: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("entities", {
      type: args.type,
      name: args.name,
      description: args.description,
      status: "active",
      metadata: args.metadata,
      updatedAt: Date.now(),
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
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.status !== undefined) updates.status = args.status;
    if (args.metadata !== undefined) updates.metadata = args.metadata;
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});
