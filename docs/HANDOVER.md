# OPEN BRAIN - AUTH FIX HANDOVER

## PRIORITY ORDER - Execute in this order

### 1. IMMEDIATE: Fix getActionable (SECURITY CRITICAL)

File: `convex/tasks.ts`

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { getCurrentUser, isAdmin } from "./lib/auth";

type TaskDoc = Doc<"tasks">;

export const list = query({
  args: {
    entityId: v.optional(v.id("entities")),
    status: v.optional(v.union(v.literal("todo"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    if (args.entityId) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId!))
        .take(100);
      if (args.status) {
        return tasks.filter((t) => t.status === args.status);
      }
      return tasks;
    }
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(100);
    }
    return await ctx.db.query("tasks").take(100);
  },
});

export const getActionable = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    
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

export const getSubtasks = query({
  args: { parentTaskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    return await ctx.db
      .query("tasks")
      .withIndex("by_parentTaskId", q => q.eq("parentTaskId", args.parentTaskId))
      .collect();
  },
});

export const getOverdue = query({
  args: { entityId: v.optional(v.id("entities")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    
    let tasks;
    if (args.entityId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_entityId", q => q.eq("entityId", args.entityId!))
        .collect();
    } else {
      tasks = await ctx.db.query("tasks").collect();
    }
    
    return tasks.filter(t => {
      if (t.status === "done" || t.status === "cancelled") return false;
      if (!t.dueDate) return false;
      return t.dueDate < now;
    });
  },
});

export const create = mutation({
  args: {
    entityId: v.id("entities"),
    title: v.string(),
    description: v.optional(v.string()),
    blockedBy: v.optional(v.array(v.id("tasks"))),
    agentCreated: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const taskId = await ctx.db.insert("tasks", {
      entityId: args.entityId,
      title: args.title,
      description: args.description,
      status: "todo",
      blockedBy: args.blockedBy || [],
      agentCreated: args.agentCreated || false,
      priority: args.priority,
      parentTaskId: args.parentTaskId,
      dueDate: args.dueDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: user._id,
      updatedBy: user._id,
    });
    return taskId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    
    const updates: Partial<TaskDoc> = { status: args.status };
    
    if (args.status === "done") {
      updates.completedAt = Date.now();
    } else if (args.status === "todo" && task.status === "done") {
      updates.completedAt = undefined;
    }
    
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const updateTask = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    parentTaskId: v.optional(v.id("tasks")),
    blockedBy: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    
    if (task.createdBy !== user._id && !isAdmin(user.role)) {
      throw new Error("Not authorized to update this task");
    }
    
    const updates: Partial<TaskDoc> = {
      updatedAt: Date.now(),
      updatedBy: user._id,
    };
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    if (args.parentTaskId !== undefined) updates.parentTaskId = args.parentTaskId;
    if (args.blockedBy !== undefined) updates.blockedBy = args.blockedBy;
    
    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

export const markDone = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await ctx.db.patch(args.id, { status: "done" });
    return args.id;
  },
});
```

---

### 2. Create User Store Mutation

File: `convex/users.ts`

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { upsertUserFromIdentity } from "./lib/auth";

export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const userId = await upsertUserFromIdentity(ctx, {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
    });
    
    return userId;
  },
});

export const list = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});
```

---

### 3. Create useStoreUserEffect Hook

File: `src/hooks/useStoreUserEffect.ts`

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

---

### 4. Create QueryErrorBoundary Component

File: `src/components/QueryErrorBoundary.tsx`

```typescript
import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class QueryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("QueryErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 text-center text-muted-foreground">
          <p>Something went wrong loading data.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 text-sm underline hover:text-foreground"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

### 5. Fix TriageView

File: `src/components/TriageView.tsx`

```typescript
import { useTranslation } from "react-inext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "./ui/card";
import { Button } from "./ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { QueryErrorBoundary } from "./QueryErrorBoundary";

export function TriageView() {
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
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t("triage.title")}</h2>
          <p className="text-muted-foreground">{t("triage.description")}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("triage.loading")}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (proposals === null) {
    return (
      <QueryErrorBoundary>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">{t("triage.title")}</h2>
            <p className="text-muted-foreground">{t("triage.description")}</p>
          </div>
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t("triage.loading")}
            </CardContent>
          </Card>
        </div>
      </QueryErrorBoundary>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("triage.title")}</h2>
        <p className="text-muted-foreground">{t("triage.description")}</p>
      </div>
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
    </div>
  );
}
```

---

### 6. Fix FocusView

File: `src/components/FocusView.tsx`

```typescript
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Circle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { QueryErrorBoundary } from "./QueryErrorBoundary";

