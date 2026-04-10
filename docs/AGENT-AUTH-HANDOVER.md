# AGENT AUTH SYSTEM - COMPLETE IMPLEMENTATION

This document contains everything needed to implement the complete agent authentication system from scratch.

---

## 1. Schema Changes

### 1.1 Users Table Enhancement

**File: `convex/schema.ts`**

Replace the existing `users` table definition with:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    role: v.union(v.literal("human"), v.literal("agent"), v.literal("sub_agent"), v.literal("admin")),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    // Agent-specific fields
    agentOwnerId: v.optional(v.id("users")), // For agents: the human who created them
    agentScope: v.optional(v.union(
      v.literal("orchestrator"),           // Full access for 7 days
      v.literal("entity_scoped"),          // Access to specific entities for 24 hours
      v.literal("sub_agent")               // Limited scope for 30 minutes
    )),
    agentScopes: v.optional(v.array(v.id("entities"))), // Specific entity IDs for entity_scoped agents
    isRevoked: v.optional(v.boolean()),     // Token revocation flag
    revokedAt: v.optional(v.number()),      // When token was revoked
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_agentOwnerId", ["agentOwnerId"]),      // For listing agents by owner
    .index("by_isRevoked", ["isRevoked"]),            // For finding revoked tokens

  agent_tokens: defineTable({
    tokenHash: v.string(),                   // SHA-256 hash of the JWT token
    userId: v.id("users"),                   // The agent user this token belongs to
    ownerId: v.id("users"),                  // The human who created this agent
    scope: v.union(v.literal("orchestrator"), v.literal("entity_scoped"), v.literal("sub_agent")),
    scopeEntityIds: v.optional(v.array(v.id("entities"))), // For entity_scoped: specific entities
    issuedAt: v.number(),                    // Token issuance timestamp
    expiresAt: v.number(),                   // Token expiration timestamp
    lastUsedAt: v.optional(v.number()),      // Last time token was used
    isRevoked: v.boolean(),                  // Token revocation status
    revokedAt: v.optional(v.number()),       // When token was revoked
    refreshTokenHash: v.optional(v.string()), // Hash of the refresh token
    refreshTokenExpiresAt: v.optional(v.number()), // Refresh token expiration
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"])
    .index("by_ownerId", ["ownerId"])
    .index("by_isRevoked", ["isRevoked"])
    .index("by_expiresAt", ["expiresAt"]),   // For cleanup of expired tokens

  inbox_log: defineTable({
    rawText: v.string(),
    source: v.union(
      v.literal("email"), v.literal("telegram"), v.literal("whatsapp"),
      v.literal("slack"), v.literal("webhook"), v.literal("api"),
      v.literal("manual"), v.literal("system_cron"), v.literal("custom")
    ),
    sourceMetadata: v.optional(v.any()),
    memoryId: v.optional(v.id("memories")),
    processed: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_processed", ["processed"])
    .index("by_source", ["source"])
    .index("by_createdBy", ["createdBy"]),

  entities: defineTable({
    type: v.union(v.literal("project"), v.literal("person"), v.literal("idea"), v.literal("admin")),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
    metadata: v.optional(v.any()),
    updatedAt: v.number(),
    ownerId: v.id("users"),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
  })
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_ownerId", ["ownerId"]),

  tasks: defineTable({
    entityId: v.id("entities"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("todo"), v.literal("in_progress"),
      v.literal("done"), v.literal("cancelled")
    ),
    blockedBy: v.array(v.id("tasks")),
    priority: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    dueDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
    agentCreated: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
  })
    .index("by_entityId", ["entityId"])
    .index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"])
    .index("by_parentTaskId", ["parentTaskId"])
    .index("by_dueDate", ["dueDate"])
    .index("by_entityId_and_status", ["entityId", "status"]),

  memories: defineTable({
    text: v.string(),
    embedding: v.array(v.float64()),
    linkedEntityIds: v.optional(v.array(v.id("entities"))),
    confidenceScore: v.optional(v.float64()),
    originalInboxId: v.optional(v.id("inbox_log")),
    accessCount: v.number(),
    lastAccessedAt: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["linkedEntityIds"],
  }),

  proposals: defineTable({
    type: v.union(v.literal("create_task"), v.literal("update_entity"), v.literal("add_memory")),
    payload: v.string(),
    reason: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number(),
    createdBy: v.id("users"),
    reviewedBy: v.optional(v.id("users")),
  }).index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"]),
});
```

---

## 2. JWT Implementation

### 2.1 JWT Library (HMAC-SHA256)

**File: `convex/lib/agentJwt.ts`** (CREATE NEW)

```typescript
import * as crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
const JWT_ALGORITHM = "HS256";

export interface AgentTokenClaims {
  sub: string;           // Agent user ID
  ownerId: string;       // Human owner ID
  scope: "orchestrator" | "entity_scoped" | "sub_agent";
  scopeEntityIds?: string[];  // For entity_scoped: specific entity IDs
  iat: number;           // Issued at
  exp: number;           // Expiration
  jti: string;           // Unique token ID for revocation
  type: "access" | "refresh";
}

export interface RefreshTokenClaims extends AgentTokenClaims {
  type: "refresh";
  refreshTokenId: string;
}

function base64UrlEncode(data: Buffer): string {
  return data.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64UrlDecode(data: string): Buffer {
  const padded = data + "=".repeat((4 - (data.length % 4)) % 4);
  const replaced = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(replaced, "base64");
}

function createSignature(header: string, payload: string): string {
  const hmac = crypto.createHmac("sha256", JWT_SECRET);
  hmac.update(`${header}.${payload}`);
  return base64UrlEncode(hmac.digest());
}

function verifySignature(header: string, payload: string, signature: string): boolean {
  const expectedSignature = createSignature(header, payload);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export function generateAccessToken(
  agentUserId: string,
  ownerId: string,
  scope: "orchestrator" | "entity_scoped" | "sub_agent",
  scopeEntityIds?: string[],
  expiresInSeconds: number = 3600
): string {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const payload: AgentTokenClaims = {
    sub: agentUserId,
    ownerId,
    scope,
    scopeEntityIds,
    iat: now,
    exp: now + expiresInSeconds,
    jti,
    type: "access",
  };

  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: JWT_ALGORITHM, typ: "JWT" })));
  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createSignature(header, payloadEncoded);

  return `${header}.${payloadEncoded}.${signature}`;
}

