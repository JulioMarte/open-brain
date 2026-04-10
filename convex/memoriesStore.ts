import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const store = internalMutation({
  args: {
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
    createdAt: v.number(),
    createdBy: v.id("users"),
    originalInboxId: v.optional(v.id("inbox_log")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("memories", {
      text: args.text,
      embedding: args.embedding,
      linkedEntityIds: args.linkedEntityIds,
      confidenceScore: args.confidenceScore,
      originalInboxId: args.originalInboxId,
      accessCount: 0,
      createdAt: args.createdAt,
      createdBy: args.createdBy,
    });
    return id;
  },
});