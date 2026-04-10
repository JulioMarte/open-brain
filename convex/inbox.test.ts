import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("inbox", () => {
  let t: ReturnType<typeof convexTest>;
  
  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  describe("list access control", () => {
    it("human sees only their own entries", async () => {
      const humanId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "human@test.com",
          role: "human",
          name: "Test Human",
          email: "human@test.com",
          createdAt: Date.now(),
        });
      });

      const otherUserId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "other@test.com",
          role: "human",
          name: "Other User",
          email: "other@test.com",
          createdAt: Date.now(),
        });
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("inbox_log", {
          rawText: "Human's message",
          source: "email",
          processed: false,
          createdAt: Date.now(),
          createdBy: humanId,
        });
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("inbox_log", {
          rawText: "Other's message",
          source: "telegram",
          processed: false,
          createdAt: Date.now(),
          createdBy: otherUserId,
        });
      });

      const asHuman = t.withIdentity({ name: "Test Human", email: "human@test.com" });
      const entries = await asHuman.query(api.inbox.list, {});
      
      expect(entries).toHaveLength(1);
      expect(entries[0].rawText).toBe("Human's message");
    });

    it("admin sees all entries", async () => {
      const humanId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "human@test.com",
          role: "human",
          name: "Test Human",
          email: "human@test.com",
          createdAt: Date.now(),
        });
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("inbox_log", {
          rawText: "Human's message",
          source: "email",
          processed: false,
          createdAt: Date.now(),
          createdBy: humanId,
        });
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("inbox_log", {
          rawText: "Admin's message",
          source: "webhook",
          processed: false,
          createdAt: Date.now(),
          createdBy: humanId,
        });
      });

      const asAdmin = t.withIdentity({ name: "Admin User", email: "admin@test.com", identity: { role: "admin" } });
      const entries = await asAdmin.query(api.inbox.list, {});
      
      expect(entries).toHaveLength(2);
    });
  });

  describe("create with sourceMetadata", () => {
    it("stores sourceMetadata on create", async () => {
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "test@test.com",
          role: "human",
          name: "Test User",
          email: "test@test.com",
          createdAt: Date.now(),
        });
      });

      const metadata = { url: "https://example.com", method: "POST" };
      
      const entryId = await t.run(async (ctx) => {
        return await ctx.db.insert("inbox_log", {
          rawText: "Test message",
          source: "api",
          processed: false,
          createdAt: Date.now(),
          createdBy: userId,
          sourceMetadata: metadata,
        });
      });
      
      const entry = await t.run(async (ctx) => {
        return await ctx.db.get(entryId);
      });
      
      expect(entry?.sourceMetadata).toEqual(metadata);
    });

    it("sourceMetadata is optional", async () => {
      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "test@test.com",
          role: "human",
          name: "Test User",
          email: "test@test.com",
          createdAt: Date.now(),
        });
      });

      const entryId = await t.run(async (ctx) => {
        return await ctx.db.insert("inbox_log", {
          rawText: "Message without metadata",
          source: "manual",
          processed: false,
          createdAt: Date.now(),
          createdBy: userId,
        });
      });
      
      const entry = await t.run(async (ctx) => {
        return await ctx.db.get(entryId);
      });
      
      expect(entry?.sourceMetadata).toBeUndefined();
    });
  });
});
