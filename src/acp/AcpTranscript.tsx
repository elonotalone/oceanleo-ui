"use client";

// The task page as a standard ACP client (contract §2.5, P4): stored rows in, the conversation out.
// Program differences live in reduce.ts / messages.ts; this file only renders. An empty row list renders nothing.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentProgress } from "../shell/AgentProgress";
import { AgentTranscriptBubble } from "../shell/AgentTranscriptBubble";
import type { AgentAttachment } from "../lib/agent";
import { TranscriptStream, StreamWaitingLine, ACP_TRANSCRIPT_CAPABILITIES, type TranscriptItem } from "../shell/transcript/TranscriptStream";
import { useAcpTranscriptAdapter } from "../shell/transcript/useAcpTranscriptAdapter";
import { ChatTimeSeparator } from "../shell/ChatTimeSeparator";
import { agentMessageTimeSeparators } from "../shell/chat-time-separators";
import { agentTurnActionTargets } from "../lib/agent-progress";
import { useUI } from "../i18n/ui/useUI";
import { cursorAnswerResult, isCursorQuestion, libraryRefFromUri, resendable, type AcpBlock } from "./messages";
import { reduceRows } from "./reduce";
import type { AcpBackgroundTask, AcpFrameRow, AcpPermission, AcpTurn, JsonRpcId } from "./types";

export type AcpTranscriptProps = {
  rows: AcpFrameRow[];
  items?: readonly TranscriptItem<AcpBlock>[];
  /** Scopes referenced files to this visible prompt, rather than the viewer's Library. */
  taskId?: string;
  showAuthors?: boolean;
  viewerUserId?: string | null;
  /** Fetch a shortened row in full; the owner replaces it in the stored window. */
  onExpandRow?: (rowId: number) => Promise<void>;
  /** Optional render diagnostic; omitted by production callers. */
  onBlockRender?: (kind: "bubble" | "process", id: number) => void;
  /** A view reduced by the owning task page; avoids reducing the same backlog twice. */
  view?: ReturnType<typeof reduceRows>;
  program: string;
  /** Send `result` as the JSON-RPC response to the agent's request `requestId`. */
  onAnswer?: (requestId: JsonRpcId, result: unknown) => void;  // omitted while the page's socket is down: cards render, not clickable
  /** Stop one background task (Claude `asyncTaskId`). Absent: no per-task stop buttons. */
  onStopTask?: (ref: string) => void;
  /** The task page's search words: hits in user text, agent text and step titles are wrapped in `<mark data-leo-search-hit>`. */
  highlightQuery?: string;
  /**
   * 「停止这一轮并发送」 on a queued prompt (`promptRowId` = its client prompt row). Absent (socket down, read-only, a stop
   * already under way): the queued line shows without the button.
   */
  onStopAndSend?: (promptRowId: number) => void;
  /** 「分享」's select mode: the pickable messages (`acpShareItems`) get the checkbox, nothing else does. */
  select?: { pickable: ReadonlySet<number>; selected: ReadonlySet<number>; onToggle: (messageId: number) => void };
  /** Open a sent attachment in the task right sidebar. */
  onOpenAttachment?: (attachment: AgentAttachment) => void | Promise<boolean>;
};

function answerFor(request: AcpPermission, answer: unknown): unknown {
  if (isCursorQuestion(request.method)) return cursorAnswerResult(request.method, answer);
  return { outcome: { outcome: "selected", optionId: String(answer) } };
}

function RawRequest({ request }: { request: AcpPermission }) {
  const params = request.params === undefined ? "" : JSON.stringify(request.params, null, 2);
  return (
    <div data-acp-raw-request={request.method} className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3">
      <p className="break-all font-mono text-[12px] font-semibold text-amber-800">{request.method}</p>
      {params && (
        <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-amber-900/80">
          {params}
        </pre>
      )}
    </div>
  );
}

function finishedBackgroundState(state: string): boolean {
  return ["completed", "complete", "failed", "stopped", "cancelled", "canceled", "terminated", "ended"].includes(state.toLowerCase());
}

