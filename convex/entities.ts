import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("entities").collect();
  },
});

export const getById = query({
  args: { id: v.id("entities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByType = query({
  args: { type: v.optional(v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin"))) },
  handler: async (ctx, args) => {
    let q = ctx.db.query("entities");
    if (args.type) {
      q = q.filter((q) => q.eq(q.field("type"), args.type));
    }
    return await q.collect();
  },
});

export const listByStatus = query({
  args: { status: v.optional(v.union(v.literal("active"), v.literal("archived"))) },
  handler: async (ctx, args) => {
    let q = ctx.db.query("entities");
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }
    return await q.collect();
  },
});
