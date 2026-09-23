"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
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
  if (status === "completed") return "text-emerald-700 dark:text-emerald-300";
  if (status === "failed") return "text-rose-700 dark:text-rose-300";
  if (status === "in_progress") return "text-sky-700 dark:text-sky-300";
  return tone.faint;
}

function permissionClass(kind: string): string {
  const base = "rounded-lg px-2.5 py-1 text-[12px]";
  if (kind === "allow_always") return `${base} bg-emerald-600 text-white`;
  if (kind === "allow_once") return `${base} border border-emerald-600 text-emerald-700 dark:border-emerald-700 dark:text-emerald-200`;
  if (kind === "reject_always") return `${base} bg-rose-700 text-white`;
  if (kind === "reject_once") return `${base} border border-amber-600 text-amber-700 dark:border-amber-700 dark:text-amber-200`;
  return `${base} border ${tone.border}`;
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
        <span aria-hidden="true" className={tone.faint}>
          {toolMark(tool.kind)}
        </span>
        <span className="min-w-0 flex-1 truncate">{tool.title || tool.kind}</span>
        <span className={statusClass(tool.status)}>{statusLabel(tt, tool.status)}</span>
        <span className={tone.faint}>{open ? tt("收起") : tt("展开")}</span>
      </button>
      {open ? (
        <div className="mt-1 space-y-2 pl-4">
          {tool.content.map((part, index) => {
            if (part.type === "diff") {
              return (
                <div key={index} data-oceanleo-cc-diff={part.path} className="font-mono text-[11px]">
                  <div className={tone.faint}>{part.path}</div>
                  {lineDiff(part.old_text, part.new_text).map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      data-oceanleo-cc-diff-op={row.op}
                      className={
                        row.op === "+"
                          ? "text-green-700 dark:text-green-400"
                          : row.op === "-"
                            ? "text-red-700 dark:text-red-400"
                            : tone.faint
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
                className={`whitespace-pre-wrap font-mono text-[11px] ${tone.muted}`}
              >
                {body}
              </pre>
            );
          })}
          {tool.locations.length > 0 ? (
            <ul data-oceanleo-cc-tool-locations="" className={`text-[11px] ${tone.muted}`}>
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
      <p data-oceanleo-cc-question={item.questionId} className={`text-[12px] ${tone.muted}`}>
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
        <p className="text-[13px]">{item.title || tt("需要你回答")}</p>
        <textarea
          data-oceanleo-cc-question-input=""
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder={tt("写下回答")}
          className={`w-full resize-none rounded-lg border px-2 py-1.5 text-[12px] outline-none ${tone.input}`}
        />
        <button
          type="submit"
          data-oceanleo-cc-question-submit=""
          className={`rounded-lg px-2.5 py-1 text-[12px] font-medium ${tone.primary}`}
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
      {item.title ? <p className="text-[13px]">{item.title}</p> : null}
      {parsed.fields.map((field) => (
        <fieldset key={field.id} className="space-y-1">
          <legend className={`text-[12px] ${tone.muted}`}>{field.title}</legend>
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
                      ? tone.chipActive
                      : `border ${tone.border} ${tone.hover}`
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
              className={`w-full rounded-lg border px-2 py-1 text-[12px] outline-none ${tone.input}`}
            />
          )}
        </fieldset>
      ))}
      <button
        type="submit"
        data-oceanleo-cc-question-submit=""
        disabled={!ready}
        className={`rounded-lg px-2.5 py-1 text-[12px] font-medium disabled:opacity-40 ${tone.primary}`}
      >
        {tt("提交")}
      </button>
    </form>
  );
}

// 裸 URL → 真链接（oceanleo 程序的产物行因此可点）。行内代码段里的 URL 不变链接。
// 不解析 HTML；textContent 与纯文本渲染完全一致。
const URL_PART = /(https?:\/\/[^\s<>()"']+)/;

function AssistantText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return (
    <p className="whitespace-pre-wrap text-[13px]">
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
          return (
            <code
              key={index}
              className={`rounded px-1 font-mono text-[12px] ${tone.chip}`}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return (
          <span key={index}>
            {part.split(URL_PART).map((segment, segIndex) =>
              segIndex % 2 === 1 ? (
                <a
                  key={segIndex}
                  data-oceanleo-cc-link=""
                  href={segment}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sky-700 underline dark:text-sky-300"
                >
                  {segment}
                </a>
              ) : (
                segment
              ),
            )}
          </span>
        );
      })}
    </p>
  );
}

function ItemView({ item, dialog }: { item: TurnItem; dialog: AgentDialogController }) {
  const tt = useUI();
  if (item.kind === "assistant") {
    return (
      <div data-oceanleo-cc-assistant="">
        <AssistantText text={item.text} />
      </div>
    );
  }
  if (item.kind === "thought") {
    return (
      <details data-oceanleo-cc-thought="" className={`text-[12px] ${tone.faint}`}>
        <summary>{tt("思考")}</summary>
        <AgentText text={item.text} className={`whitespace-pre-wrap text-[12px] ${tone.faint}`} />
      </details>
    );
  }
  if (item.kind === "tool") return <ToolView tool={item.tool} />;
  if (item.kind === "plan") {
    return (
      <div data-oceanleo-cc-plan="">
        <p className={`text-[12px] ${tone.muted}`}>{tt("计划")}</p>
        <ul className="mt-1 space-y-1">
          {item.entries.map((entry, index) => (
            <li
              key={index}
              data-oceanleo-cc-plan-status={entry.status}
              className="flex items-start gap-2 text-[12px]"
            >
              <span aria-hidden="true" className={tone.muted}>
                {entry.status === "completed" ? "☑" : entry.status === "in_progress" ? "–" : "☐"}
              </span>
              <span className="min-w-0 flex-1">{entry.content}</span>
              <span className={tone.faint}>
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
      <div data-oceanleo-cc-usage="" className={`text-[11px] ${tone.faint}`}>
        <p>
          {tt("用量 {pct}%", { pct })}
        </p>
        <div className="mt-1 h-1 w-full bg-zinc-200 dark:bg-neutral-800">
          <div className="h-1 bg-zinc-500 dark:bg-neutral-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (item.kind === "permission") {
    if (item.auto) {
      const allowed = item.toolTitle || item.title || tt("这项操作");
      return (
        <p data-oceanleo-cc-permission-auto={item.permId} className={`text-[12px] ${tone.muted}`}>
          {tt("已自动允许：{name}", { name: allowed })}
        </p>
      );
    }
    return (
      <div data-oceanleo-cc-permission={item.permId} className="space-y-2 text-[12px]">
        <p>{item.title}</p>
        {item.toolTitle ? <p className={tone.muted}>{item.toolTitle}</p> : null}
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
  return <QuestionView item={item} onSubmit={dialog.answerQuestion} />;
}

function noticeFrameText(
  message: Extract<AgentDialogMessage, { kind: "notice" }>,
): string {
  return (message.text ?? "").trim();
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
  // oceanleo 程序的离线行在这里说人话；其余 code 全站一份文案，走 notice.ts 词典。
  const copy = message.code === "computer_offline" && message.program === "oceanleo"
    ? tt("这台电脑不在线")
    : noticeCopy(tt, message.code, installed);
  return (
    <div data-oceanleo-cc-notice={message.code} className="space-y-1 text-[12px] text-amber-700 dark:text-amber-200">
      <p>{spoken || copy}</p>
      {action === "login" && program ? (
        <button
          type="button"
          onClick={() => dialog.openLogin(program)}
          className="rounded-lg border border-amber-600 px-2 py-1 text-[12px] dark:border-amber-700"
        >
          {tt("登录")}
        </button>
      ) : null}
      {action === "install" && program ? (
        <button
          type="button"
          onClick={() => dialog.openInstall(program)}
          className="rounded-lg border border-amber-600 px-2 py-1 text-[12px] dark:border-amber-700"
        >
          {tt("安装")}
        </button>
      ) : null}
      {action === "retry" ? (
        <button
          type="button"
          data-oceanleo-cc-retry=""
          onClick={dialog.retryConnect}
          className="rounded-lg border border-amber-600 px-2 py-1 text-[12px] dark:border-amber-700"
        >
          {tt("重试")}
        </button>
      ) : null}
    </div>
  );
}

const AGENT_AVATAR = {
  oceanleo: { mark: "✦", color: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  cursor: { mark: "C", color: "bg-zinc-200 text-zinc-800 dark:bg-neutral-800 dark:text-neutral-100" },
  claude: { mark: "C", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  codex: { mark: "C", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  hermes: { mark: "H", color: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
};

export function MessageList({ dialog }: { dialog: AgentDialogController }) {
  const tt = useUI();
  const ref = useRef<HTMLDivElement>(null);
  // Remember the position before React grows the content, not the new distance
  // after a streaming chunk has already increased scrollHeight.
  const following = useRef(true);
  const smoothFollowing = useRef(false);
  const [showLatest, setShowLatest] = useState(false);
  const firstId = dialog.messages[0]?.id;
  const identity = useRef({ program: dialog.program, session: dialog.activeSession, firstId });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = identity.current;
    const changed = previous.program !== dialog.program || previous.session !== dialog.activeSession || previous.firstId !== firstId;
    identity.current = { program: dialog.program, session: dialog.activeSession, firstId };
    if (changed || following.current) {
      smoothFollowing.current = false;
      node.scrollTop = node.scrollHeight;
      following.current = true;
      setShowLatest(false);
    } else {
      setShowLatest(true);
    }
  }, [dialog.messages, dialog.program, dialog.activeSession, firstId]);
  const avatar = AGENT_AVATAR[dialog.program ?? "oceanleo"];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={ref}
        data-oceanleo-cc-messages=""
        onWheel={() => { smoothFollowing.current = false; }}
        onTouchStart={() => { smoothFollowing.current = false; }}
        onPointerDown={() => { smoothFollowing.current = false; }}
        onKeyDown={() => { smoothFollowing.current = false; }}
        onScroll={() => {
          const node = ref.current;
          if (!node) return;
          const nearBottom = node.scrollHeight - node.clientHeight - node.scrollTop < 80;
          if (smoothFollowing.current && !nearBottom) return;
          smoothFollowing.current = false;
          following.current = nearBottom;
          setShowLatest(!following.current);
        }}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pt-3 pb-6 [overflow-anchor:none]"
      >
        {dialog.messages.map((message) => {
          if (message.kind === "user") {
            return (
              <div key={message.id} data-oceanleo-cc-user="" className="flex items-start gap-2.5">
                <span data-oceanleo-cc-user-avatar="" aria-hidden="true" className="mt-2 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-neutral-700 dark:text-neutral-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                  </svg>
                </span>
                <p className="min-w-0 whitespace-pre-wrap break-words rounded-xl bg-zinc-100 px-3 py-2 text-[15px] leading-relaxed text-zinc-950 dark:bg-neutral-800 dark:text-neutral-50 [overflow-wrap:anywhere]">
                  {message.text}
                </p>
              </div>
            );
          }
          if (message.kind === "notice") return <NoticeView key={message.id} message={message} dialog={dialog} />;
          return (
            <div key={message.id} data-oceanleo-cc-turn="" data-oceanleo-cc-turn-stop={message.stop} className="flex items-start gap-2.5 text-[13px]">
              <span data-oceanleo-cc-agent-avatar={dialog.program ?? "oceanleo"} aria-hidden="true" className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] ${avatar.color}`}>
                {avatar.mark}
              </span>
              <div className="min-w-0 flex-1 space-y-2 break-words [overflow-wrap:anywhere]">
                {message.items.map((item) => (
                  <ItemView key={item.id} item={item} dialog={dialog} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {showLatest ? (
        <button
          type="button"
          data-oceanleo-cc-latest=""
          onClick={() => {
            const node = ref.current;
            if (!node) return;
            following.current = true;
            smoothFollowing.current = true;
            setShowLatest(false);
            node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
          }}
          className={`absolute bottom-2 right-3 rounded-full border px-3 py-1.5 text-[12px] shadow-sm ${tone.border} ${tone.panel} ${tone.hover}`}
        >
          <span aria-hidden="true">↓ </span>{tt("最新消息")}
        </button>
      ) : null}
    </div>
  );
}
