// Agent notices on the task page (B5, wave 2026-11-20 MC). A notice is a status line from the program, not part of
// its reply: it renders on its own small line in plain words. Words a person cannot act on here — the protocol name
// of the tool connection, terminal commands such as "/mcp" — never reach the page.
// Pure functions, no program-name branching: the shape of the update decides.

type Json = Record<string, unknown>;

/** `tools_unavailable`: the task's OceanLeo tools did not connect. `hidden`: nothing a person can use. */
export type AcpNoticeCode = "tools_unavailable" | "hidden" | "";

export type AcpNoticeFields = { severity: string; title: string; description: string; code: AcpNoticeCode };

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// The only tool server a task's program is given is OceanLeo's; a notice about a tool server is about OceanLeo tools.
const TOOL_SERVER = /\bMCP\b/i;
const TOOL_SERVER_DOWN = /fail|unavailable|needs[ -]?auth|authenticat|error|disconnect|not connected|rejected/i;
// A terminal command to type ("/mcp", "/login") or an instruction to run one.
const COMMAND = /(^|[\s"'(“‘`])\/[a-z][\w:-]*/i;
const RUN = /^\s*run\b/i;

/** Classifies a notice by its words: tool-server trouble → `tools_unavailable`, other tool-server news → `hidden`. */
export function noticeCode(title: string, description: string): AcpNoticeCode {
  const text = `${title} ${description}`;
  if (!TOOL_SERVER.test(text)) return "";
  return TOOL_SERVER_DOWN.test(text) ? "tools_unavailable" : "hidden";
}

/** The notice's own words without sentences that ask a person to type a command. */
export function noticeText(title: string, description: string): string {
  return [title, description]
    .map((part) => part
      .split(/(?<=[.!?。！？])\s+/)
      .filter((sentence) => sentence.trim() && !COMMAND.test(sentence) && !RUN.test(sentence))
      .join(" ")
      .trim())
    .filter(Boolean)
    .join("\n");
}

// `_meta.<namespace>.kind` values adapters put on a notice they had to send as message text
// (claude-agent-acp 0.101.0 `session-notices.js`: clients without `session.notices`).
const NOTICE_KINDS = new Set(["mcpServerStatus", "informational", "notice"]);

/**
 * A status line that still arrived as an `agent_message_chunk` (an adapter that did not see the notice capability)
 * → the notice it stands for, so it is never appended to the assistant's reply. `null` for real reply text.
 */
export function chunkNotice(update: unknown): AcpNoticeFields | null {
  if (!isRecord(update) || !isRecord(update._meta)) return null;
  const marker = Object.values(update._meta).find((value) => isRecord(value) && NOTICE_KINDS.has(str(value.kind)));
  if (!isRecord(marker)) return null;
  const content = isRecord(update.content) ? update.content : {};
  const text = str(content.text).trim();
  // The fallback rendering is "**Title:** description" or "**Title**".
  const bold = /^\*\*([\s\S]+?)\*\*:?\s*([\s\S]*)$/.exec(text);
  const title = (bold ? bold[1] : text).replace(/:\s*$/, "").trim();
  const description = bold ? bold[2].trim() : "";
  const status = str(marker.status);
  const level = str(marker.level);
  const severity = status === "failed" || level === "warning" ? "warning" : level === "error" ? "error" : "info";
  const code: AcpNoticeCode = str(marker.kind) !== "mcpServerStatus" ? noticeCode(title, description)
    : TOOL_SERVER_DOWN.test(status) ? "tools_unavailable" : "hidden";
  return { severity, title, description, code };
}