export function generateRefreshToken(
  agentUserId: string,
  ownerId: string,
  scope: "orchestrator" | "entity_scoped" | "sub_agent",
  refreshTokenId: string,
  expiresInSeconds: number = 604800
): string {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const payload: RefreshTokenClaims = {
    sub: agentUserId,
    ownerId,
    scope,
    iat: now,
    exp: now + expiresInSeconds,
    jti,
    type: "refresh",
    refreshTokenId,
  };

  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: JWT_ALGORITHM, typ: "JWT" })));
  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = createSignature(header, payloadEncoded);

  return `${header}.${payloadEncoded}.${signature}`;
}

export function verifyAccessToken(token: string): AgentTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [header, payload, signature] = parts;

  if (!verifySignature(header, payload, signature)) {
    throw new Error("Invalid token signature");
  }

  const payloadData = JSON.parse(base64UrlDecode(payload).toString()) as AgentTokenClaims;
  
  if (payloadData.type !== "access") {
    throw new Error("Token is not an access token");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payloadData.exp < now) {
    throw new Error("Token has expired");
  }

  return payloadData;
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [header, payload, signature] = parts;

  if (!verifySignature(header, payload, signature)) {
    throw new Error("Invalid token signature");
  }

  const payloadData = JSON.parse(base64UrlDecode(payload).toString()) as RefreshTokenClaims;
  
  if (payloadData.type !== "refresh") {
    throw new Error("Token is not a refresh token");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payloadData.exp < now) {
    throw new Error("Refresh token has expired");
  }

  return payloadData;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getTokenExpiration(scope: "orchestrator" | "entity_scoped" | "sub_agent"): number {
  const now = Math.floor(Date.now() / 1000);
  switch (scope) {
    case "orchestrator":
      return now + 7 * 24 * 60 * 60; // 7 days
    case "entity_scoped":
      return now + 24 * 60 * 60; // 24 hours
    case "sub_agent":
      return now + 30 * 60; // 30 minutes
    default:
      return now + 3600; // 1 hour default
  }
}

