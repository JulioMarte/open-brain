import express from "express";
import { extractToken } from "./auth.js";
import { tools, handleToolCall } from "./tools.js";
import { JsonRpcMessage } from "./types.js";

const app = express();
app.use(express.json());

interface SseClient {
  id: string;
  res: any;
}

const clients: Map<string, SseClient> = new Map();
let clientIdCounter = 0;

function sendToClient(clientId: string, data: any) {
  const client = clients.get(clientId);
  if (client) {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

function broadcastToAll(data: any) {
  clients.forEach((client) => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

app.get("/sse", (req: any, res: any) => {
  try {
    extractToken(req);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
    return;
  }

  const clientId = `client_${++clientIdCounter}`;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.set(clientId, { id: clientId, res });

  const initialMessage = {
    jsonrpc: "2.0",
    method: "initialize",
    result: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "open-brain-mcp",
        version: "1.0.0",
      },
    },
  };
  res.write(`data: ${JSON.stringify(initialMessage)}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(clientId);
  });
});

app.post("/message", async (req: any, res: any) => {
  let token: string;
  try {
    token = extractToken(req);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
    return;
  }

  const message: JsonRpcMessage = req.body;
  const clientId = req.headers["x-client-id"] as string;

  try {
    if (message.method === "tools/list") {
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: tools,
        },
      };
      
      if (clientId) {
        sendToClient(clientId, response);
      } else {
        res.json(response);
      }
      return;
    }

    if (message.method === "tools/call") {
      const toolName = message.params?.name;
      const args = message.params?.arguments || {};

      const result = await handleToolCall(toolName, args, token);

      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
        },
      };

      if (clientId) {
        sendToClient(clientId, response);
      } else {
        res.json(response);
      }
      return;
    }

    res.status(400).json({ error: "Unknown method" });
  } catch (error: any) {
    const errorResponse = {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32603,
        message: error.message,
      },
    };
    
    if (clientId) {
      sendToClient(clientId, errorResponse);
    } else {
      res.json(errorResponse);
    }
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});

export default app;
