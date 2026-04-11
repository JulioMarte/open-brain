import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserFromAgentTokenForMutation } from "./lib/auth";
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
    if (!args.name.trim()) {
      throw new Error("Name is required");
    }
    const user = await getCurrentUser(ctx);
    
    if (user.role !== "admin") {
      throw new Error("Only admins can create agents");
    }

    if (args.scope === "entity_scoped" && (!args.scopeEntityIds || args.scopeEntityIds.length === 0)) {
      throw new Error("Entity-scoped agents must have at least one scope entity ID");
    }

    const tokenIdentifier = `agent_${Date.now()}_${crypto.randomUUID()}`;
    
    const expiresAt = getTokenExpiration(args.scope);
    const refreshTokenExpiresAt = getRefreshTokenExpiration();

    const agentUserId = await ctx.db.insert("users", {
      tokenIdentifier,
      role: args.scope === "sub_agent" ? "sub_agent" : "agent",
      name: args.name,
      createdAt: Date.now(),
      agentOwnerId: user._id,
      agentScope: args.scope,
      isRevoked: false,
    });

    const accessToken = await generateAccessToken(
      agentUserId,
      user._id,
      args.scope,
      args.scopeEntityIds,
      expiresAt - Math.floor(Date.now() / 1000)
    );

    const refreshTokenId = crypto.randomUUID();
    const refreshToken = await generateRefreshToken(
      agentUserId,
      user._id,
      args.scope,
      refreshTokenId,
      refreshTokenExpiresAt - Math.floor(Date.now() / 1000)
    );

    await ctx.db.insert("agent_tokens", {
      tokenHash: await hashToken(accessToken),
      userId: agentUserId,
      ownerId: user._id,
      scope: args.scope,
      scopeEntityIds: args.scopeEntityIds,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt,
      lastUsedAt: Math.floor(Date.now() / 1000),
      isRevoked: false,
      refreshTokenHash: await hashToken(refreshToken),
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
      throw new Error("Agent not found");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("You do not have access to this agent");
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
      throw new Error("Agent not found");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("You do not have permission to revoke this agent");
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
      throw new Error("Token not found");
    }

    if (token.ownerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("You do not have permission to revoke this token");
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
    agentToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { user: currentUser } = await getCurrentUserFromAgentTokenForMutation(ctx, args.agentToken);
    
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("You do not have permission to refresh tokens for this agent");
    }

    const { verifyRefreshToken, hashToken: hashTokenFn } = await import("./lib/agentJwt");
    const refreshTokenHash = await hashTokenFn(args.refreshToken);
    
    const existingTokens = await ctx.db
      .query("agent_tokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.agentId))
      .filter((q) => q.eq(q.field("refreshTokenHash"), refreshTokenHash))
      .take(100);

    const validToken = existingTokens.find(
      (t) => !t.isRevoked && t.refreshTokenExpiresAt && t.refreshTokenExpiresAt * 1000 > Date.now()
    );

    if (!validToken) {
      throw new Error("Invalid or expired refresh token");
    }

    await ctx.db.patch(validToken._id, {
      isRevoked: true,
      revokedAt: Date.now(),
    });

    if (agent.agentScope === undefined || agent.agentOwnerId === undefined) {
      throw new Error("Agent missing required scope or ownerId");
    }

    const newExpiresAt = getTokenExpiration(agent.agentScope);
    const newRefreshTokenExpiresAt = getRefreshTokenExpiration();
    
    const newAccessToken = await generateAccessToken(
      args.agentId,
      agent.agentOwnerId,
      agent.agentScope,
      validToken.scopeEntityIds,
      newExpiresAt - Math.floor(Date.now() / 1000)
    );

    const newRefreshTokenId = crypto.randomUUID();
    const newRefreshToken = await generateRefreshToken(
      args.agentId,
      agent.agentOwnerId,
      agent.agentScope,
      newRefreshTokenId,
      newRefreshTokenExpiresAt - Math.floor(Date.now() / 1000)
    );

    await ctx.db.insert("agent_tokens", {
      tokenHash: await hashTokenFn(newAccessToken),
      userId: args.agentId,
      ownerId: agent.agentOwnerId,
      scope: agent.agentScope,
      scopeEntityIds: validToken.scopeEntityIds,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: newExpiresAt,
      lastUsedAt: Math.floor(Date.now() / 1000),
      isRevoked: false,
      refreshTokenHash: await hashTokenFn(newRefreshToken),
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
      throw new Error("Agent not found");
    }

    if (agent.agentOwnerId !== currentUser._id && currentUser.role !== "admin") {
      throw new Error("You do not have permission to delete this agent");
    }

    const tokens = await ctx.db
      .query("agent_tokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.agentId))
      .take(100);

    for (const token of tokens) {
      await ctx.db.delete(token._id);
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", args.agentId))
      .take(1000);

    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", args.agentId))
      .take(1000);

    for (const memory of memories) {
      await ctx.db.delete(memory._id);
    }

    const proposals = await ctx.db
      .query("proposals")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", args.agentId))
      .take(1000);

    for (const proposal of proposals) {
      await ctx.db.patch(proposal._id, { status: "rejected", reviewedBy: currentUser._id });
    }

    await ctx.db.delete(args.agentId);

    return { success: true };
  },
});