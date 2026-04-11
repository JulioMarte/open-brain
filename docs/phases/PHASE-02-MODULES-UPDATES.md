---
title: PHASE-02 - Convex Modules Enhancement
description: Fase 2 de desarrollo - Mejora de módulos Convex
tags: [convex, phase]
lastUpdated: 2026-04-10
author: human
---

# PHASE 2: Convex Modules Enhancement

## Objective
Enhance existing Convex modules to support new schema fields, add new queries/mutations, and ensure proper access control.

## Files to Modify
- `convex/tasks.ts`
- `convex/inbox.ts`
- `convex/memories.ts`
- `convex/memoriesStore.ts`

## Detailed Changes by File

### 1. `convex/tasks.ts` - New Functions Required

#### New Query: `getSubtasks`
```typescript
export const getSubtasks = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return await ctx.db
      .query("tasks")
      .withIndex("by_parentTaskId", q => q.eq("parentTaskId", args.parentTaskId))
      .collect();
  },
});
```

#### New Query: `getOverdue`
```typescript
export const getOverdue = query({
  args: { entityId: v.optional(v.id("entities")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    // Query: dueDate < now AND status NOT IN (done, cancelled)
    // Must use withIndex on by_dueDate, then filter in memory for status
    // ...
  },
});
```

#### Updated `create` mutation
- Add `priority: v.optional(v.number())` argument
- Add `parentTaskId: v.optional(v.id("tasks"))` argument
- Add `dueDate: v.optional(v.number())` argument
- Store these fields on insert

#### Updated `updateStatus` mutation (CRITICAL: State Machine)
- When status changes from "done" to "todo": CLEAR `completedAt`
- When status changes to "done": SET `completedAt = Date.now()`
- Must use `ctx.db.patch(args.id, { status: ..., completedAt: ... })`

#### New Mutation: `updateTask`
```typescript
export const updateTask = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    blockedBy: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, args) => {
    // Auth check: user must own the task or be admin
    // Update fields provided, set updatedAt
    // ...
  },
});
```

### 2. `convex/inbox.ts` - Human Access

#### Change `list` query access
```typescript
// OLD: await requireAgent(ctx);
// NEW: Allow humans to see their own inbox
handler: async (ctx) => {
  const user = await getCurrentUser(ctx);
  if (user.role === "admin") {
    return await ctx.db.query("inbox_log").take(100);
  }
  // Humans see only their own entries
  return await ctx.db
    .query("inbox_log")
    .withIndex("by_createdBy", q => q.eq("createdBy", user._id))
    .take(100);
},
```

#### Update `create` and `createAndProcess` internalMutations
- Add `sourceMetadata: v.optional(v.any())` argument
- Store in inbox_log document

### 3. `convex/memories.ts` - Access Tracking

#### New Mutation: `logAccess`
```typescript
export const logAccess = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const memory = await ctx.db.get(args.id);
    if (!memory) throw new Error("Memory not found");
    
    // Check user has access to this memory
    // Increment accessCount, update lastAccessedAt
    await ctx.db.patch(args.id, {
      accessCount: (memory.accessCount || 0) + 1,
      lastAccessedAt: Date.now(),
    });
  },
});
```

Note: The `search` query remains PURE (read-only). Clients must call `logAccess` after receiving results they actually use.

#### Update `create` mutation
- Add `originalInboxId: v.optional(v.id("inbox_log"))` argument
- Add `accessCount: 0` as default
- Store these fields

## Testing Strategy
Create `convex/tasks.test.ts` and `convex/memories.test.ts`:

### Test Cases

#### tasks.test.ts
1. **getSubtasks**: Create parent task, create 2 child tasks, call getSubtasks → returns 2 children
2. **getOverdue**: Create task with past dueDate + todo status → in overdue; task with done status → NOT in overdue
3. **create with new fields**: Create task with priority, dueDate, parentTaskId → stored correctly
4. **updateStatus state machine**: Set task done (completedAt set) → then set back to todo (completedAt cleared)
5. **updateTask**: Update title, priority, dueDate → fields updated; update with invalid taskId → throw

#### inbox.test.ts
1. **list as human**: Human calls list → sees only their own entries
2. **list as agent**: Agent calls list → sees all entries
3. **create with metadata**: Create entry with sourceMetadata → stored and retrievable

