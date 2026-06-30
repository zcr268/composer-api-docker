// ─── OpenAI compatibility types ───────────────────────────────────
// Minimal types needed for request/response shaping.

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  tools?: CallerToolDef[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCallResult[];
  tool_call_id?: string;
  name?: string;
}

export interface CallerToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

export interface ToolCallResult {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCallResult[];
    };
    finish_reason: "stop" | "tool_calls" | "length" | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelListResponse {
  object: "list";
  data: { id: string; object: "model"; created: number; owned_by: string }[];
}

export const SUPPORTED_MODELS = [
  "composer-2.5",
  "composer-2.5-fast",
  "claude-opus-4-7-thinking-xhigh",
  "claude-opus-4-8-thinking-xhigh",
  "claude-opus-4-8-thinking-max",
  "claude-opus-4-7-thinking-high",
  "claude-opus-4-8-thinking-high",
  "claude-4.5-opus-high-thinking",
  "claude-4.6-opus-high-thinking",
  "claude-4.6-opus-max-thinking",
  "gpt-5.5",
  "gpt-5.5-high",
  "gpt-5.5-extra-high",
  "gpt-5.4-high",
  "glm-5.2-high",
  "glm-5.2-max",
];
