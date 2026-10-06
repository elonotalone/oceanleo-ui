// 工作回放的取数（work-chat 契约 §7.1 / §7.2）。登录态走 lib/agent 的 `authed`（带 token、网关地址），
// 公开链接走匿名请求（不带 cookie、不带 token），与 share-client.ts 同一原则。
import { authed, type AgentApiResult } from "../../../lib/agent";
import { GATEWAY_BASE } from "../../../lib/auth/config";
import type { ImCard, ImEditorKind, ImProfile } from "../../../lib/im/types";

export type ReplayVia = "owner" | "recipient" | "conversation" | "link" | "admin";
export type ReplayEventKind = "edit" | "save" | "ai_input" | "ai_output" | "lock" | "gap" | "day";

export interface WorkReplayEvent {
  id: string;
  t_ms: number;
  dur_ms: number;
  kind: ReplayEventKind;
  source: string;
  author_id: string | null;
  at: string | null;
  seq_from: number | null;
  seq_to: number | null;
  revision_id: string | null;
  text: string | null;
  undone: boolean;
  editor_kind: ImEditorKind | null;
}

export interface WorkReplayChapter {
  id: string;
  title: string;
  day: string;
  start_ms: number;
  end_ms: number;
  active_ms: number;
  sources: string[];
  summary: string | null;
  hidden: boolean;
}

export interface WorkReplayPerson {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  color: string;
  consent: "self" | "accepted" | "pending" | "declined";
}

export interface WorkReplaySource {
  key: string;
  editor_kind: ImEditorKind | null;
  title: string;
  has_trail: boolean;
}

export interface WorkReplay {
  replay: {
    id: string;
    title: string;
    owner_id: string;
    scope: "personal" | "project";
    visibility: "private" | "recipients" | "link";
    share_url: string | null;
    trim: { from: string; to: string; confirmed: boolean } | null;
    show_exact_times: boolean;
    show_undone: boolean;
    created_at: string;
  };
  viewer: { is_owner: boolean; can_fork: boolean; via: ReplayVia };
  people: WorkReplayPerson[];
  days: Array<{ date: string; active_ms: number }>;
  active_ms: number;
  playback_ms: number;
  chapters: WorkReplayChapter[];
  events: WorkReplayEvent[];
  sources: WorkReplaySource[];
  pending_consents?: number;
}

export interface WorkReplaySummary {
  id: string;
  title: string;
  scope: "personal" | "project";
  visibility: "private" | "recipients" | "link";
  sources: Array<{ key: string; editor_kind: ImEditorKind | null; title: string }>;
  range_from: string | null;
  range_to: string | null;
  created_at: string | null;
}

export interface TrailFrames {
  kind: "trail";
  base_seq: number;
  base_state: string;
  updates: Array<{ seq: number; update: string; author_id: string | null; t_ms: number }>;
}

export interface RevisionFrames {
  kind: "revisions";
  items: Array<{ revision_id: string; t_ms: number; json: unknown; title?: string | null }>;
}

export type ReplayFrames = TrailFrames | RevisionFrames;

export interface WorkReplayView {
  viewer: ImProfile | null;
  via: ReplayVia;
  viewed_at: string | null;
}

export interface CreateWorkReplayInput {
  scope?: "personal" | "project";
  project_id?: string | null;
  sources?: Array<{ key: string }>;
  range_from?: string;
  range_to?: string;
  title?: string;
}

export interface PatchWorkReplayInput {
  title?: string;
  trim_from?: string | null;
  trim_to?: string | null;
  trim_confirmed?: boolean;
  hidden_chapters?: string[];
  show_undone?: boolean;
}

/** 公开链接的分享码：`w_` + 22 位 base62。 */
export const WORK_REPLAY_SHARE_PREFIX = "w_";

export function isWorkReplayShareCode(value: string | null | undefined): boolean {
  const code = String(value ?? "");
  return code.startsWith(WORK_REPLAY_SHARE_PREFIX) && code.length > WORK_REPLAY_SHARE_PREFIX.length;
}

const BASE = "/v1/replays/work";

function tzQuery(extra: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  const offset = typeof Date === "function" ? -new Date().getTimezoneOffset() : 0;
  params.set("tz_offset_minutes", String(offset));
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `?${params.toString()}`;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}

export function createWorkReplay(input: CreateWorkReplayInput): Promise<AgentApiResult<WorkReplay>> {
  return authed<WorkReplay>(BASE, json("POST", { scope: "personal", ...input }));
}

