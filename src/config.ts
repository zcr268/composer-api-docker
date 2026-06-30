// ─── Environment & config ─────────────────────────────────────────
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface BridgeConfig {
  cursorApiKey: string;
  host: string;
  port: number;
  authToken: string;
  workspace: string;
  defaultModel: string;
  timeoutMs: number;
}

export function loadConfig(): BridgeConfig {
  // Load .env if present
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env is optional
  }

  const cursorApiKey = requiredEnv("CURSOR_API_KEY");
  return {
    cursorApiKey,
    host: process.env.BRIDGE_HOST || "0.0.0.0",
    port: parseInt(process.env.BRIDGE_PORT || "8791", 10),
    authToken: process.env.BRIDGE_AUTH_TOKEN || "",
    workspace: process.env.BRIDGE_WORKSPACE || ".",
    defaultModel: process.env.BRIDGE_DEFAULT_MODEL || "composer-2.5",
    timeoutMs: parseInt(process.env.BRIDGE_TIMEOUT_MS || "180000", 10),
  };
}

function requiredEnv(name: string): string {
  const val = process.env[name]?.trim();
  if (!val) {
    console.error(`FATAL: ${name} is not set. Set it in .env or environment.`);
    process.exit(1);
  }
  return val;
}