export function getRefreshTokenExpiration(): number {
  return Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
}
```

### 2.2 Token Claims Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          JWT STRUCTURE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  HEADER:                                                                    │
│  {                                                                           │
│    "alg": "HS256",                                                          │
│    "typ": "JWT"                                                             │
│  }                                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  PAYLOAD (Access Token):                                                     │
│  {                                                                           │
│    "sub": "agent_user_id",           // Agent's user ID                     │
│    "ownerId": "human_user_id",        // Owner human's user ID               │
│    "scope": "orchestrator",           // or "entity_scoped" or "sub_agent"  │
│    "scopeEntityIds": ["entity_id"],   // Only for entity_scoped scope        │
│    "iat": 1713000000,                // Issued at (Unix timestamp)          │
│    "exp": 1713600000,                 // Expiration (Unix timestamp)        │
│    "jti": "unique-token-id",          // For revocation tracking             │
│    "type": "access"                   // or "refresh"                        │
│  }                                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  SIGNATURE:                                                                 │
│  HMAC-SHA256(                                                                │
│    base64UrlEncode(header) + "." + base64UrlEncode(payload),                │
│    JWT_SECRET                                                                │
│  )                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Expiration by Scope:**
- `orchestrator`: 7 days (604800 seconds)
- `entity_scoped`: 24 hours (86400 seconds)
- `sub_agent`: 30 minutes (1800 seconds)
- `refresh_token`: 7 days (604800 seconds)

---

## 3. Agent Management Mutations

### 3.1 Create Agent

**File: `convex/agents.ts`** (CREATE NEW)

```typescript
import { mutation } from "./_generated/server";
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

    const accessToken = generateAccessToken(
      agentUserId,
      owner._id,
      args.scope,
      args.scopeEntityIds,
      expiresAt - Math.floor(Date.now() / 1000)
    );

    const refreshTokenId = Math.random().toString(36).substring(2, 15);
    const refreshToken = generateRefreshToken(
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
    
    const newAccessToken = generateAccessToken(
      args.agentId,
      agent.agentOwnerId!,
      agent.agentScope as AgentScope,
      agent.agentScopes,
      newExpiresAt - Math.floor(Date.now() / 1000)
    );

    const newRefreshTokenId = Math.random().toString(36).substring(2, 15);
    const newRefreshToken = generateRefreshToken(
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
```

---

## 4. Auth Helpers

### 4.1 Enhanced getCurrentUser

**File: `convex/lib/auth.ts`** (MODIFY - REPLACE)

```typescript
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
  ctx: QueryCtx | MutationCtx,
  token: string
): Promise<{ user: UserDoc; claims: AgentTokenClaims }> {
  const claims = verifyAccessToken(token);
  
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

  await ctx.db.patch(validToken._id, {
    lastUsedAt: Math.floor(Date.now() / 1000),
  });

  return { user, claims };
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
```

### 4.2 Permission Helpers

**File: `convex/lib/permissions.ts`** (CREATE NEW)

```typescript
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
        .withIndex("by_ownerId", (q) => q.eq("ownerId", claims.ownerId))
        .take(1000);
      return entities.map((e) => e._id);
    }

    if (claims.scope === "entity_scoped" || claims.scope === "sub_agent") {
      return claims.scopeEntityIds ?? [];
    }

    return [];
  }

  return [];
}
```

---

## 5. MCP Server Changes

### 5.1 Updated convex.ts

**File: `mcp-server/src/convex.ts`** (REPLACE COMPLETELY)

```typescript
import { z } from "zod";
import {
  createEntitySchema,
  updateEntitySchema,
  updateTaskSchema,
  getSubtasksSchema,
  getMemorySourceSchema,
  archiveMemorySchema,
  getLowConfidenceMemoriesSchema,
} from "./schemas.js";
import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("CONVEX_URL environment variable is not set");
}

