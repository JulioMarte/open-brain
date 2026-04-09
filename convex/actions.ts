"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const generateAndStoreMemory = action({
  args: { text: v.string(), linkedEntityIds: v.optional(v.array(v.id("entities"))) },
  handler: async (ctx, args): Promise<Id<"memories">> => {
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      throw new Error("OPENAI_API_KEY not set");
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: args.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    const memoryId = await ctx.runMutation(internal.memoriesStore.store, {
      text: args.text,
      embedding: embedding,
      linkedEntityIds: args.linkedEntityIds,
      createdAt: Date.now(),
    });

    return memoryId;
  },
});