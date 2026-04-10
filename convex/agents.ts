import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";
import { Doc } from "./_generated/dataModel";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getTokenExpiration,
  getRefreshTokenExpiration,
} from "./lib/agentJwt";
import { Id } from "./_generated/dataModel";

type AgentScope = "orchestrator" | "entity_scoped" | "sub_agent";

export const createAgent = mutation({
  args: {
    name: v.string(),
    scope: v.union(v.literal("orchestrator"), v.literal("entity_scoped"), v.literal("sub_agent")),
    scopeEntityIds: v.optional(v.array(v.id("entities"))),
  },
  handler: async (ctx, args) => {
    const owner = await getCurrentUser(ctx);
    
    if (owner.role !== "human" && owner.role !== "admin") {
      throw new Error("Solo humanos pueden crear agentes");
    }

    if (args.scope === "entity_scoped" && (!args.scopeEntityIds || args.scopeEntityIds.length === 0)) {
      throw new Error("Entity-scoped agents must have at least one scope entity ID");
    }

    const tokenIdentifier = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const expiresAt = getTokenExpiration(args.scope);
    const refreshTokenExpiresAt = getRefreshTokenExpiration();

    const agentUserId = await ctx.db.insert("users", {
      tokenIdentifier,
      role: args.scope === "sub_agent" ? "sub_agent" : "agent",
      name: args.name,
      createdAt: Date.now(),
      agentOwnerId: owner._id,
      agentScope: args.scope,
      agentScopes: args.scopeEntityIds,
      isRevoked: false,
    });

    const accessToken = await generateAccessToken(
      agentUserId,
      owner._id,
      args.scope,
      args.scopeEntityIds,
      expiresAt - Math.floor(Date.now() / 1000)
    );

    const refreshTokenId = Math.random().toString(36).substring(2, 15);
    const refreshToken = await generateRefreshToken(
      agentUserId,
      owner._id,
      args.scope,
      refreshTokenId,
      refreshTokenExpiresAt - Math.floor(Date.now() / 1000)
    );

    await ctx.db.insert("agent_tokens", {
      tokenHash: hashToken(accessToken),
      userId: agentUserId,
      ownerId: owner._id,
      scope: args.scope,
      scopeEntityIds: args.scopeEntityIds,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt,
      lastUsedAt: Math.floor(Date.now() / 1000),
      isRevoked: false,
      refreshTokenHash: hashToken(refreshToken),
      refreshTokenExpiresAt,
    });

    return {
      agentId: agentUserId,
      accessToken,
      refreshToken,
      expiresAt,
    };
  },
});

export const listAgents = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);
    
    const agents = await ctx.db
      .query("users")
      .withIndex("by_agentOwnerId", (q) => q.eq("agentOwnerId", currentUser._id))
      .filter((q) => q.or(
        q.eq(q.field("role"), "agent"),
        q.eq(q.field("role"), "sub_agent")
      ))
      .take(100);

    return agents.map((agent) => ({
      _id: agent._id,
      name: agent.name,
      role: agent.role,
      agentScope: agent.agentScope,
      agentScopes: agent.agentScopes,
      isRevoked: agent.isRevoked,
      createdAt: agent.createdAt,
    }));
  },
});

export const listAllAgentsForOwner = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);
    
    const agents = await ctx.db
      .query("users")
      .withIndex("by_agentOwnerId", (q) => q.eq("agentOwnerId", currentUser._id))
      .filter((q) => q.or(
        q.eq(q.field("role"), "agent"),
        q.eq(q.field("role"), "sub_agent")
      ))
      .take(100);

    const agentTokens = await ctx.db
      .query("agent_tokens")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", currentUser._id))
      .take(100);

    const tokenMap = new Map(agentTokens.map((t) => [t.userId, t]));

    return agents.map((agent) => {
      const token = tokenMap.get(agent._id);
      return {
        _id: agent._id,
        name: agent.name,
        role: agent.role,
        agentScope: agent.agentScope,
        agentScopes: agent.agentScopes,
        isRevoked: agent.isRevoked,
        revokedAt: agent.revokedAt,
        createdAt: agent.createdAt,
        lastUsedAt: token?.lastUsedAt,
        expiresAt: token?.expiresAt,
        hasValidToken: token && !token.isRevoked && (token.expiresAt * 1000) > Date.now(),
      };
    });
  },
});

