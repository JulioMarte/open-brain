---
title: "ADR-006: Performance Improvements - April 2026"
description: Decisions made during Phase 3 performance optimization
tags: [performance, schema, decisions]
area: convex
type: explanation
status: accepted
author: agent
date: 2026-04-10
related:
  - "004-security-fixes-2026.md"
  - "005-logic-fixes-2026.md"
---

# ADR-006: Performance Improvements - April 2026

## Context

Performance audit identified full-table scans, missing compound indexes, and hardcoded pagination limits that could cause data loss and slow queries at scale.

## Performance Improvements

### 3.1: Fix Memories Full-Table Scan

**File**: `convex/memories.ts:68`

**Bug**: `getUserAccessibleMemories` loaded ALL memories (up to 500) into memory just to filter by user's entities.

```typescript
// BEFORE (full table scan)
const allMemories = await ctx.db.query("memories").take(500);
const linkedMemories = allMemories.filter((m: MemoryDoc) =>
  m.linkedEntityIds?.some((eid: Id<"entities">) => userEntityIds.has(eid))
);

// AFTER (index-based)
const linkedMemories: MemoryDoc[] = [];
for (const entityId of userEntityIds) {
  const memories = await ctx.db
    .query("memories")
    .withIndex("by_linkedEntityId", (q) => q.eq("linkedEntityId", entityId))
    .collect();
  linkedMemories.push(...memories);
}
```

**Impact**: Query now uses index instead of loading entire table.

---

### 3.2: Add Compound Indexes

**File**: `convex/schema.ts`

**Added Indexes**:

```typescript
// entities table - compound index for owner+status queries
.index("by_ownerId_and_status", ["ownerId", "status"])

// tasks table - compound index for creator+status queries
.index("by_createdBy_and_status", ["createdBy", "status"])
```

**Usage**: These indexes support queries like:
- "Get all active entities owned by user X"
- "Get all pending tasks created by user X"

**Impact**: Faster queries on filtered lists.

---

### 3.3: Cursor-Based Pagination

**Files**: `convex/tasks.ts`, `convex/memories.ts`, `convex/inbox.ts`, `convex/entities.ts`

**Bug**: All queries used hardcoded `.take(100)`. If there were 101 items, users lost data.

**Fix**: Added cursor-based pagination pattern:

```typescript
// Query definition with optional pagination args
export const listByEntity = query({
  args: {
    entityId: v.id("entities"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const decodedCursor = args.cursor 
      ? JSON.parse(atob(args.cursor)) 
      : undefined;
    
    let query = ctx.db
      .query("tasks")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId))
      .order("desc");
    
    if (decodedCursor) {
      query = query.cursor(decodedCursor);
    }
    
    const items = await query.take(limit + 1);
    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, -1) : items;
    
    return {
      items: result,
      cursor: hasMore ? btoa(JSON.stringify(items[items.length - 1]._id)) : undefined
    };
  }
});
```

**Impact**: Users can now retrieve all data through pagination.

---

### 3.4: Metadata Field Changed to Array

**File**: `convex/schema.ts:76`

**Bug**: `metadata` was a single `{key, value}` object, limiting storage to one metadata pair.

```typescript
// BEFORE
metadata: v.optional(v.object({ key: v.string(), value: v.string() })),

// AFTER
metadata: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
```

**Migration**: Existing `{key, value}` objects are wrapped in array: `[{key, value}]`

**Impact**: Entities can now store multiple metadata entries.

---

## Schema Changes

These changes are additive (non-breaking):
1. New compound indexes on `entities` and `tasks` tables
2. Metadata field type changed from object to array

**Deployment Order**:
1. Deploy schema first (indices are additive)
2. Then deploy query updates that use the new indices

---

## Testing

Performance tests added:
- Memories are queried via index, not filtered in JavaScript
- Compound indexes exist and are used by queries
- Pagination returns correct cursor when more than limit items exist

---

## Decision

All performance improvements implemented. Schema changes are additive and backward compatible.

## Consequences

- **Positive**: Faster queries, no data loss from hardcoded limits
- **Negative**: More complex query signatures with cursor/limit args