import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { internal, api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/inboxWebhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { text, source } = await request.json();

      if (!text || !source) {
        return new Response(JSON.stringify({ error: "Missing text or source" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await ctx.runMutation(internal.inbox.createAndProcess, {
        rawText: text,
        source: source,
      });

      await ctx.runAction(api.actions.generateAndStoreMemory, {
        text: text,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/searchMemories",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const { queryText, limit } = await request.json();

      if (!queryText) {
        return new Response(JSON.stringify({ error: "Missing queryText" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const results = await ctx.runAction(api.actions.searchMemories, {
        queryText,
        limit,
      });

      return new Response(JSON.stringify(results), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
