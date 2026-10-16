"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TypewriterMarkdown } from "../../Markdown";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
import { lineDiff } from "./diff-lines";
import { noticeAction, visibleNoticeCopy } from "./notice";
import { isWsProgram } from "./parse";
import { normalizeQuestions } from "./questions";
import { normalizeUserMessage } from "./message-attachments";
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

function collapseUnlessSelecting(close: () => void) {
  if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
  close();
}

function ThoughtView({ text }: { text: string }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  return (
    <div data-oceanleo-cc-thought="">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center gap-2 text-left text-[12px] ${tone.faint}`}
      >
        <span className="min-w-0 flex-1 truncate">{tt("思考")}</span>
        <span>{open ? tt("收起") : tt("展开")}</span>
      </button>
      {open ? (
        <div
          data-oceanleo-cc-thought-expanded=""
          className="mt-1 cursor-pointer space-y-2 pl-4"
          onClick={() => collapseUnlessSelecting(() => setOpen(false))}
        >
          <AgentText
            text={text}
            className={`cursor-pointer whitespace-pre-wrap text-[12px] ${tone.faint}`}
          />
        </div>
      ) : null}
    </div>
  );
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
        <div
          data-oceanleo-cc-tool-expanded=""
          className="mt-1 cursor-pointer space-y-2 pl-4"
          onClick={() => collapseUnlessSelecting(() => setOpen(false))}
        >
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

// 「已自动允许：<整条命令>」这一行可能长达几千字：默认单行截断，点任意处展开 / 收起。
function AutoAllowedView({ permId, name }: { permId: string; name: string }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  return (
    <p
      data-oceanleo-cc-permission-auto={permId}
      aria-expanded={open}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
        setOpen((value) => !value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen((value) => !value);
        }
      }}
      className={`cursor-pointer text-[12px] ${tone.muted} ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}
    >
      {tt("已自动允许：{name}", { name })}
    </p>
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
          className={`w-full resize-none rounded-lg border px-2 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 ${tone.input}`}
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
  const selectedIds = (raw: string) =>
    raw.split(",").map((part) => part.trim()).filter(Boolean);
  const toggleValue = (field: (typeof parsed.fields)[number], optionId: string) => {
    setValues((current) => {
      if (!field.allowMultiple) return { ...current, [field.id]: optionId };
      const have = selectedIds(current[field.id] ?? "");
      const next = have.includes(optionId) ? have.filter((id) => id !== optionId) : [...have, optionId];
      return { ...current, [field.id]: next.join(",") };
    });
  };
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
      <p className="text-[13px]">{item.title || tt("需要你回答")}</p>
      {item.detail ? (
        <pre className={`max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] ${tone.muted}`}>
          {item.detail}
        </pre>
      ) : null}
      {parsed.fields.map((field) => (
        <fieldset key={field.id} className="space-y-1">
          <legend className={`text-[12px] ${tone.muted}`}>{field.title}</legend>
          {field.options.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {field.options.map((option) => {
                const pressed = selectedIds(values[field.id] ?? "").includes(option.id);
                const label =
                  field.id === "__plan__" && option.id === "accepted"
                    ? tt("接受计划")
                    : field.id === "__plan__" && option.id === "rejected"
                      ? tt("拒绝")
                      : option.label;
                return (
                <button
                  key={option.id}
                  type="button"
                  data-oceanleo-cc-question-option={option.id}
                  aria-pressed={pressed}
                  onClick={() => toggleValue(field, option.id)}
                  className={`rounded-lg px-2 py-1 text-[12px] ${
                    pressed
                      ? tone.chipActive
                      : `border ${tone.border} ${tone.hover}`
                  }`}
                >
                  {label}
                </button>
                );
              })}
            </div>
          ) : (
            <input
              value={values[field.id] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.id]: event.target.value }))
              }
              className={`w-full rounded-lg border px-2 py-1 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 ${tone.input}`}
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

const MARKDOWN_DARK_CSS = `
.dark [data-oceanleo-cc-assistant] :is(h1,h2,h3,h4,p,ul,ol,td,blockquote) { color: #e5e7eb; }
.dark [data-oceanleo-cc-assistant] a { color: #93c5fd; }
.dark [data-oceanleo-cc-assistant] :not(pre) > code { background-color: #262626; color: #f5f5f5; }
.dark [data-oceanleo-cc-assistant] thead { background-color: #262626; color: #e5e7eb; }
.dark [data-oceanleo-cc-assistant] :is(th,td,blockquote) { border-color: #404040; }
`;

function AssistantText({ text, active }: { text: string; active: boolean }) {
  return <TypewriterMarkdown content={text} active={active} className="text-[13px] leading-relaxed" />;
}

function ItemView({ item, dialog, active = false }: { item: TurnItem; dialog: AgentDialogController; active?: boolean }) {
  const tt = useUI();
  if (item.kind === "assistant") {
    return (
      <div data-oceanleo-cc-assistant="">
        <AssistantText text={item.text} active={active} />
      </div>
    );
  }
  if (item.kind === "thought") return <ThoughtView text={item.text} />;
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
      return <AutoAllowedView permId={item.permId} name={allowed} />;
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
    : visibleNoticeCopy(tt, message.code, installed, spoken);
  return (
    <div data-oceanleo-cc-notice={message.code} className="space-y-1 text-[12px] text-amber-700 dark:text-amber-200">
      <p>{copy}</p>
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

function isBlockingPrompt(item: TurnItem): boolean {
  if (item.kind === "permission") return !item.chosen && !item.auto;
  if (item.kind === "question") return !item.submitted;
  return false;
}

const LAZY_TAIL = 12;
const LOAD_OLDER_PX = 96;

function LazyBody({
  root,
  force,
  children,
}: {
  root: HTMLElement | null;
  force: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useRef(48);
  const [show, setShow] = useState(force || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (force || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setShow(entry.isIntersecting);
      },
      { root, rootMargin: "1600px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [force, root]);
  useLayoutEffect(() => {
    if (show && ref.current) height.current = Math.max(48, ref.current.offsetHeight);
  }, [show, children]);
  return (
    <div ref={ref} data-oceanleo-cc-lazy={show ? "on" : "off"} style={show ? undefined : { minHeight: height.current }}>
      {show ? children : null}
    </div>
  );
}

function blockingPrompts(messages: AgentDialogMessage[]): TurnItem[] {
  const out: TurnItem[] = [];
  for (const message of messages) {
    if (message.kind !== "turn") continue;
    for (const item of message.items) {
      if (isBlockingPrompt(item)) out.push(item);
    }
  }
  return out;
}

export function MessageList({ dialog }: { dialog: AgentDialogController }) {
  const tt = useUI();
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Remember the position before React grows the content, not the new distance
  // after a streaming chunk has already increased scrollHeight.
  const following = useRef(true);
  const smoothFollowing = useRef(false);
  const savedHeight = useRef(0);
  const [showLatest, setShowLatest] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const firstId = dialog.messages[0]?.id;
  const historyOffset = dialog.historyOffset ?? 0;
  const identity = useRef({
    program: dialog.program,
    session: dialog.activeSession,
    firstId,
    historyOffset,
  });
  // Markdown reveals text after the message frame renders. Observe the actual
  // content height as well as message updates so those later lines stay visible.
  useEffect(() => {
    const node = ref.current;
    const content = contentRef.current;
    if (!node || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (following.current) {
        smoothFollowing.current = false;
        node.scrollTop = node.scrollHeight;
      }
    });
    observer.observe(content);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = identity.current;
    const sessionChanged =
      previous.program !== dialog.program || previous.session !== dialog.activeSession;
    const prepended = !sessionChanged && historyOffset < previous.historyOffset;
    const replaced = !sessionChanged && !prepended && previous.firstId !== firstId;
    identity.current = { program: dialog.program, session: dialog.activeSession, firstId, historyOffset };
    if (prepended) {
      node.scrollTop += node.scrollHeight - savedHeight.current;
    } else if (sessionChanged || replaced || following.current) {
      smoothFollowing.current = false;
      node.scrollTop = node.scrollHeight;
      following.current = true;
      setShowLatest(false);
    } else {
      setShowLatest(true);
    }
    savedHeight.current = node.scrollHeight;
    if (
      dialog.hasOlder
      && !dialog.historyLoading
      && node.scrollHeight <= node.clientHeight + LOAD_OLDER_PX
    ) {
      dialog.loadOlderHistory?.();
    }
  }, [dialog.messages, dialog.program, dialog.activeSession, firstId, historyOffset, dialog.hasOlder, dialog.historyLoading]);
  const avatar = AGENT_AVATAR[dialog.program ?? "oceanleo"];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <style>{MARKDOWN_DARK_CSS}</style>
      {dialog.sessionLoading ? <p role="status" data-oceanleo-dialog-history-loading="" className={`px-3 py-2 text-[12px] ${tone.muted}`}>{tt("正在读取…")}</p> : null}
      <div
        ref={(node) => {
          ref.current = node;
          if (node !== scrollRoot) setScrollRoot(node);
        }}
        data-oceanleo-cc-messages=""
        onWheel={(event) => {
          if (event.deltaY < 0) { following.current = false; smoothFollowing.current = false; }
        }}
        onKeyDown={(event) => {
          if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
            following.current = false; smoothFollowing.current = false;
          }
        }}
        onScroll={() => {
          const node = ref.current;
          if (!node) return;
          const nearBottom = node.scrollHeight - node.clientHeight - node.scrollTop < 80;
          if (smoothFollowing.current && !nearBottom) return;
          smoothFollowing.current = false;
          following.current = nearBottom;
          setShowLatest(!following.current);
          if (node.scrollTop < LOAD_OLDER_PX && dialog.hasOlder && !dialog.historyLoading) {
            dialog.loadOlderHistory?.();
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-6 [overflow-anchor:none]"
      >
        <div ref={contentRef} className="space-y-5" data-oceanleo-cc-message-content="">
        {dialog.hasOlder || dialog.historyLoading ? (
          <button
            type="button"
            data-oceanleo-cc-history-older=""
            disabled={dialog.historyLoading || !dialog.hasOlder}
            onClick={() => dialog.loadOlderHistory?.()}
            className={`block w-full text-center text-[12px] ${tone.muted}`}
          >
            {dialog.historyLoading ? tt("正在读取…") : tt("向上滑动查看更早的对话")}
          </button>
        ) : null}
        {dialog.messages.map((message, index) => {
          const force = index >= dialog.messages.length - LAZY_TAIL;
          const body = (() => {
          if (message.kind === "user") {
            const visible = normalizeUserMessage(message.text, message.attachments);
            return (
              <div key={message.id} data-oceanleo-cc-user="" className="flex items-start gap-2.5">
                <span data-oceanleo-cc-user-avatar="" aria-hidden="true" className="mt-2 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-neutral-700 dark:text-neutral-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                  </svg>
                </span>
                <div className="min-w-0">
                  {visible.text ? (
                    <p className="rounded-xl bg-zinc-100 px-3 py-2 text-[15px] leading-relaxed text-zinc-950 dark:bg-neutral-800 dark:text-neutral-50 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{visible.text}</p>
                  ) : null}
                  {visible.attachments.length ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5 text-[12px] opacity-80" data-oceanleo-cc-user-files="">
                      {visible.attachments.map((item, index) => (
                        <li key={`${item.name}-${index}`} className="rounded-md bg-black/5 px-1.5 py-0.5 dark:bg-white/10">
                          {/* Path-type inbox rows are text only. Historical
                              previews stay bounded; never file:// or a large
                              data URL. */}
                          {item.preview && !item.path ? (
                            <img
                              data-oceanleo-cc-user-image=""
                              src={item.preview}
                              alt={item.name === "图片" ? tt("图片") : item.name}
                              loading="lazy"
                              decoding="async"
                              className="mb-1 max-h-32 max-w-48 rounded object-contain"
                              onError={(event) => { event.currentTarget.hidden = true; }}
                            />
                          ) : null}
                          <span>{item.name === "图片" ? tt("图片") : item.name}</span>
                          {item.path ? (
                            <span
                              data-oceanleo-cc-user-path={item.path}
                              className="mt-0.5 block break-all font-mono text-[11px]"
                            >
                              {item.path}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
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
                {message.items.map((item) =>
                  isBlockingPrompt(item) ? null : (
                    <ItemView key={item.id} item={item} dialog={dialog} active={!message.stop && dialog.busy} />
                  ),
                )}
              </div>
            </div>
          );
          })();
          return (
            <LazyBody key={message.id} root={scrollRoot} force={force}>
              {body}
            </LazyBody>
          );
        })}
        </div>
      </div>
      {blockingPrompts(dialog.messages).map((item) => (
        <div
          key={item.id}
          data-oceanleo-cc-prompt-dock=""
          className={`shrink-0 border-t px-3 py-2 ${tone.border} ${tone.panel}`}
        >
          <ItemView item={item} dialog={dialog} />
        </div>
      ))}
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
