import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    role: v.union(v.literal("human"), v.literal("agent"), v.literal("sub_agent"), v.literal("admin")),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    agentOwnerId: v.optional(v.id("users")),
    agentScope: v.optional(v.union(
      v.literal("orchestrator"),
      v.literal("entity_scoped"),
      v.literal("sub_agent")
    )),
    agentScopes: v.optional(v.array(v.id("entities"))),
    isRevoked: v.optional(v.boolean()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_agentOwnerId", ["agentOwnerId"])
    .index("by_isRevoked", ["isRevoked"]),

  agent_tokens: defineTable({
    tokenHash: v.string(),
    userId: v.id("users"),
    ownerId: v.id("users"),
    scope: v.union(v.literal("orchestrator"), v.literal("entity_scoped"), v.literal("sub_agent")),
    scopeEntityIds: v.optional(v.array(v.id("entities"))),
    issuedAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    isRevoked: v.boolean(),
    revokedAt: v.optional(v.number()),
    refreshTokenHash: v.optional(v.string()),
    refreshTokenExpiresAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"])
    .index("by_ownerId", ["ownerId"])
    .index("by_isRevoked", ["isRevoked"])
    .index("by_expiresAt", ["expiresAt"]),

  inbox_log: defineTable({
    rawText: v.string(),
    source: v.union(
      v.literal("email"), v.literal("telegram"), v.literal("whatsapp"),
      v.literal("slack"), v.literal("webhook"), v.literal("api"),
      v.literal("manual"), v.literal("system_cron"), v.literal("custom")
    ),
    sourceMetadata: v.optional(v.any()),
    memoryId: v.optional(v.id("memories")),
    processed: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_processed", ["processed"])
    .index("by_source", ["source"])
    .index("by_createdBy", ["createdBy"]),

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
    status: v.union(
      v.literal("todo"), v.literal("in_progress"),
      v.literal("done"), v.literal("cancelled")
    ),
    blockedBy: v.array(v.id("tasks")),
    priority: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    dueDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
    agentCreated: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
  })
    .index("by_entityId", ["entityId"])
    .index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"])
    .index("by_parentTaskId", ["parentTaskId"])
    .index("by_dueDate", ["dueDate"])
    .index("by_entityId_and_status", ["entityId", "status"]),

  memories: defineTable({
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
    originalInboxId: v.optional(v.id("inbox_log")),
    accessCount: v.number(),
    lastAccessedAt: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
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
