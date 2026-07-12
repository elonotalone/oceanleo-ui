"use client";

import { useMemo } from "react";
import type { AgentMessage } from "../lib/agent";
import {
  buildAgentProgressActions,
  type AgentProgressAction,
} from "../lib/agent-progress";
import { Markdown } from "./Markdown";
import { useUI } from "../i18n/ui/useUI";

function summary(message: AgentMessage): string {
  const fromMeta = String(message.meta?.summary || "").trim();
  if (fromMeta) return fromMeta;
  return (
    (message.content || "")
      .replace(/^\s*(Thought|Analysis|Reasoning)\s*:\s*/i, "")
      .replace(/<code>[\s\S]*?<\/code>|```[\s\S]*?```/gi, "")
      .trim()
      .split(/\n+/)
      .find(Boolean)
      ?.slice(0, 180) || "执行并检查结果"
  );
}

function normalize(value: string): string {
  return (value || "")
    .replace(/<code>\s*/gi, "```python\n")
    .replace(/\s*<\/code>/gi, "\n```")
    .trim();
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

  return (
    <div className="my-1 border-l border-stone-200 pl-3">
      {latestPlan && (
        <details className="group mb-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[12px] text-stone-400 transition hover:text-stone-600">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: accent }}
            />
            <span>
              {plans.length > 1 ? tt("已更新计划") : tt("已制定计划")}
              {steps.length ? ` · ${steps.length} ${tt("步")}` : ""}
            </span>
            <Chevron />
          </summary>
          <div className="pb-1 pl-3 text-[12px] leading-relaxed text-stone-400">
            {steps.length > 0 && (
              <ol className="mb-1.5 list-decimal space-y-0.5 pl-4">
                {steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
            )}
            <Markdown className="text-[12px] leading-relaxed text-stone-400">
              {normalize(latestPlan.content)}
            </Markdown>
          </div>
        </details>
      )}
      <div className="space-y-0.5">
        {actions.map((action) => (
          <ProcessRow key={action.id} action={action} accent={accent} />
        ))}
        {running && (
          <div className="flex items-center gap-2 py-1 text-[12px] text-stone-400">
            <span className="v-spinner h-3 w-3" style={{ color: accent }} />
            {actions.length
              ? tt("正在继续执行…")
              : tt("正在分析任务并准备第一步…")}
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessRow({
  action,
  accent,
}: {
  action: AgentProgressAction;
  accent: string;
}) {
  const analysis = action.analysis;
  const label =
    action.labels.join(" · ") || (analysis ? summary(analysis) : "") || "执行步骤";
  const detail = normalize(analysis?.content || "");
  if (!detail || detail.trim() === label.trim()) {
    return (
      <div className="flex items-center gap-2 py-1 text-[12px] text-stone-400">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full opacity-70"
          style={{ background: accent }}
        />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[12px] text-stone-400 transition hover:text-stone-600">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full opacity-70"
          style={{ background: accent }}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Chevron />
      </summary>
      <div className="pb-1 pl-3">
        <Markdown className="text-[12px] leading-relaxed text-stone-400">
          {detail}
        </Markdown>
      </div>
    </details>
  );
}

function Chevron() {
  return (
    <svg
      className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
