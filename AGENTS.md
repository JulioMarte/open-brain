<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

# AGENTS.md - Guía de Agentes para Open Brain

## Sistema de Documentación Viva

Este proyecto usa un **sistema de documentación que se auto-mantiene**. Los agentes deben:

1. **Investigar docs relacionados ANTES de modificar código**
2. **Actualizar docs DESPUÉS de cambios significativos**
3. **Registrar aprendizajes** cuando encuentren patrones no obvios

---

## Índice de Documentación

### Sistema de Docs (LEER PRIMERO)
- **[DOC-INDEX.md](docs/DOC-INDEX.md)** - Índice maestro con relationships entre docs
- **[HOW-TO-DOC.md](docs/system/HOW-TO-DOC.md)** - Cómo crear/actualizar documentación
- **[LEARNINGS-FORMAT.md](docs/system/LEARNINGS-FORMAT.md)** - Formato para aprendizajes

### Arquitectura y Decisiones
- **[AUTH-SYSTEM.md](docs/auth/AUTH-SYSTEM.md)** - Arquitectura de autenticación
- **[AUTH-QUICK-REFERENCE.md](docs/auth/AUTH-QUICK-REFERENCE.md)** - Referencia rápida auth
- **[AUTH-FIX-PLAN.md](docs/auth/AUTH-FIX-PLAN.md)** - Histórico de fixes auth
- **[AGENT-AUTH-FINDINGS.md](docs/learning/AGENT-AUTH-FINDINGS.md)** - Descubrimientos auth
- **decisions/*.md** - Architecture Decision Records (por qué se tomaron decisiones)

### Onboarding
- **[QUICK-START.md](docs/getting-started/QUICK-START.md)** - Primeros pasos
- **[DEV-SETUP.md](docs/getting-started/DEV-SETUP.md)** - Setup de desarrollo

### Métricas y Salud
- **[DOC-HEALTH.md](docs/DOC-HEALTH.md)** - Métricas del sistema de docs
- **[DOC-GAPS.md](docs/DOC-GAPS.md)** - Áreas sin documentación
- **[AGENT-LEARNINGS.md](docs/learning/AGENT-LEARNINGS.md)** - Aprendizajes pendientes

---

## Protocolo de Investigación Documental

### Antes de modificar código:

1. **Identificar el área de trabajo**
   - ¿Auth? → `docs/auth/`
   - ¿Convex? → `docs/convex/` o `docs/convex-*.md`
   - ¿Frontend? → `docs/frontend/` o `docs/TESTING-GUIDE.md`
   - ¿Schema? → `docs/schema/SCHEMA-CHECKLIST.md`
   - ¿Testing? → `docs/TESTING-GUIDE.md`
   - ¿Cron? → `docs/CONVEX-CRONS-GUIDE.md`
   - ¿MCP? → `docs/MCP-TESTING-GUIDE.md`

2. **Consultar DOC-INDEX.md** para ver qué docs existen y sus relationships

3. **Si hay aprendizajes pendientes** en `AGENT-LEARNINGS.md` relacionados con tu área, leerlos

4. **Verificar DOC-GAPS.md** - ¿hay brechas conocidas en esta área?

### Después de modificar código:

1. **Si encontraste un patrón nuevo no documentado** → crear aprendizaje en `AGENT-LEARNINGS.md`

2. **Si actualizaste un patrón existente** → actualizar el doc correspondiente

3. **Si tomaste una decisión arquitectural** (por qué elegiste algo) → crear ADR en `docs/decisions/`

4. **Commits incluir tag DOCS-UPDATED** si actualizaste docs:
   ```
   feat(auth): add token refresh mechanism
   
   DOCS-UPDATED: docs/auth/AUTH-SYSTEM.md
   LEARNING: #001
   ```

---

## Reglas de Documentación para Agentes

### Regla 1: Investigar Primero
Antes de modificar código en un área, SIEMPRE consulta los docs relacionados en DOC-INDEX.md.

### Regla 2: Actualizar Después
Después de cambios significativos, el agente que hizo el cambio debe actualizar la documentación relacionada.

**"Cambio significativo" incluye:**
- Eliminar archivos mencionados en docs
- Cambiar arquitectura de autenticación
- Modificar API endpoints (agregar/eliminar/cambiar)
- Renombrar o mover módulos core
- Crear nueva funcionalidad que afecta a otras partes del sistema

**Si tu cambio invalida un doc existente, DEBES:**
1. Marcar el doc antiguo como SUPERSEDED (Regla 6)
2. Incluir `DOCS-UPDATED` en el commit

### Regla 3: Registrar Descubrimientos
Cuando encuentres algo no obvio, pattern nuevo, o error solucionado, agrégalo a AGENT-LEARNINGS.md.

### Regla 4: Decisiones = ADR
Si una modificación implica una decisión de arquitectura (por qué se eligió A sobre B), documenta el "por qué" en un ADR.

### Regla 5: Tags en Commits
En commits que actualicen docs, incluir:
- `DOCS-UPDATED: lista de archivos`
- `LEARNING: #XXX` si se creó aprendizaje

### Regla 6: Marcar Docs como SUPERSEDED
Cuando un doc quede obsoleto por cambios de arquitectura, **SIEMPRE** marcarlo:

1. Agregar `tags: [..., SUPERSEDED]` al frontmatter
2. Agregar campos al frontmatter:
   ```yaml
   supersededBy: nuevo-doc.md
   supersededDate: 2026-04-10
   reason: Razón breve de por qué es obsoleto
   ```
3. Agregar banner al inicio del documento:
   ```markdown
   # ⚠️ SUPERSEDED - ARCHIVO OBSOLETO
   
   **Este documento describe una arquitectura que YA NO es válida.**
   
   **Reemplazado por:**
   - `docs/nuevo-doc.md`
   ```

**Trigger para SUPERSEDED**: Cuando cambies arquitectura (auth, API, endpoints), cualquier doc que describa la arquitectura anterior debe marcarse.

---

## TypeScript y Convex Development

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
3. **TS2339**: "Property does not exist" - vectorSearch only exists on ActionCtx, not QueryCtx or MutationCtx
4. **TS2322/TS2345**: "Type X is not assignable to type Y" with `OrderedQuery<tasks>` vs `QueryInitializer<users>` - Bug de tipos Convex: `ReturnType<QueryCtx["db"]["query"]>` infiere incorrectamente. Solución: usar `q: unknown` con type assertion interno. Ver ADR-008.
5. **TS2322**: "Type ({ _id: Id<"users">... })[] is not assignable to type ({ _id: Id<"tasks">... })[]" - Mismo bug de arriba, diferente presentación.

### Key Convex Limitations
- Actions cannot use `ctx.db` directly - only `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`
- Vector search (`ctx.vectorSearch`) only works in **actions**, not queries or mutations
- JSON.parse returns `unknown` type - always cast through `unknown` to your typed interface

---

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

---

## Tabla de Impacto (Código → Documentación)

Cuando modifiques estos archivos, verifica/actualiza los docs indicados:

| Archivo | Docs a Investigar | Tags |
|---------|-------------------|------|
| `convex/auth.config.ts` | AUTH-SYSTEM.md, AUTH-QUICK-REFERENCE.md | auth |
| `convex/lib/auth.ts` | AUTH-SYSTEM.md | auth |
| `src/providers/ConvexClerkProvider.tsx` | AUTH-SYSTEM.md | auth |
| `src/hooks/useStoreUserEffect.ts` | AUTH-SYSTEM.md, AUTH-QUICK-REFERENCE.md | auth |
| `src/App.tsx` | AUTH-SYSTEM.md | auth |
| `convex/schema.ts` | SCHEMA-CHECKLIST.md | schema |
| `convex/tasks.ts` | ADR-008 (si hay error TS2322/TS2345 con ReturnType<QueryCtx>) | convex |
| `convex/crons/*.ts` | CONVEX-CRONS-GUIDE.md | cron |
| `src/components/**/*.tsx` | TESTING-GUIDE.md, FRONTEND-TESTING-GUIDE.md | frontend |
| `mcp-server/**/*.ts` | MCP-TESTING-GUIDE.md | mcp |
