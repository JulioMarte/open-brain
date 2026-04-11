---
title: PHASE-04 - Proactive Cron Jobs
description: Fase 4 de desarrollo - Cron jobs proactivos
tags: [cron, phase]
lastUpdated: 2026-04-10
author: human
---

# PHASE 4: Proactive Cron Jobs

## Objective
Implement background jobs that monitor overdue tasks and inject them into the inbox for human attention.

## Files to Create
- `convex/crons.ts` (new file)

## Cron Job Design

### Overdue Task Monitor (runs every 12 hours)

```typescript
// convex/crons.ts
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

// Cron runs every 12 hours
export const checkOverdueTasks = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const twelveHoursFromNow = now + 12 * 60 * 60 * 1000;
    
    // Get all tasks that are:
    // - NOT done or cancelled
    // - dueDate < twelveHoursFromNow (approaching or overdue)
    
    // For each overdue task:
    // 1. Create inbox_log entry with:
    //    - source: "system_cron"
    //    - sourceMetadata: { taskId, title, dueDate, overdueBy: now - dueDate }
    //    - rawText: "Task '{title}' is overdue! Due: {formatted date}"
    //    - createdBy: system user
    //    - processed: false
    // 2. (Optional) Create proposal for auto-action
    
    // Return count of inbox entries created
  },
});
```

### Scheduler Registration

```typescript
// In your main Convex setup or a scheduler config file:
// This registers checkOverdueTasks to run every 12 hours
// Note: Convex uses cron expressions or interval-based scheduling
```

## Logic Details

### Query for Overdue Tasks
```typescript
// Get tasks approaching/completely overdue
// Use by_dueDate index to filter
const overdueTasks = await ctx.db
  .query("tasks")
  .withIndex("by_dueDate", q => q.lt("dueDate", twelveHoursFromNow))
  .filter(task => task.status !== "done" && task.status !== "cancelled")
  .take(100);
```

### Inbox Entry Creation
```typescript
await ctx.runMutation(internal.inbox.create, {
  rawText: `🔴 Task Overdue: "${task.title}" was due on ${new Date(task.dueDate!).toLocaleString()}`,
  source: "system_cron",
  sourceMetadata: {
    taskId: task._id,
    taskTitle: task.title,
    originalDueDate: task.dueDate,
    overdueByHours: Math.round((now - task.dueDate!) / (60 * 60 * 1000)),
  },
  createdBy: systemUserId,
});
```

### Duplicate Prevention
- Before creating inbox entry, check if an entry with same `sourceMetadata.taskId` and `source: "system_cron"` exists within last 24h
- This prevents spamming the inbox with the same overdue notification

## Edge Cases

1. **Task already has inbox entry for same task**: Skip, don't duplicate
2. **Task's dueDate is null**: Skip, only process tasks with dueDate set
3. **System user not found**: Create or get system user first
4. **Large number of overdue tasks**: Process in batches of 100, use pagination

## Testing Strategy

Create `convex/crons.test.ts`:

### Test Cases

1. **No overdue tasks**: Run cron when no tasks due → 0 inbox entries created
2. **Single overdue task**: Task due yesterday, status=todo → 1 inbox entry created with correct message
3. **Multiple overdue tasks**: 5 overdue tasks → 5 inbox entries created
4. **Already done task**: Task due yesterday but status=done → NOT in results
5. **Task without dueDate**: Task with dueDate=null → NOT in results
6. **Duplicate prevention**: Same task checked twice in 24h → only 1 inbox entry (first time)
7. **Future task not yet overdue**: Task due in 1 hour, within 12h window → inbox entry created (approaching)
8. **Cancelled task**: Task status=cancelled → NOT in results

Mock ctx.db for testing. Use `describe` blocks for organization.

Write the complete test file content:

