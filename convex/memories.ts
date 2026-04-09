import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("memories").collect();
  },
});

export const search = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db.query("memories").collect();
    return memories.slice(0, args.limit || 10);
  },
});

export const getByEntity = query({
  args: { entityId: v.id("entities") },
  handler: async (ctx, args) => {
    const allMemories = await ctx.db.query("memories").collect();
    return allMemories.filter(
      (m) => m.linkedEntityIds?.includes(args.entityId)
    );
  },
});