export interface AgentConfig {
  agentId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class ConvexAgentClient {
  private client: ConvexHttpClient;
  private agentConfig: AgentConfig | null = null;

  constructor(convexUrl: string = CONVEX_URL!) {
    this.client = new ConvexHttpClient(convexUrl);
  }

  configure(config: AgentConfig) {
    this.agentConfig = config;
  }

  isConfigured(): boolean {
    return this.agentConfig !== null && Date.now() < this.agentConfig.expiresAt * 1000;
  }

  private getToken(): string {
    if (!this.agentConfig) {
      throw new Error("Agent not configured. Call configure() first.");
    }
    if (Date.now() >= this.agentConfig.expiresAt * 1000) {
      throw new Error("Access token expired. Refresh required.");
    }
    return this.agentConfig.accessToken;
  }

  private async callConvex<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
    const token = this.getToken();
    const response = await fetch(`${CONVEX_URL}/api/mcp/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(args),
    });
    
    const result = await response.json() as { data?: T; error?: string };
    if (result.error) {
      throw new Error(result.error);
    }
    return result.data as T;
  }

  async semanticSearch(query: string, limit: number = 10): Promise<unknown[]> {
    return this.callConvex<unknown[]>("searchMemories", { queryText: query, limit });
  }

  async getActionableTasks(): Promise<unknown[]> {
    return this.callConvex<unknown[]>("tasks/getActionable", {});
  }

  async proposeAction(type: string, payload: string, reason: string): Promise<string> {
    return this.callConvex<string>("proposals/create", { type, payload, reason });
  }

  async markTaskDone(taskId: string): Promise<void> {
    return this.callConvex<void>("tasks/markDone", { id: taskId });
  }

  async createEntity(args: z.infer<typeof createEntitySchema>): Promise<unknown> {
    return this.callConvex<unknown>("entities/create", args);
  }

  async updateEntity(args: z.infer<typeof updateEntitySchema>): Promise<unknown> {
    return this.callConvex<unknown>("entities/update", args);
  }

  async updateTask(args: z.infer<typeof updateTaskSchema>): Promise<unknown> {
    return this.callConvex<unknown>("tasks/update", args);
  }

  async getSubtasks(args: z.infer<typeof getSubtasksSchema>): Promise<unknown[]> {
    return this.callConvex<unknown[]>("tasks/getSubtasks", args) || [];
  }

  async getMemorySource(args: z.infer<typeof getMemorySourceSchema>): Promise<unknown> {
    return this.callConvex<unknown>("memories/getSource", args);
  }

  async archiveMemory(args: z.infer<typeof archiveMemorySchema>): Promise<void> {
    return this.callConvex<void>("memories/archive", args);
  }

  async getLowConfidenceMemories(args: z.infer<typeof getLowConfidenceMemoriesSchema>): Promise<unknown[]> {
    return this.callConvex<unknown[]>("memories/lowConfidence", args) || [];
  }

  async listEntities(): Promise<unknown[]> {
    return this.callConvex<unknown[]>("entities/list", {});
  }

  async listTasksByEntity(entityId: string): Promise<unknown[]> {
    return this.callConvex<unknown[]>("tasks/listByEntity", { entityId });
  }
}

export const agentClient = new ConvexAgentClient();

export { CONVEX_URL };

export async function semanticSearch(query: string, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("searchMemories", { queryText: query, limit: 10 }, token);
  return result;
}

export async function getActionableTasks(token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("tasks/getActionable", {}, token);
  return result;
}

export async function proposeAction(type: string, payload: string, reason: string, token: string): Promise<string> {
  const result = await callConvex<string>("proposals/create", { type, payload, reason }, token);
  return result;
}

export async function markTaskDone(taskId: string, token: string): Promise<void> {
  await callConvex<void>("tasks/markDone", { id: taskId }, token);
}

export async function createEntity(args: z.infer<typeof createEntitySchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("entities/create", args, token);
  return result;
}

export async function updateEntity(args: z.infer<typeof updateEntitySchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("entities/update", args, token);
  return result;
}

export async function updateTask(args: z.infer<typeof updateTaskSchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("tasks/update", args, token);
  return result;
}

export async function getSubtasks(args: z.infer<typeof getSubtasksSchema>, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("tasks/getSubtasks", args, token);
  return result || [];
}

export async function getMemorySource(args: z.infer<typeof getMemorySourceSchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("memories/getSource", args, token);
  return result;
}

export async function archiveMemory(args: z.infer<typeof archiveMemorySchema>, token: string): Promise<void> {
  await callConvex<void>("memories/archive", args, token);
}

export async function getLowConfidenceMemories(args: z.infer<typeof getLowConfidenceMemoriesSchema>, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("memories/lowConfidence", args, token);
  return result || [];
}
```

### 5.2 Agent Token Refresh Flow

```typescript
// mcp-server/src/agentRunner.ts (CREATE NEW)

import { ConvexHttpClient } from "convex/browser";
import { AgentConfig } from "./convex.js";

const CONVEX_URL = process.env.CONVEX_URL!;

export class AgentTokenManager {
  private client: ConvexHttpClient;
  private config: AgentConfig | null = null;
  private onTokenRefresh?: (newConfig: AgentConfig) => void;

  constructor() {
    this.client = new ConvexHttpClient(CONVEX_URL);
  }

  configure(config: AgentConfig, onTokenRefresh?: (newConfig: AgentConfig) => void) {
    this.config = config;
    this.onTokenRefresh = onTokenRefresh;
  }

  getCurrentToken(): string {
    if (!this.config) {
      throw new Error("Agent not configured");
    }
    return this.config.accessToken;
  }

  isTokenExpired(): boolean {
    if (!this.config) return true;
    return Date.now() >= this.config.expiresAt * 1000;
  }

  isTokenExpiringSoon(thresholdMs: number = 5 * 60 * 1000): boolean {
    if (!this.config) return true;
    return Date.now() >= (this.config.expiresAt * 1000) - thresholdMs;
  }

  async refreshTokenIfNeeded(): Promise<AgentConfig> {
    if (!this.config) {
      throw new Error("Agent not configured");
    }

    if (!this.isTokenExpiringSoon()) {
      return this.config;
    }

    const response = await fetch(`${CONVEX_URL}/api/mcp/agents/refreshAgentToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify({
        agentId: this.config.agentId,
        refreshToken: this.config.refreshToken,
      }),
    });

    const result = await response.json() as {
      data?: { accessToken: string; refreshToken: string; expiresAt: number };
      error?: string;
    };

    if (result.error || !result.data) {
      throw new Error(result.error || "Failed to refresh token");
    }

    const newConfig: AgentConfig = {
      agentId: this.config.agentId,
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      expiresAt: result.data.expiresAt,
    };

    this.config = newConfig;

    if (this.onTokenRefresh) {
      this.onTokenRefresh(newConfig);
    }

    return newConfig;
  }

  async executeWithRefresh<T>(
    operation: (token: string) => Promise<T>
  ): Promise<T> {
    if (this.isTokenExpiringSoon()) {
      await this.refreshTokenIfNeeded();
    }
    return operation(this.config!.accessToken);
  }
}

export const tokenManager = new AgentTokenManager();
```

---

## 6. Frontend Changes

### 6.1 Updated AgentsView

**File: `src/components/AgentsView.tsx`** (CREATE NEW)

```typescript
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Copy, Plus, Trash2, RefreshCw, Shield, Clock, Check } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";

