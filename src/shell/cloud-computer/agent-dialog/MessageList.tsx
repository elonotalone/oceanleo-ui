"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { lineDiff } from "./diff-lines";
import { noticeAction, noticeCopy } from "./notice";
import { isWsProgram } from "./parse";
import { normalizeQuestions } from "./questions";
import { AgentText } from "./text";
import type { AgentDialogController, AgentDialogMessage, ToolCard, TurnItem } from "./types";

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

function statusLabel(tt: ReturnType<typeof useUI>, status: string): string {
  if (status === "completed") return tt("完成");
  if (status === "failed") return tt("失败");
  if (status === "in_progress") return tt("进行中");
  return tt("等待");
}

function statusClass(status: string): string {
  if (status === "completed") return "text-emerald-300";
  if (status === "failed") return "text-rose-300";
  if (status === "in_progress") return "text-sky-300";
  return "text-neutral-500";
}

function permissionClass(kind: string): string {
  const base = "rounded-lg px-2.5 py-1 text-[12px]";
  if (kind === "allow_always") return `${base} bg-emerald-600 text-white`;
  if (kind === "allow_once") return `${base} border border-emerald-700 text-emerald-200`;
  if (kind === "reject_always") return `${base} bg-rose-700 text-white`;
  if (kind === "reject_once") return `${base} border border-amber-700 text-amber-200`;
  return `${base} border border-neutral-700 text-neutral-200`;
}

