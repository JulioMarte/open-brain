<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Índice de Documentación

### Autenticación y Auth
- **[AUTH-SYSTEM.md](docs/AUTH-SYSTEM.md)** - Arquitectura completa del sistema de auth
- **[AUTH-QUICK-REFERENCE.md](docs/AUTH-QUICK-REFERENCE.md)** - Referencia rápida y troubleshooting
- **[AUTH-FIX-PLAN.md](docs/AUTH-FIX-PLAN.md)** - Histórico de fixes y decisiones arquitecturales

### Convex Development

### Running TypeScript Checks
- **ALWAYS use**: `npx convex dev` or `npx convex build --typecheck`
- **DO NOT use**: `npx tsc --noEmit` alone - it does not properly load Convex's `_generated` types

The Convex build system uses its own TypeScript configuration that correctly includes all generated types from `convex/_generated/`. Running `tsc` directly may pass but `convex dev` will fail.

### Type Casting Pattern
When casting `Record<string, unknown>` (from JSON.parse) to typed interfaces, use double cast:
```typescript
const typedPayload = payload as unknown as MyTypedPayload;
```

### Common TypeScript Errors
1. **TS7022/TS7023**: "implicitly has type 'any'" - Add explicit return type annotation to handler
2. **TS7006**: "Parameter implicitly has type 'any'" - Add type annotation to callback parameters
3. **TS2339**: "Property does not exist" - Use `(ctx as any).vectorSearch()` for vector search in queries

### Key Convex Limitations
- Actions cannot use `ctx.db` or `ctx.vectorSearch` directly - only `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`
- Vector search (`ctx.vectorSearch`) only works in queries, not actions
- JSON.parse returns `unknown` type - always cast through `unknown` to your typed interface

## Auth System Overview

### ⚠️ CRITICAL: React Hooks Rules for Auth

**NEVER call React hooks (`useMutation`, `useQuery`) after early return statements.** This causes "Rendered more hooks than during previous render" errors.

**USE the composition pattern with `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>` from `convex/react`:**

```tsx
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";

function App() {
  return (
    <ConvexClerkProvider>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <SignIn routing="hash" />
      </Unauthenticated>
      <Authenticated>
        <AppPage />
      </Authenticated>
    </ConvexClerkProvider>
  );
}

function AppPage() {
  useStoreUserEffect(); // ✅ Safe - inside <Authenticated>
  return <Layout>...</Layout>;
}
```

**USE `useConvexAuth()` from `convex/react` instead of Clerk's `useAuth()` when checking auth state in hooks.**

See [AUTH-SYSTEM.md](docs/AUTH-SYSTEM.md) and [AUTH-QUICK-REFERENCE.md](docs/AUTH-QUICK-REFERENCE.md) for detailed patterns.

## Regla de Documentación para Agentes

Cuando encuentres un error nuevo, patrón nuevo, o cambio en el sistema de auth:
1. **Documenta** en el archivo `docs/AUTH-SYSTEM.md` o `docs/AUTH-QUICK-REFERENCE.md`
2. **Actualiza** este `AGENTS.md` si agregas nuevos documentos al índice
3. **Agrega** una nota en `docs/AUTH-FIX-PLAN.md` sobre el cambio realizado