export const getAgentTokens = query({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Agente no encontrado");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("No tienes acceso a este agente");
    }

    const tokens = await ctx.db
      .query("agent_tokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.agentId))
      .take(100);

    return tokens.map((token) => ({
      _id: token._id,
      scope: token.scope,
      scopeEntityIds: token.scopeEntityIds,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      isRevoked: token.isRevoked,
      isExpired: token.expiresAt * 1000 < Date.now(),
      isActive: !token.isRevoked && token.expiresAt * 1000 > Date.now(),
    }));
  },
});

export const revokeAgent = mutation({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Agente no encontrado");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("No tienes permiso para revocar este agente");
    }

    await ctx.db.patch(args.agentId, {
      isRevoked: true,
      revokedAt: Date.now(),
    });

    const tokens = await ctx.db
      .query("agent_tokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.agentId))
      .take(100);

    for (const token of tokens) {
      await ctx.db.patch(token._id, {
        isRevoked: true,
        revokedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const revokeAgentToken = mutation({
  args: { tokenId: v.id("agent_tokens") },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    
    const token = await ctx.db.get(args.tokenId);
    if (!token) {
      throw new Error("Token no encontrado");
    }

    if (token.ownerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("No tienes permiso para revocar este token");
    }

    await ctx.db.patch(args.tokenId, {
      isRevoked: true,
      revokedAt: Date.now(),
    });

    return { success: true };
  },
});

export const refreshAgentToken = mutation({
  args: {
    agentId: v.id("users"),
    refreshToken: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Agente no encontrado");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("No tienes permiso para refrescar tokens de este agente");
    }

    const { verifyRefreshToken, hashToken: hashTokenFn } = await import("./lib/agentJwt");
    const refreshTokenHash = hashTokenFn(args.refreshToken);
    
    const existingTokens = await ctx.db
      .query("agent_tokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.agentId))
      .filter((q) => q.eq(q.field("refreshTokenHash"), refreshTokenHash))
      .take(100);

    const validToken = existingTokens.find(
      (t) => !t.isRevoked && t.refreshTokenExpiresAt && t.refreshTokenExpiresAt * 1000 > Date.now()
    );

    if (!validToken) {
      throw new Error("Refresh token inválido o expirado");
    }

    await ctx.db.patch(validToken._id, {
      isRevoked: true,
      revokedAt: Date.now(),
    });

    const newExpiresAt = getTokenExpiration(agent.agentScope!);
    const newRefreshTokenExpiresAt = getRefreshTokenExpiration();
    
    const newAccessToken = await generateAccessToken(
      args.agentId,
      agent.agentOwnerId!,
      agent.agentScope as AgentScope,
      agent.agentScopes,
      newExpiresAt - Math.floor(Date.now() / 1000)
    );

    const newRefreshTokenId = Math.random().toString(36).substring(2, 15);
    const newRefreshToken = await generateRefreshToken(
      args.agentId,
      agent.agentOwnerId!,
      agent.agentScope as AgentScope,
      newRefreshTokenId,
      newRefreshTokenExpiresAt - Math.floor(Date.now() / 1000)
    );

    await ctx.db.insert("agent_tokens", {
      tokenHash: hashTokenFn(newAccessToken),
      userId: args.agentId,
      ownerId: agent.agentOwnerId!,
      scope: agent.agentScope as AgentScope,
      scopeEntityIds: agent.agentScopes,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: newExpiresAt,
      lastUsedAt: Math.floor(Date.now() / 1000),
      isRevoked: false,
      refreshTokenHash: hashTokenFn(newRefreshToken),
      refreshTokenExpiresAt: newRefreshTokenExpiresAt,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
    };
  },
});

export const deleteAgent = mutation({
  args: { agentId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Agente no encontrado");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("No tienes permiso para eliminar este agente");
    }

    const tokens = await ctx.db
      .query("agent_tokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.agentId))
      .take(100);

    for (const token of tokens) {
      await ctx.db.delete(token._id);
    }

    await ctx.db.delete(args.agentId);

    return { success: true };
  },
});