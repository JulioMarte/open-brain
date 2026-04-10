import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { AgentTokenClaims } from "./agentJwt";

type UserDoc = Doc<"users">;
type EntityDoc = Doc<"entities">;

export interface AccessContext {
  user: UserDoc;
  claims?: AgentTokenClaims;
}

export async function canAccessEntity(
  ctx: QueryCtx | MutationCtx,
  accessCtx: AccessContext,
  entityId: Id<"entities">
): Promise<boolean> {
  const { user, claims } = accessCtx;

  if (user.role === "admin") {
    return true;
  }

  if (user.role === "human") {
    const entity = await ctx.db.get(entityId);
    if (!entity) return false;
    return entity.ownerId === user._id;
  }

  if (user.role === "agent" || user.role === "sub_agent") {
    if (!claims) {
      return false;
    }

    if (claims.scope === "orchestrator") {
      return claims.ownerId === user.agentOwnerId;
    }

    if (claims.scope === "entity_scoped") {
      if (claims.ownerId !== user.agentOwnerId) {
        return false;
      }
      return claims.scopeEntityIds?.includes(entityId) ?? false;
    }

    if (claims.scope === "sub_agent") {
      if (claims.ownerId !== user.agentOwnerId) {
        return false;
      }
      return claims.scopeEntityIds?.includes(entityId) ?? false;
    }

    return false;
  }

  return false;
}

export async function requireEntityAccess(
  ctx: QueryCtx | MutationCtx,
  accessCtx: AccessContext,
  entityId: Id<"entities">
): Promise<EntityDoc> {
  const entity = await ctx.db.get(entityId);
  if (!entity) {
    throw new Error("Entidad no encontrada");
  }

  const canAccess = await canAccessEntity(ctx, accessCtx, entityId);
  if (!canAccess) {
    throw new Error("No tienes acceso a esta entidad");
  }

  return entity;
}

export async function filterAccessibleEntities(
  ctx: QueryCtx,
  accessCtx: AccessContext,
  entities: EntityDoc[]
): Promise<EntityDoc[]> {
  const { user, claims } = accessCtx;

  if (user.role === "admin") {
    return entities;
  }

  if (user.role === "human") {
    return entities.filter((e) => e.ownerId === user._id);
  }

  if (user.role === "agent" || user.role === "sub_agent") {
    if (!claims) {
      return [];
    }

    if (claims.scope === "orchestrator") {
      return entities.filter((e) => e.ownerId === claims.ownerId);
    }

    if (claims.scope === "entity_scoped" || claims.scope === "sub_agent") {
      const allowedIds = new Set(claims.scopeEntityIds ?? []);
      return entities.filter((e) => allowedIds.has(e._id));
    }

    return [];
  }

  return [];
}

export function hasPermission(
  accessCtx: AccessContext,
  permission: "read" | "write" | "delete" | "admin"
): boolean {
  const { user } = accessCtx;

  if (user.role === "admin") {
    return true;
  }

  if (user.role === "human") {
    return permission === "read" || permission === "write" || permission === "delete";
  }

  if (user.role === "agent" || user.role === "sub_agent") {
    return permission === "read" || permission === "write";
  }

  return false;
}

export async function canCreateEntity(
  ctx: QueryCtx | MutationCtx,
  accessCtx: AccessContext,
  ownerId: Id<"users">
): Promise<boolean> {
  const { user, claims } = accessCtx;

  if (user.role === "admin") {
    return true;
  }

  if (user.role === "human") {
    return ownerId === user._id;
  }

  if (user.role === "agent" || user.role === "sub_agent") {
    if (!claims) return false;
    if (claims.scope === "orchestrator") {
      return ownerId === claims.ownerId;
    }
    return false;
  }

  return false;
}

export async function canAccessUser(
  ctx: QueryCtx | MutationCtx,
  accessCtx: AccessContext,
  targetUserId: Id<"users">
): Promise<boolean> {
  const { user, claims } = accessCtx;

  if (user.role === "admin") {
    return true;
  }

  if (user._id === targetUserId) {
    return true;
  }

  if (user.role === "human") {
    const targetUser = await ctx.db.get(targetUserId);
    if (!targetUser) return false;
    if (targetUser.role === "human") {
      return false;
    }
    return targetUser.agentOwnerId === user._id;
  }

  if (user.role === "agent" || user.role === "sub_agent") {
    if (!claims) return false;
    if (claims.scope === "orchestrator") {
      return claims.ownerId === user.agentOwnerId;
    }
    return false;
  }

  return false;
}

export async function getAccessibleEntityIds(
  ctx: QueryCtx,
  accessCtx: AccessContext
): Promise<Id<"entities">[]> {
  const { user, claims } = accessCtx;

  if (user.role === "admin") {
    const entities = await ctx.db.query("entities").take(1000);
    return entities.map((e) => e._id);
  }

  if (user.role === "human") {
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .take(1000);
    return entities.map((e) => e._id);
  }

  if (user.role === "agent" || user.role === "sub_agent") {
    if (!claims) return [];

    if (claims.scope === "orchestrator") {
      const entities = await ctx.db
        .query("entities")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", claims.ownerId as Id<"users">))
        .take(1000);
      return entities.map((e) => e._id);
    }

    if (claims.scope === "entity_scoped" || claims.scope === "sub_agent") {
      return (claims.scopeEntityIds ?? []) as Id<"entities">[];
    }

    return [];
  }

  return [];
}