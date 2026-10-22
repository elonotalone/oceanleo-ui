"use client";

// 聊天里的通话卡片（任务书 P6；合同 §1 A2/A3/A12/A13、§3.4）。SystemLine 认出 `meta.kind` 是通话类就交给这里。
//   call_started   开始卡片：进行中（实时人数、头像叠、「加入通话」）/ 已结束（时长、参与者）——状态以 `call` 事件与
//                  `GET …/call` 为准，不靠改消息；
//   call_ended / call_missed / call_declined / 录制与转写的开关   一行系统文字；
//   call_recording_ready   录像卡片：时长、大小，点「播放」取短时签名地址后用 <video> 播放（服务端只给会话成员签）；
//   call_minutes   Leo 纪要卡片：正文是 Markdown，走仓里现成的安全渲染组件（不渲染原始 HTML）；「查看转写全文」调 GET /transcript。
// meta 缺省或不认识 → 退回普通系统行（只显示 body 的中文兜底文字）。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import type { ImMessage } from "../../../../lib/im/types";
import { Markdown } from "../../../Markdown";
import { useCall } from "../engine";
import { recordingApi, transcriptionApi } from "../services";
import { isLivePhase, isTalentConversation } from "./call-entry";
import { useCallChatContext } from "./call-chat-context";
import { callMetaOf, formatBytes, formatCallDuration, secondsBetween, type CallCardMeta } from "./call-meta";
import { AvatarStack, HeadphonesIcon, RecordDotIcon, TranscriptIcon } from "./call-visuals";
import { conversationCalls, useConversationCallEntry } from "./use-conversation-call";
import { useCallEntry } from "./use-call-entry";

export interface CallMessageCardProps {
  message: ImMessage;
}

export function CallMessageCard({ message }: CallMessageCardProps) {
  const meta = callMetaOf(message);
  if (!meta) return <PlainLine message={message} />;
  switch (meta.kind) {
    case "call_started":
      return <CallStartedCard message={message} meta={meta} />;
    case "call_recording_ready":
      return <CallRecordingCard message={message} meta={meta} />;
    case "call_minutes":
      return <CallMinutesCard message={message} meta={meta} />;
    default:
      return <CallEventLine message={message} meta={meta} />;
  }
}

function PlainLine({ message }: { message: ImMessage }) {
  return (
    <div
      data-seq={message.seq}
      data-system-line=""
      className="my-2 flex justify-center px-6 text-center text-[12px] leading-5 text-neutral-400"
    >
      <span className="max-w-full break-words">{message.body}</span>
    </div>
  );
}

/** 名字：我 → 「你」；不认识 → 「一位成员」。 */
function usePeopleNames() {
  const tt = useUI();
  const ctx = useCallChatContext();
  const nameOf = (userId: string | null | undefined): string => {
    if (!userId) return tt("一位成员");
    if (ctx.viewerId && userId === ctx.viewerId) return tt("你");
    return ctx.nameOf(userId) || tt("一位成员");
  };
  return { ctx, nameOf, tt };
}

function CardFrame({
  message,
  kind,
  children,
}: {
  message: ImMessage;
  kind: string;
  children: ReactNode;
}) {
  return (
    <div data-seq={message.seq} data-system-line="" data-call-card={kind} className="my-2 flex justify-center px-4">
      <div className="w-full max-w-[380px] rounded-xl border border-neutral-200 bg-white p-3 text-left text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
        {children}
      </div>
    </div>
  );
}

function uniqueUserIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

// ── call_started ────────────────────────────────────────────────────────────

export type StartedCardStatus = "active" | "ended" | "unknown";

/**
 * 开始卡片现在是什么状态（纯函数，测试直接调）：
 * 我就在这一通 / 会话当前通话就是这一通 → active；会话已有条目但不是这一通、见过它结束、或已加载到它的结束消息 → ended；
 * 都还不知道（`GET …/call` 在路上）→ unknown（不显示按钮，免得已结束的旧卡片闪一下「加入」）。
 */
