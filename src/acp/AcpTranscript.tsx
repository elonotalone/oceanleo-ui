"use client";

// The task page as a standard ACP client (contract §2.5, P4): stored rows in, the conversation out.
// Program differences live in reduce.ts / messages.ts; this file only renders. An empty row list renders nothing.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AgentProgress } from "../shell/AgentProgress";
import { AgentTranscriptBubble } from "../shell/AgentTranscriptBubble";
import { useUI } from "../i18n/ui/useUI";
import { cursorAnswerResult, isCursorQuestion, resendable, viewBlocks, type AcpBlock, type AcpLabels } from "./messages";
import { reduceRows } from "./reduce";
import type { AcpBackgroundTask, AcpFrameRow, AcpPermission, AcpTurn, JsonRpcId } from "./types";

export type AcpTranscriptProps = {
  rows: AcpFrameRow[];
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
  return ["completed", "complete", "failed", "stopped", "cancelled", "canceled", "terminated"].includes(state.toLowerCase());
}

function elapsedLabel(startedAt: string, now: number): string {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "0s";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/** Live AIR tasks sit above the composer; terminal states render on their tool row. */
export function AcpBackgroundTaskStrip({ tasks, onStopTask }: { tasks: AcpBackgroundTask[]; onStopTask?: (ref: string) => void }) {
  const tt = useUI();
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const running = tasks.filter((task) => !finishedBackgroundState(task.state));
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
  if (!running.length) return null;

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
    : tt("{count} 个后台任务运行中", { count: running.length });
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
          {running.length > 1 && <span aria-hidden="true" className="shrink-0 text-[11px] text-stone-400">{expanded ? "⌃" : "⌄"}</span>}
        </button>
        {running.length === 1 && stop(first)}
      </div>
      {expanded && (
        <div id={listId} data-acp-background-list="" role="list" className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-stone-50/70 px-2 py-1.5">
          {running.map((task) => (
            <div key={task.id} data-acp-background-task={task.id} data-task-state={task.state} role="listitem" className="flex min-w-0 items-start gap-2 text-[12px] text-stone-500">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-stone-600">{nameFor(task)}</span>
                  <span className="shrink-0 text-stone-400">{tt("用时 {elapsed}", { elapsed: elapsedLabel(task.startedAt, now) })}</span>
                </div>
                {task.summary && <p className="whitespace-pre-wrap text-stone-400">{task.summary}</p>}
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

export function AcpTranscript({ rows, program, onAnswer, onStopTask, highlightQuery, onStopAndSend, select }: AcpTranscriptProps) {
  const tt = useUI();
  const view = useMemo(() => reduceRows(rows, program), [rows, program]);
  const labels: AcpLabels = useMemo(
    () => ({
      gap: (count) => tt("此处省略 {count} 条", { count }),
      oversize: (bytes) => tt("此处一行输出过大（{bytes} 字节），未显示", { bytes }),
      exit: (code, signal) => tt("程序已退出（{detail}）", { detail: signal ? `signal ${signal}` : `code ${code ?? "?"}` }),
      stopReason: (reason) => tt("本轮结束：{reason}", { reason }),
      cancelled: tt("已停止生成"),
      permissionPrompt: tt("请确认后继续。"),
      backgroundTask: (name, state) => {
        const stateText = state === "completed" || state === "complete" ? tt("已完成")
          : state === "failed" ? tt("已失败")
            : state === "stopped" || state === "cancelled" || state === "canceled" ? tt("已停止")
              : tt(state);
        return `${tt("后台任务")} · ${name} · ${stateText}`;
      },
    }),
    [tt],
  );
  const blocks = useMemo(() => viewBlocks(view, labels), [view, labels]);
  if (!rows.length) return null;
  const render = (block: AcpBlock) => {
    if (block.type === "process") {
      return <AgentProgress key={block.key} messages={block.messages} running={block.running} highlightQuery={highlightQuery} />;
    }
    if (block.type === "raw-request") return <RawRequest key={block.key} request={block.request} />;
    const request = block.request;
    const { id, kind } = block.message;
    // A turn's error / stop notice carries its prompt's id: only text bubbles are words.
    const pick = select && kind === "text" && select.pickable.has(id) ? select : null;
    return (
      <Fragment key={block.key}>
        <AgentTranscriptBubble
          message={block.message}
          streaming={block.streaming}
          stopped={block.stopped}
          highlightQuery={highlightQuery}
          onNativeAnswer={request && onAnswer ? (_message, answer) => onAnswer(request.requestId, answerFor(request, answer)) : undefined}
          selectMode={Boolean(pick)}
          selected={pick ? pick.selected.has(id) : false}
          onSelectToggle={pick ? () => pick.onToggle(id) : undefined}
        />
        {block.queued && <QueuedLine turn={block.queued} onStopAndSend={onStopAndSend} />}
      </Fragment>
    );
  };
  return (
    <div data-acp-transcript="" data-acp-program={program} className="space-y-3">
      {blocks.map(render)}
    </div>
  );
}
