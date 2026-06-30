// ─── Cursor → OpenAI tool name / argument mapping ─────────────────
// Maps Cursor SDK built-in tool calls (shell/read/write/edit/grep/glob/…)
// to the OpenAI tools registered by the caller.
//
// The primary target is Hermes Agent, but the mapping table also covers
// common OpenAI-client tool names (shell, bash, etc.) for generality.

export interface ToolMapping {
  /** Cursor SDK canonical tool name (lowercase) */
  cursorName: string;
  /** Candidate caller tool names — first match against caller's tools wins */
  callerNames: string[];
  /** Map cursor-arg-key → caller-arg-key.
   *  Absent keys pass through unchanged.
   *  If a src key is absent from the map, it's passed through as-is. */
  argMap: Record<string, string>;
  /** Keys to strip from the outgoing arguments */
  dropArgs: string[];
  /** If no caller match, output as this prefixed name */
  fallbackName: string;
}

// ── Mapping table ──────────────────────────────────────────────────
//
// Hermes tool reference (from system prompt):
//   terminal(command, workdir?, timeout?, background?, pty?, notify_on_complete?, watch_patterns?)
//   read_file(path, offset?, limit?)
//   write_file(path, content)
//   patch(mode, path, old_string, new_string, replace_all?)
//   search_files(pattern, path?, target?, file_glob?, limit?, output_mode?, context?, offset?)
//
// Cursor SDK tool reference (from cursor-sdk.ts):
//   shell  → { command, workingDirectory?, timeout? }
//   read   → { path, offset?, limit?, includeLineNumbers? }
//   write  → { path, fileText }
//   edit   → { path, streamContent }  (full-file content, NOT a diff)
//   delete → { path }
//   glob   → { targetDirectory?, globPattern }
//   grep   → { pattern, path?, glob?, outputMode?, contextBefore?, contextAfter?, context?, headLimit?, ... }
//   ls     → { path, ignore? }
//   mcp    → { name, args, providerIdentifier?, toolName? }
//   readLints → { paths }
//   semSearch → { query, targetDirectories?, explanation? }

export const TOOL_MAPPINGS: ToolMapping[] = [
  // ── shell → terminal ───────────────────────────────────────────
  {
    cursorName: "shell",
    callerNames: ["terminal", "shell", "bash", "run_command", "execute_command", "run"],
    argMap: {
      command: "command",
      workingDirectory: "workdir",
      // timeout: name matches Hermes exactly, passes through as-is
    },
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_shell",
  },

  // ── read → read_file ───────────────────────────────────────────
  {
    cursorName: "read",
    callerNames: ["read_file", "read", "readfile", "get_file", "file_read"],
    argMap: {
      path: "path",
      offset: "offset",
      limit: "limit",
    },
    dropArgs: ["toolCallId", "includeLineNumbers"],
    fallbackName: "cursor_read",
  },

  // ── write → write_file ─────────────────────────────────────────
  {
    cursorName: "write",
    callerNames: ["write_file", "write", "writefile", "create_file", "file_write"],
    argMap: {
      path: "path",
      fileText: "content",
    },
    dropArgs: ["toolCallId", "returnFileContentAfterWrite"],
    fallbackName: "cursor_write",
  },

  // ── edit → write_file (primary) / patch (fallback) ────────────
  // IMPORTANT: Cursor's edit tool provides streamContent = FULL file content,
  //            not a diff. So we MUST prefer write_file over patch.
  //            patch requires old_string + new_string (a diff), which
  //            we cannot produce from streamContent alone.
  {
    cursorName: "edit",
    callerNames: ["write_file", "patch", "edit_file", "apply_edit", "replace_in_file", "edit"],
    argMap: {
      path: "path",
      streamContent: "content", // maps to write_file.content by default
    },
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_edit",
  },

  // ── delete → terminal (rm -rf) ────────────────────────────────
  // Hermes has no direct delete tool — wrap in terminal
  {
    cursorName: "delete",
    callerNames: ["terminal", "shell", "bash", "run_command", "execute_command", "delete_file", "delete", "remove_file", "file_delete"],
    argMap: {
      // path → command is handled by special logic (rm -rf wrapping)
    },
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_delete",
  },

  // ── glob → search_files ────────────────────────────────────────
  // Cursor glob: { targetDirectory?, globPattern }
  // Hermes search_files(target="files"): { pattern, path? }
  {
    cursorName: "glob",
    callerNames: ["search_files", "glob", "find_files", "file_glob"],
    argMap: {
      globPattern: "pattern",
      targetDirectory: "path",
    },
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_glob",
  },

  // ── grep → search_files ────────────────────────────────────────
  // Cursor grep: { pattern, path?, glob?, outputMode?, contextBefore?, contextAfter?, context?, headLimit?, offset? }
  // Hermes search_files(target="content"): { pattern, path?, file_glob?, output_mode?, context?, limit?, offset? }
  {
    cursorName: "grep",
    callerNames: ["search_files", "grep", "search", "content_search", "file_search"],
    argMap: {
      pattern: "pattern",
      path: "path",
      glob: "file_glob",
      outputMode: "output_mode",
      headLimit: "limit",
      context: "context",
      offset: "offset",
    },
    dropArgs: [
      "toolCallId", "contextBefore", "contextAfter",
      "sortAscending", "multiline", "caseInsensitive", "sort", "type",
    ],
    fallbackName: "cursor_grep",
  },

  // ── ls → search_files (target=files) ────────────────────────────
  {
    cursorName: "ls",
    callerNames: ["search_files", "ls", "list_directory", "list_dir"],
    argMap: {
      path: "path",
    },
    dropArgs: ["toolCallId", "ignore"],
    fallbackName: "cursor_ls",
  },

  // ── readLints ──────────────────────────────────────────────────
  {
    cursorName: "readlints",
    callerNames: ["read_lints", "diagnostics", "lint", "readlints"],
    argMap: {},
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_readlints",
  },

  // ── semSearch ──────────────────────────────────────────────────
  {
    cursorName: "semsearch",
    callerNames: ["semantic_search", "semsearch", "code_search"],
    argMap: {},
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_semsearch",
  },

  // ── mcp ────────────────────────────────────────────────────────
  // TODO: When Hermes adds MCP tool support, add callerNames here
  {
    cursorName: "mcp",
    callerNames: [],
    argMap: {},
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_mcp",
  },
];

