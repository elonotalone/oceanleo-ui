"use client";

// The ONE process timeline for the task chat (2026-10-30 overhaul, W3).
//
// Serves the OceanLeo cloud agent and the native programs (Claude Code / Codex /
// Cursor / Hermes via map-dialog) alike: a block is one run of consecutive
// process in real order — thoughts (incl. streamed `meta.reasoning`), tools with
// their full detail, plans with status. Words to the user are never in here
// (2026-10-31): they end the block and render as normal messages in place.
//
// Fold (operator ruling): while the block is live it is open; once text starts
// after it (or the turn finishes) it collapses to one line ("思考 12 秒 · 9 个
// 步骤"). The left rail darkens on hover and a click on it folds the module.
// Each entry also folds on its own; selecting text never collapses it.
// Rendered with the host's own styling (stone palette, accent); nothing here is
// borrowed from agent-dialog components or server-page/tone.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentMessage } from "../lib/agent";
import {
  buildProcessEntries,
  normalizeProcessText,
  summarizeProcess,
  type ProcessEntry,
  type ProcessPlanItem,
  type ProcessSummary,
  type ProcessToolStatus,
} from "../lib/agent-progress";
import { lineDiff } from "./cloud-computer/agent-dialog/diff-lines";
import { Markdown, TypewriterMarkdown } from "./Markdown";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

type ToolEntry = Extract<ProcessEntry, { type: "tool" }>;
type ThoughtEntry = Extract<ProcessEntry, { type: "thought" }>;
type PlanEntry = Extract<ProcessEntry, { type: "plan" }>;

const WRAP = "min-w-0 break-words [overflow-wrap:anywhere]";
const ROW =
  "flex w-full min-w-0 items-center gap-2 py-0.5 text-left text-[12px] text-stone-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-stone-600";
const PRE_BOX =
  "max-h-64 overflow-auto rounded-md bg-stone-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-stone-600";

function collapseUnlessSelecting(close: () => void) {
  if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
  close();
}

/**
 * Open while `live`, closed when it stops being live — unless the user has
 * toggled it, in which case their choice stands.
 */
function useLiveFold(live: boolean, initial = live): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(initial);
  const touched = useRef(false);
  const previous = useRef(live);
  useEffect(() => {
    if (previous.current === live) return;
    previous.current = live;
    if (!touched.current) setOpen(live);
  }, [live]);
  const toggle = () => {
    touched.current = true;
    setOpen((value) => !value);
  };
  const close = () => {
    touched.current = true;
    setOpen(false);
  };
  return [open, toggle, close];
}

function seconds(ms: number): number {
  return Math.max(1, Math.round(ms / 1000));
}

function summaryParts(tt: UITranslate, summary: ProcessSummary): ReactNode[] {
  const parts: ReactNode[] = [];
  if (summary.ms !== null) {
    parts.push(tt("思考 {seconds} 秒", { seconds: seconds(summary.ms) }));
  } else if (summary.thoughts > 0) {
    parts.push(tt("思考"));
  } else if (summary.tools === 0 && summary.plans > 0) {
    parts.push(tt("计划"));
  }
  if (summary.tools > 0) parts.push(tt("{count} 个步骤", { count: summary.tools }));
  if (summary.failed > 0) {
    parts.push(
      <span key="failed" className="text-rose-500" data-agent-process-failed="">
        {tt("{count} 个失败", { count: summary.failed })}
      </span>,
    );
  }
  if (summary.usagePct !== null) {
    parts.push(
      <span key="usage" className="text-stone-300" data-agent-process-usage="">
        {tt("用量 {pct}%", { pct: summary.usagePct })}
      </span>,
    );
  }
  if (!parts.length) parts.push(tt("任务过程"));
  return parts.flatMap((part, index) => (index ? [" · ", part] : [part]));
}

