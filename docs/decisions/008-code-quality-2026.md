---
title: "ADR-008: Code Quality and DX Improvements - April 2026"
description: Decisions made during Phase 5 code quality improvements
tags: [code-quality, dx, validators, decisions]
area: convex
type: explanation
status: accepted
author: agent
date: 2026-04-10
related:
  - "004-security-fixes-2026.md"
  - "005-logic-fixes-2026.md"
  - "006-perf-improvements-2026.md"
  - "007-frontend-robustness-2026.md"
---

# ADR-008: Code Quality and DX Improvements - April 2026

## Context

Code quality audit identified duplicated validators, mixed language error messages, missing validation, and missing infrastructure files that should be addressed for maintainability.

## Code Quality Improvements

### 5.1: Extract sourceMetadata Validator

**Files**: `convex/schema.ts:51-61`, `convex/inbox.ts:36-46,71-81`

**Bug**: Same `sourceMetadataValidator` union type was repeated in 3 locations.

**Fix**: Extracted to `convex/lib/validators.ts`:

```typescript
// convex/lib/validators.ts
import { v } from "convex/values";

export const sourceMetadataValidator = v.optional(v.union(
  v.object({ type: v.literal("email"), from: v.optional(v.string()), subject: v.optional(v.string()), messageId: v.optional(v.string()) }),
  v.object({ type: v.literal("telegram"), chatId: v.optional(v.string()), messageId: v.optional(v.string()) }),
  v.object({ type: v.literal("whatsapp"), from: v.optional(v.string()), messageId: v.optional(v.string()) }),
  v.object({ type: v.literal("slack"), teamId: v.optional(v.string()), channelId: v.optional(v.string()), messageTs: v.optional(v.string()) }),
  v.object({ type: v.literal("webhook"), headers: v.optional(v.string()) }),
  v.object({ type: v.literal("api") }),
  v.object({ type: v.literal("manual") }),
  v.object({ type: v.literal("system_cron"), cronJobId: v.optional(v.string()) }),
  v.object({ type: v.literal("custom"), data: v.optional(v.string()) })
));
```

**Impact**: Single source of truth, easier to maintain.

---

### 5.2: Standardize Error Messages to English

**Files**: All backend files (`convex/lib/auth.ts`, `convex/memories.ts`, `convex/entities.ts`, `convex/tasks.ts`, `convex/agents.ts`, etc.)

**Bug**: Mix of Spanish ("No autenticado") and English ("Not authenticated") error messages.

**Fix**: All error messages converted to English. Frontend handles i18n.

```typescript
// BEFORE
throw new Error("No autenticado");
throw new Error("No tienes acceso a esta entidad");

// AFTER
throw new Error("Not authenticated");
throw new Error("Access denied to this entity");
```

**Impact**: Consistent developer experience across codebase.

---

### 5.3: Validate Empty Strings

**Files**: `convex/entities.ts:create`, `convex/tasks.ts:create`, `convex/agents.ts:createAgent`

**Bug**: `name`, `title` fields accepted empty strings.

**Fix**: Added explicit validation:

```typescript
if (!args.name || !args.name.trim()) {
  throw new Error("Name is required");
}
```

**Impact**: Prevents creation of nameless entities/tasks.

---

### 5.4: Add updatedAt to Tables Missing It

**File**: `convex/schema.ts`

**Added `updatedAt: v.optional(v.number())` to**:
- `inbox_log` table
- `proposals` table
- `agent_tokens` table

**Backfill**: Existing documents updated with `Date.now()` for `updatedAt` field.

---

### 5.5: Fix Documentation

**File**: `CLAUDE.md:4`

**Bug**: Referenced non-existent `convex/_generated/ai/guidelines.md`

**Fix**: Removed the reference since the file does not exist.

---

### 5.6: Create .env.example

**File**: `.env.example` (root directory)

**Content**:
```
# Open Brain Environment Variables
# Copy to .env and fill in your values

# JWT Secret for agent token signing
JWT_SECRET=your-jwt-secret-here

# Convex Deployment URL
CONVEX_DEPLOYMENT=your-convex-deployment-url

# Frontend Convex URL
VITE_CONVEX_URL=https://your-app.convex.cloud

# Clerk Publishable Key
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
```

---

### 5.7: Add CI/CD Workflow

**File**: `.github/workflows/ci.yml`

**Content**:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Lint
      run: npm run lint
    
    - name: TypeScript check (Convex)
      run: npx convex dev --typecheck
    
    - name: Run tests
      run: npx vitest run
```

---

### 5.8: ID Casting Utility

**File**: `src/lib/convex-utils.ts`

**Created** to centralize repeated `as unknown as string` pattern:

```typescript
import type { Id } from "../../convex/_generated/dataModel";

export function convexIdToString(id: Id<any>): string {
  return id as unknown as string;
}
```

**Usage**: Replaces 10+ occurrences across TriageView, FocusView, AgentsView.

---

## Testing

Tests added for:
- `convex/lib/validators.ts` - sourceMetadataValidator works correctly
- `src/lib/convex-utils.ts` - convexIdToString works correctly

---

## Decision

All code quality improvements implemented. Schema changes are additive.

## Consequences

- **Positive**: Consistent code, better maintainability, proper CI/CD
- **Negative**: None significant