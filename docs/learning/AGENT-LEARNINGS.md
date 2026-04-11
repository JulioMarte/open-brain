---
title: AGENT-LEARNINGS - Aprendizajes de Agentes
description: Log de descubrimientos y patrones encontrados por agentes
tags: [learning, findings]
lastUpdated: 2026-04-10
author: human
---

# AGENT-LEARNINGS - Aprendizajes de Agentes

## Propósito

Este archivo registra **descubrimientos no obvios** que los agentes encuentran durante su trabajo y que deberían persistir para sesiones futuras.

## Formato de Aprendizaje

Ver [LEARNINGS-FORMAT.md](../system/LEARNINGS-FORMAT.md) para el template completo.

```markdown
## Aprendiendo #XXX | YYYY-MM-DD | Status: PENDING

**Contexto**: 
**Patrón**: 
**Evidencia**: 
**Doc a actualizar**: 
**Prioridad**: HIGH|MEDIUM|LOW

---
**Resuelto**:
- Status: 
- Resolved: 
- Cómo se documentó: 
```

## Estado del Sistema

| Métrica | Valor |
|---------|-------|
| Total aprendizajes | 5 |
| Pendientes | 0 |
| Resueltos | 5 |
| Ignorados | 0 |

---

## Aprendizajes Registrados

## Aprendiendo #005 | 2026-04-10 | Status: DONE

**Contexto**: PHASE-03-MCP-TOOLS.md quedó obsolete después del auth fix (commit c1aec51)
**Patrón**: Las reglas de AGENTS.md no se cumplieron - los agentes no actualizaron los docs cuando la arquitectura cambió. Regla "DOCS-UPDATED" no se cumplió.
**Evidencia**: PHASE-03-MCP-TOOLS.md todavía menciona `convex/http.ts` y endpoints `/api/mcp/*` que fueron eliminados. HANDOVER.md tiene información obsoleta.
**Doc a actualizar**: AGENTS.md - agregar mecanismo "SUPERSEDED" y enforcement
**Prioridad**: HIGH

---
**Resuelto**:
- Status: DONE
- Resolved: 2026-04-10
- Cómo se documentó: Se marcaron PHASE-03-MCP-TOOLS.md y HANDOVER.md como SUPERSEDED. Se agregó este aprendizaje.

---

## Aprendiendo #004 | 2026-04-10 | Status: DONE

**Contexto**: TypeScript typecheck fallaba en `convex/tasks.ts` con error TS2322 y TS2345
**Patrón**: `ReturnType<QueryCtx["db"]["query"]>` no preserva el tipo genérico `<TableName extends TableNames>`. TypeScript infiere incorrectamente que el retorno es `users` (primera tabla del schema) en lugar de mantener el tipo genérico. Esto causa que `OrderedQuery<tasks>` no sea asignable a `QueryInitializer<users>`.
**Evidencia**: Error en línea 16, 50, 57, 63, 69 de `convex/tasks.ts`. El fix fue cambiar `q: ReturnType<QueryCtx["db"]["query"]>` a `q: unknown` con type assertion interno.
**Doc a actualizar**: ADR-008-convex-types-bug-workaround.md
**Prioridad**: HIGH

---
**Resuelto**:
- Status: DONE
- Resolved: 2026-04-10
- Cómo se documentó: ADR-008-convex-types-bug-workaround.md

---

## Aprendiendo #001 | 2026-04-10 | Status: DONE

**Contexto**: Audit de seguridad en `convex/agents.ts`, `convex/tasks.ts`, y `convex/lib/agentJwt.ts`
**Patrón**: Token JWT tiene `userId` (agente) y `ownerId` (humano dueño). Error común es comparar `userId` cuando se debe comparar `ownerId`
**Evidencia**: `revokeAgentToken` línea 230 comparaba `token.userId` en vez de `token.ownerId`
**Doc a actualizar**: AUTH-SYSTEM.md, ADR-004-security-fixes-2026.md
**Prioridad**: HIGH

---
**Resuelto**:
- Status: DONE
- Resolved: 2026-04-10
- Cómo se documentó: ADR-004-security-fixes-2026.md

## Aprendiendo #002 | 2026-04-10 | Status: DONE

**Contexto**: Validación de algoritmo JWT en `verifyAccessToken` y `verifyRefreshToken`
**Patrón**: Siempre validar el `alg` en el header JWT. Ataques "alg: none" permiten bypass de firma si no se valida
**Evidencia**: `verifyAccessToken` no parseaba el header para verificar `alg: "HS256"`
**Doc a actualizar**: ADR-004-security-fixes-2026.md, AUTH-SYSTEM.md
**Prioridad**: HIGH

---
**Resuelto**:
- Status: DONE
- Resolved: 2026-04-10
- Cómo se documentó: ADR-004-security-fixes-2026.md

## Aprendiendo #003 | 2026-04-10 | Status: DONE

**Contexto**: Generación de tokens con `Math.random()` en `convex/agents.ts`
**Patrón**: `Math.random()` no es criptográficamente seguro. Usar siempre `crypto.randomUUID()` para IDs de tokens
**Evidencia**: Líneas 33, 56, 293 usaban `Math.random().toString(36).substring(2, 15)` para token identifiers
**Doc a actualizar**: ADR-004-security-fixes-2026.md
**Prioridad**: HIGH

---
**Resuelto**:
- Status: DONE
- Resolved: 2026-04-10
- Cómo se documentó: ADR-004-security-fixes-2026.md

<!-- Ejemplo de formato:

## Aprendiendo #001 | 2026-04-10 | Status: DONE

**Contexto**: Modificando el flujo de auth en convex/lib/auth.ts
**Patrón**: El token JWT de Clerk tiene un expiry que no se refresca automáticamente
en el backend de Convex
**Evidencia**: El token expira después de 1 hora y las queries empiezan a fallar con
"Not authenticated" aunque el frontend muestra sesión activa
**Doc a actualizar**: AUTH-SYSTEM.md, decisions/003-token-refresh.md
**Prioridad**: HIGH

---
**Resuelto**:
- Status: DONE
- Resolved: 2026-04-10
- Cómo se documentó: Se creó ADR-003-token-refresh.md explicando el patrón
- Notas: El frontend de Clerk sí refresca el token automáticamente, pero el backend
de Convex no tiene forma de detectar esto hasta la próxima query.

-->

---

## Regla: Después de un descubrimiento no trivial

1. Agregar aquí con formato completo
2. Si prioridad es HIGH, considerar crear entrada en DOC-DEBT.md
3. Si es un "por qué" arquitectural, crear ADR en `docs/decisions/`
4. En commit, incluir tag: `LEARNING: #XXX`

## Áreas con Aprendizajes Pendientes

| Área | # Aprendizajes | Ver también |
|------|---------------|-------------|
| (vacío) | - | - |

---

## Para Humanos

Si encuentras un aprendizaje de agent que:
- **Está incorrecto**: Agregar comment con corrección
- **Está obsoleto**: Marcar como IGNORED y explicar por qué
- **Está incompleto**: Editar con más contexto o evidencia

Los agents actualizan este archivo automáticamente, pero humanos pueden corregir.
