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

export class ConvexClient {
  private client: ConvexHttpClient;
  private token: string = "";

  constructor(url: string = CONVEX_URL!) {
    this.client = new ConvexHttpClient(url);
  }

  setToken(token: string) {
    this.token = token;
  }

  private getFullArgs(args: Record<string, unknown>): Record<string, unknown> {
    if (!this.token) {
      throw new Error("No agent token set. Call setToken() first.");
    }
    return { ...args, agentToken: this.token };
  }

  async query<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return await (this.client as any).query(name, this.getFullArgs(args));
  }

  async mutation<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return await (this.client as any).mutation(name, this.getFullArgs(args));
  }

  async action<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return await (this.client as any).action(name, this.getFullArgs(args));
  }
}

export const convexClient = new ConvexClient(CONVEX_URL!);

export { CONVEX_URL };

export async function semanticSearch(query: string, token: string): Promise<unknown[]> {
  convexClient.setToken(token);
  return await convexClient.action<unknown[]>("memories/search", { queryText: query, limit: 10 });
}

export async function getActionableTasks(token: string): Promise<unknown[]> {
  convexClient.setToken(token);
  return await convexClient.query<unknown[]>("tasks/getActionable", {});
}

export async function proposeAction(type: string, payload: string, reason: string, token: string): Promise<string> {
  convexClient.setToken(token);
  return await convexClient.mutation<string>("proposals/create", { type, payload, reason });
}

export async function markTaskDone(taskId: string, token: string): Promise<void> {
  convexClient.setToken(token);
  await convexClient.mutation("tasks/markDone", { id: taskId });
}

export async function createEntity(args: z.infer<typeof createEntitySchema>, token: string): Promise<unknown> {
  convexClient.setToken(token);
  return await convexClient.mutation("entities/create", args);
}

export async function updateEntity(args: z.infer<typeof updateEntitySchema>, token: string): Promise<unknown> {
  convexClient.setToken(token);
  return await convexClient.mutation("entities/update", args);
}

export async function updateTask(args: z.infer<typeof updateTaskSchema>, token: string): Promise<unknown> {
  convexClient.setToken(token);
  return await convexClient.mutation("tasks/update", args);
}

export async function getSubtasks(args: z.infer<typeof getSubtasksSchema>, token: string): Promise<unknown[]> {
  convexClient.setToken(token);
  return await convexClient.query<unknown[]>("tasks/getSubtasks", args) || [];
}

export async function getMemorySource(args: z.infer<typeof getMemorySourceSchema>, token: string): Promise<unknown> {
  convexClient.setToken(token);
  return await convexClient.query("memories/getSource", args);
}

export async function archiveMemory(args: z.infer<typeof archiveMemorySchema>, token: string): Promise<void> {
  convexClient.setToken(token);
  await convexClient.mutation("memories/archive", args);
}

export async function getLowConfidenceMemories(args: z.infer<typeof getLowConfidenceMemoriesSchema>, token: string): Promise<unknown[]> {
  convexClient.setToken(token);
  return await convexClient.query<unknown[]>("memories/lowConfidence", args) || [];
}

export async function listEntities(token: string): Promise<unknown[]> {
  convexClient.setToken(token);
  return await convexClient.query<unknown[]>("entities/list", {});
}

export async function listTasksByEntity(entityId: string, token: string): Promise<unknown[]> {
  convexClient.setToken(token);
  return await convexClient.query<unknown[]>("tasks/list", { entityId });
}

export async function refreshAgentToken(agentId: string, refreshToken: string, token: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  convexClient.setToken(token);
  return await convexClient.mutation("agents/refreshAgentToken", { agentId, refreshToken });
}
