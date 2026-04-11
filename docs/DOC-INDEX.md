---
title: DOC-INDEX - Índice de Documentación
description: Índice maestro con tags, relationships y áreas de impacto
tags: [index, master]
lastUpdated: 2026-04-10
author: human
---

# DOC-INDEX - Índice Maestro de Documentación

## Propósito

Este archivo es el **punto de entrada** para que los agentes descubran qué documentación existe y cuál actualizar según el área de trabajo.

## Sistema de Tags

Cada documento usa frontmatter con tags:
- `area`: Área principal (auth, convex, frontend, schema, testing, mcp, cron)
- `type`: Tipo según Diátaxis (guide, reference, how-to, tutorial, explanation, checklist, findings, history)

## Estructura de Documentación

### Sistema de Docs (Meta)

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [DOC-INDEX.md](DOC-INDEX.md) | area:index | Este índice |
| [DOC-HEALTH.md](DOC-HEALTH.md) | area:index, type:guide | Métricas de salud del sistema |
| [DOC-GAPS.md](DOC-GAPS.md) | area:index, type:checklist | Áreas sin documentación |
| [system/HOW-TO-DOC.md](system/HOW-TO-DOC.md) | area:index, type:guide | Cómo crear/actualizar docs |
| [system/LEARNINGS-FORMAT.md](system/LEARNINGS-FORMAT.md) | area:index, type:reference | Formato de aprendizajes |

### Aprendizajes

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [AGENT-LEARNINGS.md](learning/AGENT-LEARNINGS.md) | area:learning, type:findings | Aprendizajes pendientes |
| [AGENT-AUTH-FINDINGS.md](learning/AGENT-AUTH-FINDINGS.md) | area:auth, type:findings | Descubrimientos auth |

### Auth System

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [AUTH-SYSTEM.md](auth/AUTH-SYSTEM.md) | area:auth, type:explanation | Arquitectura completa (por qué) |
| [AUTH-QUICK-REFERENCE.md](auth/AUTH-QUICK-REFERENCE.md) | area:auth, type:reference | Referencia rápida |
| [AUTH-FIX-PLAN.md](auth/AUTH-FIX-PLAN.md) | area:auth, type:history | Histórico de fixes |

### Architecture Decisions (ADR)

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [decisions/001-why-clerk.md](decisions/001-why-clerk.md) | area:auth, type:explanation | Por qué Clerk sobre Auth0 |
| [decisions/002-why-convex.md](decisions/002-why-convex.md) | area:convex, type:explanation | Por qué Convex |
| [decisions/003-token-refresh.md](decisions/003-token-refresh.md) | area:auth, type:explanation | Estrategia de token refresh |
| [decisions/004-security-fixes-2026.md](decisions/004-security-fixes-2026.md) | area:auth, type:explanation | Fixes de seguridad 2026 |
| [decisions/007-frontend-robustness-2026.md](decisions/007-frontend-robustness-2026.md) | area:frontend, type:explanation | Robustez del frontend |
| [decisions/008-convex-types-bug-workaround.md](decisions/008-convex-types-bug-workaround.md) | area:convex, type:explanation | Bug de tipos Convex workaround |

### Getting Started (Onboarding)

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [QUICK-START.md](getting-started/QUICK-START.md) | area:onboarding, type:tutorial | Primeros pasos |
| [DEV-SETUP.md](getting-started/DEV-SETUP.md) | area:onboarding, type:guide | Setup de desarrollo |

### Schema

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [SCHEMA-CHECKLIST.md](schema/SCHEMA-CHECKLIST.md) | area:schema, type:checklist | Checklist de desarrollo schema |

### Testing

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [TESTING-GUIDE.md](TESTING-GUIDE.md) | area:testing, type:guide | Guía general de testing |
| [TESTING-BEST-PRACTICES.md](TESTING-BEST-PRACTICES.md) | area:testing, type:guide | Mejores prácticas |
| [FRONTEND-TESTING-GUIDE.md](FRONTEND-TESTING-GUIDE.md) | area:frontend, type:guide | Testing frontend |
| [CONVEX-TESTING-GUIDE.md](CONVEX-TESTING-GUIDE.md) | area:convex, type:guide | Testing Convex |
| [MCP-TESTING-GUIDE.md](MCP-TESTING-GUIDE.md) | area:mcp, type:guide | Testing MCP |

