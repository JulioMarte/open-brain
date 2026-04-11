---
title: TESTING-GUIDE - Guía de Testing
description: Guía general de testing para Open Brain
tags: [testing, guide]
lastUpdated: 2026-04-10
author: human
---

# Open Brain Testing Guide

## Quick Reference

| Layer | Framework | Location | Config |
|-------|-----------|----------|--------|
| Convex Backend | Vitest + convex-test | convex/**/*.test.ts | vitest.config.ts |
| Frontend React | Vitest + Testing Library | src/**/*.test.{ts,tsx} | (separate config) |
| MCP Server | Vitest + Supertest | mcp-server/**/*.test.ts | (separate config) |

## Documentation Index

- [Convex Backend Testing](./CONVEX-TESTING-GUIDE.md) - Backend functions, queries, mutations
- [MCP Server Testing](./MCP-TESTING-GUIDE.md) - Express routes, tools, auth
- [Frontend Testing](./FRONTEND-TESTING-GUIDE.md) - React components, hooks
- [Best Practices](./TESTING-BEST-PRACTICES.md) - General testing patterns

## Required Dependencies

Install before writing tests:

```bash
npm install --save-dev vitest @edge-runtime/vm
npm install --save-dev @testing-library/react @testing-library/user-event jsdom
npm install --save-dev supertest
```

Note: `convex-test` should be auto-installed with Convex, but if tests fail, try:
```bash
npm install --save-dev convex-test
```

## Running Tests

```bash
# All tests
npm test

# Convex only
npx vitest run --project convex

# Frontend only  
npx vitest run --project frontend

# MCP only
npx vitest run --project mcp

# With coverage
npm run test:coverage
```

## Common Patterns

### Mocking OpenAI (for actions)
```typescript
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
  json: () => Promise.resolve({ data: [{ embedding: [0.1, 0.2] }] })
})));
```

### Testing Auth Checks
```typescript
const t = convexTest(schema, modules);
const asSarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com" });
// Now asSarah.mutation() will run with Sarah's identity
```