function elapsedLabel(startedAt: string, now: number): string {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "0s";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function ModelWaitingNotice({ view, rows, tt }: { view: ReturnType<typeof reduceRows>; rows: AcpFrameRow[]; tt: ReturnType<typeof useUI> }) {
  const open = view.turns.find((turn) => turn.open);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open?.rowId]);
  if (!open) return null;
  if (view.retrying) return <div data-acp-model-retry=""><StreamWaitingLine retrying label={tt("模型连接中断，正在重试")} /></div>;
  const last = rows.filter((row) => row.direction === "agent").reduce((latest, row) => Math.max(latest, Date.parse(row.received_at) || 0), 0);
  const promptAt = Date.parse(rows.find((row) => row.id === open.rowId)?.received_at || "") || 0;
  const silent = now - Math.max(last, promptAt);
  const spoken = open.items.some((item) => item.type === "message" && item.role === "agent" && !item.scope && item.text.trim());
  if (spoken && silent < 60_000) return null;
  const seconds = Math.max(0, Math.floor(silent / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <div data-acp-model-waiting=""><StreamWaitingLine label={tt("等待模型回应 · {elapsed}", { elapsed })} /></div>;
}

/** Live AIR tasks sit above the composer; terminal states render on their tool row. */
export function AcpBackgroundTaskStrip({ tasks, onStopTask }: { tasks: AcpBackgroundTask[]; onStopTask?: (ref: string) => void }) {
  const tt = useUI();
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const running = tasks.filter((task) => !finishedBackgroundState(task.state) && task.backgroundState !== "stale" && task.backgroundState !== "unknown");
  const ended = tasks.filter((task) => !finishedBackgroundState(task.state) && (task.backgroundState === "stale" || task.backgroundState === "unknown"));
  const visible = [...running, ...ended];
  const previousRunningCount = useRef(running.length);
  useEffect(() => {
    if (!running.length) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running.length]);
  useEffect(() => {
    const previous = previousRunningCount.current;
    if (running.length < previous && running.length <= 1) setExpanded(false);
    previousRunningCount.current = running.length;
  }, [running.length]);
  if (!visible.length) return null;

  const nameFor = (task: AcpBackgroundTask) => task.name || task.description || task.id;
  const stop = (task: AcpBackgroundTask) => onStopTask && task.canStop ? (
    <button
      type="button"
      data-acp-stop-task={task.id}
      onClick={() => onStopTask(task.id)}
      className="shrink-0 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] text-stone-600 hover:bg-stone-50"
    >
      {tt("停止")}
    </button>
  ) : null;
  const first = running[0];
  const summary = running.length === 1
    ? tt("后台任务运行中 · {name} · {elapsed}", { name: nameFor(first), elapsed: elapsedLabel(first.startedAt, now) })
    : running.length > 1
      ? tt("{count} 个后台任务运行中", { count: running.length })
      : tt("已随会话结束（未确认）");
  const listId = "acp-background-task-list";

  return (
    <div data-acp-background-strip="" className="mb-2 border-l-2 border-stone-200 pl-3">
      <div data-acp-background-summary="" className="flex min-w-0 items-center gap-2 text-[12px] text-stone-500">
        <button
          type="button"
          data-acp-background-toggle=""
          aria-expanded={expanded}
          aria-controls={listId}
          aria-label={tt(expanded ? "收起后台任务" : "展开后台任务")}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-0.5 text-left hover:bg-stone-50"
        >
          <span className="min-w-0 flex-1 truncate text-stone-600">{summary}</span>
          {visible.length > 1 && <span aria-hidden="true" className="shrink-0 text-[11px] text-stone-400">{expanded ? "⌃" : "⌄"}</span>}
        </button>
        {running.length === 1 && stop(first)}
      </div>
      {expanded && (
        <div id={listId} data-acp-background-list="" role="list" className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-stone-50/70 px-2 py-1.5">
          {visible.map((task) => (
            <div key={task.id} data-acp-background-task={task.id} data-task-state={task.state} role="listitem" className="flex min-w-0 items-start gap-2 text-[12px] text-stone-500">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-stone-600">{nameFor(task)}</span>
                  <span className="shrink-0 text-stone-400">{tt("用时 {elapsed}", { elapsed: elapsedLabel(task.startedAt, now) })}</span>
                </div>
                {task.backgroundState === "stale" || task.backgroundState === "unknown" ? <p className="whitespace-pre-wrap text-stone-400">{tt("已随会话结束（未确认）")}</p> : task.summary && <p className="whitespace-pre-wrap text-stone-400">{task.summary}</p>}
              </div>
              {stop(task)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Under a prompt the program is holding. The button only where the page can send the prompt again (`resendable`). */
function QueuedLine({ turn, onStopAndSend }: { turn: AcpTurn; onStopAndSend?: (promptRowId: number) => void }) {
  const tt = useUI();
  return (
    <div data-acp-queued={turn.rowId} className="-mt-1.5 flex flex-wrap items-center justify-end gap-2 text-[12px] text-stone-500">
      <span>{tt("排队中：这一轮做完后它会看到")}</span>
      {onStopAndSend && resendable(turn) && (
        <button
          type="button"
          data-acp-stop-and-send={turn.rowId}
          onClick={() => onStopAndSend(turn.rowId)}
          className="shrink-0 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] text-stone-600 hover:bg-stone-50"
        >
          {tt("停止这一轮并发送")}
        </button>
      )}
    </div>
  );
}

/** Old gateways only sent bytes; infer their reason from the shortened content. */
function shortenedContent(row: AcpFrameRow) {
  let text = row.truncated?.text ?? false;
  let binary = row.truncated?.binary ?? false;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const item = value as Record<string, unknown>;
    if ((item.type === "image" || item.type === "audio") && !item.data) {
      binary = true;
    }
    if (item.blob === "") binary = true;
    for (const [key, child] of Object.entries(item)) {
      if (row.truncated?.text === undefined && key !== "uri" && typeof child === "string" && child.endsWith("…") &&
          new TextEncoder().encode(child).length >= 8192) text = true;
      visit(child);
    }
  };
  try { visit(JSON.parse(row.raw)); } catch { text = true; }
  return { text: text || !binary };
}

function TruncatedRow({ row, onExpand }: { row: AcpFrameRow; onExpand?: AcpTranscriptProps["onExpandRow"] }) {
  const tt = useUI();
  const content = shortenedContent(row);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const expand = async () => {
    if (!onExpand || busy) return;
    setBusy(true); setError("");
    try { await onExpand(row.id); }
    catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      setError(reason);
    }
    finally { setBusy(false); }
  };
  if (!content.text) return null;
  if (!row.truncated) return null;
  return <div className="flex flex-wrap gap-2 px-1 text-[12px] text-stone-500" data-acp-truncated-row={row.id}>
    {content.text && <button type="button" disabled={!onExpand || busy} onClick={() => void expand()} aria-busy={busy}>
      {tt("内容较长，已省略 {size} KB · 展开", { size: Math.ceil((row.truncated?.bytes || 0) / 1024) })}
    </button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function blockRowId(block: AcpBlock): number {
  return block.type === "bubble" ? block.message.id
    : block.type === "raw-request" ? block.request.rowId
      : Math.min(...block.messages.map((message) => message.id));
}

export function AcpTranscript({ items: providedItems, rows, taskId, program, view: providedView, onAnswer, onStopTask, highlightQuery, onStopAndSend, select, onOpenAttachment, onBlockRender, onExpandRow, showAuthors, viewerUserId }: AcpTranscriptProps) {
  const tt = useUI();
  const view = useMemo(() => providedView ?? reduceRows(rows, program), [providedView, rows, program]);
  const items = useAcpTranscriptAdapter(view, taskId, providedItems);
  const blocks = useMemo(() => items.map((item) => item.value), [items]);
  const times = useMemo(() => agentMessageTimeSeparators(blocks.map((block) => block.type === "bubble"
    ? { ...block.message, created_at: rows.find((row) => row.id === block.message.id)?.received_at }
    : { role: "system" })), [blocks, rows]);
  const turnCopies = useMemo(() => agentTurnActionTargets(blocks.flatMap((block, index) => block.type === "bubble"
    ? [{ type: "message" as const, key: block.key, index, message: block.message }] : []), view.open), [blocks, view.open]);
  const shortened = useMemo(() => {
    const assigned = new Map<string, AcpFrameRow[]>();
    for (const row of rows) {
      if (!row.truncated) continue;
      const block = blocks.findLast((item) => blockRowId(item) <= row.id);
      const key = block?.key ?? "";
      assigned.set(key, [...(assigned.get(key) ?? []), row]);
    }
    return assigned;
  }, [rows, blocks]);
  if (!rows.length) return null;
  return (
    <div data-acp-transcript="" data-agent-stream="" data-acp-program={program} className="space-y-3">
      <TranscriptStream items={items} capabilities={ACP_TRANSCRIPT_CAPABILITIES} renderItem={(block) => {
        const pick = block.type === "bubble" && block.message.kind === "text" && select?.pickable.has(block.message.id);
        return <>
          {times.has(blocks.indexOf(block)) && <ChatTimeSeparator at={times.get(blocks.indexOf(block))!} />}
          <TranscriptBlock
            block={block}
            turnCopyText={turnCopies.get(block.key) ?? null}
            showAuthors={showAuthors}
            viewerUserId={viewerUserId}
            highlightQuery={highlightQuery}
            onAnswer={block.type === "bubble" && block.request ? onAnswer : undefined}
            onStopAndSend={block.type === "bubble" && block.queued ? onStopAndSend : undefined}
            onOpenAttachment={block.type === "raw-request" ? undefined : onOpenAttachment}
            selectMode={Boolean(pick)}
            selected={Boolean(pick && block.type === "bubble" && select?.selected.has(block.message.id))}
            onToggle={pick ? select?.onToggle : undefined}
            onBlockRender={onBlockRender}
          />
          {shortened.get(block.key)?.map((row) => <TruncatedRow key={row.id} row={row} onExpand={onExpandRow} />)}
        </>;
      }} />
      {shortened.get("")?.map((row) => <TruncatedRow key={row.id} row={row} onExpand={onExpandRow} />)}
      <ModelWaitingNotice view={view} rows={rows} tt={tt} />
    </div>
  );
}

type TranscriptBlockProps = Pick<AcpTranscriptProps,
  "onAnswer" | "onStopAndSend" | "onOpenAttachment" | "highlightQuery" | "onBlockRender" | "showAuthors" | "viewerUserId"> & {
  block: AcpBlock;
  turnCopyText: string | null;
  selectMode: boolean;
  selected: boolean;
  onToggle?: (id: number) => void;
};

/**
 * Both reducers rebuild their JSON-shaped output, even for unchanged rows. Compare
 * that data structurally before entering a block: text compares as a string, tool
 * details short-circuit on shared references, and every field (including nested
 * request / attachment / tool metadata) participates. No lossy hash or id-only
 * comparison can hide a streamed update. Functions are compared by identity.
 */
function sameBlockData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && sameBlockData(left[key], right[key]));
}

const TranscriptBlock = memo(function TranscriptBlock({
  block, turnCopyText, onAnswer, onStopAndSend, onOpenAttachment, highlightQuery,
  selectMode, selected, onToggle, onBlockRender, showAuthors, viewerUserId,
}: TranscriptBlockProps) {
  const request = block.type === "bubble" ? block.request : undefined;
  const id = block.type === "bubble" ? block.message.id : null;
  const answer = useCallback((_message: unknown, value: unknown) => {
    if (request) onAnswer?.(request.requestId, answerFor(request, value));
  }, [request, onAnswer]);
  const toggle = useCallback(() => {
    if (id !== null) onToggle?.(id);
  }, [id, onToggle]);
  if (block.type === "process") {
    return <AgentProgress messages={block.messages} running={block.running} highlightQuery={highlightQuery} onBlockRender={onBlockRender} onOpenAttachment={onOpenAttachment} />;
  }
  if (block.type === "raw-request") return <RawRequest request={block.request} />;
  return <>
    <AgentTranscriptBubble
      message={block.message}
      turnCopyText={turnCopyText}
      showAuthors={showAuthors}
      viewerUserId={viewerUserId}
      streaming={block.streaming}
      stopped={block.stopped}
      highlightQuery={highlightQuery}
      onNativeAnswer={request && onAnswer ? answer : undefined}
      onOpenAttachment={onOpenAttachment}
      selectMode={selectMode}
      selected={selected}
      onSelectToggle={onToggle ? toggle : undefined}
      onBlockRender={onBlockRender}
    />
    {block.queued && <QueuedLine turn={block.queued} onStopAndSend={onStopAndSend} />}
  </>;
}, (previous, next) =>
  previous.turnCopyText === next.turnCopyText &&
  previous.showAuthors === next.showAuthors &&
  previous.viewerUserId === next.viewerUserId &&
  previous.highlightQuery === next.highlightQuery &&
  previous.onAnswer === next.onAnswer &&
  previous.onStopAndSend === next.onStopAndSend &&
  previous.onOpenAttachment === next.onOpenAttachment &&
  previous.selectMode === next.selectMode &&
  previous.selected === next.selected &&
  previous.onToggle === next.onToggle &&
  previous.onBlockRender === next.onBlockRender &&
  sameBlockData(previous.block, next.block),
);
