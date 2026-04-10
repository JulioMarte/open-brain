import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, isAdmin } from "./lib/auth";
import { Doc } from "./_generated/dataModel";

type EntityDoc = Doc<"entities">;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (isAdmin(user.role)) {
      return await ctx.db.query("entities").take(100);
    }
    return await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .take(100);
  },
});

export const getById = query({
  args: { id: v.id("entities") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const entity = await ctx.db.get(args.id);

    if (!entity) return null;

    if (isAdmin(user.role) || entity.ownerId === user._id) {
      return entity;
    }

    throw new Error("No tienes acceso a esta entidad");
  },
});

export const listByType = query({
  args: {
    type: v.optional(
      v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    if (isAdmin(user.role)) {
      if (args.type) {
        return await ctx.db
          .query("entities")
          .withIndex("by_type", (q) => q.eq("type", args.type!))
          .take(100);
      }
      return await ctx.db.query("entities").take(100);
    }

    let baseQuery = ctx.db.query("entities").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id));

    if (args.type) {
      const byTypeQuery = ctx.db
        .query("entities")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .filter((q) => q.eq(q.field("ownerId"), user._id));
      return await byTypeQuery.take(100);
    }

    return await baseQuery.take(100);
  },
});

export const listByStatus = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    if (isAdmin(user.role)) {
      if (args.status) {
        return await ctx.db
          .query("entities")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .take(100);
      }
      return await ctx.db.query("entities").take(100);
    }

    if (args.status) {
      const filteredQuery = ctx.db
        .query("entities")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .filter((q) => q.eq(q.field("ownerId"), user._id));
      return await filteredQuery.take(100);
    }

    return await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .take(100);
  },
});

export const create = mutation({
  args: {
    type: v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin")),
    name: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const id = await ctx.db.insert("entities", {
      type: args.type,
      name: args.name,
      description: args.description,
      status: "active",
      metadata: args.metadata,
      updatedAt: Date.now(),
      ownerId: user._id,
      createdBy: user._id,
      updatedBy: user._id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("entities"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const entity = await ctx.db.get(args.id);

    if (!entity) {
      throw new Error("Entidad no encontrada");
    }

    if (!isAdmin(user.role) && entity.ownerId !== user._id) {
      throw new Error("No tienes permiso para editar esta entidad");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: user._id };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.status !== undefined) updates.status = args.status;
    if (args.metadata !== undefined) updates.metadata = args.metadata;

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});