function ToolView({ tool }: { tool: ToolCard }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  return (
    <div data-oceanleo-cc-tool={tool.id} data-oceanleo-cc-tool-status={tool.status}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left text-[12px]"
      >
        <span aria-hidden="true" className="text-neutral-500">
          {toolMark(tool.kind)}
        </span>
        <span className="min-w-0 flex-1 truncate text-neutral-100">{tool.title || tool.kind}</span>
        <span className={statusClass(tool.status)}>{statusLabel(tt, tool.status)}</span>
        <span className="text-neutral-500">{open ? tt("收起") : tt("展开")}</span>
      </button>
      {open ? (
        <div className="mt-1 space-y-2 pl-4">
          {tool.content.map((part, index) => {
            if (part.type === "diff") {
              return (
                <div key={index} data-oceanleo-cc-diff={part.path} className="font-mono text-[11px]">
                  <div className="text-neutral-500">{part.path}</div>
                  {lineDiff(part.old_text, part.new_text).map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      data-oceanleo-cc-diff-op={row.op}
                      className={
                        row.op === "+" ? "text-green-400" : row.op === "-" ? "text-red-400" : "text-neutral-500"
                      }
                    >
                      {row.op === "+" ? "+ " : row.op === "-" ? "- " : "  "}
                      {row.text}
                    </div>
                  ))}
                </div>
              );
            }
            const body = part.type === "terminal" ? part.output : part.text;
            return (
              <pre
                key={index}
                data-oceanleo-cc-tool-body={part.type}
                className="whitespace-pre-wrap font-mono text-[11px] text-neutral-300"
              >
                {body}
              </pre>
            );
          })}
          {tool.locations.length > 0 ? (
            <ul data-oceanleo-cc-tool-locations="" className="text-[11px] text-neutral-400">
              {tool.locations.map((loc) => (
                <li key={`${loc.path}:${loc.line ?? ""}`}>
                  {typeof loc.line === "number" ? `${loc.path}:${loc.line}` : loc.path}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QuestionView({
  item,
  onSubmit,
}: {
  item: Extract<TurnItem, { kind: "question" }>;
  onSubmit: (id: string, values: Record<string, string>) => void;
}) {
  const tt = useUI();
  const parsed = normalizeQuestions(item.questions);
  const [values, setValues] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  if (item.submitted) {
    return (
      <p data-oceanleo-cc-question={item.questionId} className="text-[12px] text-neutral-400">
        {tt("已经提交")}
      </p>
    );
  }
  if (parsed.mode === "text") {
    return (
      <form
        data-oceanleo-cc-question={item.questionId}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onSubmit(item.questionId, { text });
        }}
      >
        <p className="text-[13px] text-neutral-100">{item.title || tt("需要你回答")}</p>
        <textarea
          data-oceanleo-cc-question-input=""
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder={tt("写下回答")}
          className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none"
        />
        <button
          type="submit"
          data-oceanleo-cc-question-submit=""
          className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-900"
        >
          {tt("提交")}
        </button>
      </form>
    );
  }
  const ready = parsed.fields.every((field) => (values[field.id] ?? "").trim() !== "");
  return (
    <form
      data-oceanleo-cc-question={item.questionId}
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit(item.questionId, values);
      }}
    >
      {item.title ? <p className="text-[13px] text-neutral-100">{item.title}</p> : null}
      {parsed.fields.map((field) => (
        <fieldset key={field.id} className="space-y-1">
          <legend className="text-[12px] text-neutral-300">{field.title}</legend>
          {field.options.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {field.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-oceanleo-cc-question-option={option.id}
                  aria-pressed={values[field.id] === option.id}
                  onClick={() => setValues((current) => ({ ...current, [field.id]: option.id }))}
                  className={`rounded-lg px-2 py-1 text-[12px] ${
                    values[field.id] === option.id
                      ? "bg-neutral-100 text-neutral-900"
                      : "border border-neutral-700 text-neutral-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <input
              value={values[field.id] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.id]: event.target.value }))
              }
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-[12px] text-neutral-100 outline-none"
            />
          )}
        </fieldset>
      ))}
      <button
        type="submit"
        data-oceanleo-cc-question-submit=""
        disabled={!ready}
        className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-900 disabled:opacity-40"
      >
        {tt("提交")}
      </button>
    </form>
  );
}

function ItemView({ item, dialog }: { item: TurnItem; dialog: AgentDialogController }) {
  const tt = useUI();
  if (item.kind === "assistant") {
    return (
      <div data-oceanleo-cc-assistant="">
        <AgentText text={item.text} />
      </div>
    );
  }
  if (item.kind === "thought") {
    return (
      <details data-oceanleo-cc-thought="" className="text-[12px] text-neutral-500">
        <summary>{tt("思考")}</summary>
        <AgentText text={item.text} className="whitespace-pre-wrap text-[12px] text-neutral-500" />
      </details>
    );
  }
  if (item.kind === "tool") return <ToolView tool={item.tool} />;
  if (item.kind === "plan") {
    return (
      <div data-oceanleo-cc-plan="">
        <p className="text-[12px] text-neutral-400">{tt("计划")}</p>
        <ul className="mt-1 space-y-1">
          {item.entries.map((entry, index) => (
            <li
              key={index}
              data-oceanleo-cc-plan-status={entry.status}
              className="flex items-start gap-2 text-[12px] text-neutral-200"
            >
              <span aria-hidden="true" className="text-neutral-400">
                {entry.status === "completed" ? "☑" : entry.status === "in_progress" ? "–" : "☐"}
              </span>
              <span className="min-w-0 flex-1">{entry.content}</span>
              <span className="text-neutral-500">
                {entry.priority === "high"
                  ? tt("优先级高")
                  : entry.priority === "low"
                    ? tt("优先级低")
                    : tt("优先级中")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (item.kind === "usage") {
    const pct = item.size > 0 ? Math.min(100, Math.round((item.used / item.size) * 100)) : 0;
    return (
      <div data-oceanleo-cc-usage="" className="text-[11px] text-neutral-500">
        <p>
          {tt("用量 {pct}%", { pct })}
          {item.cost ? ` ${item.cost.amount} ${item.cost.currency}` : ""}
        </p>
        <div className="mt-1 h-1 w-full bg-neutral-800">
          <div className="h-1 bg-neutral-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (item.kind === "permission") {
    return (
      <div data-oceanleo-cc-permission={item.permId} className="space-y-2 text-[12px]">
        <p className="text-neutral-100">{item.title}</p>
        {item.toolTitle ? <p className="text-neutral-400">{item.toolTitle}</p> : null}
        {item.chosen ? (
          <p data-oceanleo-cc-permission-chosen="">{tt("已选：{name}", { name: item.chosen })}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {item.options.map((option) => (
              <button
                key={option.id}
                type="button"
                data-oceanleo-cc-permission-option={option.id}
                className={permissionClass(option.kind)}
                onClick={() => dialog.answerPermission(item.permId, option.id, option.name)}
              >
                {option.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (item.kind === "question") {
    return <QuestionView item={item} onSubmit={dialog.answerQuestion} />;
  }
  return (
    <div data-oceanleo-cc-commands="">
      <p className="text-[11px] text-neutral-500">{tt("可用命令")}</p>
      <ul className="text-[11px] text-neutral-400">
        {item.commands.map((command) => (
          <li key={command.name}>
            {command.name}
            {command.description ? ` ${command.description}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function noticeFrameText(
  message: Extract<AgentDialogMessage, { kind: "notice" }>,
): string {
  const raw = (message as { text?: unknown }).text;
  return typeof raw === "string" ? raw.trim() : "";
}

function NoticeView({
  message,
  dialog,
}: {
  message: Extract<AgentDialogMessage, { kind: "notice" }>;
  dialog: AgentDialogController;
}) {
  const tt = useUI();
  const program = isWsProgram(message.program)
    ? message.program
    : isWsProgram(dialog.program)
      ? dialog.program
      : null;
  const finishedHere =
    program !== null &&
    dialog.install.program === program &&
    dialog.install.donePath !== "" &&
    dialog.install.failedText === "";
  const row = program ? dialog.programs.find((item) => item.id === program) : undefined;
  const installed = finishedHere ? true : row ? row.installed : null;
  const action = noticeAction(message.code, installed);
  const spoken = noticeFrameText(message);
  return (
    <div data-oceanleo-cc-notice={message.code} className="space-y-1 text-[12px] text-amber-200">
      <p>{spoken || noticeCopy(tt, message.code, installed)}</p>
      {action === "login" && program ? (
        <button
          type="button"
          onClick={() => dialog.openLogin(program)}
          className="rounded-lg border border-amber-700 px-2 py-1 text-[12px]"
        >
          {tt("登录")}
        </button>
      ) : null}
      {action === "install" && program ? (
        <button
          type="button"
          onClick={() => dialog.openInstall(program)}
          className="rounded-lg border border-amber-700 px-2 py-1 text-[12px]"
        >
          {tt("安装")}
        </button>
      ) : null}
      {action === "retry" ? (
        <button
          type="button"
          data-oceanleo-cc-retry=""
          onClick={dialog.retryConnect}
          className="rounded-lg border border-amber-700 px-2 py-1 text-[12px]"
        >
          {tt("重试")}
        </button>
      ) : null}
    </div>
  );
}

export function MessageList({ dialog }: { dialog: AgentDialogController }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [dialog.messages]);
  return (
    <div ref={ref} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {dialog.messages.map((message) => {
        if (message.kind === "user") {
          return (
            <p key={message.id} data-oceanleo-cc-user="" className="whitespace-pre-wrap text-[13px] text-neutral-100">
              {message.text}
            </p>
          );
        }
        if (message.kind === "notice") return <NoticeView key={message.id} message={message} dialog={dialog} />;
        return (
          <div key={message.id} data-oceanleo-cc-turn="" data-oceanleo-cc-turn-stop={message.stop} className="space-y-2">
            {message.items.map((item) => (
              <ItemView key={item.id} item={item} dialog={dialog} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
