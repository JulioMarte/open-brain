import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("inbox_log").collect();
  },
});

export const listUnprocessed = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("inbox_log").collect();
    return all.filter((i) => !i.processed);
  },
});

export const create = internalMutation({
  args: {
    rawText: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("inbox_log", {
      rawText: args.rawText,
      source: args.source,
      processed: false,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const markProcessed = mutation({
  args: { id: v.id("inbox_log") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { processed: true });
    return args.id;
  },
});
