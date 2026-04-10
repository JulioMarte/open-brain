import { z } from 'zod';

export const createEntitySchema = z.object({
  type: z.enum(['project', 'person', 'idea', 'admin']),
  name: z.string(),
  description: z.string().optional(),
  metadata: z.any().optional(),
});

export const updateEntitySchema = z.object({
  entityId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
  metadata: z.any().optional(),
});

export const updateTaskSchema = z.object({
  taskId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
  priority: z.number().min(1).max(4).optional(),
  dueDate: z.number().optional(),
  blockedBy: z.array(z.string()).optional(),
});

export const getSubtasksSchema = z.object({
  taskId: z.string(),
});

export const getMemorySourceSchema = z.object({
  memoryId: z.string(),
});

export const archiveMemorySchema = z.object({
  memoryId: z.string(),
  reason: z.string().optional(),
});

export const getLowConfidenceMemoriesSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.5),
  entityId: z.string().optional(),
  limit: z.number().default(50),
});
