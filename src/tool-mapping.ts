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
//   search_files(pattern, path?, target?, file_glob?, limit?, output_mode?, context?)
//   browser_navigate(url)
//   delegate_task(goal, context?, tasks?, toolsets?)
//
// Cursor SDK tool reference (from cursor-sdk.ts):
//   shell  → { command, workingDirectory?, timeout? }
//   read   → { path, offset?, limit?, includeLineNumbers? }
//   write  → { path, fileText }
//   edit   → { path, streamContent }  (normalizeSdkToolCallForOpenCode converts to write)
//   delete → { path }
//   glob   → { targetDirectory, globPattern }
//   grep   → { pattern, path?, glob?, outputMode?, contextBefore?, contextAfter?, ... }
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
    },
    dropArgs: ["toolCallId", "timeout"],
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

  // ── edit → patch ───────────────────────────────────────────────
  // Cursor edit: { path, streamContent }
  // Hermes patch: { mode: "replace", path, old_string, new_string }
  // For a full-file write, map edit → write_file (fileText=streamContent)
  // For a diff edit, map edit → patch (best-effort, since Cursor's edit
  //   format differs from Hermes patch)
  {
    cursorName: "edit",
    callerNames: ["patch", "edit_file", "apply_edit", "replace_in_file", "edit"],
    argMap: {
      path: "path",
      streamContent: "new_string",
    },
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_edit",
  },

  // ── delete ──────────────────────────────────────────────────────
  // Hermes has no direct delete tool — map to terminal with `rm`
  {
    cursorName: "delete",
    callerNames: ["terminal", "delete_file", "delete", "remove_file", "file_delete"],
    argMap: {
      path: "command", // will be wrapped in rm -rf
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
  // Cursor grep: { pattern, path?, glob?, outputMode?, ... }
  // Hermes search_files(target="content"): { pattern, path?, file_glob?, output_mode? }
  {
    cursorName: "grep",
    callerNames: ["search_files", "grep", "search", "content_search", "file_search"],
    argMap: {
      pattern: "pattern",
      path: "path",
      glob: "file_glob",
      outputMode: "output_mode",
    },
    dropArgs: [
      "toolCallId", "contextBefore", "contextAfter", "context",
      "headLimit", "sortAscending", "multiline", "caseInsensitive",
      "offset", "sort", "type",
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
  {
    cursorName: "mcp",
    callerNames: [],
    argMap: {},
    dropArgs: ["toolCallId"],
    fallbackName: "cursor_mcp",
  },
];

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
 *  1. Exact name match: if caller registered a tool with the exact same name → use it as-is
 *  2. Mapping table: walk TOOL_MAPPINGS, find first callerNames match → transform args
 *  3. Fallback: prefix cursor_ + pass args as-is
 *
 * Special handling:
 *  - delete with caller=terminal → auto-wrap path in `rm -rf`
 *  - glob/grep with target=search_files → add target="files"/"content" implicitly
 */
export function mapToolCall(
  cursorToolName: string,
  cursorArgs: Record<string, unknown>,
  callerTools: CallerTool[],
  callId: string
): MappedToolCall {
  const normalizedCursor = cursorToolName.toLowerCase();

  // 1) Exact name match with caller tools
  const exactMatch = callerTools.find(
    (t) => t.function.name.toLowerCase() === normalizedCursor
  );
  if (exactMatch) {
    return makeToolCall(callId, exactMatch.function.name, cursorArgs);
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

        // ── Special: delete → terminal (wrap in rm) ──────────────
        if (normalizedCursor === "delete" && found.function.name === "terminal") {
          const targetPath = cursorArgs.path as string || "";
          mappedArgs = { command: `rm -rf ${shellQuote(targetPath)}` };
        }

        // ── Special: glob → search_files (set target=files) ──────
        if (normalizedCursor === "glob" && found.function.name === "search_files") {
          mappedArgs.target = "files";
        }

        // ── Special: grep → search_files (set target=content) ────
        if (normalizedCursor === "grep" && found.function.name === "search_files") {
          mappedArgs.target = "content";
        }

        // ── Special: edit → patch (mode=replace) ─────────────────
        if (normalizedCursor === "edit" && found.function.name === "patch") {
          mappedArgs.mode = "replace";
          // edit only has streamContent (full new content), no old_string
          // so we can't do a proper old_string/new_string diff
          // Instead, map to write_file if available; if not, set old_string=""
          if (mappedArgs.new_string !== undefined && !mappedArgs.old_string) {
            // For patch mode, we need old_string. Since Cursor edit
            // doesn't provide it, fall through to write_file if possible
            const writeFileTool = callerTools.find(
              (t) => t.function.name.toLowerCase() === "write_file"
            );
            if (writeFileTool) {
              return makeToolCall(callId, writeFileTool.function.name, {
                path: cursorArgs.path,
                content: cursorArgs.streamContent ?? cursorArgs.fileText ?? "",
              });
            }
            // Last resort: use patch with empty old_string (full replace)
            mappedArgs.old_string = "";
          }
        }

        // ── Special: edit → write_file ───────────────────────────
        if (normalizedCursor === "edit" && found.function.name === "write_file") {
          return makeToolCall(callId, found.function.name, {
            path: cursorArgs.path,
            content: cursorArgs.streamContent ?? cursorArgs.fileText ?? "",
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
    const targetKey = argMap[key] ?? key;
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
