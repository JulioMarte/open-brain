# MCP Server Testing Guide

## Overview
The MCP Server (Express + @modelcontextprotocol/sdk) handles agent tool calls.

## Tech Stack
- Express.js for HTTP server
- @modelcontextprotocol/sdk for MCP protocol
- ConvexHttpClient for backend communication

## Required Setup

### 1. Install dependencies
```bash
cd mcp-server
npm install --save-dev vitest supertest @types/supertest
```

### 2. Create mcp-server/vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,js}'],
  },
});
```

## Test Patterns

### Pattern 1: Health Endpoint
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from './index';

let server: ReturnType<typeof createServer>;

beforeAll(() => {
  server = createServer();
});

afterAll(() => {
  server.close();
});

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await request(server)
      .get('/health')
      .expect(200);
    
    expect(res.body.status).toBe('ok');
  });
});
```

### Pattern 2: Auth Middleware Tests
```typescript
describe('Auth Middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const res = await request(server)
      .post('/message')
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
      .expect(401);
    
    expect(res.body.error).toContain('Missing Bearer token');
  });
  
  it('rejects invalid API key', async () => {
    const res = await request(server)
      .post('/message')
      .set('Authorization', 'Bearer invalid-key')
      .send({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
      .expect(401);
  });
});
```

### Pattern 3: Tool Handler Tests (with mocked Convex)
```typescript
import { convexClient } from './convex';

vi.mock('./convex', () => ({
  convexClient: {
    query: vi.fn(),
    mutation: vi.fn(),
  },
}));

describe('tools/list', () => {
  it('returns available tools', async () => {
    const mockTools = [
      { name: 'semantic_search', description: 'Search memories' },
      { name: 'get_actionable_tasks', description: 'Get tasks' },
    ];
    
    (convexClient.query as any).mockResolvedValue(mockTools);
    
    const res = await request(server)
      .post('/message')
      .set('Authorization', 'Bearer valid-token')
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1
      });
    
    expect(res.body.result?.tools).toHaveLength(7); // Current + new tools
  });
});
```

### Pattern 4: Zod Schema Validation Tests
```typescript
import { z } from 'zod';

describe('Tool Input Schemas', () => {
  const createEntitySchema = z.object({
    type: z.enum(['project', 'person', 'idea', 'admin']),
    name: z.string().min(1),
    description: z.string().optional(),
  });
  
  it('accepts valid project entity', () => {
    const result = createEntitySchema.safeParse({
      type: 'project',
      name: 'My Project',
    });
    expect(result.success).toBe(true);
  });
  
  it('rejects invalid type', () => {
    const result = createEntitySchema.safeParse({
      type: 'invalid',
      name: 'Test',
    });
    expect(result.success).toBe(false);
  });
});
```

## What to Test

| Endpoint/Function | What to Test |
|-------------------|--------------|
| GET /health | Returns status ok |
| POST /message | Auth required, valid JSON-RPC |
| GET /sse | Auth required, SSE stream |
| tools/list | Returns all 11 tools |
| tools/call (each tool) | Validates input, calls Convex correctly |

## Mocking Convex Client

```typescript
vi.mock('./convex', () => ({
  convexClient: {
    query: vi.fn(),
    mutation: vi.fn().mockResolvedValue({}),
    action: vi.fn(),
  },
  CONVEX_URL: 'https://test.convex.site',
}));

beforeEach(() => {
  vi.clearAllMocks();
});
```

## Running MCP Tests

```bash
cd mcp-server
npx vitest run
```