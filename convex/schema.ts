import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  inbox_log: defineTable({
    rawText: v.string(),
    source: v.string(),
    processed: v.boolean(),
    createdAt: v.number(),
  }),

  entities: defineTable({
    type: v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin")),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    metadata: v.optional(v.any()),
    updatedAt: v.number(),
  }),

  tasks: defineTable({
    entityId: v.id("entities"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("todo"), v.literal("done")),
    blockedBy: v.array(v.id("tasks")),
    agentCreated: v.boolean(),
    createdAt: v.number(),
  }),

  memories: defineTable({
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
    createdAt: v.number(),
  }).index("embedding", ["embedding"]),

  proposals: defineTable({
    type: v.union(v.literal("create_task"), v.literal("update_entity"), v.literal("add_memory")),
    payload: v.string(),
    reason: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number(),
  }),
});
