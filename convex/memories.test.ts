import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

describe("memories", () => {
  let t: ReturnType<typeof convexTest>;
  const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
  
  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  describe("logAccess", () => {
    it("increments accessCount and sets lastAccessedAt", async () => {
      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Entity",
          status: "active",
          updatedAt: Date.now(),
          ownerId: "user1" as Id<"users">,
          createdBy: "user1" as Id<"users">,
          updatedBy: "user1" as Id<"users">,
        });
      });

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const memoryId = await asUser.mutation(api.memories.create, {
        text: "Test memory",
        embedding: testEmbedding,
        linkedEntityIds: [entityId],
      });
      
      await asUser.mutation(api.memories.logAccess, { id: memoryId });
      
      const memories = await asUser.query(api.memories.list, {});
      const memory = memories.find((m: any) => m._id === memoryId);
      
      expect(memory?.accessCount).toBe(1);
      expect(memory?.lastAccessedAt).toBeDefined();
      expect(memory?.lastAccessedAt).toBeGreaterThan(Date.now() - 10000);
    });

    it("increments accessCount on multiple calls", async () => {
      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Entity",
          status: "active",
          updatedAt: Date.now(),
          ownerId: "user1" as Id<"users">,
          createdBy: "user1" as Id<"users">,
          updatedBy: "user1" as Id<"users">,
        });
      });

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const memoryId = await asUser.mutation(api.memories.create, {
        text: "Test memory",
        embedding: testEmbedding,
        linkedEntityIds: [entityId],
      });
      
      await asUser.mutation(api.memories.logAccess, { id: memoryId });
      await asUser.mutation(api.memories.logAccess, { id: memoryId });
      await asUser.mutation(api.memories.logAccess, { id: memoryId });
      
      const memories = await asUser.query(api.memories.list, {});
      const memory = memories.find((m: any) => m._id === memoryId);
      
      expect(memory?.accessCount).toBe(3);
    });
  });

  describe("create with originalInboxId", () => {
    it("stores originalInboxId", async () => {
      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Entity",
          status: "active",
          updatedAt: Date.now(),
          ownerId: "user1" as Id<"users">,
          createdBy: "user1" as Id<"users">,
          updatedBy: "user1" as Id<"users">,
        });
      });

      const userId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
          tokenIdentifier: "test@test.com",
          role: "human",
          name: "Test User",
          email: "test@test.com",
          createdAt: Date.now(),
        });
      });

      const inboxEntryId = await t.run(async (ctx) => {
        return await ctx.db.insert("inbox_log", {
          rawText: "Source message",
          source: "email",
          processed: true,
          createdAt: Date.now(),
          createdBy: userId,
        });
      });

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const memoryId = await asUser.mutation(api.memories.create, {
        text: "Memory from inbox",
        embedding: testEmbedding,
        linkedEntityIds: [entityId],
        originalInboxId: inboxEntryId,
      });
      
      const memories = await asUser.query(api.memories.list, {});
      const memory = memories.find((m: any) => m._id === memoryId);
      
      expect(memory?.originalInboxId).toBe(inboxEntryId);
    });

    it("defaults accessCount to 0", async () => {
      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Entity",
          status: "active",
          updatedAt: Date.now(),
          ownerId: "user1" as Id<"users">,
          createdBy: "user1" as Id<"users">,
          updatedBy: "user1" as Id<"users">,
        });
      });

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const memoryId = await asUser.mutation(api.memories.create, {
        text: "Test memory",
        embedding: testEmbedding,
        linkedEntityIds: [entityId],
      });
      
      const memories = await asUser.query(api.memories.list, {});
      const memory = memories.find((m: any) => m._id === memoryId);
      
      expect(memory?.accessCount).toBe(0);
    });

    it("originalInboxId is optional", async () => {
      const entityId = await t.run(async (ctx) => {
        return await ctx.db.insert("entities", {
          type: "project",
          name: "Test Entity",
          status: "active",
          updatedAt: Date.now(),
          ownerId: "user1" as Id<"users">,
          createdBy: "user1" as Id<"users">,
          updatedBy: "user1" as Id<"users">,
        });
      });

      const asUser = t.withIdentity({ name: "Test User", email: "test@example.com" });
      
      const memoryId = await asUser.mutation(api.memories.create, {
        text: "Memory without inbox",
        embedding: testEmbedding,
        linkedEntityIds: [entityId],
      });
      
      const memories = await asUser.query(api.memories.list, {});
      const memory = memories.find((m: any) => m._id === memoryId);
      
      expect(memory?.originalInboxId).toBeUndefined();
    });
  });
});
