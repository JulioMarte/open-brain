# Auth Quick Reference - Open Brain

## Patrón Correcto: `<Authenticated>`

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
  useStoreUserEffect(); // ✅ Seguro - siempre dentro de <Authenticated>
  return <Layout>...</Layout>;
}
```

## useStoreUserEffect Pattern

```typescript
import { useEffect, useState } from "react";
import { useMutation, useConvexAuth } from "convex/react";
import { api } from "../convex/_generated/api";

export function useStoreUserEffect() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.storeUser);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;  // ✅ Guardia al inicio

    async function store() {
      try {
        const id = await storeUser({});
        setUserId(id as string);
      } catch (error) {
        console.error("Failed to store user:", error);
      }
    }

    store();
    return () => setUserId(null);
  }, [isAuthenticated, storeUser]);

  return {
    isLoading: isLoading || (isAuthenticated && userId === null),
    isAuthenticated: isAuthenticated && userId !== null,
  };
}
```

## Diferencias: `useAuth` vs `useConvexAuth`

| Hook | Fuente | Uso |
|------|--------|-----|
| `useAuth()` | `@clerk/clerk-react` | Solo para UI de Clerk (sign-in, sign-out) |
| `useConvexAuth()` | `convex/react` | **Correcto** para verificar auth con Convex |

**Importante**: `useConvexAuth()` garantiza que el token JWT ha sido validado por Convex antes de报告 `isAuthenticated: true`.

## Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| "Rendered more hooks" | Hooks después de early returns | Refactorizar con `<Authenticated>` |
| "Not authenticated" | Clerk token no validado | Usar `useConvexAuth()` |
| "No autenticado" | Clerk integration inactiva | Verificar dashboard Clerk → Convex |
| App crashea en login | Race condition | Mover `useStoreUserEffect` dentro de `<Authenticated>` |

## Comandos de Verificación

```bash
# Limpiar localStorage (browser console)
localStorage.clear()

# Ver requests de auth en DevTools
# Network filter: __convex/
# Verificar header "Authorization: Bearer ..."

# Verificar Clerk integration
# Ir a: https://dashboard.clerk.com/apps/setup/convex
```

## Importaciones Necesarias

```tsx
// React hooks de Convex
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";

// Clerk hooks
import { useAuth, useUser } from "@clerk/clerk-react";
```