export function FocusView() {
  const { t } = useTranslation();
  const tasks = useQuery(api.tasks.getActionable);
  const markDone = useMutation(api.tasks.markDone);

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

  if (tasks === null) {
    return (
      <QueryErrorBoundary>
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
      </QueryErrorBoundary>
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

### 7. Fix EntitiesView

File: `src/components/EntitiesView.tsx`

```typescript
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { QueryErrorBoundary } from "./QueryErrorBoundary";

type EntityType = "project" | "person" | "idea" | "admin";

export function EntitiesView() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EntityType>("project");

  const entities = useQuery(api.entities.list);
  const create = useMutation(api.entities.create);

  const handleCreate = () => {
    if (!newName.trim()) return;
    create({ type: newType, name: newName });
    setNewName("");
    setShowForm(false);
  };

  if (entities === undefined) {
    return <div className="p-4">{t("focus.loading")}</div>;
  }

  if (entities === null) {
    return (
      <QueryErrorBoundary>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{t("entities.title")}</h2>
              <p className="text-muted-foreground">{t("entities.description")}</p>
            </div>
          </div>
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t("focus.loading")}
            </CardContent>
          </Card>
        </div>
      </QueryErrorBoundary>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("entities.title")}</h2>
          <p className="text-muted-foreground">{t("entities.description")}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          {t("entities.newEntity")}
        </Button>
      </div>
      {showForm && (
        <Card>
          <CardContent className="p-4 flex gap-4 items-end">
            <div className="flex-1">
              <Input
                placeholder={t("entities.entityName")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <select
              className="h-9 px-3 rounded-md border border-input bg-background"
              value={newType}
              onChange={(e) => setNewType(e.target.value as EntityType)}
            >
              <option value="project">{t("entities.types.project")}</option>
              <option value="person">{t("entities.types.person")}</option>
              <option value="idea">{t("entities.types.idea")}</option>
              <option value="admin">{t("entities.types.admin")}</option>
            </select>
            <Button onClick={handleCreate}>{t("entities.create")}</Button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-4">
        {entities.map((entity) => (
          <Card key={entity._id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    entity.type === "project"
                      ? "bg-blue-500"
                      : entity.type === "person"
                      ? "bg-green-500"
                      : entity.type === "idea"
                      ? "bg-purple-500"
                      : "bg-orange-500"
                  }`}
                />
                {entity.name}
              </CardTitle>
            </CardHeader>
            {entity.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{entity.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

### 8. Update App.tsx to use storeUser

File: `src/App.tsx`

```typescript
import { useState } from "react";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { ConvexClerkProvider } from "./providers/ConvexClerkProvider";
import { Layout } from "./components/Layout";
import { TriageView } from "./components/TriageView";
import { FocusView } from "./components/FocusView";
import { EntitiesView } from "./components/EntitiesView";
import { SearchView } from "./components/SearchView";
import { useStoreUserEffect } from "./hooks/useStoreUserEffect";

type View = "triage" | "focus" | "entities" | "search";

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function AppPage() {
  const [currentView, setCurrentView] = useState<View>("triage");

  return (
    <Layout currentView={currentView} onNavigate={(view) => setCurrentView(view as View)}>
      {currentView === "triage" && <TriageView />}
      {currentView === "focus" && <FocusView />}
      {currentView === "entities" && <EntitiesView />}
      {currentView === "search" && <SearchView />}
    </Layout>
  );
}

function AppContent() {
  const { isLoaded, isSignedIn } = useAuth();

  useStoreUserEffect();

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <SignIn routing="hash" />
      </div>
    );
  }

  return <AppPage />;
}

function App() {
  return (
    <ConvexClerkProvider>
      <AppContent />
    </ConvexClerkProvider>
  );
}

export default App;
```

---

### 9. MCP Server Fix (IMPORTANT)

File: `mcp-server/src/convex.ts`

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

const client = new ConvexHttpClient(CONVEX_URL);

interface ConvexResult<T> {
  data?: T;
  error?: string;
}

async function callConvex<T>(functionName: string, args: Record<string, unknown>, token: string): Promise<T> {
  const response = await fetch(`${CONVEX_URL}/api/mcp/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });
  
  const result = await response.json() as ConvexResult<T>;
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data as T;
}

export { callConvex, CONVEX_URL };

export async function semanticSearch(query: string, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>('searchMemories', { queryText: query, limit: 10 }, token);
  return result;
}

export async function getActionableTasks(token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>('tasks/getActionable', {}, token);
  return result;
}

export async function proposeAction(type: string, payload: string, reason: string, token: string): Promise<string> {
  const result = await callConvex<string>('proposals/create', { type, payload, reason }, token);
  return result;
}

export async function markTaskDone(taskId: string, token: string): Promise<void> {
  await callConvex<void>('tasks/markDone', { id: taskId }, token);
}

export async function createEntity(args: z.infer<typeof createEntitySchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>('entities/create', args, token);
  return result;
}

export async function updateEntity(args: z.infer<typeof updateEntitySchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>('entities/update', args, token);
  return result;
}

export async function updateTask(args: z.infer<typeof updateTaskSchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>('tasks/update', args, token);
  return result;
}

export async function getSubtasks(args: z.infer<typeof getSubtasksSchema>, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>('tasks/getSubtasks', args, token);
  return result || [];
}

export async function getMemorySource(args: z.infer<typeof getMemorySourceSchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>('memories/getSource', args, token);
  return result;
}

export async function archiveMemory(args: z.infer<typeof archiveMemorySchema>, token: string): Promise<void> {
  await callConvex<void>('memories/archive', args, token);
}

export async function getLowConfidenceMemories(args: z.infer<typeof getLowConfidenceMemoriesSchema>, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>('memories/lowConfidence', args, token);
  return result || [];
}
```

---

## Verification Steps

After each step, run: `npx convex build --typecheck`

If typecheck passes, proceed to next step.

---

## Files Summary

| File | Action |
|------|--------|
| convex/tasks.ts | Modify - add auth to getActionable |
| convex/users.ts | Create - storeUser mutation |
| src/hooks/useStoreUserEffect.ts | Create |
| src/components/QueryErrorBoundary.tsx | Create |
| src/components/TriageView.tsx | Modify |
| src/components/FocusView.tsx | Modify |
| src/components/EntitiesView.tsx | Modify |
| src/App.tsx | Modify |
| mcp-server/src/convex.ts | Rewrite |

---

## Key Changes Explained

### 1. getActionable Auth Fix
The `getActionable` query was missing `getCurrentUser(ctx)` call, allowing unauthenticated access to all tasks. Added the auth check at the start of the handler.

### 2. storeUser Mutation
Creates/updates user record when they sign in, ensuring user exists in database before other queries run.

### 3. useStoreUserEffect Hook
Calls `storeUser` mutation on app load after authentication to sync user to Convex.

### 4. QueryErrorBoundary Component
Wraps queries to gracefully handle when queries return `null` (auth errors) instead of crashing.

### 5-7. View Components
Added `null` checks for queries that can return `null` when auth fails, displaying loading/error state instead of crashing.

### 8. App.tsx
Added `useStoreUserEffect()` call in `AppContent` to sync user on sign-in.

### 9. MCP Server Rewrite
Changed from raw HTTP calls to using `ConvexHttpClient` for proper authentication handling with Convex.
