import { ToolDefinition } from "./types.js";
import { extractToken } from "./auth.js";
import {
  semanticSearch,
  getActionableTasks,
  proposeAction,
  markTaskDone,
  createEntity,
  updateEntity,
  updateTask,
  getSubtasks,
  getMemorySource,
  archiveMemory,
  getLowConfidenceMemories,
} from "./convex.js";
import {
  createEntitySchema,
  updateEntitySchema,
  updateTaskSchema,
  getSubtasksSchema,
  getMemorySourceSchema,
  archiveMemorySchema,
  getLowConfidenceMemoriesSchema,
} from "./schemas.js";

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
  {
    name: "create_entity",
    description: "Create a new entity (project, person, idea, or admin).",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["project", "person", "idea", "admin"],
          description: "The type of entity to create",
        },
        name: {
          type: "string",
          description: "The name of the entity",
        },
        description: {
          type: "string",
          description: "Optional description of the entity",
        },
        metadata: {
          type: "any",
          description: "Optional metadata object",
        },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "update_entity",
    description: "Update an existing entity's properties.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "The ID of the entity to update",
        },
        name: {
          type: "string",
          description: "New name for the entity",
        },
        description: {
          type: "string",
          description: "New description for the entity",
        },
        status: {
          type: "string",
          enum: ["active", "archived"],
          description: "New status for the entity",
        },
        metadata: {
          type: "any",
          description: "New metadata for the entity",
        },
      },
      required: ["entityId"],
    },
  },
  {
    name: "update_task",
    description: "Update a task's properties including title, description, status, priority, due date, and dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to update",
        },
        title: {
          type: "string",
          description: "New title for the task",
        },
        description: {
          type: "string",
          description: "New description for the task",
        },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "done", "cancelled"],
          description: "New status for the task",
        },
        priority: {
          type: "number",
          minimum: 1,
          maximum: 4,
          description: "Priority level (1-4, where 1 is highest)",
        },
        dueDate: {
          type: "number",
          description: "New due date as Unix timestamp in milliseconds",
        },
        blockedBy: {
          type: "array",
          items: { type: "string" },
          description: "Array of task IDs this task is blocked by",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "get_subtasks",
    description: "Get all subtasks of a given task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the parent task",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "get_memory_source",
    description: "Get the source information for a memory, including its origin and creation context.",
    inputSchema: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "The ID of the memory to get source info for",
        },
      },
      required: ["memoryId"],
    },
  },
  {
    name: "archive_memory",
    description: "Archive a memory with an optional reason.",
    inputSchema: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "The ID of the memory to archive",
        },
        reason: {
          type: "string",
          description: "Optional reason for archiving",
        },
      },
      required: ["memoryId"],
    },
  },
  {
    name: "get_low_confidence_memories",
    description: "Get memories with confidence scores below a threshold, optionally filtered by entity.",
    inputSchema: {
      type: "object",
      properties: {
        threshold: {
          type: "number",
          minimum: 0,
          maximum: 1,
          default: 0.5,
          description: "Confidence threshold (0-1). Memories below this will be returned.",
        },
        entityId: {
          type: "string",
          description: "Optional entity ID to filter memories by",
        },
        limit: {
          type: "number",
          default: 50,
          description: "Maximum number of memories to return",
        },
      },
    },
  },
];

export async function handleToolCall(toolName: string, args: any, token: string): Promise<any> {
  switch (toolName) {
    case "semantic_search":
      return await semanticSearch(args.query, token);
    case "get_actionable_tasks":
      return await getActionableTasks(token);
    case "propose_action":
      return await proposeAction(args.type, args.payload, args.reason, token);
    case "mark_task_done":
      return await markTaskDone(args.taskId, token);
    case "create_entity":
      createEntitySchema.parse(args);
      return await createEntity(args, token);
    case "update_entity":
      updateEntitySchema.parse(args);
      return await updateEntity(args, token);
    case "update_task":
      updateTaskSchema.parse(args);
      return await updateTask(args, token);
    case "get_subtasks":
      getSubtasksSchema.parse(args);
      return await getSubtasks(args, token);
    case "get_memory_source":
      getMemorySourceSchema.parse(args);
      return await getMemorySource(args, token);
    case "archive_memory":
      archiveMemorySchema.parse(args);
      return await archiveMemory(args, token);
    case "get_low_confidence_memories":
      getLowConfidenceMemoriesSchema.parse(args);
      return await getLowConfidenceMemories(args, token);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
