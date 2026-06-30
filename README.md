# cursor-openai-bridge

OpenAI-compatible (`/v1/chat/completions`, `/v1/models`) adapter for the Cursor Agent SDK.

Translates Cursor SDK tool calls (shell/read/write/edit/grep/glob/…) into standard OpenAI `tool_calls` JSON so any OpenAI client (Hermes, OpenCode, etc.) can consume them safely.

## Architecture

```
OpenAI Client (Hermes, etc.)
  │ POST /v1/chat/completions  (with optional `tools` array)
  ▼
cursor-openai-bridge (:8791)
  │ 1. Stores caller's `tools` definitions
  │ 2. Builds prompt → sends to @cursor/sdk Agent
  │ 3. Agent runs, may emit tool calls (shell, read, write …)
  │ 4. Bridge maps Cursor tool names/args → caller's tool schema
  │ 5. Returns standard OpenAI response with `tool_calls`
  ▼
OpenAI Client receives standard response
  → executes tool_calls locally (its own tools)
  → POSTs result back (role: "tool" message)
  → Bridge continues the agent loop
```

## Quick start

```bash
cp .env.example .env   # set CURSOR_API_KEY
npm install && npm run build
npm start
```

## Endpoints

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/v1/chat/completions` | POST | Standard OpenAI format (stream + non-stream) |
| `/v1/models` | GET | Returns Cursor Composer model list |
| `/health` | GET | Health check |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_API_KEY` | — | Cursor user API key |
| `BRIDGE_PORT` | `8791` | Listen port |
| `BRIDGE_HOST` | `0.0.0.0` | Listen host |
| `BRIDGE_AUTH_TOKEN` | — | Optional Bearer token for proxy auth |
| `BRIDGE_WORKSPACE` | `.` | Default working directory for agent |
| `BRIDGE_DEFAULT_MODEL` | `composer-2.5` | Default model ID |
| `BRIDGE_TIMEOUT_MS` | `180000` | Agent run timeout |

## Tool mapping

When the caller sends `tools` in the request, the bridge registers them as MCP tools visible to the Cursor agent. When the agent emits a tool call, the bridge:

1. Checks if it maps to a caller-registered tool (exact name or alias)
2. Falls back to a **generic mapping table** (shell→caller's shell-like tool, read→caller's read-like tool, etc.)
3. If no mapping found, returns the tool call as-is with `name: "cursor_{tool}"` prefix

The caller is always in control of execution — the bridge never runs tools locally.
