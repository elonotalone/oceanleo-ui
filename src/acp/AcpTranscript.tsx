"use client";

// The task page as a standard ACP client (contract §2.5, P4): stored rows in, the conversation out.
// Program differences live in reduce.ts / messages.ts; this file only renders. An empty row list renders nothing.

import { useMemo } from "react";
import { AgentProgress } from "../shell/AgentProgress";
import { AgentTranscriptBubble } from "../shell/AgentTranscriptBubble";
import { useUI } from "../i18n/ui/useUI";
import { cursorAnswerResult, isCursorQuestion, viewBlocks, type AcpBlock, type AcpLabels } from "./messages";
import { reduceRows } from "./reduce";
import type { AcpBackgroundTask, AcpFrameRow, AcpPermission, JsonRpcId } from "./types";

export type AcpTranscriptProps = {
  rows: AcpFrameRow[];
  program: string;
  /** Send `result` as the JSON-RPC response to the agent's request `requestId`. */
  onAnswer?: (requestId: JsonRpcId, result: unknown) => void;  // omitted while the page's socket is down: cards render, not clickable
  /** Stop one background task (Claude `asyncTaskId`). Absent: no per-task stop buttons. */
  onStopTask?: (ref: string) => void;
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

function BackgroundTasks({ tasks, onStopTask }: { tasks: AcpBackgroundTask[]; onStopTask?: (ref: string) => void }) {
  const tt = useUI();
  return (
    <div data-acp-background-tasks="" className="space-y-1 border-l-2 border-stone-200 pl-3">
      {tasks.map((task) => (
        <div key={task.id} data-acp-background-task={task.id} data-task-state={task.state} className="flex min-w-0 items-start gap-2 text-[12px] text-stone-500">
          <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
            <span className="text-stone-600">{task.description || task.name || task.id}</span>
            <span className="text-stone-400">{` · ${task.state}`}</span>
            {task.summary && <p className="whitespace-pre-wrap text-stone-400">{task.summary}</p>}
          </div>
          {onStopTask && task.canStop && task.state === "running" && (
            <button
              type="button"
              data-acp-stop-task={task.id}
              onClick={() => onStopTask(task.id)}
              className="shrink-0 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] text-stone-600 hover:bg-stone-50"
            >
              {tt("停止")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function AcpTranscript({ rows, program, onAnswer, onStopTask }: AcpTranscriptProps) {
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
    }),
    [tt],
  );
  const blocks = useMemo(() => viewBlocks(view, labels), [view, labels]);
  if (!rows.length) return null;
  const render = (block: AcpBlock) => {
    if (block.type === "process") return <AgentProgress key={block.key} messages={block.messages} running={block.running} />;
    if (block.type === "raw-request") return <RawRequest key={block.key} request={block.request} />;
    const request = block.request;
    return (
      <AgentTranscriptBubble
        key={block.key}
        message={block.message}
        streaming={block.streaming}
        stopped={block.stopped}
        onNativeAnswer={request && onAnswer ? (_message, answer) => onAnswer(request.requestId, answerFor(request, answer)) : undefined}
      />
    );
  };
  return (
    <div data-acp-transcript="" data-acp-program={program} className="space-y-3">
      {blocks.map(render)}
      {view.backgroundTasks.length > 0 && <BackgroundTasks tasks={view.backgroundTasks} onStopTask={onStopTask} />}
    </div>
  );
}