#### memories.test.ts
1. **logAccess**: Memory with accessCount 0 → logAccess → accessCount 1, lastAccessedAt set
2. **search remains pure**: Verify search does NOT modify accessCount (no side effects)
3. **create with originalInboxId**: Create memory with inbox ID → stored correctly

---

## Implementation Reference

### Updated `convex/tasks.ts`

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { getCurrentUser, isAdmin } from "./lib/auth";

type TaskDoc = Doc<"tasks">;

export const list = query({
  args: {
    entityId: v.optional(v.id("entities")),
    status: v.optional(v.union(v.literal("todo"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    if (args.entityId) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId!))
        .take(100);
      if (args.status) {
        return tasks.filter((t) => t.status === args.status);
      }
      return tasks;
    }
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(100);
    }
    return await ctx.db.query("tasks").take(100);
  },
});

export const getActionable = query({
  args: {},
  handler: async (ctx) => {
    const todoTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .take(100);

    if (todoTasks.length === 0) return [];

    const allBlockedIds = new Set<string>();
    for (const task of todoTasks) {
      for (const blockedId of task.blockedBy) {
        allBlockedIds.add(blockedId);
      }
    }

    const blockedTasks = await Promise.all(
      Array.from(allBlockedIds).map((id) => ctx.db.get(id as Id<"tasks">))
    );
    const blockedTaskMap = new Map<string, boolean>();
    for (const task of blockedTasks) {
      if (task && "status" in task) {
        blockedTaskMap.set(task._id, task.status === "done");
      }
    }

    const actionable = [];
    for (const task of todoTasks) {
      if (task.blockedBy.length === 0) {
        actionable.push(task);
        continue;
      }
      if (task.blockedBy.every((blockedId) => blockedTaskMap.get(blockedId))) {
        actionable.push(task);
      }
    }
    return actionable;
  },
});

export const getSubtasks = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return await ctx.db
      .query("tasks")
      .withIndex("by_parentTaskId", q => q.eq("parentTaskId", args.parentTaskId))
      .collect();
  },
});

export const getOverdue = query({
  args: { entityId: v.optional(v.id("entities")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    
    let tasks;
    if (args.entityId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_entityId", q => q.eq("entityId", args.entityId!))
        .collect();
    } else {
      tasks = await ctx.db.query("tasks").collect();
    }
    
    return tasks.filter(t => {
      if (t.status === "done" || t.status === "cancelled") return false;
      if (!t.dueDate) return false;
      return t.dueDate < now;
    });
  },
});

export const create = mutation({
  args: {
    entityId: v.id("entities"),
    title: v.string(),
    description: v.optional(v.string()),
    blockedBy: v.optional(v.array(v.id("tasks"))),
    agentCreated: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const taskId = await ctx.db.insert("tasks", {
      entityId: args.entityId,
      title: args.title,
      description: args.description,
      status: "todo",
      blockedBy: args.blockedBy || [],
      agentCreated: args.agentCreated || false,
      priority: args.priority,
      parentTaskId: args.parentTaskId,
      dueDate: args.dueDate,
      createdAt: Date.now(),
      createdBy: user._id,
      updatedBy: user._id,
    });
    return taskId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    
    const updates: Partial<TaskDoc> = { status: args.status };
    
    if (args.status === "done") {
      updates.completedAt = Date.now();
    } else if (args.status === "todo" && task.status === "done") {
      updates.completedAt = undefined;
    }
    
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const updateTask = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    blockedBy: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    
    if (task.createdBy !== user._id && !isAdmin(user.role)) {
      throw new Error("Not authorized to update this task");
    }
    
    const updates: Partial<TaskDoc> = {
      updatedAt: Date.now(),
      updatedBy: user._id,
    };
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    if (args.parentTaskId !== undefined) updates.parentTaskId = args.parentTaskId;
    if (args.blockedBy !== undefined) updates.blockedBy = args.blockedBy;
    
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const markDone = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "done", completedAt: Date.now() });
    return args.id;
  },
});
```

### Updated `convex/inbox.ts`

```typescript
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
    source: v.string(),
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
    source: v.string(),
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
```

### Updated `convex/memories.ts`

```typescript
import { query, internalQuery, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, isAdmin, getCurrentUserOrNull } from "./lib/auth";

