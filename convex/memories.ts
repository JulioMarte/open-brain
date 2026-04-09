import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

type MemoryDoc = Doc<"memories">;

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("memories").take(100);
  },
});

export const search = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await (ctx as any).vectorSearch("memories", "by_embedding", {
      vector: args.embedding,
      limit: args.limit || 10,
    });

    const memories = await Promise.all(
      results.map(async (result: { _id: any; _score: number }) => {
        const doc = await ctx.db.get(result._id);
        return doc ? { ...doc, _score: result._score } : null;
      })
    );

    return memories.filter((m): m is MemoryDoc & { _score: number } => m !== null);
  },
});

export const getByEntity = query({
  args: { entityId: v.id("entities") },
  handler: async (ctx, args) => {
    const allMemories = await ctx.db.query("memories").take(500);
    return allMemories
      .filter((m) => m.linkedEntityIds?.includes(args.entityId))
      .slice(0, 100);
  },
});

export const getById = internalQuery({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
