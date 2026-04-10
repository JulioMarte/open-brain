# Sistema de Autenticación - Open Brain

## Arquitectura Actual

### Stack de Auth
- **Clerk**: Proveedor de autenticación (OAuth/JWT)
- **Convex**: Backend con validación de tokens via `auth.config.ts`
- **React**: Frontend con providers `<ClerkProvider>` y `<ConvexProviderWithClerk>`

### Flujo de Autenticación

```
Browser → ClerkProvider → ConvexProviderWithClerk → Convex 
                    ↓           ↓
              Clerk Session   JWT Token → ctx.auth.getUserIdentity()
```

1. Usuario hace login en Clerk
2. ClerkProvider obtiene sesión
3. ConvexProviderWithClerk intercambia token con Convex
4. Convex valida el JWT via `auth.config.ts`
5. `ctx.auth.getUserIdentity()` retorna la identidad del usuario

### Roles del Sistema

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `human` | Usuario normal (default) | CRUD en sus entities y tasks |
| `agent` | Agente de IA | Acceso vía MCP con token |
| `sub_agent` | Sub-agente | Acceso limitado vía MCP |
| `admin` | Administrador | Panel admin + acceso total |

## Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `convex/auth.config.ts` | Configuración del provider Clerk |
| `convex/lib/auth.ts` | Helpers: `getCurrentUser`, `requireAdmin`, `upsertUserFromIdentity` |
| `src/providers/ConvexClerkProvider.tsx` | Proveedor combinando Clerk + Convex |
| `src/hooks/useStoreUserEffect.ts` | Hook para crear usuario en login |
| `src/App.tsx` | Composición de auth con `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>` |

## Patrones de Auth en React

### Pattern Correcto: Composición con Componentes

**SIEMPRE** usa los componentes de composición de `convex/react`:

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
```

### NO HAGAS Esto: Hooks Condicionales

**INCORRECTO** - Causa "Rendered more hooks than during previous render":

```tsx
// ❌ INCORRECTO
function AppContent() {
  const { isLoaded, isSignedIn } = useAuth();
  
  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <SignIn />;
  
  useStoreUserEffect(); // ❌ Hook después de early returns!
  
  return <AppPage />;
}
```

## Reglas de Oro para Agentes

1. **NUNCA** llames hooks de React (`useMutation`, `useQuery`) después de early returns
2. **USA** `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>` de `convex/react`
3. **USA** `useConvexAuth()` de `convex/react` cuando necesites estado de auth en hooks
4. **NUNCA** uses `httpAction` para endpoints que requieren auth de usuario

## Errores Comunes

### "Rendered more hooks than during previous render"

| Aspecto | Detalle |
|---------|---------|
| **Causa** | Llamar hooks condicionalmente (después de if statements con early return) |
| **Solución** | Usar componentes `<Authenticated>` y mover hooks dentro |
| **Referencia** | [Rules of Hooks](https://react.dev/link/rules-of-hooks) |

### "Not authenticated" 

| Aspecto | Detalle |
|---------|---------|
| **Causa** | Clerk token no ha sido validado por Convex aún |
| **Solución** | Usar `useConvexAuth()` y verificar `isAuthenticated` antes de queries |

### Clerk Convex Integration Inactiva

1. Ir a [Clerk Dashboard](https://dashboard.clerk.com/apps/setup/convex)
2. Verificar que Convex integration muestre **GREEN/ACTIVE**
3. Hacer logout completo y login de nuevo
4. Limpiar localStorage: `localStorage.clear()`

## Sistema de Archivos de Documentación

```
docs/
├── AUTH-SYSTEM.md           # Este archivo - Arquitectura completa
├── AUTH-QUICK-REFERENCE.md  # Referencia rápida y troubleshooting
├── AUTH-FIX-PLAN.md         # Histórico de fixes y decisiones
└── phases/
    ├── PHASE-01-SCHEMA-UPDATES.md
    ├── PHASE-02-MODULES-UPDATES.md
    ├── PHASE-03-MCP-TOOLS.md
    └── PHASE-04-CRON-JOBS.md
```

## Para Más Información

- [Convex Auth Overview](https://docs.convex.dev/auth)
- [Clerk Integration](https://docs.convex.dev/auth/clerk)
- [Auth in Functions](https://docs.convex.dev/auth/functions-auth)
- [Storing Users in Convex Database](https://docs.convex.dev/auth/database-auth)