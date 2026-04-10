import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgent, getCurrentUser } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user.role === "admin") {
      return await ctx.db.query("inbox_log").take(100);
    }
    return await ctx.db
      .query("inbox_log")
      .withIndex("by_createdBy", q => q.eq("createdBy", user._id))
      .take(100);
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
    source: v.union(
      v.literal("email"), v.literal("telegram"), v.literal("whatsapp"),
      v.literal("slack"), v.literal("webhook"), v.literal("api"),
      v.literal("manual"), v.literal("system_cron"), v.literal("custom")
    ),
    createdBy: v.id("users"),
    sourceMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { sourceMetadata, ...rest } = args;
    const id = await ctx.db.insert("inbox_log", {
      rawText: rest.rawText,
      source: rest.source,
      processed: false,
      createdAt: Date.now(),
      createdBy: rest.createdBy,
      sourceMetadata: sourceMetadata,
    });
    return id;
  },
});

export const createAndProcess = internalMutation({
  args: {
    rawText: v.string(),
    source: v.union(
      v.literal("email"), v.literal("telegram"), v.literal("whatsapp"),
      v.literal("slack"), v.literal("webhook"), v.literal("api"),
      v.literal("manual"), v.literal("system_cron"), v.literal("custom")
    ),
    createdBy: v.id("users"),
    sourceMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { sourceMetadata, ...rest } = args;
    const id = await ctx.db.insert("inbox_log", {
      rawText: rest.rawText,
      source: rest.source,
      processed: true,
      createdAt: Date.now(),
      createdBy: rest.createdBy,
      sourceMetadata: sourceMetadata,
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