### Convex

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [CONVEX-CRONS-GUIDE.md](CONVEX-CRONS-GUIDE.md) | area:convex, type:guide | Cron jobs |

### Fases de Desarrollo

| Archivo | Tags | Descripción |
|---------|------|-------------|
| [phases/PHASE-01-SCHEMA-UPDATES.md](phases/PHASE-01-SCHEMA-UPDATES.md) | area:schema, type:guide | Fase 1 |
| [phases/PHASE-02-MODULES-UPDATES.md](phases/PHASE-02-MODULES-UPDATES.md) | area:schema, type:guide | Fase 2 |
| [phases/PHASE-03-MCP-TOOLS.md](phases/PHASE-03-MCP-TOOLS.md) | area:mcp, type:guide | Fase 3 |
| [phases/PHASE-04-CRON-JOBS.md](phases/PHASE-04-CRON-JOBS.md) | area:cron, type:guide | Fase 4 |

---

## Discovery por Área

### Auth → Modificar auth de usuario
1. [AUTH-SYSTEM.md](auth/AUTH-SYSTEM.md) - Arquitectura
2. [AUTH-QUICK-REFERENCE.md](auth/AUTH-QUICK-REFERENCE.md) - Patrones rápidos
3. [AGENT-AUTH-FINDINGS.md](learning/AGENT-AUTH-FINDINGS.md) - Descubrimientos previos
4. [AGENT-LEARNINGS.md](learning/AGENT-LEARNINGS.md) - ¿hay aprendizajes pendientes?

### Schema → Modificar schema de Convex
1. [SCHEMA-CHECKLIST.md](schema/SCHEMA-CHECKLIST.md) - Checklist
2. [phases/PHASE-01-SCHEMA-UPDATES.md](phases/PHASE-01-SCHEMA-UPDATES.md) - Ejemplos de fases

### Testing → Agregar tests
1. [TESTING-GUIDE.md](TESTING-GUIDE.md) - Guía general
2. [TESTING-BEST-PRACTICES.md](TESTING-BEST-PRACTICES.md) - Mejores prácticas
3. [FRONTEND-TESTING-GUIDE.md](FRONTEND-TESTING-GUIDE.md) - Frontend
4. [CONVEX-TESTING-GUIDE.md](CONVEX-TESTING-GUIDE.md) - Convex

### Cron Jobs → Agregar/modificar crons
1. [CONVEX-CRONS-GUIDE.md](CONVEX-CRONS-GUIDE.md) - Guía de crons
2. [phases/PHASE-04-CRON-JOBS.md](phases/PHASE-04-CRON-JOBS.md) - Fase 4

### MCP Server → Trabajar en MCP
1. [MCP-TESTING-GUIDE.md](MCP-TESTING-GUIDE.md) - Testing MCP
2. [phases/PHASE-03-MCP-TOOLS.md](phases/PHASE-03-MCP-TOOLS.md) - Fase 3

---

## Mapeo: Código → Documentación

| Archivo de Código | Documentación Relacionada |
|-------------------|--------------------------|
| `convex/auth.config.ts` | AUTH-SYSTEM.md, decisions/001-why-clerk.md |
| `convex/lib/auth.ts` | AUTH-SYSTEM.md, AUTH-QUICK-REFERENCE.md |
| `convex/schema.ts` | SCHEMA-CHECKLIST.md |
| `convex/crons/*.ts` | CONVEX-CRONS-GUIDE.md |
| `src/providers/ConvexClerkProvider.tsx` | AUTH-SYSTEM.md |
| `src/hooks/useStoreUserEffect.ts` | AUTH-SYSTEM.md, AUTH-QUICK-REFERENCE.md |
| `src/App.tsx` | AUTH-SYSTEM.md |
| `src/components/**/*.tsx` | FRONTEND-TESTING-GUIDE.md, TESTING-GUIDE.md |
| `mcp-server/**/*.ts` | MCP-TESTING-GUIDE.md |
