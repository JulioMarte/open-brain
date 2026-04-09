import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error("CONVEX_URL environment variable is not set");
}

const baseUrl = CONVEX_URL;

export function createConvexClient(userToken?: string): ConvexHttpClient {
  if (userToken) {
    return new ConvexHttpClient(baseUrl, { auth: userToken });
  }
  return new ConvexHttpClient(baseUrl);
}

export async function semanticSearch(query: string, userToken?: string): Promise<any[]> {
  const client = createConvexClient(userToken);
  return await (client as any).query("actions:searchMemories", {
    queryText: query,
    limit: 10,
  });
}

export async function getActionableTasks(userToken?: string): Promise<any[]> {
  const client = createConvexClient(userToken);
  return await (client as any).query("tasks:getActionable", {});
}

export async function proposeAction(type: string, payload: string, reason: string, userToken?: string): Promise<string> {
  const client = createConvexClient(userToken);
  return await (client as any).mutation("proposals:create", {
    type,
    payload,
    reason,
  });
}

export async function markTaskDone(taskId: string, userToken?: string): Promise<void> {
  const client = createConvexClient(userToken);
  await (client as any).mutation("tasks:markDone", { id: taskId });
}