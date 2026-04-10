import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Schema Validation Tests", () => {
  it("inserts task with valid status", async () => {
    const t = convexTest(schema, modules);
    
    const task = await t.run(async (ctx) => {
      const id = await ctx.db.insert("tasks", {
        entityId: "entity1" as any,
        title: "Test",
        status: "todo",
        blockedBy: [],
        agentCreated: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: "user1" as any,
        updatedBy: "user1" as any,
      });
      return await ctx.db.get(id);
    });
    
    expect(task?.title).toBe("Test");
  });
});