export function startedCardStatus(input: {
  callId: string;
  mineLive: boolean;
  currentCallId: string | null;
  hasEntry: boolean;
  seenEnded: boolean;
  hasEndedMessage: boolean;
}): StartedCardStatus {
  if (input.mineLive) return "active";
  if (input.currentCallId && input.currentCallId === input.callId) return "active";
  if (input.hasEndedMessage || input.seenEnded || input.hasEntry) return "ended";
  return "unknown";
}

function CallStartedCard({ message, meta }: { message: ImMessage; meta: CallCardMeta }) {
  const { ctx, nameOf, tt } = usePeopleNames();
  const conversationId = message.conversation_id;
  const entry = useConversationCallEntry(conversationId, { fetch: true });
  const engine = useCall();
  const join = useCallEntry(conversationId, isTalentConversation(conversationId));
  const mineLive = isLivePhase(engine.phase) && engine.callId === meta.callId;
  const current = entry?.call && entry.call.call_id === meta.callId ? entry.call : null;
  const known = conversationCalls().callById(meta.callId);
  const endedMeta = ctx.endedMetaOf(meta.callId);
  const status = startedCardStatus({
    callId: meta.callId,
    mineLive,
    currentCallId: entry?.call?.call_id ?? null,
    hasEntry: Boolean(entry),
    seenEnded: known?.status === "ended",
    hasEndedMessage: Boolean(endedMeta),
  });
  const liveView = current ?? (mineLive ? engine.server : null);
  const starter = meta.startedBy && ctx.viewerId && meta.startedBy === ctx.viewerId ? tt("你发起了通话") : tt("{name} 发起了通话", { name: nameOf(meta.startedBy) });

  if (status === "active") {
    const people = uniqueUserIds((liveView?.participants ?? []).map((p) => p.user_id));
    const count = Math.max(liveView?.participant_count ?? 0, people.length, mineLive ? 1 : 0);
    const inThis = join.state === "in_this_call" && mineLive;
    return (
      <CardFrame message={message} kind="call_started">
        <div className="flex items-center gap-3" data-call-status="active">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <HeadphonesIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold" data-call-count={count}>
              {tt("通话进行中 · {n} 人", { n: count })}
            </div>
            <div className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">{starter}</div>
          </div>
          <button
            type="button"
            data-call-join={inThis ? "mine" : join.state}
            disabled={join.pending || join.state === "busy" || join.state === "hidden"}
            onClick={() => void join.run({ title: ctx.conversationTitle || undefined, callId: meta.callId })}
            className={
              "shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-60 " +
              (inThis
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-emerald-500 text-white hover:bg-emerald-600")
            }
          >
            {inThis ? tt("通话中") : tt("加入通话")}
          </button>
        </div>
        {people.length > 0 ? (
          <div className="mt-2 pl-12">
            <AvatarStack userIds={people} profileOf={(id) => ctx.profileOf(id)} nameOf={nameOf} />
          </div>
        ) : null}
        {join.dialog}
      </CardFrame>
    );
  }

  if (status === "ended") {
    const duration =
      endedMeta?.durationSeconds ?? secondsBetween(known?.started_at ?? null, known?.ended_at ?? null);
    const people = endedMeta?.participantIds.length
      ? endedMeta.participantIds
      : uniqueUserIds((known?.participants ?? []).map((p) => p.user_id));
    const durationText = formatCallDuration(duration);
    return (
      <CardFrame message={message} kind="call_started">
        <div className="flex items-center gap-3" data-call-status="ended">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            <HeadphonesIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">
              {durationText ? tt("通话已结束 · {duration}", { duration: durationText }) : tt("通话已结束")}
            </div>
            <div className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">
              {people.length > 0 ? tt("{starter} · {n} 人参与", { starter, n: people.length }) : starter}
            </div>
          </div>
        </div>
        {people.length > 0 ? (
          <div className="mt-2 pl-12">
            <AvatarStack userIds={people} profileOf={(id) => ctx.profileOf(id)} nameOf={nameOf} />
          </div>
        ) : null}
      </CardFrame>
    );
  }

  return (
    <CardFrame message={message} kind="call_started">
      <div className="flex items-center gap-3" data-call-status="unknown">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <HeadphonesIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{tt("通话")}</div>
          <div className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">{starter}</div>
        </div>
      </div>
    </CardFrame>
  );
}

// ── 一行系统文字 ─────────────────────────────────────────────────────────────

/** `call_recording_failed` 的 `error`（A-13 的四种）→ 原因文字；别的值给空串。 */
export function recordingFailureReason(
  tt: (zh: string, vars?: Record<string, string | number>) => string,
  error: string | null,
): string {
  switch (error) {
    case "no_media":
      return tt("没有录到内容");
    case "files_timeout":
      return tt("录像文件未能生成");
    case "storage_unavailable":
      return tt("录制存储不可用");
    case "provider_failed":
      return tt("录制服务出错");
    default:
      return "";
  }
}

/** 一行文字的内容（纯函数，测试直接调）。`viewerId` 用来区分「对方已拒绝」与「你已拒接」。 */
export function callEventText(
  tt: (zh: string, vars?: Record<string, string | number>) => string,
  meta: CallCardMeta,
  nameOf: (userId: string | null | undefined) => string,
  viewerId: string | null,
): string {
  const mine = Boolean(viewerId) && meta.userId === viewerId;
  switch (meta.kind) {
    case "call_ended": {
      const duration = formatCallDuration(meta.durationSeconds);
      const n = meta.participantIds.length;
      if (duration && n > 0) return tt("通话已结束 · {duration} · {n} 人参与", { duration, n });
      if (duration) return tt("通话已结束 · {duration}", { duration });
      return tt("通话已结束");
    }
    case "call_missed":
      return tt("未接通");
    case "call_declined":
      return viewerId && meta.calleeId === viewerId ? tt("你已拒接") : tt("对方已拒绝");
    // 本人做的事用单独的「你…」句子：把「你」代进「{name} …」在德语、法语等语言里主谓不一致。
    case "call_recording_started":
      return mine ? tt("你开始了录制") : tt("{name} 开始了录制", { name: nameOf(meta.userId) });
    case "call_recording_stopped":
      return mine ? tt("你停止了录制") : tt("{name} 停止了录制", { name: nameOf(meta.userId) });
    case "call_recording_failed": {
      // 仲裁 A-13：一行「录制失败 · 原因」，不给播放按钮；不认识的原因只写「录制失败」。
      const reason = recordingFailureReason(tt, meta.error);
      return reason ? tt("录制失败 · {reason}", { reason }) : tt("录制失败");
    }
    case "call_transcription_started":
      return mine ? tt("你开启了转写") : tt("{name} 开启了转写", { name: nameOf(meta.userId) });
    case "call_transcription_stopped":
      return mine ? tt("你关闭了转写") : tt("{name} 关闭了转写", { name: nameOf(meta.userId) });
    default:
      return "";
  }
}

function CallEventLine({ message, meta }: { message: ImMessage; meta: CallCardMeta }) {
  const { ctx, nameOf, tt } = usePeopleNames();
  const text = callEventText(tt, meta, nameOf, ctx.viewerId) || message.body;
  const recording =
    meta.kind === "call_recording_started" ||
    meta.kind === "call_recording_stopped" ||
    meta.kind === "call_recording_failed";
  const transcript = meta.kind === "call_transcription_started" || meta.kind === "call_transcription_stopped";
  const warn = meta.kind === "call_missed" || meta.kind === "call_declined" || meta.kind === "call_recording_failed";
  return (
    <div
      data-seq={message.seq}
      data-system-line=""
      data-call-line={meta.kind}
      className="my-2 flex justify-center px-6 text-center text-[12px] leading-5"
    >
      <span
        className={
          "inline-flex max-w-full items-center gap-1.5 break-words rounded-full px-2.5 py-0.5 " +
          (warn
            ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"
            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400")
        }
      >
        {recording ? <RecordDotIcon size={12} /> : transcript ? <TranscriptIcon size={12} /> : <HeadphonesIcon size={12} />}
        <span>{text}</span>
      </span>
    </div>
  );
}

// ── call_recording_ready ────────────────────────────────────────────────────

const AUDIO_FORMATS = new Set(["mp3", "aac", "m4a", "wav", "ogg"]);

/** 播放地址只认 https（短时签名的对象存储地址）；别的一律不放进 <video src>。 */
export function playableUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

type PlayState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; url: string; refreshed: boolean } | { kind: "error" };

function CallRecordingCard({ message, meta }: { message: ImMessage; meta: CallCardMeta }) {
  const tt = useUI();
  const [play, setPlay] = useState<PlayState>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const failed = Boolean(meta.error);
  const recordingId = meta.recordingId;
  const duration = formatCallDuration(meta.durationSeconds);
  const size = formatBytes(meta.sizeBytes);
  const format = meta.format ? meta.format.toUpperCase() : "";
  const details = [duration, size, format].filter(Boolean).join(" · ");
  const audioOnly = meta.format ? AUDIO_FORMATS.has(meta.format.toLowerCase()) : false;

  const fetchUrl = async (refreshed: boolean) => {
    if (!recordingId) return;
    setPlay({ kind: "loading" });
    try {
      const result = await recordingApi.play(recordingId);
      const url = playableUrl(result?.url);
      if (!alive.current) return;
      setPlay(url ? { kind: "ready", url, refreshed } : { kind: "error" });
    } catch {
      if (alive.current) setPlay({ kind: "error" });
    }
  };

  return (
    <CardFrame message={message} kind="call_recording_ready">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300">
          <RecordDotIcon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{tt("通话录像")}</div>
          <div className="truncate text-[12px] text-neutral-500 dark:text-neutral-400" data-recording-details="">
            {failed ? tt("录像生成失败") : !recordingId ? tt("录像暂不可用") : details}
          </div>
        </div>
        {!failed && recordingId && play.kind !== "ready" ? (
          <button
            type="button"
            data-recording-play=""
            disabled={play.kind === "loading"}
            onClick={() => void fetchUrl(false)}
            className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {play.kind === "loading" ? tt("正在打开…") : play.kind === "error" ? tt("重试") : tt("播放")}
          </button>
        ) : null}
      </div>
      {play.kind === "error" ? (
        <p className="mt-2 text-[12px] text-red-600 dark:text-red-400" role="alert">
          {tt("录像暂时无法播放，请稍后再试")}
        </p>
      ) : null}
      {play.kind === "ready" ? (
        audioOnly ? (
          <audio
            data-recording-player="audio"
            className="mt-2 w-full"
            src={play.url}
            controls
            autoPlay
            preload="metadata"
            onError={() => (play.refreshed ? setPlay({ kind: "error" }) : void fetchUrl(true))}
          />
        ) : (
          <video
            data-recording-player="video"
            className="mt-2 w-full rounded-lg bg-black"
            src={play.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            // 签名地址最多 10 分钟有效：放久了再点会 403，换一个地址重试一次。
            onError={() => (play.refreshed ? setPlay({ kind: "error" }) : void fetchUrl(true))}
          />
        )
      ) : null}
    </CardFrame>
  );
}

// ── call_minutes ────────────────────────────────────────────────────────────

interface TranscriptSegmentView {
  key: string;
  userId: string;
  text: string;
  offset: string;
}

/** 转写段 → 显示用（纯函数，测试直接调）：按开始时间排序，时间写成相对第一段的 m:ss，丢掉空文本与坏数据。 */
export function transcriptRows(
  segments: Array<{ participant_id?: unknown; user_id?: unknown; text?: unknown; begin_at?: unknown }> | null | undefined,
): TranscriptSegmentView[] {
  if (!Array.isArray(segments)) return [];
  const rows = segments
    .map((segment, index) => {
      const text = typeof segment?.text === "string" ? segment.text.trim() : "";
      const userId = typeof segment?.user_id === "string" ? segment.user_id : "";
      const at = typeof segment?.begin_at === "string" ? Date.parse(segment.begin_at) : Number.NaN;
      return { index, text, userId, at: Number.isFinite(at) ? at : null };
    })
    .filter((row) => row.text.length > 0);
  rows.sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.index - b.index);
  const first = rows.find((row) => row.at !== null)?.at ?? null;
  return rows.map((row) => ({
    key: `${row.index}`,
    userId: row.userId,
    text: row.text,
    offset: first !== null && row.at !== null ? formatCallDuration(Math.floor((row.at - first) / 1000)) : "",
  }));
}

type TranscriptState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "open"; rows: TranscriptSegmentView[] }
  | { kind: "error" };

