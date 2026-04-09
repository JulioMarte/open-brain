import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    return await ctx.db.query("inbox_log").take(100);
  },
});

export const listUnprocessed = query({
  args: {},
  handler: async (ctx) => {
    await requireAgent(ctx);
    return await ctx.db.query("inbox_log").withIndex("by_processed", q => q.eq("processed", false)).take(100);
  },
});

export const create = internalMutation({
  args: {
    rawText: v.string(),
    source: v.string(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("inbox_log", {
      rawText: args.rawText,
      source: args.source,
      processed: false,
      createdAt: Date.now(),
      createdBy: args.createdBy,
    });
    return id;
  },
});

export const createAndProcess = internalMutation({
  args: {
    rawText: v.string(),
    source: v.string(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("inbox_log", {
      rawText: args.rawText,
      source: args.source,
      processed: true,
      createdAt: Date.now(),
      createdBy: args.createdBy,
    });
    return id;
  },
});

export const markProcessed = mutation({
  args: { id: v.id("inbox_log") },
  handler: async (ctx, args) => {
    await requireAgent(ctx);
    await ctx.db.patch(args.id, { processed: true });
    return args.id;
  },
});