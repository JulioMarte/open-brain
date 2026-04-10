# PHASE 3: MCP Server Tools Expansion

## Objective
Expand MCP Server toolkit with surgical tools for agents to perform precise CRUD operations, context pruning, and entity management. Wire them to Convex HTTP endpoints with proper authentication.

## Files to Create/Modify
- `mcp-server/src/tools.ts` (expand)
- `mcp-server/src/convex.ts` (update to HTTP calls)
- `mcp-server/src/auth.ts` (simplify)
- `convex/http.ts` (new HTTP endpoints)
- NEW: `mcp-server/src/schemas.ts` (Zod schemas for all tools)

## New MCP Tools (7 new, keeping 4 existing = 11 total)

### Entity Management Tools

#### 1. `create_entity`
```typescript
// Input schema (Zod)
z.object({
  type: z.enum(["project", "person", "idea", "admin"]),
  name: z.string(),
  description: z.string().optional(),
  metadata: z.any().optional(),
})

// Scope: any authenticated agent
// Action: POST /api/mcp/entities/create
```

#### 2. `update_entity`
```typescript
// Input schema (Zod)
z.object({
  entityId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  metadata: z.any().optional(),
})

// Scope: entity access required (owner or linked)
// Action: POST /api/mcp/entities/update
```

### Task Management Tools

#### 3. `update_task`
```typescript
// Input schema (Zod)
z.object({
  taskId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  priority: z.number().min(1).max(4).optional(),
  dueDate: z.number().optional(), // Unix timestamp
  blockedBy: z.array(z.string()).optional(),
})

// Scope: entity access required
// Action: POST /api/mcp/tasks/update
```

#### 4. `get_subtasks`
```typescript
// Input schema (Zod)
z.object({
  taskId: z.string(),
})

// Returns: Array of subtasks
// Scope: entity access required
// Action: GET /api/mcp/tasks/subtasks/:taskId
```

### Memory/Pruning Tools

#### 5. `get_memory_source`
```typescript
// Input schema (Zod)
z.object({
  memoryId: z.string(),
})

// Returns: { memory, originalInboxId, inboxSource, inboxMetadata }
// Scope: entity access required
// Action: GET /api/mcp/memories/source/:memoryId
```

#### 6. `archive_memory`
```typescript
// Input schema (Zod)
z.object({
  memoryId: z.string(),
  reason: z.string().optional(),
})

// Action: Soft-delete - marks as archived in metadata or creates inbox entry
// Scope: entity access required
// Action: POST /api/mcp/memories/archive
```

#### 7. `get_low_confidence_memories`
```typescript
// Input schema (Zod)
z.object({
  threshold: z.number().min(0).max(1).default(0.5),
  entityId: z.string().optional(),
  limit: z.number().default(50),
})

// Returns: Memories with confidenceScore < threshold
// Scope: filtered by accessible entities
// Action: POST /api/mcp/memories/low-confidence
```

## Convex HTTP Endpoints (convex/http.ts)

```typescript
// All endpoints: POST /api/mcp/*
// All use: authenticateAgent(ctx, request) to validate Bearer token
// All return: { data, error } JSON structure

POST /api/mcp/entities/create     - Create entity
POST /api/mcp/entities/update     - Update entity
POST /api/mcp/tasks/update        - Update task fields
GET  /api/mcp/tasks/subtasks/:id  - Get subtasks
GET  /api/mcp/memories/source/:id - Get memory + inbox trace
POST /api/mcp/memories/archive    - Archive memory
POST /api/mcp/memories/low-confidence - Search low confidence
```

## Authentication Flow (mcp-server/src/auth.ts)

Simplify to just pass Bearer token to Convex:

```typescript
async function authenticateAgent(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing Bearer token");
  }
  const token = authHeader.slice(7);
  // Hash token, validate against agent_tokens table
  // Return { userId, scope, allowedEntityIds, ownerId }
  // ...
}
```

## Testing Strategy

Create `mcp-server/src/tools.test.ts`:

### Test Cases