```typescript
// convex/crons.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkOverdueTasks } from "./crons";

describe("checkOverdueTasks", () => {
  const createMockTask = (overrides: Partial<{
    _id: string;
    title: string;
    status: string;
    dueDate: number | null;
  }> = {}) => ({
    _id: "task1",
    title: "Test Task",
    status: "todo",
    dueDate: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
    ...overrides,
  });

  const createMockCtx = (tasks: any[]) => {
    const mockDb = {
      query: vi.fn(() => ({
        withIndex: vi.fn(() => ({
          filter: vi.fn(() => ({
            take: vi.fn().mockResolvedValue(tasks),
          })),
        })),
      })),
      runMutation: vi.fn(),
    };

    const mockCtx = {
      db: mockDb,
      runMutation: mockDb.runMutation,
    } as any;

    return { mockCtx, mockDb };
  };

  const createInboxEntryMatcher = (taskId: string) => {
    return expect.objectContaining({
      rawText: expect.stringContaining("Task Overdue"),
      source: "system_cron",
      sourceMetadata: expect.objectContaining({
        taskId,
      }),
    });
  };

  describe("when there are no overdue tasks", () => {
    it("should not create any inbox entries", async () => {
      const { mockCtx } = createMockCtx([]);
      await checkOverdueTasks.handler(mockCtx);
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });
  });

  describe("when there is a single overdue task", () => {
    it("should create one inbox entry with correct message", async () => {
      const overdueTask = createMockTask({
        _id: "task123",
        title: "Overdue Task",
        dueDate: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
      });
      
      const { mockCtx } = createMockCtx([overdueTask]);
      await checkOverdueTasks.handler(mockCtx);
      
      expect(mockCtx.runMutation).toHaveBeenCalledTimes(1);
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.stringContaining("inbox.create"),
        createInboxEntryMatcher("task123")
      );
    });
  });

  describe("when there are multiple overdue tasks", () => {
    it("should create an inbox entry for each overdue task", async () => {
      const tasks = [
        createMockTask({ _id: "task1", title: "Task 1" }),
        createMockTask({ _id: "task2", title: "Task 2" }),
        createMockTask({ _id: "task3", title: "Task 3" }),
        createMockTask({ _id: "task4", title: "Task 4" }),
        createMockTask({ _id: "task5", title: "Task 5" }),
      ];
      
      const { mockCtx } = createMockCtx(tasks);
      await checkOverdueTasks.handler(mockCtx);
      
      expect(mockCtx.runMutation).toHaveBeenCalledTimes(5);
    });
  });

  describe("when task is already done", () => {
    it("should not include done tasks in overdue check", async () => {
      const doneTask = createMockTask({
        _id: "doneTask",
        status: "done",
        dueDate: Date.now() - 24 * 60 * 60 * 1000,
      });
      
      const { mockCtx, mockDb } = createMockCtx([doneTask]);
      
      // The filter should exclude done tasks
      const filterFn = mockDb.query().withIndex().filter;
      expect(filterFn).toHaveBeenCalled();
      
      await checkOverdueTasks.handler(mockCtx);
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });
  });

  describe("when task has no dueDate", () => {
    it("should skip tasks with null dueDate", async () => {
      const noDateTask = createMockTask({
        _id: "noDateTask",
        dueDate: null,
      });
      
      const { mockCtx } = createMockCtx([noDateTask]);
      await checkOverdueTasks.handler(mockCtx);
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });
  });

  describe("duplicate prevention", () => {
    it("should not create duplicate entries for same task within 24h", async () => {
      const task = createMockTask({ _id: "task1" });
      const { mockCtx } = createMockCtx([task]);
      
      // First run - should create entry
      await checkOverdueTasks.handler(mockCtx);
      const firstCallCount = mockCtx.runMutation.mock.calls.length;
      
      // Reset and run again
      mockCtx.runMutation.mockClear();
      
      // Second run - should skip due to existing entry
      await checkOverdueTasks.handler(mockCtx);
      
      // Should not have created another entry
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });
  });

  describe("when task is approaching but not yet overdue", () => {
    it("should create inbox entry for tasks due within 12 hours", async () => {
      const approachingTask = createMockTask({
        _id: "approachingTask",
        title: "Soon Due Task",
        dueDate: Date.now() + 60 * 60 * 1000, // 1 hour from now (within 12h window)
      });
      
      const { mockCtx } = createMockCtx([approachingTask]);
      await checkOverdueTasks.handler(mockCtx);
      
      expect(mockCtx.runMutation).toHaveBeenCalledTimes(1);
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.stringContaining("inbox.create"),
        expect.objectContaining({
          rawText: expect.stringContaining("Soon Due Task"),
        })
      );
    });
  });

  describe("when task is cancelled", () => {
    it("should not include cancelled tasks in overdue check", async () => {
      const cancelledTask = createMockTask({
        _id: "cancelledTask",
        status: "cancelled",
      });
      
      const { mockCtx } = createMockCtx([cancelledTask]);
      await checkOverdueTasks.handler(mockCtx);
      expect(mockCtx.runMutation).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle empty task list gracefully", async () => {
      const { mockCtx } = createMockCtx([]);
      await expect(checkOverdueTasks.handler(mockCtx)).resolves.not.toThrow();
    });

    it("should handle tasks with very old due dates", async () => {
      const veryOldTask = createMockTask({
        _id: "veryOldTask",
        title: "Very Old Task",
        dueDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      });
      
      const { mockCtx } = createMockCtx([veryOldTask]);
      await checkOverdueTasks.handler(mockCtx);
      
      expect(mockCtx.runMutation).toHaveBeenCalledTimes(1);
    });

    it("should calculate overdue hours correctly", async () => {
      const taskDue24HoursAgo = createMockTask({
        _id: "task24",
        dueDate: Date.now() - 24 * 60 * 60 * 1000,
      });
      
      const { mockCtx } = createMockCtx([taskDue24HoursAgo]);
      await checkOverdueTasks.handler(mockCtx);
      
      expect(mockCtx.runMutation).toHaveBeenCalledWith(
        expect.stringContaining("inbox.create"),
        expect.objectContaining({
          sourceMetadata: expect.objectContaining({
            overdueByHours: expect.closeTo(24, 1),
          }),
        })
      );
    });
  });
});
```