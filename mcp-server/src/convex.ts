import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("CONVEX_URL environment variable is not set");
}

export const convexClient = new ConvexHttpClient(CONVEX_URL);

export async function semanticSearch(query: string): Promise<any[]> {
  return await convexClient.query("actions:searchMemories", {
    queryText: query,
    limit: 10,
  });
}

export async function getActionableTasks(): Promise<any[]> {
  return await convexClient.query("tasks:getActionable", {});
}

export async function proposeAction(type: string, payload: string, reason: string): Promise<string> {
  return await convexClient.mutation("proposals:create", {
    type,
    payload,
    reason,
  });
}

export async function markTaskDone(taskId: string): Promise<void> {
  await convexClient.mutation("tasks:markDone", { id: taskId });
}
