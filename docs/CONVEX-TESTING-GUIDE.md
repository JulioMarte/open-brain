# Convex Backend Testing Guide

## Overview
Convex backend functions (queries, mutations, actions) are tested using `convex-test` with Vitest.

## Required Setup

### 1. vitest.config.ts (Root)
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.{ts,js}'],
    globals: true,
  },
});
```

### 2. Imports (CORRECT vs WRONG)

```typescript
// ✅ CORRECT
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { Id, Doc } from "./_generated/dataModel";

// ❌ WRONG - these don't exist
import { useFakeAuth, useMutation, useQuery } from "convex-test";
import { getSchema } from "./schema";
import { Id } from "convex/dataModel";
```

## Test Patterns

### Pattern 1: Direct DB Operations (testing schema)
```typescript
const modules = import.meta.glob("./**/*.ts");

describe("tasks table", () => {
  it("inserts task with all fields", async () => {
    const t = convexTest(schema, modules);
    
    const task = await t.run(async (ctx) => {
      const id = await ctx.db.insert("tasks", {
        entityId: "entity1" as Id<"entities">,
        title: "Test Task",
        status: "todo",
        blockedBy: [],
        priority: 3,
        parentTaskId: undefined,
        dueDate: Date.now() + 86400000,
        completedAt: undefined,
        agentCreated: false,
        createdAt: Date.now(),
        createdBy: "user1" as Id<"users">,
        updatedBy: "user1" as Id<"users">,
      });
      return await ctx.db.get(id);
    });
    
    expect(task?.title).toBe("Test Task");
    expect(task?.priority).toBe(3);
  });
});
```

### Pattern 2: Calling Query Functions
```typescript
describe("tasks.list", () => {
  it("returns empty array when no tasks", async () => {
    const t = convexTest(schema, modules);
    
    const tasks = await t.query(api.tasks.list, {});
    expect(tasks).toEqual([]);
  });
});
```

### Pattern 3: Calling Mutations with Auth
```typescript
describe("tasks.create", () => {
  it("creates task for authenticated user", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ 
      name: "Test User", 
      email: "test@example.com" 
    });
    
    // First create an entity
    const entityId = await t.run(async (ctx) => {
      return await ctx.db.insert("entities", {
        type: "project",
        name: "Test Project",
        status: "active",
        updatedAt: Date.now(),
        ownerId: "user1" as Id<"users">,
        createdBy: "user1" as Id<"users">,
        updatedBy: "user1" as Id<"users">,
      });
    });
    
    // Now call mutation with auth
    await asUser.mutation(api.tasks.create, {
      entityId,
      title: "New Task",
    });
    
    const tasks = await t.query(api.tasks.list, {});
    expect(tasks.length).toBe(1);
  });
});
```

### Pattern 4: Testing Access Control
```typescript
it("rejects unauthenticated user", async () => {
  const t = convexTest(schema, modules);
  // No withIdentity() - runs without auth
  
  await expect(t.query(api.tasks.list, {})).rejects.toThrow();
});
```

## Limitations

### Cannot Test
- Vector search (`ctx.vectorSearch`) - not mockable
- Action → Internal Mutation chains (complex)
- Real OpenAI/fetch calls (need vi.stubGlobal)

### Can Test
- Query return values
- Mutation database side effects
- Auth access control
- Schema validation (via db.insert errors)

## Adding New Tests

When adding tests for a new module (e.g., `convex/newModule.ts`):

1. Create `convex/newModule.test.ts`
2. Use same imports and pattern as above
3. Test all public queries and mutations
4. Test auth requirements for each function

## Key Files to Test

| File | What to Test |
|------|--------------|
| tasks.ts | create, list, getActionable, getSubtasks, getOverdue, updateStatus, updateTask, markDone |
| inbox.ts | list, listUnprocessed, create, markProcessed |
| memories.ts | create, search, list, logAccess |
| entities.ts | create, list, getById, update |
| proposals.ts | create, list, approve, reject |

## Example: Full Test File for Tasks

```typescript
import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("tasks", () => {
  let t: ReturnType<typeof convexTest>;
  
  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  describe("create", () => {
    it("creates a task with default values", async () => {
      // Create an entity first (tasks require entityId)
      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Project",
          status: "active",
          updatedAt: Date.now(),
          ownerId: "user1" as Id<"users">,
          createdBy: "user1" as Id<"users">,
          updatedBy: "user1" as Id<"users">,
        });
      });

      await t.mutation(api.tasks.create, {
        entityId,
        title: "New Task",
      });

      const tasks = await t.query(api.tasks.list, {});
      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe("New Task");
      expect(tasks[0].status).toBe("todo");
    });
  });

  describe("list", () => {
    it("returns empty array when no tasks exist", async () => {
      const tasks = await t.query(api.tasks.list, {});
      expect(tasks).toEqual([]);
    });
  });
});
```

## Testing with Custom Indexes

### Important Limitation
When using `convex-test`, the mocked `ctx.db` does NOT support custom indexes like `withIndex("by_source", ...)`. The test environment only supports system indexes (`_id`, `_creationTime`).

### Workarounds

1. **Use `.filter()` instead of custom indexes:**
```typescript
// Instead of this (won't work in tests):
const entry = await ctx.db
  .query("inbox_log")
  .withIndex("by_source", q => q.eq("source", "system_cron"))
  .first();

// Use this:
const entries = await ctx.db.query("inbox_log").take(100);
const entry = entries.find(e => e.source === "system_cron");
```

2. **Restructure tests to avoid index-dependent logic:**
Test the cron job's behavior without relying on specific index queries.

3. **Mock the db.query return value:**
```typescript
mockDb.query = vi.fn(() => ({
  withIndex: vi.fn(() => ({
    filter: vi.fn(() => ({
      first: vi.fn().mockResolvedValue(existingEntry),
    })),
  })),
}));
```

### Key Insight
Unit test the cron logic, not the query mechanics. If a function relies heavily on specific indexes, test the function's outcome rather than its internal query structure.

## Summary: Key Rules

ALWAYS use:
- `convexTest` (singular), NOT `useFakeAuth`, `useMutation`, etc.
- `./_generated/api` for api/internal imports
- `./_generated/dataModel` for Id/Doc types
- `environment: "edge-runtime"` in vitest config

NEVER use:
- `getSchema` (doesn't exist)
- `convex/dataModel` (wrong path)
- `useFakeAuth`, `useMutation`, `useQuery` (don't exist)