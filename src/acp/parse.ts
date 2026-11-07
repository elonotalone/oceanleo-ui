// One stored row → one typed event (contract §2.1/§2.3).
//
// Agent rows hold the JSON-RPC message exactly as the agent wrote it (TG-G1 stores the node envelope's inner message
// bytes); the node's own lines (`gap`, `exit`, `oversize`) are stored whole and are the only rows with an
// `oceanleo_acp` key. Client rows are the JSON-RPC object the gateway wrote. Nothing is repaired or guessed: a row
// this page cannot read becomes `unknown` and keeps its raw line.

import {
  KNOWN_SESSION_UPDATES,
  type AcpEvent,
  type AcpFrameRow,
  type ContentBlock,
  type JsonRpcError,
  type JsonRpcId,
  type SessionUpdate,
} from "./types";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rpcError(value: unknown): JsonRpcError {
  const error = isRecord(value) ? value : {};
  return {
    code: num(error.code) ?? 0,
    message: typeof error.message === "string" ? error.message : "",
    ...(error.data !== undefined ? { data: error.data } : {}),
  };
}

const KNOWN = new Set<string>(KNOWN_SESSION_UPDATES);

function contentBlocks(value: unknown): ContentBlock[] {
  return Array.isArray(value) ? value.filter((block): block is ContentBlock => isRecord(block) && typeof block.type === "string") : [];
}

/** A JSON-RPC message (request, notification or response) from `direction`. */
function message(row: AcpFrameRow, msg: Json): AcpEvent {
  const from = row.direction;
  const method = typeof msg.method === "string" ? msg.method : "";
  const hasId = isId(msg.id);
  if (method) {
    const params = msg.params;
    if (from === "agent") {
      if (hasId) return { row, kind: "agent_request", id: msg.id as JsonRpcId, method, params };
      if (method === "session/update" && isRecord(params) && isRecord(params.update)) {
        const update = params.update;
        const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const kind = typeof update.sessionUpdate === "string" ? update.sessionUpdate : "";
        if (KNOWN.has(kind)) return { row, kind: "update", sessionId, update: update as SessionUpdate };
        return { row, kind: "unknown_update", sessionId, sessionUpdate: kind, update };
      }
      return { row, kind: "agent_notification", method, params };
    }
    if (hasId && method === "session/prompt" && isRecord(params)) {
      return {
        row,
        kind: "prompt",
        id: msg.id as JsonRpcId,
        sessionId: typeof params.sessionId === "string" ? params.sessionId : "",
        prompt: contentBlocks(params.prompt),
      };
    }
    if (hasId) return { row, kind: "client_request", id: msg.id as JsonRpcId, method, params };
    return { row, kind: "client_notification", method, params };
  }
  if (hasId && ("result" in msg || "error" in msg)) {
    const id = msg.id as JsonRpcId;
    const answer = "error" in msg && msg.error !== undefined && msg.error !== null
      ? { error: rpcError(msg.error) }
      : { result: msg.result };
    return from === "agent"
      ? { row, kind: "agent_response", id, ...answer }
      : { row, kind: "client_response", id, ...answer };
  }
  return { row, kind: "unknown", reason: "not_jsonrpc", value: msg };
}

export function parseRow(row: AcpFrameRow): AcpEvent {
  let value: unknown;
  try {
    value = JSON.parse(row.raw);
  } catch {
    return { row, kind: "unknown", reason: "not_json" };
  }
  if (!isRecord(value)) return { row, kind: "unknown", reason: "not_object", value };
  if (row.direction === "agent" && value.oceanleo_acp !== undefined) {
    if (isRecord(value.gap)) {
      const gap = value.gap;
      return { row, kind: "gap", from: num(gap.from) ?? 0, to: num(gap.to) ?? 0, count: num(gap.count) ?? 0 };
    }
    if (isRecord(value.exit)) {
      const exit = value.exit;
      return {
        row,
        kind: "exit",
        code: num(exit.code),
        signal: typeof exit.signal === "string" && exit.signal ? exit.signal : typeof exit.signal === "number" ? String(exit.signal) : null,
      };
    }
    if (isRecord(value.oversize)) return { row, kind: "oversize", bytes: num(value.oversize.bytes) ?? 0 };
    return { row, kind: "unknown", reason: "unknown_meta", value };
  }
  return message(row, value);
}
