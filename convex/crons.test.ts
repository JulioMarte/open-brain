import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("crons", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  describe("checkOverdueTasks", () => {
    it("creates inbox entry for overdue task", async () => {
      const systemUserId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "system",
          role: "admin",
          name: "System",
          createdAt: Date.now(),
        });
      });

      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Project",
          status: "active",
          updatedAt: Date.now(),
          ownerId: systemUserId,
          createdBy: systemUserId,
          updatedBy: systemUserId,
        });
      });

      const pastDate = Date.now() - 86400000;

      await t.run(async (ctx) => {
        await ctx.db.insert("tasks", {
          entityId: entityId as Id<"entities">,
          title: "Overdue Task",
          status: "todo",
          blockedBy: [],
          priority: 3,
          dueDate: pastDate,
          agentCreated: false,
          createdAt: Date.now(),
          createdBy: systemUserId as Id<"users">,
          updatedBy: systemUserId as Id<"users">,
          updatedAt: Date.now(),
        });
      });

      const result = await t.mutation(internal.crons.checkOverdueTasks, {});

      expect(result.createdCount).toBe(1);

      const inboxEntries = await t.run(async (ctx) => {
        const allEntries = await ctx.db.query("inbox_log").take(100);
        return allEntries.filter((e) => e.source === "system_cron");
      });

      expect(inboxEntries).toHaveLength(1);
      expect(inboxEntries[0].rawText).toContain("Overdue Task");
    });

    it("skips already notified tasks within 24h", async () => {
      const systemUserId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "system",
          role: "admin",
          name: "System",
          createdAt: Date.now(),
        });
      });

      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Project",
          status: "active",
          updatedAt: Date.now(),
          ownerId: systemUserId,
          createdBy: systemUserId,
          updatedBy: systemUserId,
        });
      });

      const pastDate = Date.now() - 86400000;

      const taskId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("tasks", {
          entityId: entityId as Id<"entities">,
          title: "Already Notified Task",
          status: "todo",
          blockedBy: [],
          priority: 3,
          dueDate: pastDate,
          agentCreated: false,
          createdAt: Date.now(),
          createdBy: systemUserId as Id<"users">,
          updatedBy: systemUserId as Id<"users">,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("inbox_log", {
          rawText: "Previous notification",
          source: "system_cron",
          sourceMetadata: {
            taskId: id,
            notifiedAt: Date.now() - 12 * 60 * 60 * 1000,
          },
          processed: false,
          createdAt: Date.now() - 12 * 60 * 60 * 1000,
          createdBy: systemUserId as Id<"users">,
        });

        return id;
      });

      const result = await t.mutation(internal.crons.checkOverdueTasks, {});

      expect(result.createdCount).toBe(0);
    });

    it("excludes done and cancelled tasks", async () => {
      const systemUserId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "system",
          role: "admin",
          name: "System",
          createdAt: Date.now(),
        });
      });

      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Project",
          status: "active",
          updatedAt: Date.now(),
          ownerId: systemUserId,
          createdBy: systemUserId,
          updatedBy: systemUserId,
        });
      });

      const pastDate = Date.now() - 86400000;

      await t.run(async (ctx) => {
        await ctx.db.insert("tasks", {
          entityId: entityId as Id<"entities">,
          title: "Completed Task",
          status: "done",
          blockedBy: [],
          priority: 3,
          dueDate: pastDate,
          agentCreated: false,
          createdAt: Date.now(),
          createdBy: systemUserId as Id<"users">,
          updatedBy: systemUserId as Id<"users">,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("tasks", {
          entityId: entityId as Id<"entities">,
          title: "Cancelled Task",
          status: "cancelled",
          blockedBy: [],
          priority: 3,
          dueDate: pastDate,
          agentCreated: false,
          createdAt: Date.now(),
          createdBy: systemUserId as Id<"users">,
          updatedBy: systemUserId as Id<"users">,
          updatedAt: Date.now(),
        });
      });

      const result = await t.mutation(internal.crons.checkOverdueTasks, {});

      expect(result.createdCount).toBe(0);
    });

    it("excludes tasks with future due dates", async () => {
      const systemUserId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "system",
          role: "admin",
          name: "System",
          createdAt: Date.now(),
        });
      });

      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Project",
          status: "active",
          updatedAt: Date.now(),
          ownerId: systemUserId,
          createdBy: systemUserId,
          updatedBy: systemUserId,
        });
      });

      const futureDate = Date.now() + 86400000;

      await t.run(async (ctx) => {
        await ctx.db.insert("tasks", {
          entityId: entityId as Id<"entities">,
          title: "Future Task",
          status: "todo",
          blockedBy: [],
          priority: 3,
          dueDate: futureDate,
          agentCreated: false,
          createdAt: Date.now(),
          createdBy: systemUserId as Id<"users">,
          updatedBy: systemUserId as Id<"users">,
          updatedAt: Date.now(),
        });
      });

      const result = await t.mutation(internal.crons.checkOverdueTasks, {});

      expect(result.createdCount).toBe(0);
    });
  });
});
