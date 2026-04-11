---
title: "ADR-005: Logic Fixes - April 2026"
description: Decisions made during Phase 2 logic and data integrity fixes
tags: [logic, data-integrity, decisions]
area: convex
type: explanation
status: accepted
author: agent
date: 2026-04-10
related:
  - "004-security-fixes-2026.md"
---

# ADR-005: Logic Fixes - April 2026

## Context

During code review of entities, tasks, and crons modules, several logic issues were identified that could cause incorrect behavior or data integrity problems.

## Logic Issues Fixed

### 2.1: entities.listByType - Admin Type Filter Broken

**File**: `convex/entities.ts:48-54`

**Bug**: When admin passed a `type` filter, the code incorrectly queried `by_ownerId` index (only admin's entities) instead of `by_type` index (all entities of that type).

```typescript
// BEFORE (broken)
if (isAdmin(user.role)) {
  if (args.type) {
    return await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))  // Wrong index
      .order("desc")
      .take(100);
  }
}

// AFTER (fixed)
if (isAdmin(user.role)) {
  if (args.type) {
    return await ctx.db
      .query("entities")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .order("desc")
      .take(100);
  }
}
```

**Impact**: Admins filtering entities by type received only their own entities instead of all entities of that type.

---

### 2.2: Standardize Permission Model in Tasks

**Files**: `convex/tasks.ts:237` (updateStatus) vs `convex/tasks.ts:272` (updateTask)

**Bug**: Inconsistent authorization models:
- `updateStatus` checked `entity.ownerId`
- `updateTask` checked `task.createdBy`

**Fix**: Standardized both to use `entity.ownerId` check. The entity owner should be able to modify any task under their entity.

```typescript
// updateTask BEFORE (inconsistent)
if (task.createdBy !== user._id && !isAdmin(user.role)) {
  throw new Error("Not authorized to update this task");
}

// updateTask AFTER (consistent with updateStatus)
const entity = await ctx.db.get(task.entityId);
if (!entity) throw new Error("Entity not found");
if (entity.ownerId !== user._id && !isAdmin(user.role)) {
  throw new Error("Not authorized to update this task");
}
```

**Impact**: Entity owners can now modify any task within their entity, making permission model consistent.

---

### 2.3: Cron - Handle Missing System User Gracefully

**File**: `convex/crons.ts:31-33`

**Bug**: Cron job threw an error and stopped completely if system user didn't exist.

```typescript
// BEFORE (crashes cron)
if (!systemUser) {
  throw new Error("System user not found");
}

// AFTER (graceful handling)
if (!systemUser) {
  console.error("System user not found for cron job");
  return { createdCount: 0 };
}
```

**Impact**: Cron jobs no longer crash on first run or missing system user. They gracefully return empty results.

---

### 2.4: Circular Dependency Detection in blockedBy

**File**: `convex/tasks.ts:276-287`

**Bug**: Only validated self-reference (`A->A`) but not circular chains (`A->B->C->A`).

**Fix**: Implemented BFS walk of blockedBy chain with max depth of 10:

```typescript
const visited = new Set<Id<"tasks">>();
const queue: Id<"tasks">[] = [...args.blockedBy];

while (queue.length > 0) {
  if (visited.size > 10) {
    throw new Error("blockedBy chain too deep (max 10)");
  }
  
  const current = queue.shift()!;
  if (current === args.id) {
    throw new Error("Circular dependency detected in blockedBy");
  }
  if (visited.has(current)) continue;
  visited.add(current);
  
  const task = await ctx.db.get(current);
  if (task?.blockedBy) {
    queue.push(...task.blockedBy);
  }
}
```

**Impact**: Prevents circular task dependencies that could cause infinite loops or deadlocks.

---

### 2.5: Validate Entity is Active Before Creating Task

**File**: `convex/tasks.ts:193-219`

**Bug**: Tasks could be created on archived entities.

**Fix**: Added entity status check before task creation:

```typescript
const entity = await ctx.db.get(args.entityId);
if (!entity) {
  throw new Error("Entity not found");
}
if (entity.status !== "active") {
  throw new Error("Cannot create task on archived entity");
}
```

**Impact**: Prevents task creation on non-active entities.

---

## Testing

Logic tests added to verify fixes:
- Admin filtering entities by type returns correct results
- `updateStatus` and `updateTask` use consistent authorization (entity.ownerId)
- Circular blockedBy chains are rejected with proper error
- Cron handles missing system user gracefully
- Tasks cannot be created on archived entities

## Decision

All logic fixes implemented as described. These improve data integrity and prevent edge cases.

## Consequences

- **Positive**: Consistent permission model, better data integrity
- **Negative**: Additional DB lookups add small overhead