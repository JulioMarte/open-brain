import { v } from "convex/values";

export const sourceMetadataValidator = v.optional(v.union(
  v.object({ type: v.literal("email"), from: v.optional(v.string()), subject: v.optional(v.string()), messageId: v.optional(v.string()) }),
  v.object({ type: v.literal("telegram"), chatId: v.optional(v.string()), messageId: v.optional(v.string()) }),
  v.object({ type: v.literal("whatsapp"), from: v.optional(v.string()), messageId: v.optional(v.string()) }),
  v.object({ type: v.literal("slack"), teamId: v.optional(v.string()), channelId: v.optional(v.string()), messageTs: v.optional(v.string()) }),
  v.object({ type: v.literal("webhook"), headers: v.optional(v.string()) }),
  v.object({ type: v.literal("api") }),
  v.object({ type: v.literal("manual") }),
  v.object({ type: v.literal("system_cron"), cronJobId: v.optional(v.string()) }),
  v.object({ type: v.literal("custom"), data: v.optional(v.string()) })
));

export const sourceValidator = v.union(
  v.literal("email"), v.literal("telegram"), v.literal("whatsapp"),
  v.literal("slack"), v.literal("webhook"), v.literal("api"),
  v.literal("manual"), v.literal("system_cron"), v.literal("custom")
);