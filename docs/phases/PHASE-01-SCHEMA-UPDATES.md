---
title: PHASE-01 - Schema Updates
description: Fase 1 de desarrollo - Actualizaciones de schema
tags: [schema, phase]
lastUpdated: 2026-04-10
author: human
---

# PHASE 1: Schema Updates - Open Brain

## Objective
Update Convex schema tables to support: Notion-like tasks (subtasks, priorities, dueDates), inbox traceability (source metadata), and memory access tracking.

## Files to Modify
- `convex/schema.ts`

## Detailed Changes by Table

### 1. `inbox_log` Table
Add fields and index:
```typescript
inbox_log: defineTable({
  rawText: v.string(),
  source: v.union(
    v.literal("email"), v.literal("telegram"), v.literal("whatsapp"),
    v.literal("slack"), v.literal("webhook"), v.literal("api"),
    v.literal("manual"), v.literal("system_cron"), v.literal("custom")
  ),
  sourceMetadata: v.optional(v.any()),        // Payload-agnostic (Slack vs Telegram differ)
  memoryId: v.optional(v.id("memories")),     // Link to processed memory
  processed: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
})
  .index("by_processed", ["processed"])
  .index("by_source", ["source"])              // NEW: filter by source type
```

### 2. `tasks` Table
Expand status, add priority, parentTaskId, dueDate, completedAt with new indices:
```typescript
tasks: defineTable({
  entityId: v.id("entities"),
  title: v.string(),
  description: v.optional(v.string()),
  status: v.union(
    v.literal("todo"), v.literal("in_progress"),
    v.literal("done"), v.literal("cancelled")
  ),
  blockedBy: v.array(v.id("tasks")),
  priority: v.optional(v.number()),           // 1=low, 2=medium, 3=high, 4=urgent
  parentTaskId: v.optional(v.id("tasks")),   // For subtasks
  dueDate: v.optional(v.number()),           // Unix timestamp
  completedAt: v.optional(v.number()),       // When marked done
  updatedAt: v.number(),                     // Last modification time
  agentCreated: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
  updatedBy: v.id("users"),
})
  .index("by_entityId", ["entityId"])
  .index("by_status", ["status"])
  .index("by_createdBy", ["createdBy"])
  .index("by_parentTaskId", ["parentTaskId"])    // NEW: for subtask queries
  .index("by_dueDate", ["dueDate"])              // NEW: for timeline/overdue
  .index("by_entityId_and_status", ["entityId", "status"])  // NEW: for Kanban
```

### 3. `memories` Table
Add traceability and access tracking fields:
```typescript
memories: defineTable({
  text: v.string(),
  embedding: v.array(v.float64()),
  linkedEntityIds: v.optional(v.array(v.id("entities"))),
  confidenceScore: v.optional(v.float64()),
  originalInboxId: v.optional(v.id("inbox_log")),  // NEW: traceback to source
  accessCount: v.number(),                          // NEW: default 0
  lastAccessedAt: v.optional(v.number()),           // NEW: timestamp
  createdAt: v.number(),
  createdBy: v.id("users"),
})
```

## Important Notes
1. **Priority is INTEGER (1-4)**, NOT string/enum. Strings sort alphabetically which breaks query ordering.
2. **sourceMetadata uses `v.any()`** because Slack/Telegram/Stripe payloads differ wildly - type safety is enforced at application layer (Zod), not DB layer.
3. **completedAt must be CLEARED when task moves from done back to todo** - this is a state machine requirement.

## Testing Strategy
Create `convex/schema.test.ts`:

### Test Cases
1. **inbox_log source enum**: Insert with valid sources (email, telegram, etc.) → success; invalid source → throw
2. **tasks status enum**: Insert with in_progress → success; invalid status → throw
3. **tasks priority as number**: Insert with priority: 3 → success
4. **memories default accessCount**: Insert without accessCount field → defaults to 0
5. **Vector index exists**: Verify memories table has `.vectorIndex("by_embedding", ...)`
6. **New indices exist**: Verify by_parentTaskId, by_dueDate, by_entityId_and_status indices are defined

Use Convex testing patterns with `useFakeAuth` or mock ctx.db.

Write the complete test file content.