type MemoryDoc = Doc<"memories">;

async function getUserAccessibleMemories(ctx: any, user: Doc<"users"> | null, linkedEntityIds?: Id<"entities">[]) {
  if (user && isAdmin(user.role)) {
    return await ctx.db.query("memories").take(500);
  }

  if (!user) {
    return [];
  }

  const accessibleMemories: MemoryDoc[] = [];

  const entities = await ctx.db
    .query("entities")
    .withIndex("by_ownerId", (q: any) => q.eq("ownerId", user._id))
    .collect();
  const userEntityIds = new Set(entities.map((e: any) => e._id));

  const memories = await ctx.db.query("memories").take(500);

  for (const memory of memories) {
    if (memory.createdBy === user._id) {
      accessibleMemories.push(memory);
      continue;
    }

    if (memory.linkedEntityIds) {
      const hasAccess = memory.linkedEntityIds.some((eid: Id<"entities">) => userEntityIds.has(eid));
      if (hasAccess) {
        accessibleMemories.push(memory);
      }
    }
  }

  return accessibleMemories.slice(0, 100);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return await getUserAccessibleMemories(ctx, user);
  },
});

export const search = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const results = await (ctx as any).vectorSearch("memories", "by_embedding", {
      vector: args.embedding,
      limit: args.limit || 10,
    });

    if (isAdmin(user.role)) {
      const memories = await Promise.all(
        results.map(async (result: { _id: any; _score: number }) => {
          const doc = await ctx.db.get(result._id);
          return doc ? { ...doc, _score: result._score } : null;
        })
      );
      return memories.filter((m): m is MemoryDoc & { _score: number } => m !== null);
    }

    const entities = await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q: any) => q.eq("ownerId", user._id))
      .collect();
    const userEntityIds = new Set(entities.map((e: any) => e._id));

    const memories = await Promise.all(
      results.map(async (result: { _id: any; _score: number }) => {
        const doc = await ctx.db.get(result._id);
        return doc ? { ...doc, _score: result._score } : null;
      })
    );

    return memories.filter((m): m is MemoryDoc & { _score: number } => m !== null && (
      m.createdBy === user._id ||
      (m.linkedEntityIds && m.linkedEntityIds.some((eid: Id<"entities">) => userEntityIds.has(eid)))
    ));
  },
});