export function AgentProgress({
  messages,
  running,
  accent = "#4f46e5",
}: {
  messages: AgentMessage[];
  running: boolean;
  accent?: string;
}) {
  const tt = useUI();
  const entries = useMemo(() => buildProcessEntries(messages), [messages]);
  const summary = useMemo(() => summarizeProcess(messages, entries), [messages, entries]);
  const [open, toggle, close] = useLiveFold(running);
  if (!entries.length) return null;
  let latestPlan = "";
  for (const entry of entries) if (entry.type === "plan") latestPlan = entry.key;
  const last = entries.length - 1;

  return (
    <div
      data-agent-process=""
      data-agent-process-state={running ? "running" : "done"}
      className={`my-1 max-w-full ${WRAP}`}
    >
      <button
        type="button"
        aria-expanded={open}
        data-agent-process-toggle=""
        onClick={toggle}
        className={ROW}
      >
        {running ? (
          <span className="v-spinner h-3 w-3 shrink-0" style={{ color: accent }} />
        ) : (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full opacity-70"
            style={{ background: accent }}
          />
        )}
        <span className="min-w-0 flex-1 truncate" data-agent-process-summary="">
          {summaryParts(tt, summary)}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className={`relative mt-0.5 pl-4 ${WRAP}`}>
          {/* The rail: darkens on hover; clicking it folds the whole module. */}
          <button
            type="button"
            aria-expanded={open}
            aria-label={tt("收起")}
            title={tt("收起")}
            data-agent-process-rail=""
            onClick={close}
            className="group absolute inset-y-0 left-0 flex w-3 cursor-pointer justify-center"
          >
            <span
              aria-hidden="true"
              className="h-full w-px bg-stone-200 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-hover:bg-stone-400"
            />
          </button>
          <div data-agent-process-entries="" className={`space-y-0.5 ${WRAP}`}>
            {entries.map((entry, index) => {
              const live = running && (index === last || (entry.type === "thought" && entry.streaming));
              if (entry.type === "thought") return <ThoughtView key={entry.key} entry={entry} live={live} />;
              if (entry.type === "tool") {
                return <ToolView key={entry.key} entry={entry} running={running} accent={accent} />;
              }
              return (
                <PlanView
                  key={entry.key}
                  entry={entry}
                  live={running && entry.key === latestPlan}
                  accent={accent}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ThoughtView({ entry, live }: { entry: ThoughtEntry; live: boolean }) {
  const tt = useUI();
  const [open, toggle, close] = useLiveFold(live);
  const label = entry.ms !== null ? tt("思考 {seconds} 秒", { seconds: seconds(entry.ms) }) : tt("思考");
  return (
    <div data-agent-process-thought="" data-streaming={entry.streaming ? "true" : undefined}>
      <button type="button" aria-expanded={open} onClick={toggle} className={ROW}>
        <span aria-hidden="true" className="w-3 shrink-0 text-center">…</span>
        <span className="shrink-0">{label}</span>
        {!open && entry.summary ? (
          <span className="min-w-0 flex-1 truncate text-stone-300">{entry.summary}</span>
        ) : (
          <span className="flex-1" />
        )}
        <Chevron open={open} />
      </button>
      {open && (
        <div
          data-agent-process-thought-body=""
          className={`cursor-text pb-1 pl-5 ${WRAP}`}
          onClick={() => collapseUnlessSelecting(close)}
        >
          <TypewriterMarkdown
            content={normalizeProcessText(entry.text)}
            active={entry.streaming}
            className="text-[12px] leading-relaxed text-stone-500"
          />
        </div>
      )}
    </div>
  );
}

function toolMark(kind: string): string {
  switch (kind) {
    case "read":
      return "▤";
    case "edit":
      return "✎";
    case "delete":
      return "✕";
    case "move":
      return "→";
    case "search":
      return "⌕";
    case "execute":
      return "▸";
    case "think":
      return "…";
    case "fetch":
      return "↓";
    case "switch_mode":
      return "⇄";
    default:
      return "•";
  }
}

function statusText(tt: UITranslate, status: ProcessToolStatus, running: boolean): string {
  if (status === "failed") return tt("失败");
  if (status === "done") return tt("完成");
  if (!running) return "";
  return status === "running" ? tt("运行中") : tt("等待");
}

function prettyPreview(value: string): string {
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return value;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

function ToolView({
  entry,
  running,
  accent,
}: {
  entry: ToolEntry;
  running: boolean;
  accent: string;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const status = statusText(tt, entry.status, running);
  const title = entry.title || tt("执行步骤");
  return (
    <div data-agent-process-tool={entry.kind} data-tool-status={entry.status}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={ROW}
      >
        <span aria-hidden="true" className="w-3 shrink-0 text-center">{toolMark(entry.kind)}</span>
        <span className="min-w-0 flex-1 truncate text-stone-500" data-agent-process-tool-title="">
          {title}
        </span>
        {status && (
          <span
            data-agent-process-tool-status=""
            className={`shrink-0 ${entry.status === "failed" ? "text-rose-500" : ""}`}
            style={entry.status === "running" || entry.status === "pending" ? { color: accent } : undefined}
          >
            {status}
          </span>
        )}
        <Chevron open={open} />
      </button>
      {!open && entry.error && (
        <p className="truncate pl-5 text-[11px] text-rose-500" data-agent-process-tool-error-line="">
          {entry.error}
        </p>
      )}
      {open && (
        <div
          data-agent-process-tool-body=""
          className={`cursor-text space-y-1.5 pb-1.5 pl-5 text-[12px] text-stone-500 ${WRAP}`}
          onClick={() => collapseUnlessSelecting(() => setOpen(false))}
        >
          <p className={`whitespace-pre-wrap text-stone-600 ${WRAP}`}>{title}</p>
          {entry.content.map((part, index) => {
            if (part.type === "diff") {
              return (
                <div key={index} data-agent-process-diff={part.path} className="min-w-0">
                  {part.path && <p className="break-all font-mono text-[11px] text-stone-400">{part.path}</p>}
                  <div className="max-h-80 overflow-auto rounded-md bg-stone-50 py-1 font-mono text-[11px] leading-relaxed">
                    {lineDiff(part.oldText, part.newText).map((row, rowIndex) => (
                      <div
                        key={rowIndex}
                        data-diff-op={row.op}
                        className={`whitespace-pre-wrap break-all px-2 ${
                          row.op === "+"
                            ? "bg-emerald-50 text-emerald-700"
                            : row.op === "-"
                              ? "bg-rose-50 text-rose-700"
                              : "text-stone-500"
                        }`}
                      >
                        {row.op === "+" ? "+ " : row.op === "-" ? "- " : "  "}
                        {row.text}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (part.type === "terminal") {
              return (
                <pre key={index} data-agent-process-terminal="" className={`whitespace-pre ${PRE_BOX}`}>
                  {part.output}
                </pre>
              );
            }
            return (
              <pre key={index} data-agent-process-tool-text="" className={`whitespace-pre-wrap break-all ${PRE_BOX}`}>
                {part.text}
              </pre>
            );
          })}
          {entry.locations.length > 0 && (
            <ul data-agent-process-locations="" className="space-y-0.5 font-mono text-[11px] text-stone-400">
              {entry.locations.map((loc, index) => (
                <li key={`${loc.path}:${loc.line ?? ""}:${index}`} className="break-all">
                  {typeof loc.line === "number" ? `${loc.path}:${loc.line}` : loc.path}
                </li>
              ))}
            </ul>
          )}
          {entry.args && (
            <div data-agent-process-args="">
              <p className="text-[11px] text-stone-400">{tt("参数")}</p>
              <pre className={`whitespace-pre-wrap break-all ${PRE_BOX}`}>{prettyPreview(entry.args)}</pre>
            </div>
          )}
          {entry.result && (
            <div data-agent-process-result="">
              <p className="text-[11px] text-stone-400">{tt("结果")}</p>
              <pre className={`whitespace-pre-wrap break-all ${PRE_BOX}`}>{prettyPreview(entry.result)}</pre>
            </div>
          )}
          {entry.error && (
            <p data-agent-process-tool-error="" className={`whitespace-pre-wrap text-rose-600 ${WRAP}`}>
              {entry.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function planMark(item: ProcessPlanItem, index: number): string {
  if (item.status === "completed") return "☑";
  if (item.status === "in_progress") return "–";
  if (item.status === "pending") return "☐";
  return `${index + 1}.`;
}

function PlanView({ entry, live, accent }: { entry: PlanEntry; live: boolean; accent: string }) {
  const tt = useUI();
  const [open, toggle, close] = useLiveFold(live);
  const known = entry.items.some((item) => item.status);
  const done = entry.items.filter((item) => item.status === "completed").length;
  const count = entry.items.length ? (known ? `${done}/${entry.items.length}` : String(entry.items.length)) : "";
  return (
    <div data-agent-process-plan="" data-plan-revision={entry.revision}>
      <button type="button" aria-expanded={open} onClick={toggle} className={ROW}>
        <span aria-hidden="true" className="w-3 shrink-0 text-center" style={{ color: accent }}>☰</span>
        <span className="min-w-0 flex-1 truncate">
          {entry.revision > 0 ? tt("计划已更新") : tt("计划")}
          {count ? ` · ${count}` : ""}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div
          data-agent-process-plan-body=""
          className={`cursor-text pb-1 pl-5 text-[12px] leading-relaxed text-stone-500 ${WRAP}`}
          onClick={() => collapseUnlessSelecting(close)}
        >
          {entry.items.length > 0 && (
            <ul className="space-y-0.5">
              {entry.items.map((item, index) => (
                <li
                  key={`${index}-${item.content}`}
                  data-plan-status={item.status || undefined}
                  className="flex min-w-0 items-start gap-2"
                >
                  <span aria-hidden="true" className="shrink-0 text-stone-400">{planMark(item, index)}</span>
                  <span
                    className={`min-w-0 flex-1 ${WRAP} ${item.status === "completed" ? "text-stone-400" : ""}`}
                  >
                    {item.content}
                  </span>
                  {item.priority && (
                    <span className="shrink-0 text-[11px] text-stone-300">
                      {item.priority === "high"
                        ? tt("优先级高")
                        : item.priority === "low"
                          ? tt("优先级低")
                          : tt("优先级中")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {entry.text && (
            <Markdown className="mt-1 text-[12px] leading-relaxed text-stone-400">{entry.text}</Markdown>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${open ? "rotate-90" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
