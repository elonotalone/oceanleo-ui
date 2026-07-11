"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AgentMessage } from "../lib/agent";
import {
  buildAgentProgressActions,
  type AgentProgressAction,
} from "../lib/agent-progress";
import { Markdown } from "./Markdown";
import { useUI } from "../i18n/ui/useUI";


function messageSummary(message: AgentMessage): string {
  const fromMeta = String(message.meta?.summary || "").trim();
  if (fromMeta) return fromMeta;
  const raw = (message.content || "")
    .replace(/^\s*(Thought|Analysis|Reasoning)\s*:\s*/i, "")
    .replace(/<code>[\s\S]*?<\/code>|```[\s\S]*?```/gi, "")
    .trim();
  return raw.split(/\n+/).find(Boolean)?.slice(0, 180) || "执行并检查结果";
}


function normalizeProcessMarkdown(value: string): string {
  return (value || "")
    .replace(/<code>\s*/gi, "```python\n")
    .replace(/\s*<\/code>/gi, "\n```")
    .trim();
}


function normalizePlanMarkdown(value: string): string {
  const raw = normalizeProcessMarkdown(value);
  const wrapped = /^[\s\S]*?\n```\s*\n?([\s\S]*?)\n?```\s*$/.exec(raw);
  return (wrapped?.[1] || raw).trim();
}


function planSteps(message: AgentMessage | undefined): string[] {
  if (!message || !Array.isArray(message.meta?.plan_steps)) return [];
  return (message.meta.plan_steps as unknown[])
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim())
    .slice(0, 8);
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
  const plans = messages.filter(
    (message) => message.kind === "plan" || message.meta?.plan === true,
  );
  const latestPlan = plans[plans.length - 1];
  const steps = planSteps(latestPlan);
  const actions = useMemo(
    () => buildAgentProgressActions(messages),
    [messages],
  );
  const [expanded, setExpanded] = useState(running);
  const wasRunning = useRef(running);

  useEffect(() => {
    if (running) setExpanded(true);
    if (wasRunning.current && !running) setExpanded(false);
    wasRunning.current = running;
  }, [running]);

  const latestAction = actions[actions.length - 1];
  const currentLabel =
    latestAction?.labels[0] ||
    (latestAction?.analysis ? messageSummary(latestAction.analysis) : "") ||
    (running ? tt("正在制定计划…") : tt("任务过程"));
  const title = running ? tt("正在执行任务") : tt("任务执行记录");
  const countText = steps.length
    ? tt("计划 {plans} 项 · 执行 {actions} 步", {
        plans: steps.length,
        actions: actions.length,
      })
    : tt("已执行 {count} 步", { count: actions.length });

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white/85 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-stone-50/80"
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
            running ? "bg-sky-50" : "bg-emerald-50"
          }`}
        >
          {running ? (
            <span className="v-spinner h-3.5 w-3.5" style={{ color: accent }} />
          ) : (
            <svg
              className="h-4 w-4 text-emerald-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-stone-800">{title}</span>
            <span className="text-[11px] text-stone-400">{countText}</span>
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-stone-500">
            {currentLabel}
          </span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-stone-100 px-3.5 pb-3.5 pt-3">
          {latestPlan && (
            <div className="mb-3 rounded-xl bg-stone-50/90 px-3 py-2.5">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-stone-700">
                <span
                  className="grid h-5 w-5 place-items-center rounded-md text-[11px] text-white"
                  style={{ background: accent }}
                >
                  {plans.length > 1 ? "↻" : "✓"}
                </span>
                {plans.length > 1 ? tt("当前计划") : tt("执行计划")}
              </div>
              {steps.length > 0 && (
                <ol className="space-y-1.5">
                  {steps.map((step, index) => (
                    <li
                      key={`${index}-${step}`}
                      className="flex items-start gap-2 text-[12px] leading-relaxed text-stone-600"
                    >
                      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-stone-300 bg-white text-[9px] font-semibold text-stone-500">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              <Foldout label={tt("查看规划依据")}>
                <Markdown className="text-[12px] leading-relaxed text-stone-600">
                  {normalizePlanMarkdown(latestPlan.content)}
                </Markdown>
              </Foldout>
            </div>
          )}

          <div className="space-y-0.5">
            {actions.map((action, index) => (
              <ActionRow
                key={action.id}
                action={action}
                isLast={index === actions.length - 1}
                accent={accent}
              />
            ))}
            {actions.length === 0 && running && (
              <div className="flex items-center gap-2 py-2 text-[12px] text-stone-400">
                <span className="v-spinner h-3.5 w-3.5" />
                {tt("正在分析任务并准备第一步…")}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}


function ActionRow({
  action,
  isLast,
  accent,
}: {
  action: AgentProgressAction;
  isLast: boolean;
  accent: string;
}) {
  const tt = useUI();
  const analysis = action.analysis;
  const summary = analysis ? messageSummary(analysis) : "";
  const label = action.labels.join(" · ") || summary || tt("执行步骤");
  const detail = normalizeProcessMarkdown(analysis?.content || "");
  const collapsed = Boolean(
    analysis?.meta?.default_collapsed ||
      detail.length > 260 ||
      detail.includes("```") ||
      detail.includes("<code>"),
  );
  const showInlineDetail =
    Boolean(detail) && !collapsed && detail.trim() !== label.trim();

  return (
    <div className="relative flex gap-2.5 pb-2.5 last:pb-0">
      {!isLast && (
        <span className="absolute bottom-0 left-[7px] top-4 w-px bg-stone-200" />
      )}
      <span className="relative mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-50">
        <svg
          className="h-2.5 w-2.5 text-emerald-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
        >
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[12px] font-medium leading-relaxed text-stone-700">
            {label}
          </span>
          <span className="shrink-0 text-[10px] text-stone-300">
            {String(action.index).padStart(2, "0")}
          </span>
        </div>
        {collapsed && detail && (
          <Foldout label={tt("查看分析与代码")} compact>
            <Markdown className="text-[12px] leading-relaxed text-stone-600">
              {detail}
            </Markdown>
          </Foldout>
        )}
        {showInlineDetail && (
          <div className="mt-1 border-l-2 pl-2" style={{ borderColor: `${accent}33` }}>
            <Markdown className="text-[12px] leading-relaxed text-stone-500">
              {detail}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}


function Foldout({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={compact ? "mt-1" : "mt-2"}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-400 transition hover:text-stone-600"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-stone-200 bg-white p-2.5">
          {children}
        </div>
      )}
    </div>
  );
}