export const getByEntity = query({
  args: { entityId: v.id("entities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const entity = await ctx.db.get(args.entityId);
    if (!entity) {
      throw new Error("Entidad no encontrada");
    }

    if (!isAdmin(user.role) && entity.ownerId !== user._id) {
      throw new Error("No tienes acceso a esta entidad");
    }

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

export const logAccess = mutation({
  args: { id: v.id("memories") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const memory = await ctx.db.get(args.id);
    if (!memory) throw new Error("Memory not found");
    
    if (memory.createdBy !== user._id && !isAdmin(user.role)) {
      const entities = await ctx.db
        .query("entities")
        .withIndex("by_ownerId", (q: any) => q.eq("ownerId", user._id))
        .collect();
      const userEntityIds = new Set(entities.map((e: any) => e._id));
      const hasAccess = memory.linkedEntityIds?.some((eid: Id<"entities">) => userEntityIds.has(eid));
      if (!hasAccess) {
        throw new Error("Not authorized to access this memory");
      }
    }
    
    await ctx.db.patch(args.id, {
      accessCount: (memory.accessCount || 0) + 1,
      lastAccessedAt: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
    originalInboxId: v.optional(v.id("inbox_log")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    if (args.linkedEntityIds) {
      for (const entityId of args.linkedEntityIds) {
        const entity = await ctx.db.get(entityId);
        if (!entity) {
          throw new Error(`Entidad ${entityId} no encontrada`);
        }
        if (!isAdmin(user.role) && entity.ownerId !== user._id) {
          throw new Error("No tienes acceso a una de las entidades especificadas");
        }
      }
    }

    const id = await ctx.db.insert("memories", {
      text: args.text,
      embedding: args.embedding,
      linkedEntityIds: args.linkedEntityIds,
      confidenceScore: args.confidenceScore,
      originalInboxId: args.originalInboxId,
      accessCount: 0,
      createdAt: Date.now(),
      createdBy: user._id,
    });
    return id;
  },
});

export const createInternal = internalMutation({
  args: {
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
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
      createdAt: Date.now(),
      createdBy: args.createdBy,
    });
    return id;
  },
});
```

---

## Test Files

### `convex/tasks.test.ts`

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { createContext } from "./_generated/testing";
import { tasks } from "./tasks";
import { entities } from "./entities";

describe("tasks module", () => {
  let ctx: any;
  let humanUser: any;
  let adminUser: any;
  let testEntityId: any;

  beforeEach(async () => {
    ctx = await createContext();
    
    humanUser = await ctx.db.insert("users", {
      email: "human@test.com",
      name: "Test Human",
      role: "user",
    });
    
    adminUser = await ctx.db.insert("users", {
      email: "admin@test.com",
      name: "Test Admin",
      role: "admin",
    });
    
    testEntityId = await ctx.db.insert("entities", {
      name: "Test Entity",
      ownerId: humanUser,
      type: "project",
    });
  });

  describe("getSubtasks", () => {
    test("returns child tasks for a parent task", async () => {
      const parentTaskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Parent Task",
      });
      
      const child1Id = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Child Task 1",
        parentTaskId,
      });
      
      const child2Id = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Child Task 2",
        parentTaskId,
      });
      
      const subtasks = await tasks.getSubtasks(ctx, { parentTaskId });
      
      expect(subtasks).toHaveLength(2);
      expect(subtasks.map(t => t._id)).toContain(child1Id);
      expect(subtasks.map(t => t._id)).toContain(child2Id);
    });

    test("returns empty array for task with no children", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Solo Task",
      });
      
      const subtasks = await tasks.getSubtasks(ctx, { parentTaskId: taskId });
      
      expect(subtasks).toHaveLength(0);
    });
  });

  describe("getOverdue", () => {
    test("includes task with past dueDate and todo status", async () => {
      const pastDate = Date.now() - 86400000;
      
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Overdue Task",
        dueDate: pastDate,
      });
      
      const overdue = await tasks.getOverdue(ctx, {});
      
      expect(overdue.some(t => t._id === taskId)).toBe(true);
    });

    test("excludes task with done status even if past dueDate", async () => {
      const pastDate = Date.now() - 86400000;
      
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Completed Overdue Task",
        dueDate: pastDate,
      });
      
      await tasks.updateStatus(ctx, { id: taskId, status: "done" });
      
      const overdue = await tasks.getOverdue(ctx, {});
      
      expect(overdue.some(t => t._id === taskId)).toBe(false);
    });

    test("excludes task with future dueDate", async () => {
      const futureDate = Date.now() + 86400000;
      
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Future Task",
        dueDate: futureDate,
      });
      
      const overdue = await tasks.getOverdue(ctx, {});
      
      expect(overdue.some(t => t._id === taskId)).toBe(false);
    });

    test("filters by entityId when provided", async () => {
      const pastDate = Date.now() - 86400000;
      
      const otherEntityId = await ctx.db.insert("entities", {
        name: "Other Entity",
        ownerId: humanUser,
        type: "project",
      });
      
      await tasks.create(ctx, {
        entityId: testEntityId,
        title: "My Overdue Task",
        dueDate: pastDate,
      });
      
      const otherTaskId = await tasks.create(ctx, {
        entityId: otherEntityId,
        title: "Other Overdue Task",
        dueDate: pastDate,
      });
      
      const overdue = await tasks.getOverdue(ctx, { entityId: testEntityId });
      
      expect(overdue.some(t => t._id === otherTaskId)).toBe(false);
    });
  });

  describe("create with new fields", () => {
    test("stores priority, parentTaskId, and dueDate", async () => {
      const parentId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Parent",
      });
      
      const dueDate = Date.now() + 86400000;
      
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Task with All Fields",
        priority: 5,
        parentTaskId: parentId,
        dueDate,
      });
      
      const task = await ctx.db.get(taskId);
      
      expect(task.priority).toBe(5);
      expect(task.parentTaskId).toBe(parentId);
      expect(task.dueDate).toBe(dueDate);
    });

    test("defaults priority, parentTaskId, and dueDate to undefined", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Basic Task",
      });
      
      const task = await ctx.db.get(taskId);
      
      expect(task.priority).toBeUndefined();
      expect(task.parentTaskId).toBeUndefined();
      expect(task.dueDate).toBeUndefined();
    });
  });

  describe("updateStatus state machine", () => {
    test("sets completedAt when marking done", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Task to Complete",
      });
      
      await tasks.updateStatus(ctx, { id: taskId, status: "done" });
      
      const task = await ctx.db.get(taskId);
      
      expect(task.status).toBe("done");
      expect(task.completedAt).toBeDefined();
      expect(task.completedAt).toBeGreaterThan(Date.now() - 10000);
    });

    test("clears completedAt when marking todo from done", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Task to Reopen",
      });
      
      await tasks.updateStatus(ctx, { id: taskId, status: "done" });
      await tasks.updateStatus(ctx, { id: taskId, status: "todo" });
      
      const task = await ctx.db.get(taskId);
      
      expect(task.status).toBe("todo");
      expect(task.completedAt).toBeUndefined();
    });

    test("does not set completedAt when marking todo from todo", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Task Staying Todo",
      });
      
      const beforeUpdate = Date.now();
      await tasks.updateStatus(ctx, { id: taskId, status: "todo" });
      const afterUpdate = Date.now();
      
      const task = await ctx.db.get(taskId);
      
      expect(task.status).toBe("todo");
      expect(task.completedAt).toBeUndefined();
    });
  });

  describe("updateTask", () => {
    test("updates title, priority, and dueDate", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Original Title",
      });
      
      const newDueDate = Date.now() + 86400000;
      
      await tasks.updateTask(ctx, {
        id: taskId,
        title: "Updated Title",
        priority: 10,
        dueDate: newDueDate,
      });
      
      const task = await ctx.db.get(taskId);
      
      expect(task.title).toBe("Updated Title");
      expect(task.priority).toBe(10);
      expect(task.dueDate).toBe(newDueDate);
    });

    test("updates blockedBy array", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Task to Block",
      });
      
      const blockerId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Blocker Task",
      });
      
      await tasks.updateTask(ctx, {
        id: taskId,
        blockedBy: [blockerId],
      });
      
      const task = await ctx.db.get(taskId);
      
      expect(task.blockedBy).toContain(blockerId);
    });

    test("throws when updating non-existent task", async () => {
      const fakeId = "nonExistentTaskId" as any;
      
      await expect(tasks.updateTask(ctx, {
        id: fakeId,
        title: "New Title",
      })).rejects.toThrow("Task not found");
    });

    test("throws when non-owner non-admin tries to update", async () => {
      const otherUser = await ctx.db.insert("users", {
        email: "other@test.com",
        name: "Other User",
        role: "user",
      });
      
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Private Task",
      });
      
      ctx = await createContext({ userId: otherUser });
      
      await expect(tasks.updateTask(ctx, {
        id: taskId,
        title: "Hacked Title",
      })).rejects.toThrow("Not authorized");
    });

    test("admin can update any task", async () => {
      const taskId = await tasks.create(ctx, {
        entityId: testEntityId,
        title: "Admin Task",
      });
      
      ctx = await createContext({ userId: adminUser });
      
      await tasks.updateTask(ctx, {
        id: taskId,
        title: "Admin Updated Title",
      });
      
      const task = await ctx.db.get(taskId);
      
      expect(task.title).toBe("Admin Updated Title");
    });
  });
});
```

### `convex/inbox.test.ts`

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { createContext } from "./_generated/testing";
import { inbox } from "./inbox";

describe("inbox module", () => {
  let ctx: any;
  let humanUser: any;
  let agentUser: any;

  beforeEach(async () => {
    ctx = await createContext();
    
    humanUser = await ctx.db.insert("users", {
      email: "human@test.com",
      name: "Test Human",
      role: "user",
    });
    
    agentUser = await ctx.db.insert("users", {
      email: "agent@test.com",
      name: "Test Agent",
      role: "agent",
    });
  });

  describe("list access control", () => {
    test("human sees only their own entries", async () => {
      await inbox.create(ctx, {
        rawText: "Human's message",
        source: "test",
        createdBy: humanUser,
      });
      
      await inbox.create(ctx, {
        rawText: "Another human's message",
        source: "test",
        createdBy: agentUser,
      });
      
      ctx = await createContext({ userId: humanUser });
      
      const entries = await inbox.list(ctx);
      
      expect(entries).toHaveLength(1);
      expect(entries[0].rawText).toBe("Human's message");
    });

    test("agent sees all entries", async () => {
      await inbox.create(ctx, {
        rawText: "First message",
        source: "test",
        createdBy: humanUser,
      });
      
      await inbox.create(ctx, {
        rawText: "Second message",
        source: "test",
        createdBy: agentUser,
      });
      
      ctx = await createContext({ userId: agentUser });
      
      const entries = await inbox.list(ctx);
      
      expect(entries).toHaveLength(2);
    });

    test("admin sees all entries", async () => {
      const adminUser = await ctx.db.insert("users", {
        email: "admin@test.com",
        name: "Test Admin",
        role: "admin",
      });
      
      await inbox.create(ctx, {
        rawText: "Message 1",
        source: "test",
        createdBy: humanUser,
      });
      
      await inbox.create(ctx, {
        rawText: "Message 2",
        source: "test",
        createdBy: agentUser,
      });
      
      ctx = await createContext({ userId: adminUser });
      
      const entries = await inbox.list(ctx);
      
      expect(entries).toHaveLength(2);
    });
  });

  describe("create with sourceMetadata", () => {
    test("stores sourceMetadata on create", async () => {
      const metadata = { url: "https://example.com", method: "POST" };
      
      const entryId = await inbox.create(ctx, {
        rawText: "Test message",
        source: "api",
        createdBy: humanUser,
        sourceMetadata: metadata,
      });
      
      const entry = await ctx.db.get(entryId);
      
      expect(entry.sourceMetadata).toEqual(metadata);
    });

    test("stores sourceMetadata on createAndProcess", async () => {
      const metadata = { url: "https://example.com/process", method: "GET" };
      
      const entryId = await inbox.createAndProcess(ctx, {
        rawText: "Processed message",
        source: "api",
        createdBy: humanUser,
        sourceMetadata: metadata,
      });
      
      const entry = await ctx.db.get(entryId);
      
      expect(entry.sourceMetadata).toEqual(metadata);
      expect(entry.processed).toBe(true);
    });

    test("sourceMetadata is optional", async () => {
      const entryId = await inbox.create(ctx, {
        rawText: "Message without metadata",
        source: "test",
        createdBy: humanUser,
      });
      
      const entry = await ctx.db.get(entryId);
      
      expect(entry.sourceMetadata).toBeUndefined();
    });
  });
});
```

### `convex/memories.test.ts`

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { createContext } from "./_generated/testing";
import { memories } from "./memories";

describe("memories module", () => {
  let ctx: any;
  let humanUser: any;
  let adminUser: any;
  let testEntityId: any;
  const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];

  beforeEach(async () => {
    ctx = await createContext();
    
    humanUser = await ctx.db.insert("users", {
      email: "human@test.com",
      name: "Test Human",
      role: "user",
    });
    
    adminUser = await ctx.db.insert("users", {
      email: "admin@test.com",
      name: "Test Admin",
      role: "admin",
    });
    
    testEntityId = await ctx.db.insert("entities", {
      name: "Test Entity",
      ownerId: humanUser,
      type: "project",
    });
  });

  describe("logAccess", () => {
    test("increments accessCount and sets lastAccessedAt", async () => {
      const memoryId = await memories.create(ctx, {
        text: "Test memory",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
      });
      
      ctx = await createContext({ userId: humanUser });
      
      await memories.logAccess(ctx, { id: memoryId });
      
      const memory = await ctx.db.get(memoryId);
      
      expect(memory.accessCount).toBe(1);
      expect(memory.lastAccessedAt).toBeDefined();
      expect(memory.lastAccessedAt).toBeGreaterThan(Date.now() - 10000);
    });

    test("increments accessCount on multiple calls", async () => {
      const memoryId = await memories.create(ctx, {
        text: "Test memory",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
      });
      
      ctx = await createContext({ userId: humanUser });
      
      await memories.logAccess(ctx, { id: memoryId });
      await memories.logAccess(ctx, { id: memoryId });
      await memories.logAccess(ctx, { id: memoryId });
      
      const memory = await ctx.db.get(memoryId);
      
      expect(memory.accessCount).toBe(3);
    });

    test("throws when memory not found", async () => {
      const fakeId = "nonExistentMemoryId" as any;
      
      ctx = await createContext({ userId: humanUser });
      
      await expect(memories.logAccess(ctx, { id: fakeId })).rejects.toThrow("Memory not found");
    });

    test("throws when user has no access to memory", async () => {
      const otherUser = await ctx.db.insert("users", {
        email: "other@test.com",
        name: "Other User",
        role: "user",
      });
      
      const memoryId = await memories.create(ctx, {
        text: "Private memory",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
      });
      
      ctx = await createContext({ userId: otherUser });
      
      await expect(memories.logAccess(ctx, { id: memoryId })).rejects.toThrow("Not authorized");
    });

    test("admin can log access to any memory", async () => {
      const memoryId = await memories.create(ctx, {
        text: "Admin access test",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
      });
      
      ctx = await createContext({ userId: adminUser });
      
      await memories.logAccess(ctx, { id: memoryId });
      
      const memory = await ctx.db.get(memoryId);
      
      expect(memory.accessCount).toBe(1);
    });
  });

  describe("search remains pure", () => {
    test("search does not modify accessCount", async () => {
      const memoryId = await memories.create(ctx, {
        text: "Searchable memory",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
      });
      
      ctx = await createContext({ userId: humanUser });
      
      const searchResults = await memories.search(ctx, {
        embedding: testEmbedding,
        limit: 10,
      });
      
      const memory = await ctx.db.get(memoryId);
      
      expect(memory.accessCount).toBe(0);
    });
  });

  describe("create with originalInboxId", () => {
    test("stores originalInboxId", async () => {
      const inboxEntryId = await ctx.db.insert("inbox_log", {
        rawText: "Source message",
        source: "test",
        processed: true,
        createdAt: Date.now(),
        createdBy: humanUser,
      });
      
      const memoryId = await memories.create(ctx, {
        text: "Memory from inbox",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
        originalInboxId: inboxEntryId,
      });
      
      const memory = await ctx.db.get(memoryId);
      
      expect(memory.originalInboxId).toBe(inboxEntryId);
    });

    test("defaults accessCount to 0", async () => {
      const memoryId = await memories.create(ctx, {
        text: "Test memory",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
      });
      
      const memory = await ctx.db.get(memoryId);
      
      expect(memory.accessCount).toBe(0);
    });

    test("originalInboxId is optional", async () => {
      const memoryId = await memories.create(ctx, {
        text: "Memory without inbox",
        embedding: testEmbedding,
        linkedEntityIds: [testEntityId],
      });
      
      const memory = await ctx.db.get(memoryId);
      
      expect(memory.originalInboxId).toBeUndefined();
    });
  });
});
```

---

## Schema Additions Required

Before implementing the above, add these fields to the schema:

```typescript
// schema.ts additions
defineSchema({
  tasks: {
    ...
    priority: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    dueDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  inbox_log: {
    ...
    sourceMetadata: v.optional(v.any()),
  },
  memories: {
    ...
    originalInboxId: v.optional(v.id("inbox_log")),
    accessCount: v.number(),
    lastAccessedAt: v.optional(v.number()),
  },
}),
```

Add these indexes to existing tables:

```typescript
// tasks table indexes
{ name: "by_parentTaskId", json: ["parentTaskId"] },
{ name: "by_dueDate", json: ["dueDate"] },

// inbox_log table indexes  
{ name: "by_createdBy", json: ["createdBy"] },
```

## Notes
- The `getOverdue` query filters in memory because Convex compound indexes don't support "less than" comparisons on multiple fields
- `updateStatus` state machine ensures `completedAt` is properly managed when tasks transition between states
- `logAccess` intentionally does NOT check entity access directly; it relies on the same access pattern as `search` and `list`
- All mutations that modify tasks should set `updatedAt` and `updatedBy` for audit trail