export function listMyWorkReplays(): Promise<AgentApiResult<{ items: WorkReplaySummary[]; next_cursor: string | null }>> {
  return authed(`${BASE}?mine=1`);
}

export function getWorkReplay(id: string): Promise<AgentApiResult<WorkReplay>> {
  return authed<WorkReplay>(`${BASE}/${encodeURIComponent(id)}${tzQuery()}`);
}

export function patchWorkReplay(id: string, patch: PatchWorkReplayInput): Promise<AgentApiResult<WorkReplay>> {
  return authed<WorkReplay>(`${BASE}/${encodeURIComponent(id)}`, json("PATCH", patch));
}

export function getWorkReplayFrames(
  id: string,
  source: string,
  range: { fromSeq?: number; toSeq?: number } = {},
): Promise<AgentApiResult<ReplayFrames>> {
  return authed<ReplayFrames>(
    `${BASE}/${encodeURIComponent(id)}/frames${tzQuery({ source, from_seq: range.fromSeq, to_seq: range.toSeq })}`,
  );
}

export function shareWorkReplay(
  id: string,
  target: { conversation_id?: string; user_ids?: string[]; post_card?: boolean },
): Promise<AgentApiResult<{ ok: boolean; visibility: string }>> {
  return authed(`${BASE}/${encodeURIComponent(id)}/share`, json("POST", target));
}

export function createWorkReplayLink(id: string): Promise<AgentApiResult<{ share_code: string; share_url: string }>> {
  return authed(`${BASE}/${encodeURIComponent(id)}/link`, json("POST"));
}

export function revokeWorkReplayLink(id: string): Promise<AgentApiResult<{ ok: boolean }>> {
  return authed(`${BASE}/${encodeURIComponent(id)}/link`, json("DELETE"));
}

export function listWorkReplayViews(id: string): Promise<AgentApiResult<{ items: WorkReplayView[] }>> {
  return authed(`${BASE}/${encodeURIComponent(id)}/views`);
}

export function decideWorkReplayConsent(
  id: string,
  decision: "accept" | "decline",
): Promise<AgentApiResult<{ ok: boolean; status: string }>> {
  return authed(`${BASE}/consents/${encodeURIComponent(id)}/${decision}`, json("POST"));
}

export function createOrgMemberReplay(
  orgId: string,
  memberId: string,
  range: { range_from?: string; range_to?: string } = {},
): Promise<AgentApiResult<WorkReplay>> {
  return authed(`${BASE}/org/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberId)}`, json("POST", range));
}

/** 把回放变成会话里的卡片（ReplayPickerDialog 选中后回调给输入框）。 */
export function replayCard(summary: Pick<WorkReplaySummary, "id" | "title" | "sources">): ImCard {
  const first = summary.sources.find((source) => source.editor_kind);
  return {
    type: "replay",
    id: summary.id,
    title: summary.title || "",
    subtitle: undefined,
    thumb_url: null,
    editor_kind: first?.editor_kind ?? null,
    open_path: null,
    coedit: null,
  };
}

// ---- 公开链接（匿名）-------------------------------------------------------

export interface PublicFetchOptions {
  gatewayBase?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function publicGet<T>(path: string, options: PublicFetchOptions): Promise<AgentApiResult<T>> {
  const base = options.gatewayBase ?? GATEWAY_BASE;
  const call = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await call(`${base}${path}`, {
      method: "GET",
      credentials: "omit", // 公开链接是给陌生人的：不带 cookie、不带 token
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "network error", status: 0 };
  }
  if (!res.ok) return { ok: false, error: `replay ${res.status}`, status: res.status };
  try {
    return { ok: true, data: (await res.json()) as T, status: res.status };
  } catch {
    return { ok: false, error: "bad replay payload", status: res.status };
  }
}

/** 公开链接走新接口 `/v1/replays/work/public/<code>`（分享码以 `w_` 开头）。 */
export function getPublicWorkReplay(code: string, options: PublicFetchOptions = {}): Promise<AgentApiResult<WorkReplay>> {
  return publicGet<WorkReplay>(`${BASE}/public/${encodeURIComponent(code)}${tzQuery()}`, options);
}

export function getPublicWorkReplayFrames(
  code: string,
  source: string,
  range: { fromSeq?: number; toSeq?: number } = {},
  options: PublicFetchOptions = {},
): Promise<AgentApiResult<ReplayFrames>> {
  return publicGet<ReplayFrames>(
    `${BASE}/public/${encodeURIComponent(code)}/frames${tzQuery({ source, from_seq: range.fromSeq, to_seq: range.toSeq })}`,
    options,
  );
}
