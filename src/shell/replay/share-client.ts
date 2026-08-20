// ============================================================================
// @oceanleo/ui — 分享回放的取数（只读、不带身份）
// ----------------------------------------------------------------------------
// 合同 §4 I-2（2026-08-20）：`GET /v1/share/<share_id>` 不需要登录、不读 cookie、
// 不回任何用户身份字段。这里对应地**显式** `credentials: "omit"`、不带
// Authorization —— 分享链接是给陌生人开的，请求上挂着 SSO cookie 既没用也危险。
//
// 后端（W04）还没上线时，页面用 ./replay-sample 里那份写死数据开发，
// 不在这里对后端做任何猜测性的兼容处理。
// ============================================================================

import type { AgentApiResult, AgentMessage } from "../../lib/agent";
import { GATEWAY_BASE } from "../../lib/auth/config";

export interface SharedReplay {
  share_id: string;
  title: string;
  messages: AgentMessage[];
  created_at?: string;
}

/** 合同 I-2：`messages[]` 只保留这六个键。多回来的一律丢掉，不往页面里带。 */
const ALLOWED_MESSAGE_KEYS = [
  "id",
  "role",
  "kind",
  "content",
  "meta",
  "created_at",
] as const;

function normalizeMessage(raw: unknown, index: number): AgentMessage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of ALLOWED_MESSAGE_KEYS) {
    if (key in record) picked[key] = record[key];
  }
  const id =
    typeof picked.id === "number" && Number.isFinite(picked.id)
      ? picked.id
      : index;
  const meta =
    picked.meta && typeof picked.meta === "object" && !Array.isArray(picked.meta)
      ? (picked.meta as AgentMessage["meta"])
      : undefined;
  return {
    id,
    role: picked.role === "user" ? "user" : "assistant",
    kind: typeof picked.kind === "string" ? picked.kind : "text",
    content: typeof picked.content === "string" ? picked.content : "",
    meta,
    created_at:
      typeof picked.created_at === "string" ? picked.created_at : undefined,
  };
}

export function normalizeSharedReplay(
  shareId: string,
  payload: unknown,
): SharedReplay {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const rawMessages = Array.isArray(record.messages) ? record.messages : [];
  return {
    share_id: shareId,
    title: typeof record.title === "string" ? record.title : "",
    created_at:
      typeof record.created_at === "string" ? record.created_at : undefined,
    messages: rawMessages
      .map((message, index) => normalizeMessage(message, index))
      .filter((message): message is AgentMessage => message !== null),
  };
}

export interface FetchSharedReplayOptions {
  /** 测试与本地开发用；不给就走 `GATEWAY_BASE`。 */
  gatewayBase?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function fetchSharedReplay(
  shareId: string,
  options: FetchSharedReplayOptions = {},
): Promise<AgentApiResult<SharedReplay>> {
  const id = (shareId || "").trim();
  if (!id) return { ok: false, error: "missing share id", status: 0 };
  const base = options.gatewayBase ?? GATEWAY_BASE;
  const call = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await call(`${base}/v1/share/${encodeURIComponent(id)}`, {
      method: "GET",
      // 匿名只读：不带 cookie、不带 token。
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "network error",
      status: 0,
    };
  }

  if (!res.ok) {
    return { ok: false, error: `share ${res.status}`, status: res.status };
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "bad share payload", status: res.status };
  }
  return { ok: true, data: normalizeSharedReplay(id, payload), status: res.status };
}
