// ─── Agent session: wraps @cursor/sdk Agent for multi-turn ────────
import { Agent } from "@cursor/sdk";
import type { SDKAgent, SendOptions, Run, RunResult, InteractionUpdate } from "@cursor/sdk";
import type { BridgeConfig } from "./config.js";
import type { CallerToolDef, ToolCallResult } from "./types.js";
import { mapToolCall, type CallerTool } from "./tool-mapping.js";

export interface SessionState {
  agent: SDKAgent;
  callerTools: CallerTool[];
  toolDefs: CallerToolDef[];
  callCounter: number;
}

// ─── Public API ───────────────────────────────────────────────────

export async function createSession(
  config: BridgeConfig,
  model: string,
  callerTools?: CallerToolDef[]
): Promise<SessionState> {
  const agent = await Agent.create({
    apiKey: config.cursorApiKey,
    model: { id: model || config.defaultModel },
    name: "cursor-openai-bridge",
    local: { cwd: config.workspace },
  }) as SDKAgent;

  const tools: CallerTool[] = (callerTools ?? []).filter(
    (t) => t?.type === "function" && t?.function?.name
  );

  return {
    agent,
    callerTools: tools,
    toolDefs: callerTools ?? [],
    callCounter: 0,
  };
}

export interface RunResult2 {
  text: string;
  toolCalls: ToolCallResult[];
}

/**
 * Run one turn of the agent. Returns text + mapped tool_calls.
 * The agent internally executes read-context etc, but when it emits
 * a tool_call for shell/write/edit/etc, we capture it, cancel the
 * run, and return it as a mapped OpenAI tool_call for the caller
 * to handle locally.
 */
export async function runTurn(
  session: SessionState,
  prompt: string,
  config: BridgeConfig
): Promise<RunResult2> {
  const run = await session.agent.send(prompt, {
    model: session.agent.model ?? { id: config.defaultModel },
    idempotencyKey: `bridge-${Date.now()}`,
  });

  let text = "";
  let capturedToolCall: { name: string; args: Record<string, unknown> } | null = null;

  try {
    for await (const event of run.stream()) {
      // Capture text from assistant messages
      if (event.type === "assistant") {
        for (const block of (event as any).message?.content ?? []) {
          if (block?.type === "text" && block.text) {
            text += block.text;
          }
        }
        continue;
      }

      // Capture the first emittable tool_call
      if (event.type === "tool_call") {
        if ((event as any).status && (event as any).status !== "running") continue;
        const toolName = (event as any).name as string;
        const toolArgs =
          (event as any).args && typeof (event as any).args === "object"
            ? ((event as any).args as Record<string, unknown>)
            : {};
        if (!capturedToolCall) {
          capturedToolCall = { name: toolName, args: toolArgs };
        }
      }
    }
  } catch (err) {
    // Agent errors during streaming may be benign cancellations after
    // we captured a tool call — or real errors we should surface.
    if (!capturedToolCall) {
      const msg = err instanceof Error ? err.message : String(err);
      if (text) text += `\n[Agent error: ${msg}]`;
      else throw err;
    }
  }

  // Wait for result if no tool call was captured during streaming
  if (!capturedToolCall) {
    try {
      const result = await run.wait();
      if (result.status === "error") {
        const errDetail = (result as any).error ?? (result as any).cause ?? (result as any).details;
        const errMsg =
          typeof errDetail?.message === "string"
            ? errDetail.message
            : String(errDetail ?? "unknown error");
        throw new Error(`Cursor agent run failed: ${errMsg}`);
      }
      if (!text && typeof result.result === "string") {
        text = result.result;
      }
    } catch (err) {
      if (capturedToolCall) {
        // Already got what we need, ignore wait error
      } else {
        throw err;
      }
    }
  }

  // Cancel the agent run if we captured a tool call (the caller will handle it)
  if (capturedToolCall) {
    run.cancel().catch(() => {});
  }

  // Map Cursor SDK tool calls → caller's OpenAI tool_calls
  const toolCalls: ToolCallResult[] = [];
  if (capturedToolCall) {
    session.callCounter++;
    const callId = `call_${session.callCounter}`;
    const mapped = mapToolCall(
      capturedToolCall.name,
      capturedToolCall.args,
      session.callerTools,
      callId
    );
    toolCalls.push(mapped);
  }

  return { text, toolCalls };
}
