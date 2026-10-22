// 通话系统消息的 meta → 卡片要用的规整形状（合同 §3.4；仲裁 A-4：服务端只下发白名单键）。
// 纯 TS：不碰 React / DOM，tests/call-chat-cards.test.mjs 直接加载。
// 一律防御：meta 缺省、为 null、字段类型不对、id 形状不对 → 当没有；认不出的 kind → 返回 null（退回普通系统行）。
import type { CallMessageKind } from "../../../../lib/im/call-types";

export const CALL_MESSAGE_KINDS: readonly CallMessageKind[] = [
  "call_started",
  "call_ended",
  "call_missed",
  "call_declined",
  "call_recording_started",
  "call_recording_stopped",
  "call_recording_ready",
  "call_transcription_started",
  "call_transcription_stopped",
  "call_minutes",
];

const KIND_SET: ReadonlySet<string> = new Set(CALL_MESSAGE_KINDS);

/** 用户 / 通话 / 录像 id：uuid 或同类短 id。别的形状（含空白、斜杠、过长）一律不认。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
/** participant_ids / callee_ids 最多认这么多（通话上限 50 人）。 */
const MAX_IDS = 60;

export interface CallCardMeta {
  kind: CallMessageKind;
  callId: string;
  startedBy: string | null;
  durationSeconds: number | null;
  participantIds: string[];
  reason: string | null;
  callerId: string | null;
  calleeIds: string[];
  calleeId: string | null;
  userId: string | null;
  recordingId: string | null;
  sizeBytes: number | null;
  format: string | null;
  segmentCount: number | null;
  language: string | null;
  error: string | null;
}

function idOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return ID_PATTERN.test(text) ? text : null;
}

function idsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (out.length >= MAX_IDS) break;
    const id = idOf(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function countOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** 短的纯文本标记（reason、format、language、error 码）：只留字母数字与 `._-`，截到 40 字。 */
function tokenOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || !/^[A-Za-z0-9._-]{1,40}$/.test(text)) return null;
  return text;
}

/** 这条消息是不是通话系统消息；是就给规整后的 meta，否则 null。 */
export function callMetaOf(message: { sender_kind?: unknown; kind?: unknown; meta?: unknown } | null | undefined): CallCardMeta | null {
  if (!message) return null;
  if (message.sender_kind !== "system" && message.kind !== "system") return null;
  const raw = message.meta;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const meta = raw as Record<string, unknown>;
  const kind = typeof meta.kind === "string" ? meta.kind : "";
  if (!KIND_SET.has(kind)) return null;
  const callId = idOf(meta.call_id);
  if (!callId) return null;
  return {
    kind: kind as CallMessageKind,
    callId,
    startedBy: idOf(meta.started_by),
    durationSeconds: countOf(meta.duration_seconds),
    participantIds: idsOf(meta.participant_ids),
    reason: tokenOf(meta.reason),
    callerId: idOf(meta.caller_id),
    calleeIds: idsOf(meta.callee_ids),
    calleeId: idOf(meta.callee_id),
    userId: idOf(meta.user_id),
    recordingId: idOf(meta.recording_id),
    sizeBytes: countOf(meta.size_bytes),
    format: tokenOf(meta.format),
    segmentCount: countOf(meta.segment_count),
    language: tokenOf(meta.language),
    error: tokenOf(meta.error),
  };
}

/** 卡片上会出现名字 / 头像的人（给会话视图批量补资料用）。 */
export function callMetaUserIds(meta: CallCardMeta | null): string[] {
  if (!meta) return [];
  const ids = [
    meta.startedBy,
    meta.callerId,
    meta.calleeId,
    meta.userId,
    ...meta.participantIds,
    ...meta.calleeIds,
  ];
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

/** 时长：一小时以内 `m:ss`，以上 `h:mm:ss`。不认的值给空串。 */
export function formatCallDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** 文件大小：B / KB / MB / GB，一位小数（整数不带 .0）。 */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** 两个时间点之间的秒数（结束卡片在拿不到 duration 时用 CallView 的起止时间算）。 */
export function secondsBetween(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.floor((b - a) / 1000);
}