type AgentScope = "orchestrator" | "entity_scoped" | "sub_agent";

interface AgentToken {
  _id: string;
  scope: AgentScope;
  scopeEntityIds?: string[];
  issuedAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  isRevoked: boolean;
  isExpired: boolean;
  isActive: boolean;
}

interface Agent {
  _id: string;
  name: string;
  role: string;
  agentScope?: AgentScope;
  agentScopes?: string[];
  isRevoked?: boolean;
  revokedAt?: number;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  hasValidToken?: boolean;
}

export function AgentsView() {
  const { t } = useTranslation();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentScope, setNewAgentScope] = useState<AgentScope>("entity_scoped");
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<string | null>(null);

  const agents = useQuery(api.agents.listAllAgentsForOwner);
  const createAgent = useMutation(api.agents.createAgent);
  const revokeAgent = useMutation(api.agents.revokeAgent);
  const deleteAgent = useMutation(api.agents.deleteAgent);
  const getAgentTokens = useQuery(api.agents.getAgentTokens, 
    showTokens ? { agentId: showTokens as any } : "skip"
  );

  const handleCreateAgent = () => {
    if (!newAgentName.trim()) return;
    createAgent({
      name: newAgentName,
      scope: newAgentScope,
    });
    setNewAgentName("");
    setShowCreateForm(false);
  };

  const copyToClipboard = async (token: string, tokenId: string) => {
    await navigator.clipboard.writeText(token);
    setCopiedTokenId(tokenId);
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getScopeLabel = (scope: AgentScope) => {
    switch (scope) {
      case "orchestrator":
        return t("agents.scopes.orchestrator");
      case "entity_scoped":
        return t("agents.scopes.entityScoped");
      case "sub_agent":
        return t("agents.scopes.subAgent");
      default:
        return scope;
    }
  };

  const getScopeDescription = (scope: AgentScope) => {
    switch (scope) {
      case "orchestrator":
        return t("agents.scopeDescriptions.orchestrator");
      case "entity_scoped":
        return t("agents.scopeDescriptions.entityScoped");
      case "sub_agent":
        return t("agents.scopeDescriptions.subAgent");
      default:
        return "";
    }
  };

  if (agents === undefined) {
    return <div className="p-4">{t("agents.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("agents.title")}</h2>
          <p className="text-muted-foreground">{t("agents.description")}</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="h-4 w-4" />
          {t("agents.createAgent")}
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t("agents.createNewAgent")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                placeholder={t("agents.agentName")}
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("agents.scope")}</label>
              <div className="grid grid-cols-3 gap-2">
                {(["orchestrator", "entity_scoped", "sub_agent"] as AgentScope[]).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setNewAgentScope(scope)}
                    className={`p-3 rounded-lg border text-left ${
                      newAgentScope === scope
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium text-sm">{getScopeLabel(scope)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {getScopeDescription(scope)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateAgent}>{t("agents.create")}</Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {agents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t("agents.noAgents")}
            </CardContent>
          </Card>
        ) : (
          agents.map((agent) => (
            <Card key={agent._id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    {agent.isRevoked && (
                      <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                        {t("agents.revoked")}
                      </span>
                    )}
                    {agent.hasValidToken && !agent.isRevoked && (
                      <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded">
                        {t("agents.active")}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!agent.isRevoked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTokens(showTokens === agent._id ? null : agent._id)}
                      >
                        <Shield className="h-4 w-4" />
                        {t("agents.viewTokens")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeAgent({ agentId: agent._id as any })}
                      disabled={agent.isRevoked}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {t("agents.created")}: {formatDate(agent.createdAt)}
                  </div>
                  {agent.lastUsedAt && (
                    <div>
                      {t("agents.lastUsed")}: {formatDate(agent.lastUsedAt)}
                    </div>
                  )}
                  {agent.agentScope && (
                    <div>
                      {t("agents.scope")}: {getScopeLabel(agent.agentScope)}
                    </div>
                  )}
                </div>

                {showTokens === agent._id && getAgentTokens && (
                  <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
                    <h4 className="font-medium">{t("agents.tokens")}</h4>
                    {getAgentTokens.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("agents.noTokens")}</p>
                    ) : (
                      getAgentTokens.map((token: AgentToken) => (
                        <div
                          key={token._id}
                          className="flex items-center justify-between p-2 bg-background rounded"
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              {token.scope} - {token.isActive ? t("agents.active") : t("agents.inactive")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("agents.issued")}: {formatDate(token.issuedAt)}
                              {" | "}
                              {t("agents.expires")}: {formatDate(token.expiresAt)}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(token._id, token._id)}
                            >
                              {copiedTokenId === token._id ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
```

### 6.2 Copy JWT Button Component

**File: `src/components/ui/copy-button.tsx`** (CREATE NEW)

```typescript
import { useState } from "react";
import { Button } from "./button";
import { Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={className}
      title={t("agents.copyToken")}
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}
```

---

## 7. Complete Flow Diagrams

### 7.1 Agent Creation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT CREATION FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────┘

  HUMAN USER                      CONVEX BACKEND                      AGENT TOKEN
      │                                  │                                  │
      │  1. createAgent({                │                                  │
      │     name: "My Agent",            │                                  │
      │     scope: "entity_scoped",      │                                  │
      │     scopeEntityIds: [e1, e2]     │                                  │
      │  })                              │                                  │
      │─────────────────────────────────>│                                  │
      │                                  │                                  │
      │                         2. Verify human user                         │
      │                         from ctx.auth.getUserIdentity()             │
      │                                  │                                  │
      │                         3. Create agent user in users table:        │
      │                            - tokenIdentifier: "agent_<timestamp>"     │
      │                            - role: "agent"                          │
      │                            - agentOwnerId: human._id                │
      │                            - agentScope: "entity_scoped"            │
      │                            - agentScopes: [e1, e2]                 │
      │                                  │                                  │
      │                                  │ 4. Generate access token (JWT)    │
      │                                  │    with 24h expiration           │
      │                                  │                                  │
      │                                  │ 5. Generate refresh token (JWT)   │
      │                                  │    with 7d expiration            │
      │                                  │                                  │
      │                                  │ 6. Store token hash in           │
      │                                  │    agent_tokens table            │
      │                                  │                                  │
      │  7. Return:                      │                                  │
      │     {                             │                                  │
      │       agentId,                    │                                  │
      │       accessToken,                │                                  │
      │       refreshToken,               │                                  │
      │       expiresAt                   │                                  │
      │     }                             │                                  │
      │<──────────────────────────────────│                                  │
      │                                  │                                  │
      v                                  v                                  v
```

### 7.2 Agent Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT AUTHENTICATION FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  MCP AGENT                      CONVEX BACKEND                       agent_tokens
      │                                  │                                  │
      │  1. Make request with           │                                  │
      │     Authorization: Bearer <JWT> │                                  │
      │─────────────────────────────────>│                                  │
      │                                  │                                  │
      │                         2. Verify JWT signature                    │
      │                         using HMAC-SHA256                          │
      │                                  │                                  │
      │                         3. Check expiration (exp claim)           │
      │                                  │                                  │
      │                         4. Look up token hash in                   │
      │                            agent_tokens table                      │
      │                                  │─────────────────────────────────>│
      │                                  │                                  │
      │                                  │  5. Verify token is not revoked  │
      │                                  │<─────────────────────────────────│
      │                                  │                                  │
      │                         6. Update lastUsedAt                       │
      │                                  │─────────────────────────────────>│
      │                                  │                                  │
      │                         7. Get agent user from users table        │
      │                                  │                                  │
      │                         8. Check ownerId matches:                   │
      │                            agent.agentOwnerId === claims.ownerId   │
      │                                  │                                  │
      │                         9. If entity_scoped:                       │
      │                            Verify entityId in claims.scopeEntityIds │
      │                                  │                                  │
      │                         10. Execute query/mutation                  │
      │                            with agent's access context             │
      │                                  │                                  │
      │  11. Return result               │                                  │
      │<──────────────────────────────────│                                  │
      │                                  │                                  │
      v                                  v                                  v
```

### 7.3 Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TOKEN REFRESH FLOW                                        │
└─────────────────────────────────────────────────────────────────────────────┘

  MCP AGENT                      CONVEX BACKEND                       agent_tokens
      │                                  │                                  │
      │  1. Detect token expiring soon   │                                  │
      │     (within 5 minutes)            │                                  │
      │                                  │                                  │
      │  2. Call refreshAgentToken({     │                                  │
      │       agentId,                   │                                  │
      │       refreshToken               │                                  │
      │     })                            │                                  │
      │─────────────────────────────────>│                                  │
      │                                  │                                  │
      │                         3. Verify refresh token signature          │
      │                                  │                                  │
      │                         4. Find token by refreshTokenHash          │
      │                                  │─────────────────────────────────>│
      │                                  │                                  │
      │                         5. Verify not expired                      │
      │                         6. Verify not revoked                      │
      │                                  │<─────────────────────────────────│
      │                                  │                                  │
      │                         7. Mark old token as revoked               │
      │                                  │─────────────────────────────────>│
      │                                  │                                  │
      │                         8. Generate new access token                │
      │                         9. Generate new refresh token             │
      │                                  │                                  │
      │                         10. Store new token hashes                 │
      │                                  │─────────────────────────────────>│
      │                                  │                                  │
      │  11. Return:                      │                                  │
      │     {                             │                                  │
      │       accessToken,               │                                  │
      │       refreshToken,              │                                  │
      │       expiresAt                   │                                  │
      │     }                             │                                  │
      │<──────────────────────────────────│                                  │
      │                                  │                                  │
      │  12. Update local config with     │                                  │
      │      new tokens                   │                                  │
      │                                  │                                  │
      v                                  v                                  v
```

### 7.4 Agent Access Control Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT ACCESS CONTROL FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  QUERY/MUTATION                  PERMISSION CHECK                            ENTITIES
      │                                  │                                    │
      │  getCurrentUserFromAgentToken()   │                                    │
      │─────────────────────────────────>│                                    │
      │                                  │                                    │
      │                         2. Extract claims from JWT:                 │
      │                            - sub: agent user ID                      │
      │                            - ownerId: human owner ID                 │
      │                            - scope: orchestrator|entity_scoped      │
      │                            - scopeEntityIds: [e1, e2]               │
      │                                  │                                    │
      │                         3. Verify agent user exists                 │
      │                         4. Verify token valid in agent_tokens        │
      │                                  │                                    │
      │                         5. canAccessEntity():                      │
      │                            if orchestrator:                         │
      │                              return entity.ownerId === ownerId     │
      │                                                              ┌───────>│
      │                                                              │        │
      │                            if entity_scoped:                 │        │
      │                              return scopeEntityIds            │        │
      │                                 .includes(entity._id)         │        │
      │                                                              │        │
      │<──────────────────────────────────────────────────────────────┘        │
      │                                  │                                    │
      │                         6. If access denied:                         │
      │                            throw Error("No tienes acceso")           │
      │                                  │                                    │
      │                         7. If access granted:                       │
      │                            execute query/mutation                    │
      │                                  │                                    │
      v                                  v                                    v

  SECURITY RULE: AN AGENT CAN NEVER SEE RESOURCES FROM ANOTHER OWNER
  
  This is enforced by:
  1. ownerId claim in JWT must match agent's agentOwnerId
  2. For orchestrator: entity.ownerId === claims.ownerId
  3. For entity_scoped: entity._id in claims.scopeEntityIds
  4. Every query filters by ownerId or scopeEntityIds
```

---

## 8. Security Rules

### 8.1 Core Rule

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   "AN AGENT CAN NEVER SEE RESOURCES FROM ANOTHER OWNER"                     │
│                                                                              │
│   This is the FUNDAMENTAL security rule that governs the entire system.     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Implementation

**Every query and mutation MUST enforce these checks:**

```typescript
// PSEUDO-CODE SHOWING ENFORCEMENT PATTERNS

// 1. ORCHESTRATOR AGENT - Can see all entities owned by the human owner
if (claims.scope === "orchestrator") {
  // Entity query must filter by ownerId
  entities = await ctx.db
    .query("entities")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", claims.ownerId))
    .take(100);
}

// 2. ENTITY-SCOPED AGENT - Can only see specific entities
if (claims.scope === "entity_scoped") {
  // Entity query must filter by both ownerId AND entity IDs
  const allowedIds = claims.scopeEntityIds;
  entities = await ctx.db
    .query("entities")
    .filter((q) => 
      q.eq(q.field("ownerId"), claims.ownerId) &&
      q.member(q.field("_id"), allowedIds)
    )
    .take(100);
}

// 3. SUB-AGENT - Same as entity-scoped, created by orchestrator
if (claims.scope === "sub_agent") {
  // Same enforcement as entity-scoped
  const allowedIds = claims.scopeEntityIds;
  // ... filter by ownerId + entity IDs
}

// 4. CROSS-OWNER ACCESS IS IMPOSSIBLE
// No matter what, claims.ownerId is ALWAYS verified against the resource ownerId
// An agent with ownerId=A can NEVER access resources from ownerId=B
```

**Enforcement in permissions.ts:**

```typescript
// convex/lib/permissions.ts

export async function canAccessEntity(
  ctx: QueryCtx | MutationCtx,
  accessCtx: AccessContext,
  entityId: Id<"entities">
): Promise<boolean> {
  const { user, claims } = accessCtx;

  // Admins can access everything
  if (user.role === "admin") return true;

  // Humans can only access their own entities
  if (user.role === "human") {
    const entity = await ctx.db.get(entityId);
    return entity?.ownerId === user._id;
  }

  // Agents have strict scope checks
  if (user.role === "agent" || user.role === "sub_agent") {
    if (!claims) return false;

    // CRITICAL: Verify the agent's owner matches
    if (claims.ownerId !== user.agentOwnerId) return false;

    // Orchestrator: check ownerId match
    if (claims.scope === "orchestrator") {
      const entity = await ctx.db.get(entityId);
      return entity?.ownerId === claims.ownerId;
    }

    // Entity-scoped: check specific entity IDs
    if (claims.scope === "entity_scoped" || claims.scope === "sub_agent") {
      return claims.scopeEntityIds?.includes(entityId) ?? false;
    }

    return false;
  }

  return false;
}
```

---

## 9. Files Summary

| File | Action | Priority | Description |
|------|--------|----------|-------------|
| `convex/schema.ts` | Modify | CRITICAL | Add agent fields to users table, create agent_tokens table |
| `convex/lib/agentJwt.ts` | Create | CRITICAL | JWT generation/verification with HMAC-SHA256 |
| `convex/lib/permissions.ts` | Create | CRITICAL | Access control helpers (canAccessEntity, etc) |
| `convex/agents.ts` | Create | CRITICAL | All agent management mutations and queries |
| `convex/lib/auth.ts` | Modify | CRITICAL | Enhanced getCurrentUser supporting agent tokens |
| `mcp-server/src/convex.ts` | Modify | HIGH | Updated with ConvexAgentClient class |
| `mcp-server/src/agentRunner.ts` | Create | HIGH | Token refresh flow for agents |
| `src/components/AgentsView.tsx` | Create | MEDIUM | Frontend UI for managing agents |
| `src/components/ui/copy-button.tsx` | Create | MEDIUM | Reusable copy to clipboard button |
| `docs/AGENT-AUTH-HANDOVER.md` | Create | CRITICAL | This document |

---

## 10. Testing Checklist

### 10.1 JWT Implementation Tests

- [ ] `generateAccessToken()` creates valid JWT with correct claims
- [ ] `generateRefreshToken()` creates valid JWT with correct claims
- [ ] `verifyAccessToken()` validates correct signature
- [ ] `verifyAccessToken()` rejects tampered tokens
- [ ] `verifyAccessToken()` rejects expired tokens
- [ ] `verifyRefreshToken()` validates correct signature
- [ ] `verifyRefreshToken()` rejects expired refresh tokens
- [ ] `hashToken()` produces consistent SHA-256 hashes
- [ ] Token expiration times are correct for each scope:
  - [ ] orchestrator: 7 days
  - [ ] entity_scoped: 24 hours
  - [ ] sub_agent: 30 minutes

### 10.2 Agent Creation Tests

- [ ] Human can create orchestrator agent
- [ ] Human can create entity-scoped agent with entity IDs
- [ ] Human can create sub-agent
- [ ] Agent cannot create another agent
- [ ] Agent creation returns valid JWT tokens
- [ ] Agent is stored with correct agentOwnerId
- [ ] Agent token is stored in agent_tokens table
- [ ] Agent creation fails without required fields

### 10.3 Agent Authentication Tests

- [ ] Agent can authenticate with valid access token
- [ ] Agent authentication fails with revoked token
- [ ] Agent authentication fails with expired token
- [ ] Agent authentication fails with tampered token
- [ ] Orchestrator agent can access all owner's entities
- [ ] Entity-scoped agent can only access specified entities
- [ ] Sub-agent can only access specified entities
- [ ] Agent CANNOT access another owner's entities

### 10.4 Token Refresh Tests

- [ ] Agent can refresh token before expiration
- [ ] Refresh fails with invalid refresh token
- [ ] Refresh fails with expired refresh token
- [ ] Refresh fails with revoked refresh token
- [ ] Old access token is revoked after refresh
- [ ] New tokens have correct expiration times
- [ ] Agent can continue operations with new token

### 10.5 Revocation Tests

- [ ] Owner can revoke their agent
- [ ] Revoked agent cannot authenticate
- [ ] Owner can revoke specific agent token
- [ ] Revocation updates isRevoked flag
- [ ] Revocation records revokedAt timestamp
- [ ] All agent tokens are revoked when agent is revoked

### 10.6 Frontend Tests

- [ ] AgentsView displays all user's agents
- [ ] AgentsView shows agent status (active/revoked)
- [ ] Create agent form works with all scope types
- [ ] Copy to clipboard works for tokens
- [ ] Token details show correct expiration
- [ ] Delete agent removes agent and tokens

### 10.7 Security Tests

- [ ] Agent cannot access entities outside scope
- [ ] Agent cannot access another owner's data
- [ ] Admin can access all data
- [ ] Humans can only see their own data
- [ ] Token claims cannot be spoofed
- [ ] Expired tokens are rejected
- [ ] Revoked tokens are rejected

### 10.8 Integration Tests

- [ ] Full agent creation → authentication → operation flow
- [ ] Token refresh during long-running operations
- [ ] Concurrent requests with same agent token
- [ ] Agent creation by orchestrator creates sub-agent with correct scope
- [ ] MCP server correctly passes agent tokens to Convex

---

## Appendix: Environment Variables

```bash
# Required for JWT signing
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars

# Convex configuration
CONVEX_URL=https://your-convex-deployment.convex.cloud

# For MCP server
OPEN_BRAIN_URL=https://your-frontend-url.com
```

---

## Appendix: Migration Notes

When running this for the first time on an existing database:

1. **Backup your database** before making schema changes
2. Run `npx convex schema push` to update the schema
3. The new fields on `users` table are optional, so existing users won't be affected
4. The `agent_tokens` table will be empty initially
5. Existing agents (if any) will need to be recreated

---

*Document Version: 1.0*
*Last Updated: 2026-04-10*
*Author: AI Assistant (for Open Brain Agent Auth Implementation)*