```typescript
import { describe, it, expect } from "vitest";
import { useFakeAuth, useMutation, useQuery } from "convex-test";
import { getSchema } from "../schema";
import { Convex } from "../convex stand";
import { use } from "convex-test";

describe("Schema Validation Tests", () => {
  describe("inbox_log table", () => {
    it("inserts with valid email source", async () => {
      const { db } = await useFakeAuth();
      const schema = getSchema();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Test email content",
        source: "email",
        sourceMetadata: { subject: "Hello", from: "test@example.com" },
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid telegram source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Telegram message",
        source: "telegram",
        sourceMetadata: { chatId: "123456", messageId: "789" },
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid slack source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Slack message",
        source: "slack",
        sourceMetadata: { teamId: "T123", channelId: "C456" },
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid whatsapp source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "WhatsApp message",
        source: "whatsapp",
        sourceMetadata: { waId: "1234567890" },
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid webhook source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Webhook payload",
        source: "webhook",
        sourceMetadata: { headers: { "x-webhook-key": "secret" } },
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid api source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "API request body",
        source: "api",
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid manual source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Manually entered note",
        source: "manual",
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid system_cron source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Cron triggered event",
        source: "system_cron",
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("inserts with valid custom source", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Custom integration",
        source: "custom",
        sourceMetadata: { provider: "custom_provider" },
        processed: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(inboxLogId).toBeDefined();
    });

    it("throws on invalid source", async () => {
      const { db } = await useFakeAuth();
      
      expect(async () => {
        await db.insert("inbox_log", {
          rawText: "Invalid source",
          source: "invalid_source" as any,
          processed: false,
          createdAt: Date.now(),
          createdBy: "user123" as Id<"users">,
        });
      }).toThrow();
    });

    it("has by_source index defined", () => {
      const schema = getSchema();
      const inboxLogTable = schema.tables.inbox_log;
      
      expect(inboxLogTable.indexes).toHaveProperty("by_source");
    });
  });

  describe("tasks table", () => {
    it("inserts with in_progress status", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const taskId = await db.insert("tasks", {
        entityId,
        title: "Test Task",
        status: "in_progress",
        blockedBy: [],
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(taskId).toBeDefined();
    });

    it("inserts with cancelled status", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project 2",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const taskId = await db.insert("tasks", {
        entityId,
        title: "Cancelled Task",
        status: "cancelled",
        blockedBy: [],
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(taskId).toBeDefined();
    });

    it("throws on invalid status", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project 3",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(async () => {
        await db.insert("tasks", {
          entityId,
          title: "Invalid Status Task",
          status: "invalid_status" as any,
          blockedBy: [],
          agentCreated: false,
          createdAt: Date.now(),
          createdBy: "user123" as Id<"users">,
          updatedBy: "user123" as Id<"users">,
        });
      }).toThrow();
    });

    it("inserts with priority as number (high priority)", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project 4",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const taskId = await db.insert("tasks", {
        entityId,
        title: "High Priority Task",
        status: "todo",
        blockedBy: [],
        priority: 3,
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(taskId).toBeDefined();
    });

    it("inserts with priority 4 (urgent)", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project 5",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const taskId = await db.insert("tasks", {
        entityId,
        title: "Urgent Task",
        status: "todo",
        blockedBy: [],
        priority: 4,
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(taskId).toBeDefined();
    });

    it("inserts with parentTaskId for subtask", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project 6",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const parentTaskId = await db.insert("tasks", {
        entityId,
        title: "Parent Task",
        status: "todo",
        blockedBy: [],
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const subtaskId = await db.insert("tasks", {
        entityId,
        title: "Subtask",
        status: "todo",
        blockedBy: [],
        parentTaskId,
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(subtaskId).toBeDefined();
    });

    it("inserts with dueDate as unix timestamp", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project 7",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const futureDate = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now
      
      const taskId = await db.insert("tasks", {
        entityId,
        title: "Task with Due Date",
        status: "todo",
        blockedBy: [],
        dueDate: futureDate,
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(taskId).toBeDefined();
    });

    it("inserts with completedAt timestamp", async () => {
      const { db } = await useFakeAuth();
      
      const entityId = await db.insert("entities", {
        type: "project",
        name: "Test Project 8",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user123" as Id<"users">,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      const completedTimestamp = Date.now();
      
      const taskId = await db.insert("tasks", {
        entityId,
        title: "Completed Task",
        status: "done",
        blockedBy: [],
        completedAt: completedTimestamp,
        agentCreated: false,
        createdAt: Date.now() - 1000,
        createdBy: "user123" as Id<"users">,
        updatedBy: "user123" as Id<"users">,
      });
      
      expect(taskId).toBeDefined();
    });

    it("has by_parentTaskId index defined", () => {
      const schema = getSchema();
      const tasksTable = schema.tables.tasks;
      
      expect(tasksTable.indexes).toHaveProperty("by_parentTaskId");
    });

    it("has by_dueDate index defined", () => {
      const schema = getSchema();
      const tasksTable = schema.tables.tasks;
      
      expect(tasksTable.indexes).toHaveProperty("by_dueDate");
    });

    it("has by_entityId_and_status compound index defined", () => {
      const schema = getSchema();
      const tasksTable = schema.tables.tasks;
      
      expect(tasksTable.indexes).toHaveProperty("by_entityId_and_status");
    });
  });

  describe("memories table", () => {
    it("inserts without accessCount field and defaults to 0", async () => {
      const { db } = await useFakeAuth();
      
      const memoryId = await db.insert("memories", {
        text: "Test memory without accessCount",
        embedding: new Array(1536).fill(0),
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(memoryId).toBeDefined();
      
      const memory = await db.get(memoryId);
      expect(memory?.accessCount).toBe(0);
    });

    it("inserts with originalInboxId for traceability", async () => {
      const { db } = await useFakeAuth();
      
      const inboxLogId = await db.insert("inbox_log", {
        rawText: "Source message for memory",
        source: "email",
        processed: true,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      const memoryId = await db.insert("memories", {
        text: "Memory traced to inbox",
        embedding: new Array(1536).fill(0.5),
        originalInboxId: inboxLogId,
        accessCount: 0,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(memoryId).toBeDefined();
    });

    it("inserts with lastAccessedAt timestamp", async () => {
      const { db } = await useFakeAuth();
      
      const lastAccessed = Date.now();
      
      const memoryId = await db.insert("memories", {
        text: "Memory with lastAccessedAt",
        embedding: new Array(1536).fill(0.3),
        accessCount: 5,
        lastAccessedAt: lastAccessed,
        createdAt: Date.now(),
        createdBy: "user123" as Id<"users">,
      });
      
      expect(memoryId).toBeDefined();
    });

    it("has vectorIndex by_embedding defined", () => {
      const schema = getSchema();
      const memoriesTable = schema.tables.memories;
      
      expect(memoriesTable.vectorIndexes).toHaveProperty("by_embedding");
    });
  });
});
```
