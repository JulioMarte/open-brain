import { z } from "zod";
import {
  createEntitySchema,
  updateEntitySchema,
  updateTaskSchema,
  getSubtasksSchema,
  getMemorySourceSchema,
  archiveMemorySchema,
  getLowConfidenceMemoriesSchema,
} from "./schemas.js";
import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("CONVEX_URL environment variable is not set");
}

export interface AgentConfig {
  agentId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class ConvexAgentClient {
  private client: ConvexHttpClient;
  private agentConfig: AgentConfig | null = null;

  constructor(convexUrl: string = CONVEX_URL!) {
    this.client = new ConvexHttpClient(convexUrl);
  }

  configure(config: AgentConfig) {
    this.agentConfig = config;
  }

  isConfigured(): boolean {
    return this.agentConfig !== null && Date.now() < this.agentConfig.expiresAt * 1000;
  }

  private getToken(): string {
    if (!this.agentConfig) {
      throw new Error("Agent not configured. Call configure() first.");
    }
    if (Date.now() >= this.agentConfig.expiresAt * 1000) {
      throw new Error("Access token expired. Refresh required.");
    }
    return this.agentConfig.accessToken;
  }

  private async callConvex<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
    const token = this.getToken();
    const response = await fetch(`${CONVEX_URL}/api/mcp/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(args),
    });
    
    const result = await response.json() as { data?: T; error?: string };
    if (result.error) {
      throw new Error(result.error);
    }
    return result.data as T;
  }

  async semanticSearch(query: string, limit: number = 10): Promise<unknown[]> {
    return this.callConvex<unknown[]>("searchMemories", { queryText: query, limit });
  }

  async getActionableTasks(): Promise<unknown[]> {
    return this.callConvex<unknown[]>("tasks/getActionable", {});
  }

  async proposeAction(type: string, payload: string, reason: string): Promise<string> {
    return this.callConvex<string>("proposals/create", { type, payload, reason });
  }

  async markTaskDone(taskId: string): Promise<void> {
    return this.callConvex<void>("tasks/markDone", { id: taskId });
  }

  async createEntity(args: z.infer<typeof createEntitySchema>): Promise<unknown> {
    return this.callConvex<unknown>("entities/create", args);
  }

  async updateEntity(args: z.infer<typeof updateEntitySchema>): Promise<unknown> {
    return this.callConvex<unknown>("entities/update", args);
  }

  async updateTask(args: z.infer<typeof updateTaskSchema>): Promise<unknown> {
    return this.callConvex<unknown>("tasks/update", args);
  }

  async getSubtasks(args: z.infer<typeof getSubtasksSchema>): Promise<unknown[]> {
    return this.callConvex<unknown[]>("tasks/getSubtasks", args) || [];
  }

  async getMemorySource(args: z.infer<typeof getMemorySourceSchema>): Promise<unknown> {
    return this.callConvex<unknown>("memories/getSource", args);
  }

  async archiveMemory(args: z.infer<typeof archiveMemorySchema>): Promise<void> {
    return this.callConvex<void>("memories/archive", args);
  }

  async getLowConfidenceMemories(args: z.infer<typeof getLowConfidenceMemoriesSchema>): Promise<unknown[]> {
    return this.callConvex<unknown[]>("memories/lowConfidence", args) || [];
  }

  async listEntities(): Promise<unknown[]> {
    return this.callConvex<unknown[]>("entities/list", {});
  }

  async listTasksByEntity(entityId: string): Promise<unknown[]> {
    return this.callConvex<unknown[]>("tasks/listByEntity", { entityId });
  }
}

export const agentClient = new ConvexAgentClient();

export { CONVEX_URL };

interface ConvexResult<T> {
  data?: T;
  error?: string;
}

async function callConvex<T>(functionName: string, args: Record<string, unknown>, token: string): Promise<T> {
  const response = await fetch(`${CONVEX_URL}/api/mcp/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });
  
  const result = await response.json() as ConvexResult<T>;
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data as T;
}

export async function semanticSearch(query: string, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("searchMemories", { queryText: query, limit: 10 }, token);
  return result;
}

export async function getActionableTasks(token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("tasks/getActionable", {}, token);
  return result;
}

export async function proposeAction(type: string, payload: string, reason: string, token: string): Promise<string> {
  const result = await callConvex<string>("proposals/create", { type, payload, reason }, token);
  return result;
}

export async function markTaskDone(taskId: string, token: string): Promise<void> {
  await callConvex<void>("tasks/markDone", { id: taskId }, token);
}

export async function createEntity(args: z.infer<typeof createEntitySchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("entities/create", args, token);
  return result;
}

export async function updateEntity(args: z.infer<typeof updateEntitySchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("entities/update", args, token);
  return result;
}

export async function updateTask(args: z.infer<typeof updateTaskSchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("tasks/update", args, token);
  return result;
}

export async function getSubtasks(args: z.infer<typeof getSubtasksSchema>, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("tasks/getSubtasks", args, token);
  return result || [];
}

export async function getMemorySource(args: z.infer<typeof getMemorySourceSchema>, token: string): Promise<unknown> {
  const result = await callConvex<unknown>("memories/getSource", args, token);
  return result;
}

export async function archiveMemory(args: z.infer<typeof archiveMemorySchema>, token: string): Promise<void> {
  await callConvex<void>("memories/archive", args, token);
}

export async function getLowConfidenceMemories(args: z.infer<typeof getLowConfidenceMemoriesSchema>, token: string): Promise<unknown[]> {
  const result = await callConvex<unknown[]>("memories/lowConfidence", args, token);
  return result || [];
}