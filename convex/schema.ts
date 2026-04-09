import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    role: v.union(v.literal("human"), v.literal("agent"), v.literal("sub_agent"), v.literal("admin")),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  inbox_log: defineTable({
    rawText: v.string(),
    source: v.string(),
    processed: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }).index("by_processed", ["processed"]),

  entities: defineTable({
    type: v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin")),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    metadata: v.optional(v.any()),
    updatedAt: v.number(),
    ownerId: v.id("users"),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
  })
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_ownerId", ["ownerId"]),

  tasks: defineTable({
    entityId: v.id("entities"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("todo"), v.literal("done")),
    blockedBy: v.array(v.id("tasks")),
    agentCreated: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
  })
    .index("by_entityId", ["entityId"])
    .index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"]),

  memories: defineTable({
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["linkedEntityIds"],
  }),

  proposals: defineTable({
    type: v.union(v.literal("create_task"), v.literal("update_entity"), v.literal("add_memory")),
    payload: v.string(),
    reason: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number(),
    createdBy: v.id("users"),
    reviewedBy: v.optional(v.id("users")),
  }).index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"]),
});