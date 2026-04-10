# AUTH FIX PLAN v2 - Open Brain

## Executive Summary

Comprehensive authentication fixes based on deep analysis of Clerk + Convex integration. This document addresses critical security vulnerabilities and authentication flow issues discovered during codebase review.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HUMAN FLOW (Frontend)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │   Browser   │───▶│  ClerkProvider   │───▶│ ConvexProviderWithClerk    │ │
│  │             │    │  (CLERK_KEY)     │    │ (bridges Clerk → Convex)   │ │
│  └─────────────┘    └──────────────────┘    └─────────────┬───────────────┘ │
│                                                           │                 │
│                                                           ▼                 │
│                                                 ┌─────────────────────────┐ │
│                                                 │   Convex Query/Mutation │ │
│                                                 │   ctx.auth.getUserId()  │ │
│                                                 └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT FLOW (MCP)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │ MCP Client  │───▶│  Bearer Token    │───▶│  Convex JS Client          │ │
│  │             │    │  Extraction      │    │  (direct, not httpAction)   │ │
│  └─────────────┘    └──────────────────┘    └─────────────────────────────┘ │
│                                                           │                 │
│                              ┌────────────────────────────┴───────────────┐ │
│                              ▼                                          ▼ │
│                    ┌─────────────────┐                      ┌─────────────────┐│
│                    │ Query Functions │                      │ Mutation Funct. ││
│                    │ (read-only)     │                      │ (writes)        ││
│                    └─────────────────┘                      └─────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           CRITICAL: httpAction                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │ HTTP POST   │───▶│  httpAction      │───▶│  ctx.runQuery/Mutation      │ │
│  │ /api/mcp/*  │    │  handler         │    │  (NO ctx.auth!)             │ │
│  └─────────────┘    └──────────────────┘    └─────────────────────────────┘ │
│                                                                             │
│  ⚠️  httpAction does NOT have user authentication context!                │
│  ⚠️  All /api/mcp/* endpoints are UNPROTECTED without custom token val.   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Problems Identified (with severity)

| ID | Problem | Severity | Impact |
|----|---------|----------|--------|
| P1 | getActionable has NO auth check | 🔴 CRITICAL | Anyone can see ALL actionable tasks |
| P2 | Clerk Convex integration may not be active | 🟡 HIGH | "No autenticado" errors on fresh login |
| P3 | MCP HTTP endpoints have no auth context | 🔴 CRITICAL | Agents can't authenticate via httpAction |
| P4 | No user auto-creation on login | 🟡 MEDIUM | Users not persisted, getCurrentUser fails |
| P5 | Views don't handle errors from queries | 🟡 MEDIUM | App crashes when queries throw |

---

## Phase 1: IMMEDIATE SECURITY FIX

### P1: Add auth to getActionable

**File**: `convex/tasks.ts`

The `getActionable` query currently returns ALL actionable tasks without checking who is asking. This is a critical information disclosure vulnerability.

**CURRENT (VULNERABLE)**:
```typescript
export const getActionable = query({
  args: {},
  handler: async (ctx) => {
    const todoTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .take(100);
    // ... returns all tasks without filtering by user
  },
});
```

**FIXED (with auth)**:
```typescript
export const getActionable = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    
    const entities = await ctx.db
      .query("entities")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();
    
    const entityIds = new Set(entities.map(e => e._id));
    
    const todoTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "todo"))
      .take(100);

    if (todoTasks.length === 0) return [];

    const allBlockedIds = new Set<string>();
    for (const task of todoTasks) {
      for (const blockedId of task.blockedBy) {
        allBlockedIds.add(blockedId);
      }
    }

    const blockedTasks = await Promise.all(
      Array.from(allBlockedIds).map((id) => ctx.db.get(id as Id<"tasks">))
    );
    const blockedTaskMap = new Map<string, boolean>();
    for (const task of blockedTasks) {
      if (task && "status" in task) {
        blockedTaskMap.set(task._id, task.status === "done");
      }
    }

    const actionable = [];
    for (const task of todoTasks) {
      if (!entityIds.has(task.entityId)) continue;
      
      if (task.blockedBy.length === 0) {
        actionable.push(task);
        continue;
      }
      if (task.blockedBy.every((blockedId) => blockedTaskMap.get(blockedId))) {
        actionable.push(task);
      }
    }
    return actionable;
  },
});
```

---

## Phase 2: Clerk Convex Integration Verification

### Checklist for Clerk Convex Integration

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/apps/setup/convex)
2. Verify Convex integration shows **GREEN/ACTIVE** status
3. Verify domain matches `auth.config.ts`:
   ```typescript
   // convex/auth.config.ts
   export default {
     providers: [
       {
         domain: "https://inspired-oarfish-5.clerk.accounts.dev",
         applicationID: "convex",
       },
     ],
   };
   ```
4. **CRITICAL**: SIGNOUT COMPLETELY (not just switch user) and sign back in
5. Clear browser localStorage: `localStorage.clear()` and refresh
6. Open DevTools → Network, filter for `__convex/` requests to see auth headers

### Root Cause Analysis: Why "No autenticado" happens

The "No autenticado" error occurs in this sequence:

```
1. User visits app
2. ClerkProvider initializes, user may not be loaded yet
3. ConvexProviderWithClerk wraps app
4. useQuery(api.tasks.getActionable) fires IMMEDIATELY
5. Convex tries to authenticate via ctx.auth.getUserIdentity()
6. Clerk token hasn't been exchanged yet → returns null
7. getCurrentUser() throws "No autenticado"
```

This is a **race condition**: queries fire before auth is established.

### Fix: Add auth state guard in views

**Files**: `TriageView.tsx`, `FocusView.tsx`, `EntitiesView.tsx`

Create a hook to detect when auth is ready:

```typescript
// src/hooks/useAuthReady.ts
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

export function useAuthReady(): boolean {
  const { isSignedIn, isLoaded } = useAuth();
  
  useEffect(() => {
    if (!isLoaded) {
      console.log("[Auth] Clerk still loading...");
    } else if (!isSignedIn) {
      console.log("[Auth] User not signed in");
    } else {
      console.log("[Auth] User signed in and ready");
    }
  }, [isLoaded, isSignedIn]);
  
  return isLoaded && isSignedIn !== undefined;
}
```

**Updated FocusView.tsx**:
```typescript
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Circle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useAuthReady } from "../hooks/useAuthReady";
import { useAuth } from "@clerk/clerk-react";

export function FocusView() {
  const { t } = useTranslation();
  const isAuthReady = useAuthReady();
  const { isSignedIn } = useAuth();
  
  const tasks = useQuery(api.tasks.getActionable);
  const markDone = useMutation(api.tasks.markDone);

  if (!isAuthReady) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t("focus.title")}</h2>
          <p className="text-muted-foreground">{t("focus.description")}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("focus.loading")}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t("focus.title")}</h2>
          <p className="text-muted-foreground">{t("focus.description")}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Por favor, inicia sesión para ver tus tareas.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tasks === undefined) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t("focus.title")}</h2>
          <p className="text-muted-foreground">{t("focus.description")}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("focus.loading")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("focus.title")}</h2>
        <p className="text-muted-foreground">{t("focus.description")}</p>
      </div>
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("focus.noTasks")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task._id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={async () => {
                      try {
                        await markDone({ id: task._id });
                      } catch (e) {
                        console.error("Failed to mark done:", e);
                      }
                    }}
                  >
                    <Circle className="h-4 w-4" />
                  </Button>
                  {task.title}
                </CardTitle>
              </CardHeader>
              {task.description && (
                <CardContent className="pb-2">
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Phase 3: MCP Server Auth Architecture

### Why httpAction doesn't have auth context

`httpAction` is designed for **external API integrations**, not user authentication:

- `httpAction` receives raw HTTP requests
- It's meant to be called by external services (webhooks, third-party APIs)
- `ctx.auth.getUserIdentity()` returns `null` in httpAction because there's no Clerk token to validate
- The `Authorization: Bearer <token>` header goes to the HTTP layer, NOT to Convex auth

Current MCP endpoints in `convex/http.ts` are **completely unauthenticated**:
```typescript
http.route({
  path: "/api/mcp/tasks/getActionable",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // NO AUTH CHECK - anyone with the URL can call this!
    const tasks = await ctx.runQuery(api.tasks.getActionable, {});
    return new Response(JSON.stringify({ data: tasks }), { ... });
  }),
});
```

### Solution: Agent Auth Architecture

**Option A (RECOMMENDED): MCP uses Convex JS client directly**

Instead of HTTP endpoints, MCP server should use the Convex JS client:

```typescript
// mcp-server/src/convex-client.ts
import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL!;

export function createConvexClient(token: string): ConvexHttpClient {
  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(token);
  return client;
}

export async function getActionableTasks(token: string) {
  const client = createConvexClient(token);
  return await client.query("tasks/getActionable", {});
}

export async function markTaskDone(token: string, taskId: string) {
  const client = createConvexClient(token);
  await client.mutation("tasks/markDone", { id: taskId });
}
```

**Option B: Validate tokens via internal mutation**

Create a mutation that validates the agent token and returns a session:

```typescript
// convex/auth.ts
export const validateAgentToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", `agent:${args.token}`))
      .unique();
    
    if (!agent) {
      throw new Error("Invalid agent token");
    }
    
    if (agent.role !== "agent" && agent.role !== "sub_agent" && agent.role !== "admin") {
      throw new Error("Not an agent user");
    }
    
    return { userId: agent._id, role: agent.role };
  },
});
```

### Recommended Architecture for Agents

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENT → Convex Auth Flow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Agent obtains token (out of scope - external auth system)              │
│                                                                             │
│  2. Agent calls Convex JS client with Bearer token:                        │
│     ┌─────────────────────────────────────────────────────────────────┐   │
│     │ convex = new ConvexHttpClient(CONVEX_URL)                       │   │
│     │ convex.setAuth(token)  // Clerk JWT or custom agent token        │   │
│     │ tasks = await convex.query("tasks/getActionable", {})           │   │
│     └─────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  3. Convex auth.config.ts validates Clerk JWT OR custom token             │
│                                                                             │
│  4. If valid, ctx.auth.getUserIdentity() returns identity                 │
│     If invalid, request fails with 401                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: User Auto-Creation

### Add storeUser mutation

**File**: `convex/users.ts` (create new file)

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { upsertUserFromIdentity } from "./lib/auth";

export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("No autenticado");
    }

    const userId = await upsertUserFromIdentity(ctx, {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
    });

    return userId;
  },
});
```

### Add useStoreUserEffect hook

**File**: `src/hooks/useStoreUserEffect.ts`

```typescript
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useStoreUserEffect() {
  const storeUser = useMutation(api.users.storeUser);

  useEffect(() => {
    storeUser({}).catch((error) => {
      console.error("Failed to store user:", error);
    });
  }, [storeUser]);
}
```

**Usage in app root** (`src/App.tsx` or layout component):
```typescript
import { useStoreUserEffect } from "./hooks/useStoreUserEffect";

function App() {
  useStoreUserEffect();
  // ... rest of app
}
```

---

## Phase 5: Error Handling in Views

### Create QueryErrorBoundary

**File**: `src/components/QueryErrorBoundary.tsx`

```typescript
import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class QueryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[QueryErrorBoundary] Caught error:", error, errorInfo);
  }

  resetError() {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="m-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Error loading data</h3>
            <p className="text-muted-foreground mb-2">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Try refreshing the page or signing out and back in.
            </p>
            <Button variant="outline" onClick={this.resetError}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
```

### Update views to handle errors

**TriageView.tsx**:
```typescript
import { QueryErrorBoundary } from "./QueryErrorBoundary";

function TriageContent() {
  const { t } = useTranslation();
  const proposals = useQuery(api.proposals.listPending);
  const approve = useMutation(api.proposals.approve);
  const reject = useMutation(api.proposals.reject);

  const handleApprove = async (id: string) => {
    try {
      await approve({ id });
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await reject({ id });
    } catch (error) {
      console.error("Failed to reject:", error);
    }
  };

  if (proposals === undefined) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          {t("triage.loading")}
        </CardContent>
      </Card>
    );
  }

  if (proposals === null) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No tienes acceso a las propuestas. Asegúrate de ser administrador.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {proposals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("triage.noProposals")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <Card key={proposal._id}>
              <CardHeader>
                <CardTitle className="text-base">{proposal.type.replace("_", " ")}</CardTitle>
                <CardDescription>{proposal.reason}</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                  {JSON.stringify(JSON.parse(proposal.payload), null, 2)}
                </pre>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handleApprove(proposal._id)}
                >
                  <CheckCircle className="h-4 w-4" />
                  {t("triage.approve")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleReject(proposal._id)}
                >
                  <XCircle className="h-4 w-4" />
                  {t("triage.reject")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export function TriageView() {
  const { t } = useTranslation();

  return (
    <QueryErrorBoundary>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t("triage.title")}</h2>
          <p className="text-muted-foreground">{t("triage.description")}</p>
        </div>
        <TriageContent />
      </div>
    </QueryErrorBoundary>
  );
}
```

---

## Testing Plan

### Manual Testing Checklist

1. [ ] Clear localStorage: `localStorage.clear()` in browser console
2. [ ] Sign out COMPLETELY from Clerk (click user menu → Sign out)
3. [ ] Sign back in fresh
4. [ ] Verify DevTools → Network shows `__convex/` requests with `Authorization` header
5. [ ] Verify TriageView loads without "No autenticado" error
6. [ ] Verify FocusView loads and shows only YOUR tasks (not all users' tasks)
7. [ ] Verify EntitiesView loads your entities only
8. [ ] Test MCP with valid token - should work
9. [ ] Test MCP with invalid token - should get clear error
10. [ ] Test `getActionable` - verify it only returns YOUR entity's tasks

### Automated Testing (if available)

```typescript
// convex/tasks.test.ts
import { expect, test } from "vitest";
import { multiMutationCtx, singleQueryCtx } from "./test_helpers";
import { getActionable } from "./tasks";

test("getActionable returns only user's tasks", async () => {
  const { ctx, userId, otherUserId } = await setupUsers();
  const { entityId: userEntity } = await createEntityForUser(ctx, userId);
  const { entityId: otherEntity } = await createEntityForUser(ctx, otherUserId);
  
  await createTask(ctx, { entityId: userEntity, title: "My task" });
  await createTask(ctx, { entityId: otherEntity, title: "Other task" });
  
  const results = await getActionable({ ctx, args: {} });
  
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe("My task");
});
```

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `convex/tasks.ts` | Add auth to getActionable - filter by user's entities | P1-CRITICAL |
| `convex/users.ts` | Create new file with storeUser mutation | P4 |
| `src/hooks/useAuthReady.ts` | Create new hook for auth state detection | P2 |
| `src/hooks/useStoreUserEffect.ts` | Create new hook for auto-creating users | P4 |
| `src/components/QueryErrorBoundary.tsx` | Create new component for error handling | P5 |
| `src/components/TriageView.tsx` | Add auth guard + null handling + error boundary | P2, P5 |
| `src/components/FocusView.tsx` | Add auth guard + null handling + error boundary | P2, P5 |
| `src/components/EntitiesView.tsx` | Add auth guard + null handling + error boundary | P2, P5 |
| `mcp-server/src/convex.ts` | Rewrite for direct Convex JS client | P3 |
| `mcp-server/src/index.ts` | Update to use Convex client with auth | P3 |
| `convex/http.ts` | Either remove MCP endpoints or add proper auth | P3 |

---

## Documentation for Future Agents

### AUTH SYSTEM DOCUMENTATION

## How Auth Works in Open Brain

### Human Auth (Frontend → Convex)

```
Browser → ClerkProvider → ConvexProviderWithClerk → Convex Query/Mutation
                              ↓
                    Clerk exchanges token
                    Convex validates via auth.config.ts
                    ctx.auth.getUserIdentity() returns identity
```

- **Clerk** handles user authentication (sign in/up/password reset)
- **ConvexProviderWithClerk** bridges Clerk's JWT token to Convex
- Each query/mutation gets `ctx.auth` with user identity
- `getCurrentUser()` throws `"No autenticado"` if not authenticated
- `getCurrentUserOrNull()` returns `null` instead of throwing

### Agent Auth (MCP → Convex)

```
MCP Client → Bearer Token → ConvexHttpClient.setAuth() → Convex
                                  ↓
                          HTTP request with auth header
                          Convex validates token
                          ctx.auth.getUserIdentity() returns identity
```

- MCP server extracts Bearer token from request
- MCP uses **Convex JS client** (`ConvexHttpClient`), NOT HTTP endpoints
- Token must be a Clerk JWT or a recognized agent token
- `httpAction` handlers **DO NOT** have user auth context

### Key Files for Auth

| File | Purpose |
|------|---------|
| `convex/lib/auth.ts` | Auth helpers: `getCurrentUser`, `requireAgent`, `upsertUserFromIdentity` |
| `convex/auth.config.ts` | Clerk provider configuration (domain, applicationID) |
| `src/providers/ConvexClerkProvider.tsx` | Frontend auth setup: ClerkProvider + ConvexProviderWithClerk |
| `src/hooks/useAuthReady.ts` | Hook to detect when Clerk auth is loaded |
| `src/hooks/useStoreUserEffect.ts` | Hook to auto-create user on login |
| `mcp-server/src/convex-client.ts` | Convex JS client wrapper for agents |
| `mcp-server/src/auth.ts` | MCP token extraction helper |

### When Working on Auth Issues

#### 1. Frontend query fails with "No autenticado"

**Symptoms**: App loads but shows "No autenticado" error

**排查步骤**:
1. Open DevTools → Network, filter `__convex/`
2. Check if requests have `Authorization` header
3. Go to https://dashboard.clerk.com/apps/setup/convex
4. Verify Convex integration is **GREEN/ACTIVE**
5. Check `convex/auth.config.ts` domain matches Clerk dashboard
6. Clear localStorage: `localStorage.clear()`
7. Sign out COMPLETELY, close tab, reopen, sign back in

**Common causes**:
- Clerk Convex integration not activated
- Race condition: query fires before Clerk loads
- Stale localStorage with old token

#### 2. MCP endpoints fail auth

**Symptoms**: Agent can't access Convex functions

**排查步骤**:
1. Verify agent token is valid Clerk JWT
2. Check `mcp-server/src/convex-client.ts` uses `client.setAuth(token)`
3. Verify Convex deployment URL is correct

**Common causes**:
- Using `httpAction` instead of Convex JS client
- Token not passed to Convex client
- Token expired

#### 3. getCurrentUser returns null/throws

**Symptoms**: "No autenticado" or "Usuario no encontrado"

**排查步骤**:
1. Check `ctx.auth.getUserIdentity()` - is it null?
2. If null: Clerk token not validated → check Clerk integration
3. If identity exists but user not found: user not in DB → check `useStoreUserEffect`
4. Verify user exists in `users` table with matching `tokenIdentifier`

### Critical Rules

1. **NEVER expose `httpAction` for user-authenticated endpoints**
   - `httpAction` has NO auth context
   - Use Convex JS client for agent-to-Convex communication

2. **ALWAYS add auth check to queries that return user data**
   - `getActionable` must filter by user's entities
   - `entities.list` already filters by ownerId - good pattern

3. **Use `useAuthReady()` hook before rendering auth-dependent views**
   - Prevents race condition errors

4. **Handle `null` return from queries**
   - Some queries return `null` when not authorized
   - `useQuery` returns `undefined` while loading
   - `useQuery` throws on error (use QueryErrorBoundary)

### Official Documentation Links

- [Convex Auth Overview](https://docs.convex.dev/auth)
- [Clerk Integration](https://docs.convex.dev/auth/clerk)
- [Auth Debugging Guide](https://docs.convex.dev/auth/debug)
- [Convex HTTP Actions](https://docs.convex.dev/functions/http-actions)
- [Clerk Dashboard](https://dashboard.clerk.com)

---

## Fix Log

### 2026-04-10: Race Condition Fix - Hooks After Early Returns

**Problema**: Error "Rendered more hooks than during previous render" causado por llamar `useStoreUserEffect()` (que internamente usa `useMutation`) después de if statements con early return.

**Causa raíz**: React requiere que los hooks se ejecuten en el mismo orden en cada render. Cuando `!isLoaded` o `!isSignedIn`, los early returns evitaban que `useStoreUserEffect()` se llamara, cambiando el orden de hooks entre renders.

**Solución implementada**:

1. **Refactorizado `src/App.tsx`** para usar componentes de composición:
   ```tsx
   import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
   
   function App() {
     return (
       <ConvexClerkProvider>
         <AuthLoading><LoadingScreen /></AuthLoading>
         <Unauthenticated><SignIn /></Unauthenticated>
         <Authenticated><AppPage /></Authenticated>
       </ConvexClerkProvider>
     );
   }
   ```

2. **Actualizado `src/hooks/useStoreUserEffect.ts`** para usar `useConvexAuth()`:
   ```typescript
   import { useConvexAuth } from "convex/react";
   
   export function useStoreUserEffect() {
     const { isLoading, isAuthenticated } = useConvexAuth();
     const storeUser = useMutation(api.users.storeUser);
     // ...
   }
   ```

3. **Eliminado `convex/http.ts`** - endpoints `/api/mcp/*` ya no son necesarios (MCP server debe usar `ConvexHttpClient.setAuth()`)

**Archivos modificados**:
- `src/App.tsx` - Refactorizado con `<Authenticated>`
- `src/hooks/useStoreUserEffect.ts` - Usa `useConvexAuth()`
- `convex/http.ts` - ELIMINADO

**Documentación actualizada**:
- `docs/AUTH-SYSTEM.md` - Creado
- `docs/AUTH-QUICK-REFERENCE.md` - Creado
- `AGENTS.md` - Actualizado con índice de docs de auth

**Referencias**:
- [Rules of Hooks](https://react.dev/link/rules-of-hooks)
- [Convex Clerk Integration](https://docs.convex.dev/auth/clerk)
- [Storing Users in Convex Database](https://docs.convex.dev/auth/database-auth)

## Appendix: Complete File Templates

### src/hooks/useAuthReady.ts
```typescript
import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

export function useAuthReady(): boolean {
  const { isSignedIn, isLoaded } = useAuth();
  
  useEffect(() => {
    if (!isLoaded) {
      console.log("[Auth] Clerk still loading...");
    } else if (!isSignedIn) {
      console.log("[Auth] User not signed in");
    } else {
      console.log("[Auth] User signed in and ready");
    }
  }, [isLoaded, isSignedIn]);
  
  return isLoaded && isSignedIn !== undefined;
}
```

### src/components/QueryErrorBoundary.tsx
```typescript
import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class QueryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[QueryErrorBoundary] Caught error:", error, errorInfo);
  }

  resetError() {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="m-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Error loading data</h3>
            <p className="text-muted-foreground mb-2">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Try refreshing the page or signing out and back in.
            </p>
            <Button variant="outline" onClick={this.resetError}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
```