function CallMinutesCard({ message, meta }: { message: ImMessage; meta: CallCardMeta }) {
  const { nameOf, tt } = usePeopleNames();
  const [transcript, setTranscript] = useState<TranscriptState>({ kind: "closed" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const body = useMemo(() => (typeof message.body === "string" ? message.body.slice(0, 4000) : ""), [message.body]);
  const duration = formatCallDuration(meta.durationSeconds);
  const facts = [
    duration ? tt("通话 {duration}", { duration }) : "",
    typeof meta.segmentCount === "number" ? tt("{n} 段转写", { n: meta.segmentCount }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const toggle = async () => {
    if (transcript.kind === "open") {
      setTranscript({ kind: "closed" });
      return;
    }
    if (transcript.kind === "loading") return;
    setTranscript({ kind: "loading" });
    try {
      const result = await transcriptionApi.transcript(meta.callId);
      if (alive.current) setTranscript({ kind: "open", rows: transcriptRows(result?.segments) });
    } catch {
      if (alive.current) setTranscript({ kind: "error" });
    }
  };

  return (
    <CardFrame message={message} kind="call_minutes">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
          <TranscriptIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{tt("Leo 纪要")}</div>
          {facts ? <div className="truncate text-[11.5px] text-neutral-500 dark:text-neutral-400">{facts}</div> : null}
        </div>
      </div>
      {body ? (
        <div className="mt-2 text-[13px] leading-relaxed" data-call-minutes-body="">
          <Markdown className="text-[13px] leading-relaxed">{body}</Markdown>
        </div>
      ) : null}
      <button
        type="button"
        data-call-transcript-toggle={transcript.kind}
        aria-expanded={transcript.kind === "open"}
        disabled={transcript.kind === "loading"}
        onClick={() => void toggle()}
        className="mt-2 text-[12.5px] font-medium text-violet-600 hover:underline disabled:opacity-60 dark:text-violet-300"
      >
        {transcript.kind === "open"
          ? tt("收起转写全文")
          : transcript.kind === "loading"
            ? tt("正在加载转写…")
            : tt("查看转写全文")}
      </button>
      {transcript.kind === "error" ? (
        <p className="mt-1 text-[12px] text-red-600 dark:text-red-400" role="alert">
          {tt("转写全文暂时打不开，请稍后再试")}
        </p>
      ) : null}
      {transcript.kind === "open" ? (
        transcript.rows.length === 0 ? (
          <p className="mt-1 text-[12px] text-neutral-500">{tt("这通通话没有转写内容")}</p>
        ) : (
          <ol className="mt-2 max-h-72 space-y-1.5 overflow-y-auto rounded-lg bg-neutral-50 p-2 text-[12.5px] dark:bg-neutral-800/60" data-call-transcript="">
            {transcript.rows.map((row) => (
              <li key={row.key} className="leading-5">
                {row.offset ? <span className="mr-1.5 tabular-nums text-neutral-400">{row.offset}</span> : null}
                <span className="mr-1 font-medium text-neutral-700 dark:text-neutral-200">{nameOf(row.userId)}</span>
                <span className="break-words text-neutral-600 dark:text-neutral-300">{row.text}</span>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </CardFrame>
  );
}