/** Shell-like tool names — used for delete → rm special handling */
const SHELL_LIKE_NAMES = new Set([
  "terminal", "shell", "bash", "run_command", "execute_command", "run",
]);

// ─── Types ────────────────────────────────────────────────────────

export interface CallerTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

export interface MappedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// ─── Mapping logic ────────────────────────────────────────────────

/**
 * Map a Cursor SDK tool call to the caller's OpenAI tool_calls format.
 *
 * Strategy (priority order):
 *  1. Exact name match → apply dropArgs + argMap from mapping table (if available)
 *  2. Mapping table: walk TOOL_MAPPINGS, find first callerNames match → transform args
 *  3. Fallback: prefix cursor_ + pass args as-is
 *
 * Special handling:
 *  - delete with shell-like caller → auto-wrap path in `rm -rf`
 *  - glob → search_files: add target="files"
 *  - grep → search_files: add target="content", merge contextBefore/After → context
 *  - ls → search_files: add target="files" + pattern="*"
 *  - edit → patch: rewrite as write_file (since streamContent is full content, not diff)
 */
export function mapToolCall(
  cursorToolName: string,
  cursorArgs: Record<string, unknown>,
  callerTools: CallerTool[],
  callId: string
): MappedToolCall {
  const normalizedCursor = cursorToolName.toLowerCase();

  // 1) Exact name match with caller tools
  // Note: only apply dropArgs (strip internals), NOT argMap — the caller
  // intentionally used the Cursor tool name and expects Cursor-native param names.
  const exactMatch = callerTools.find(
    (t) => t.function.name.toLowerCase() === normalizedCursor
  );
  if (exactMatch) {
    const mapping = TOOL_MAPPINGS.find((m) => m.cursorName === normalizedCursor);
    const cleanedArgs = mapping
      ? transformArgs(cursorArgs, {}, mapping.dropArgs) // empty argMap: only drop, don't rename
      : cursorArgs;
    return makeToolCall(callId, exactMatch.function.name, cleanedArgs);
  }

  // 2) Walk mapping table
  const mapping = TOOL_MAPPINGS.find((m) => m.cursorName === normalizedCursor);
  if (mapping) {
    for (const candidateName of mapping.callerNames) {
      const found = callerTools.find(
        (t) => t.function.name.toLowerCase() === candidateName.toLowerCase()
      );
      if (found) {
        let mappedArgs = transformArgs(cursorArgs, mapping.argMap, mapping.dropArgs);

        // ── Special: delete → shell-like tool (wrap in rm -rf) ───
        if (normalizedCursor === "delete" && SHELL_LIKE_NAMES.has(found.function.name.toLowerCase())) {
          const targetPath = (cursorArgs.path as string) || "";
          mappedArgs = { command: `rm -rf ${shellQuote(targetPath)}` };
        }

        // ── Special: delete → non-shell caller (pass path through) ─
        // (delete_file etc. accepts path directly, no wrapping needed)

        // ── Special: glob → search_files (set target=files) ──────
        if (normalizedCursor === "glob" && found.function.name === "search_files") {
          mappedArgs.target = "files";
          // search_files requires pattern; if globPattern was not provided, use wildcard
          if (!mappedArgs.pattern) mappedArgs.pattern = "*";
        }

        // ── Special: grep → search_files (set target=content) ────
        if (normalizedCursor === "grep" && found.function.name === "search_files") {
          mappedArgs.target = "content";
          // Merge contextBefore/contextAfter → context (if not already set)
          if (mappedArgs.context === undefined) {
            const before = Number(cursorArgs.contextBefore) || 0;
            const after = Number(cursorArgs.contextAfter) || 0;
            if (before || after) {
              mappedArgs.context = Math.max(before, after);
            }
          }
        }

        // ── Special: ls → search_files (set target=files + pattern) ──
        if (normalizedCursor === "ls" && found.function.name === "search_files") {
          mappedArgs.target = "files";
          // search_files requires pattern; ls doesn't have one → use wildcard
          if (!mappedArgs.pattern) mappedArgs.pattern = "*";
        }

        // ── Special: edit matched write_file → use content directly ──
        if (normalizedCursor === "edit" && found.function.name === "write_file") {
          return makeToolCall(callId, found.function.name, {
            path: cursorArgs.path,
            content: cursorArgs.streamContent ?? cursorArgs.fileText ?? "",
          });
        }

        // ── Special: edit matched patch → rewrite as write_file ───
        // Cursor edit only has full-file streamContent, cannot produce diff
        if (normalizedCursor === "edit" && found.function.name === "patch") {
          // Try to fall back to write_file instead
          const writeFileTool = callerTools.find(
            (t) => t.function.name.toLowerCase() === "write_file"
          );
          if (writeFileTool) {
            return makeToolCall(callId, writeFileTool.function.name, {
              path: cursorArgs.path,
              content: cursorArgs.streamContent ?? cursorArgs.fileText ?? "",
            });
          }
          // No write_file available — best-effort: patch with old_string=""
          // WARNING: old_string="" with fuzzy matching is unreliable.
          // The caller should prefer registering write_file for edit support.
          return makeToolCall(callId, found.function.name, {
            mode: "replace",
            path: cursorArgs.path,
            old_string: "",
            new_string: (cursorArgs.streamContent ?? cursorArgs.fileText) as string ?? "",
          });
        }

        return makeToolCall(callId, found.function.name, mappedArgs);
      }
    }

    // No caller match — fallback
    const fallbackArgs = transformArgs(cursorArgs, mapping.argMap, mapping.dropArgs);
    return makeToolCall(callId, mapping.fallbackName, fallbackArgs);
  }

  // 3) Unknown tool — prefix and pass through
  return makeToolCall(callId, `cursor_${normalizedCursor}`, cursorArgs);
}

// ─── Helpers ───────────────────────────────────────────────────────

function transformArgs(
  raw: Record<string, unknown>,
  argMap: Record<string, string>,
  dropArgs: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const dropped = new Set(dropArgs);
  for (const [key, value] of Object.entries(raw)) {
    if (dropped.has(key)) continue;
    // Only apply argMap mapping if the key is explicitly listed;
    // otherwise pass through with original key name
    const targetKey = key in argMap ? argMap[key] : key;
    if (value !== undefined && value !== null) {
      result[targetKey] = value;
    }
  }
  return result;
}

function makeToolCall(
  id: string,
  name: string,
  args: Record<string, unknown>
): MappedToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

/** Minimal shell quoting for safety */
function shellQuote(s: string): string {
  if (!s) return "''";
  if (/^[a-zA-Z0-9_./:-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