1. **Zod validation**: Valid payload → passes; missing required → throws ZodError
2. **Scope validation**: Agent with entity_scoped tries to access wrong entity → 403 error
3. **Token validation**: Invalid/expired token → 401 error
4. **create_entity**: Valid payload → returns entity ID
5. **update_task state machine**: Mark done → completedAt set; mark todo → completedAt cleared
6. **get_memory_source**: Memory from email inbox → returns { source: "email", from: "..." }
7. **archive_memory**: Archives and creates inbox entry with reason
8. **get_low_confidence_memories**: Returns only memories below threshold

Use Vitest for testing. Mock ConvexHttpClient responses.

---

## Complete Test File: `mcp-server/src/tools.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  createEntitySchema,
  updateEntitySchema,
  updateTaskSchema,
  getSubtasksSchema,
  getMemorySourceSchema,
  archiveMemorySchema,
  getLowConfidenceMemoriesSchema,
} from './schemas';

const mockConvexHttpClient = {
  post: vi.fn(),
  get: vi.fn(),
};

vi.mock('./convex', () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => mockConvexHttpClient),
}));

vi.mock('./auth', () => ({
  authenticateAgent: vi.fn().mockResolvedValue({
    userId: 'user1',
    scope: 'entity_scoped',
    allowedEntityIds: ['entity1', 'entity2'],
    ownerId: 'user1',
  }),
}));

describe('MCP Tools - Zod Schemas', () => {
  describe('createEntitySchema', () => {
    it('passes with valid payload', () => {
      const payload = {
        type: 'project',
        name: 'Test Project',
        description: 'A test project',
        metadata: { key: 'value' },
      };
      expect(() => createEntitySchema.parse(payload)).not.toThrow();
    });

    it('passes with minimal required fields', () => {
      const payload = {
        type: 'idea',
        name: 'Minimal Idea',
      };
      expect(() => createEntitySchema.parse(payload)).not.toThrow();
    });

    it('throws ZodError for missing required fields', () => {
      const payload = { description: 'Only description' };
      expect(() => createEntitySchema.parse(payload)).toThrow(z.ZodError);
    });

    it('throws ZodError for invalid type', () => {
      const payload = {
        type: 'invalid_type',
        name: 'Test',
      };
      expect(() => createEntitySchema.parse(payload)).toThrow(z.ZodError);
    });
  });

  describe('updateEntitySchema', () => {
    it('passes with valid payload', () => {
      const payload = {
        entityId: 'entity1',
        name: 'Updated Name',
        status: 'archived',
      };
      expect(() => updateEntitySchema.parse(payload)).not.toThrow();
    });

    it('throws ZodError for missing entityId', () => {
      const payload = { name: 'Updated Name' };
      expect(() => updateEntitySchema.parse(payload)).toThrow(z.ZodError);
    });

    it('throws ZodError for invalid status', () => {
      const payload = {
        entityId: 'entity1',
        status: 'invalid_status',
      };
      expect(() => updateEntitySchema.parse(payload)).toThrow(z.ZodError);
    });
  });

  describe('updateTaskSchema', () => {
    it('passes with valid payload', () => {
      const payload = {
        taskId: 'task1',
        status: 'done',
        priority: 3,
        dueDate: 1710000000,
      };
      expect(() => updateTaskSchema.parse(payload)).not.toThrow();
    });

    it('throws ZodError for priority out of range', () => {
      const payload = {
        taskId: 'task1',
        priority: 5,
      };
      expect(() => updateTaskSchema.parse(payload)).toThrow(z.ZodError);
    });

    it('throws ZodError for invalid status', () => {
      const payload = {
        taskId: 'task1',
        status: 'invalid',
      };
      expect(() => updateTaskSchema.parse(payload)).toThrow(z.ZodError);
    });
  });

  describe('getSubtasksSchema', () => {
    it('passes with valid taskId', () => {
      const payload = { taskId: 'task1' };
      expect(() => getSubtasksSchema.parse(payload)).not.toThrow();
    });

    it('throws ZodError for missing taskId', () => {
      expect(() => getSubtasksSchema.parse({})).toThrow(z.ZodError);
    });
  });

  describe('getMemorySourceSchema', () => {
    it('passes with valid memoryId', () => {
      const payload = { memoryId: 'memory1' };
      expect(() => getMemorySourceSchema.parse(payload)).not.toThrow();
    });
  });

  describe('archiveMemorySchema', () => {
    it('passes with minimal fields', () => {
      const payload = { memoryId: 'memory1' };
      expect(() => archiveMemorySchema.parse(payload)).not.toThrow();
    });

    it('passes with reason', () => {
      const payload = { memoryId: 'memory1', reason: 'Outdated information' };
      expect(() => archiveMemorySchema.parse(payload)).not.toThrow();
    });
  });

  describe('getLowConfidenceMemoriesSchema', () => {
    it('passes with default threshold', () => {
      const payload = {};
      const result = getLowConfidenceMemoriesSchema.parse(payload);
      expect(result.threshold).toBe(0.5);
      expect(result.limit).toBe(50);
    });

    it('passes with custom values', () => {
      const payload = {
        threshold: 0.3,
        entityId: 'entity1',
        limit: 100,
      };
      const result = getLowConfidenceMemoriesSchema.parse(payload);
      expect(result.threshold).toBe(0.3);
      expect(result.limit).toBe(100);
    });

    it('throws ZodError for threshold > 1', () => {
      const payload = { threshold: 1.5 };
      expect(() => getLowConfidenceMemoriesSchema.parse(payload)).toThrow(z.ZodError);
    });
  });
});

