import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { verifyAccessToken, hashToken, AgentTokenClaims } from "./agentJwt";

type UserDoc = Doc<"users">;

export type UserRole = "human" | "agent" | "sub_agent" | "admin";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<UserDoc> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("No autenticado");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (!user) {
    throw new Error("Usuario no encontrado");
  }

  if (user.isRevoked) {
    throw new Error("Usuario ha sido revocado");
  }

  return user;
}

export async function getCurrentUserOrNull(ctx: QueryCtx | MutationCtx): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (!user || user.isRevoked) {
    return null;
  }

  return user;
}

export async function getCurrentUserFromAgentToken(
  ctx: QueryCtx,
  token: string
): Promise<{ user: UserDoc; claims: AgentTokenClaims }> {
  const claims = await verifyAccessToken(token);
  
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", `agent_${claims.sub}`))
    .unique();

  if (!user) {
    throw new Error("Agente no encontrado");
  }

  if (user.isRevoked) {
    throw new Error("Agente ha sido revocado");
  }

  const tokenHash = hashToken(token);
  const tokens = await ctx.db
    .query("agent_tokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .take(1);

  const validToken = tokens.find(
    (t) => !t.isRevoked && t.expiresAt * 1000 > Date.now()
  );

  if (!validToken) {
    throw new Error("Token inválido o expirado");
  }

  return { user, claims };
}

export async function updateAgentTokenLastUsed(
  ctx: MutationCtx,
  tokenId: Id<"agent_tokens">
): Promise<void> {
  await ctx.db.patch(tokenId, {
    lastUsedAt: Math.floor(Date.now() / 1000),
  });
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Solo admins pueden realizar esta accion");
  }
  return user;
}

export async function requireAgent(ctx: QueryCtx | MutationCtx): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (user.role !== "agent" && user.role !== "sub_agent" && user.role !== "admin") {
    throw new Error("Solo agentes pueden realizar esta accion");
  }
  return user;
}

export async function requireHuman(ctx: QueryCtx | MutationCtx): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (user.role !== "human" && user.role !== "admin") {
    throw new Error("Solo humanos pueden realizar esta accion");
  }
  return user;
}

export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}

export function isAgent(role: UserRole): boolean {
  return role === "agent" || role === "sub_agent";
}

export function isHuman(role: UserRole): boolean {
  return role === "human";
}

export async function upsertUserFromIdentity(
  ctx: MutationCtx,
  identity: { tokenIdentifier: string; name?: string; email?: string }
): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (existing) {
    if (identity.name || identity.email) {
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
      });
    }
    return existing._id;
  }

  const userId = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    role: "human",
    name: identity.name,
    email: identity.email,
    createdAt: Date.now(),
  });

  return userId;
}

export async function getOrCreateSystemUser(ctx: MutationCtx): Promise<Id<"users">> {
  const SYSTEM_TOKEN_IDENTIFIER = "system";

  const existing = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", SYSTEM_TOKEN_IDENTIFIER))
    .unique();

  if (existing) {
    return existing._id;
  }

  return await ctx.db.insert("users", {
    tokenIdentifier: SYSTEM_TOKEN_IDENTIFIER,
    role: "admin",
    name: "System",
    email: undefined,
    createdAt: Date.now(),
  });
}