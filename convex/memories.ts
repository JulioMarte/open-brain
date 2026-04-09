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

export const create = mutation({
  args: {
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
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
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("memories", {
      text: args.text,
      embedding: args.embedding,
      linkedEntityIds: args.linkedEntityIds,
      confidenceScore: args.confidenceScore,
      createdAt: Date.now(),
      createdBy: args.createdBy,
    });
    return id;
  },
});