describe('MCP Tools - Tool Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create_entity', () => {
    it('returns entity ID on success', async () => {
      const { createEntity } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        data: { entityId: 'new-entity-123' },
      });

      const result = await createEntity({
        type: 'project',
        name: 'New Project',
      });

      expect(result).toEqual({ entityId: 'new-entity-123' });
      expect(mockConvexHttpClient.post).toHaveBeenCalledWith(
        '/api/mcp/entities/create',
        expect.any(Object)
      );
    });

    it('throws on Convex error', async () => {
      const { createEntity } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        error: 'Invalid entity type',
      });

      await expect(createEntity({
        type: 'project',
        name: 'Test',
      })).rejects.toThrow('Invalid entity type');
    });
  });

  describe('update_entity', () => {
    it('throws 403 when accessing wrong entity', async () => {
      const { updateEntity } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        error: 'Access denied: entity not in allowed scope',
      });

      await expect(updateEntity({
        entityId: 'unauthorized-entity',
        name: 'Hacked Name',
      })).rejects.toThrow('Access denied');
    });

    it('updates entity successfully', async () => {
      const { updateEntity } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        data: { success: true },
      });

      const result = await updateEntity({
        entityId: 'entity1',
        name: 'Updated Name',
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe('update_task state machine', () => {
    it('sets completedAt when marking done', async () => {
      const { updateTask } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        data: {
          taskId: 'task1',
          status: 'done',
          completedAt: expect.any(Number),
        },
      });

      const result = await updateTask({
        taskId: 'task1',
        status: 'done',
      });

      expect(result.status).toBe('done');
      expect(result.completedAt).toBeDefined();
    });

    it('clears completedAt when marking todo', async () => {
      const { updateTask } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        data: {
          taskId: 'task1',
          status: 'todo',
          completedAt: null,
        },
      });

      const result = await updateTask({
        taskId: 'task1',
        status: 'todo',
      });

      expect(result.status).toBe('todo');
      expect(result.completedAt).toBeNull();
    });
  });

  describe('get_subtasks', () => {
    it('returns array of subtasks', async () => {
      const { getSubtasks } = await import('./tools');
      
      const mockSubtasks = [
        { taskId: 'sub1', title: 'Subtask 1', status: 'todo' },
        { taskId: 'sub2', title: 'Subtask 2', status: 'done' },
      ];
      
      mockConvexHttpClient.get.mockResolvedValueOnce({
        data: mockSubtasks,
      });

      const result = await getSubtasks({ taskId: 'task1' });

      expect(result).toEqual(mockSubtasks);
      expect(mockConvexHttpClient.get).toHaveBeenCalledWith(
        '/api/mcp/tasks/subtasks/task1'
      );
    });
  });

  describe('get_memory_source', () => {
    it('returns memory with inbox trace for email source', async () => {
      const { getMemorySource } = await import('./tools');
      
      mockConvexHttpClient.get.mockResolvedValueOnce({
        data: {
          memory: { id: 'memory1', content: 'Test memory' },
          originalInboxId: 'inbox1',
          inboxSource: 'email',
          inboxMetadata: { from: 'sender@example.com', subject: 'Test' },
        },
      });

      const result = await getMemorySource({ memoryId: 'memory1' });

      expect(result.inboxSource).toBe('email');
      expect(result.inboxMetadata.from).toBe('sender@example.com');
    });

    it('throws when memory not found', async () => {
      const { getMemorySource } = await import('./tools');
      
      mockConvexHttpClient.get.mockResolvedValueOnce({
        error: 'Memory not found',
      });

      await expect(getMemorySource({ memoryId: 'nonexistent' }))
        .rejects.toThrow('Memory not found');
    });
  });

  describe('archive_memory', () => {
    it('archives memory and creates inbox entry with reason', async () => {
      const { archiveMemory } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        data: {
          archived: true,
          inboxEntryId: 'inbox-entry-123',
        },
      });

      const result = await archiveMemory({
        memoryId: 'memory1',
        reason: 'Outdated information',
      });

      expect(result.archived).toBe(true);
      expect(mockConvexHttpClient.post).toHaveBeenCalledWith(
        '/api/mcp/memories/archive',
        expect.objectContaining({
          body: expect.stringContaining('Outdated information'),
        })
      );
    });
  });

  describe('get_low_confidence_memories', () => {
    it('returns only memories below threshold', async () => {
      const { getLowConfidenceMemories } = await import('./tools');
      
      const mockMemories = [
        { id: 'mem1', content: 'Low confidence memory', confidenceScore: 0.2 },
        { id: 'mem2', content: 'Another low', confidenceScore: 0.4 },
      ];
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        data: mockMemories,
      });

      const result = await getLowConfidenceMemories({
        threshold: 0.5,
        entityId: 'entity1',
        limit: 50,
      });

      expect(result.length).toBe(2);
      expect(result.every(m => m.confidenceScore < 0.5)).toBe(true);
    });

    it('filters by accessible entities', async () => {
      const { getLowConfidenceMemories } = await import('./tools');
      
      mockConvexHttpClient.post.mockResolvedValueOnce({
        data: [],
      });

      await getLowConfidenceMemories({
        threshold: 0.5,
        entityId: 'entity1',
      });

      expect(mockConvexHttpClient.post).toHaveBeenCalledWith(
        '/api/mcp/memories/low-confidence',
        expect.objectContaining({
          body: expect.stringContaining('entity1'),
        })
      );
    });
  });
});

