import { ToolDefinition } from "./types.js";
import { semanticSearch, getActionableTasks, proposeAction, markTaskDone } from "./convex.js";

export const tools: ToolDefinition[] = [
  {
    name: "semantic_search",
    description: "Search memories using semantic vector search. Takes a natural language query and returns relevant memories.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query in natural language",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_actionable_tasks",
    description: "Get tasks that are ready to be worked on. A task is actionable if it has status 'todo' and all blocking tasks are done.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "propose_action",
    description: "Propose an action for human review. The action will be written to the proposals table for approval.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["create_task", "update_entity", "add_memory"],
          description: "The type of action being proposed",
        },
        payload: {
          type: "string",
          description: "JSON string containing the action payload",
        },
        reason: {
          type: "string",
          description: "The reason for this proposal",
        },
      },
      required: ["type", "payload", "reason"],
    },
  },
  {
    name: "mark_task_done",
    description: "Mark a task as done by updating its status.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to mark as done",
        },
      },
      required: ["taskId"],
    },
  },
];

export async function handleToolCall(toolName: string, args: any, userToken?: string): Promise<any> {
  switch (toolName) {
    case "semantic_search":
      return await semanticSearch(args.query, userToken);
    case "get_actionable_tasks":
      return await getActionableTasks(userToken);
    case "propose_action":
      return await proposeAction(args.type, args.payload, args.reason, userToken);
    case "mark_task_done":
      return await markTaskDone(args.taskId, userToken);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}