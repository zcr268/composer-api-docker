// ─── HTTP server: OpenAI-compatible endpoints ─────────────────────
import http from "node:http";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { createSession, runTurn } from "./agent-session.js";
import { mapToolCall } from "./tool-mapping.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  CallerToolDef,
  ToolCallResult,
  ModelListResponse,
} from "./types.js";
import { SUPPORTED_MODELS } from "./types.js";
import type { BridgeConfig } from "./config.js";

// ─── Session store ────────────────────────────────────────────────
interface ActiveSession {
  agent: any; // Agent from @cursor/sdk
  callerTools: CallerToolDef[];
  callCounter: number;
}

const sessions = new Map<string, ActiveSession>();

// ─── Main ─────────────────────────────────────────────────────────

const config = loadConfig();

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("Unhandled error:", err);
    writeJson(res, errorPayload(err), 500);
  });
});

server.listen(config.port, config.host, () => {
  console.log(`cursor-openai-bridge listening on http://${config.host}:${config.port}/v1`);
  console.log(`Workspace: ${config.workspace}`);
  console.log(`Default model: ${config.defaultModel}`);
});

process.on("SIGINT", () => { server.close(); process.exit(0); });
process.on("SIGTERM", () => { server.close(); process.exit(0); });

// ─── Router ───────────────────────────────────────────────────────

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && path === "/health") {
    writeJson(res, { ok: true, agents: sessions.size });
    return;
  }

  if (req.method === "GET" && path === "/v1/models") {
    writeJson(res, modelList());
    return;
  }

  if (req.method === "POST" && path === "/v1/chat/completions") {
    await handleChatCompletions(req, res);
    return;
  }

  writeJson(res, errorPayload(new Error("Not found")), 404);
}

// ─── POST /v1/chat/completions ─────────────────────────────────────

async function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse) {
  // Auth check
  if (config.authToken) {
    const bearer = extractBearer(req);
    if (bearer !== config.authToken) {
      writeJson(res, errorPayload(new Error("Unauthorized"), "unauthorized"), 401);
      return;
    }
  }

  const body = await readBody<ChatCompletionRequest>(req);
  if (!body?.messages?.length) {
    writeJson(res, errorPayload(new Error("messages is required")), 400);
    return;
  }

  const model = body.model || config.defaultModel;
  const requestId = `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  // Build prompt from messages
  const prompt = messagesToPrompt(body.messages, body.tools);

  // Create or resume agent session
  const sessionId = randomUUID();
  const session = await createSession(config, model, body.tools);
  sessions.set(sessionId, session);

  try {
    const result = await runTurn(session, prompt, config);

    // Build OpenAI response
    const response: ChatCompletionResponse = {
      id: requestId,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text || null,
            ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
          },
          finish_reason: result.toolCalls.length > 0 ? "tool_calls" : "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };

    writeJson(res, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeJson(res, errorPayload(new Error(message), "cursor_sdk_error"), 502);
  } finally {
    // Clean up session (agent will be re-created for next turn if needed)
    sessions.delete(sessionId);
  }
}

// ─── Prompt builder ───────────────────────────────────────────────

/**
 * Convert OpenAI messages array into a single prompt string for the Cursor agent.
 * Also injects caller's tool definitions so the agent knows what's available.
 */
function messagesToPrompt(messages: ChatMessage[], tools?: CallerToolDef[]): string {
  const parts: string[] = [];

  // System preamble
  parts.push("You are an AI assistant running through the Cursor SDK with an OpenAI-compatible bridge.");
  parts.push(`Project directory: ${config.workspace}`);
  parts.push("When the request requires file or system operations, use the available tools.");

  // Inject caller tool definitions
  if (tools && tools.length > 0) {
    parts.push("");
    parts.push("## Available tools (registered by the outer caller)");
    for (const tool of tools) {
      const f = tool.function;
      parts.push(`- **${f.name}**: ${f.description || "(no description)"}`);
      if (f.parameters && typeof f.parameters === "object") {
        const schema = f.parameters as any;
        const props = schema.properties ?? {};
        const required = new Set(schema.required ?? []);
        const paramList = Object.entries(props)
          .map(([k, v]: [string, any]) => {
            const req = required.has(k) ? "required" : "optional";
            const type = v.type || "any";
            return `  - \`${k}\` (${type}, ${req}): ${v.description || ""}`;
          })
          .join("\n");
        if (paramList) parts.push(paramList);
      }
    }
    parts.push("");
    parts.push(
      "IMPORTANT: Prefer using these registered tools for any file/shell operations. " +
      "When you need to execute a command, read a file, write a file, etc., emit a tool call " +
      "that matches one of the above tool names and schemas. The bridge will translate it " +
      "back to the caller's expected format."
    );
  }

  // Conversation history
  parts.push("");
  parts.push("## Conversation");
  for (const msg of messages) {
    const role = msg.role.toUpperCase();
    if (msg.content) {
      parts.push(`${role}: ${msg.content}`);
    }
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        parts.push(`${role}: [tool_call: ${tc.function.name}(${tc.function.arguments})]`);
      }
    }
    if (msg.role === "tool" && msg.tool_call_id) {
      parts.push(`TOOL_RESULT (${msg.name || msg.tool_call_id}): ${msg.content || "(empty)"}`);
    }
  }

  return parts.join("\n");
}

// ─── Model list ───────────────────────────────────────────────────

function modelList(): ModelListResponse {
  return {
    object: "list",
    data: SUPPORTED_MODELS.map((id) => ({
      id,
      object: "model" as const,
      created: 1700000000,
      owned_by: "cursor",
    })),
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────

function writeJson(res: http.ServerResponse, data: unknown, status = 200) {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function setCorsHeaders(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

async function readBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(raw) as T;
}

function extractBearer(req: http.IncomingMessage): string {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function errorPayload(err: Error, code = "error") {
  return {
    error: {
      message: err.message,
      type: code,
      code,
    },
  };
}