describe('MCP Tools - Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 401 for missing Bearer token', async () => {
    vi.resetModules();
    
    vi.mock('./auth', () => ({
      authenticateAgent: vi.fn().mockRejectedValue(new Error('Missing Bearer token')),
    }));

    const { createEntity } = await import('./tools');
    
    mockConvexHttpClient.post.mockResolvedValueOnce({
      error: 'Unauthorized',
    });

    await expect(createEntity({
      type: 'project',
      name: 'Test',
    })).rejects.toThrow('Unauthorized');
  });

  it('throws 401 for invalid/expired token', async () => {
    vi.resetModules();
    
    vi.mock('./auth', () => ({
      authenticateAgent: vi.fn().mockRejectedValue(new Error('Token expired')),
    }));

    const { createEntity } = await import('./tools');

    await expect(createEntity({
      type: 'project',
      name: 'Test',
    })).rejects.toThrow('Token expired');
  });
});

describe('MCP Tools - Scope Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 403 when entity_scoped agent accesses wrong entity', async () => {
    const { updateEntity } = await import('./tools');
    
    mockConvexHttpClient.post.mockResolvedValueOnce({
      error: 'Access denied: entity not in allowed scope',
    });

    await expect(updateEntity({
      entityId: 'unauthorized-entity',
      name: 'Hacked Name',
    })).rejects.toThrow('Access denied');
  });
});
```
