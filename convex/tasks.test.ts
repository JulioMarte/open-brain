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

  describe("getSubtasks", () => {
    it("returns child tasks for a parent task", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const parentTaskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Parent Task",
      });
      
      await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Child Task 1",
        parentTaskId,
      });
      
      await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Child Task 2",
        parentTaskId,
      });
      
      const subtasks = await asUser.query(api.tasks.getSubtasks, { parentTaskId });
      
      expect(subtasks).toHaveLength(2);
    });

    it("returns empty array for task with no children", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Solo Task",
      });
      
      const subtasks = await asUser.query(api.tasks.getSubtasks, { parentTaskId: taskId });
      
      expect(subtasks).toHaveLength(0);
    });
  });

  describe("getOverdue", () => {
    it("includes task with past dueDate and todo status", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      const pastDate = Date.now() - 86400000;
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Overdue Task",
        dueDate: pastDate,
      });
      
      const overdue = await asUser.query(api.tasks.getOverdue, {});
      
      expect(overdue.some((t: any) => t._id === taskId)).toBe(true);
    });

    it("excludes task with done status even if past dueDate", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      const pastDate = Date.now() - 86400000;
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Completed Overdue Task",
        dueDate: pastDate,
      });
      
      await asUser.mutation(api.tasks.updateStatus, { id: taskId, status: "done" });
      
      const overdue = await asUser.query(api.tasks.getOverdue, {});
      
      expect(overdue.some((t: any) => t._id === taskId)).toBe(false);
    });

    it("excludes task with future dueDate", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      const futureDate = Date.now() + 86400000;
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Future Task",
        dueDate: futureDate,
      });
      
      const overdue = await asUser.query(api.tasks.getOverdue, {});
      
      expect(overdue.some((t: any) => t._id === taskId)).toBe(false);
    });
  });

  describe("create with new fields", () => {
    it("stores priority, parentTaskId, and dueDate", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const parentId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Parent",
      });
      
      const dueDate = Date.now() + 86400000;
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Task with All Fields",
        priority: 5,
        parentTaskId: parentId,
        dueDate,
      });
      
      const tasks = await asUser.query(api.tasks.list, {});
      const task = tasks.find((t: any) => t._id === taskId);
      
      expect(task?.priority).toBe(5);
      expect(task?.parentTaskId).toBe(parentId);
      expect(task?.dueDate).toBe(dueDate);
    });

    it("defaults priority, parentTaskId, and dueDate to undefined", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Basic Task",
      });
      
      const tasks = await asUser.query(api.tasks.list, {});
      const task = tasks.find((t: any) => t._id === taskId);
      
      expect(task?.priority).toBeUndefined();
      expect(task?.parentTaskId).toBeUndefined();
      expect(task?.dueDate).toBeUndefined();
    });
  });

  describe("updateStatus state machine", () => {
    it("sets completedAt when marking done", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Task to Complete",
      });
      
      await asUser.mutation(api.tasks.updateStatus, { id: taskId, status: "done" });
      
      const tasks = await asUser.query(api.tasks.list, {});
      const task = tasks.find((t: any) => t._id === taskId);
      
      expect(task?.status).toBe("done");
      expect(task?.completedAt).toBeDefined();
      expect(task?.completedAt).toBeGreaterThan(Date.now() - 10000);
    });

    it("clears completedAt when marking todo from done", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Task to Reopen",
      });
      
      await asUser.mutation(api.tasks.updateStatus, { id: taskId, status: "done" });
      await asUser.mutation(api.tasks.updateStatus, { id: taskId, status: "todo" });
      
      const tasks = await asUser.query(api.tasks.list, {});
      const task = tasks.find((t: any) => t._id === taskId);
      
      expect(task?.status).toBe("todo");
      expect(task?.completedAt).toBeUndefined();
    });
  });

  describe("updateTask", () => {
    it("updates title, priority, and dueDate", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Original Title",
      });
      
      const newDueDate = Date.now() + 86400000;
      
      await asUser.mutation(api.tasks.updateTask, {
        id: taskId,
        title: "Updated Title",
        priority: 10,
        dueDate: newDueDate,
      });
      
      const tasks = await asUser.query(api.tasks.list, {});
      const task = tasks.find((t: any) => t._id === taskId);
      
      expect(task?.title).toBe("Updated Title");
      expect(task?.priority).toBe(10);
      expect(task?.dueDate).toBe(newDueDate);
    });

    it("updates blockedBy array", async () => {
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

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const taskId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Task to Block",
      });
      
      const blockerId = await asUser.mutation(api.tasks.create, {
        entityId,
        title: "Blocker Task",
      });
      
      await asUser.mutation(api.tasks.updateTask, {
        id: taskId,
        blockedBy: [blockerId],
      });
      
      const tasks = await asUser.query(api.tasks.list, {});
      const task = tasks.find((t: any) => t._id === taskId);
      
      expect(task?.blockedBy).toContain(blockerId);
    });
  });
});
