"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AgentAttachment, AgentMessage } from "../lib/agent";
import {
  AIGC_LABEL_TEXT,
  aigcLabelActive,
  withAigcTextNotice,
} from "../contracts/aigc-label";
import { useUI, type UITranslate } from "../i18n/ui/useUI";
import { HighlightedText, Markdown, TypewriterMarkdown } from "./Markdown";
import { ShareCheckbox } from "./share/ShareActionBar";
import { writeClipboardText } from "./share/share-clipboard";
import { ApprovalCard, parseApprovalMessage } from "./ApprovalCard";
import { cloudHealthTone, deviceStatusNoticeLine, deviceStatusNoticeTime } from "../lib/local-agent-task";

export function agentArtifactLabels(
  tt: UITranslate,
): Record<string, string> {
  return {
    map: tt("地图"),
    canvas: tt("画布"),
    novel: tt("小说"),
    ppt: tt("演示文稿"),
    sheet: tt("表格"),
    doc: tt("文档"),
    markdown: tt("结果文档"),
    image: tt("图片"),
  };
}

export interface AgentTranscriptBubbleProps {
  message: AgentMessage;
  streaming?: boolean;
  /**
   * 这条回答是被用户按停止中断的。已经生成的部分照常显示（用户可能已经在读了），
   * 只在末尾说明它没写完——不标的话，一段半截的话看起来就是模型答得莫名其妙。
   */
  stopped?: boolean;
  onBranch?: () => void;
  onArtifactOpen?: () => void;
  gateActive?: boolean;
  gateBusy?: boolean;
  onGate?: (decision: "approve" | "reject", feedback: string) => void;
  /** 外发确认卡：任务是否仍在跑（后端还在 90 秒等待里）。 */
  taskRunning?: boolean;
  /** 任务已停时，确认成功后发一条后续消息让 agent 接着做。 */
  onContinue?: () => void;
  /** 选段模式：每条消息左侧长出圆形勾选框，整行可点。 */
  selectMode?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
  /** 普通模式下每条回答底下那排小图标。 */
  onRegenerate?: () => void;
  onShare?: () => void;
  /**
   * 对话内搜索的当前搜索词。非空时正文里每一处大小写不敏感的纯文本命中都包成
   * `<mark data-leo-search-hit>`，搜索控件据此计数、标当前项、滚动定位。
   */
  highlightQuery?: string;
  /**
   * 电脑上的原生对话（Codex / Claude Code / Cursor / Hermes）的确认与提问：
   * `meta.native_permission` 收到所选选项 id，`meta.native_question` 收到
   * `{ [questionId]: value }`。不传时这类确认只读显示。
   */
  onNativeAnswer?: (message: AgentMessage, answer: unknown) => void;
}

/**
 * 一条消息。普通模式下助手回答底下有「复制 / 重做 / 分享」一排小图标；
 * 选段模式下整条变成可勾选的行，图标收起（此时用户是在选，不是在操作单条）。
 */
export function AgentTranscriptBubble(props: AgentTranscriptBubbleProps) {
  const tt = useUI();
  const {
    message,
    selectMode = false,
    selected = false,
    onSelectToggle,
    onRegenerate,
    onShare,
    streaming = false,
  } = props;
  if (message.kind === "ui_action") return null;
  const body = <TranscriptBody {...props} />;
  const actionable =
    !selectMode &&
    message.role === "assistant" &&
    !streaming &&
    (message.kind === "text" || !message.kind || message.kind === "report") &&
    Boolean(message.content?.trim());
  if (!selectMode && !actionable) return body;
  return (
    <div
      className={`group/message flex gap-2.5 ${
 selectMode
 ? "cursor-pointer rounded-xl px-1.5 py-1 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-50"
 : ""
 } ${selected ? "bg-stone-100/70" : ""}`}
      onClick={selectMode ? onSelectToggle : undefined}
    >
      {selectMode && (
        <ShareCheckbox
          checked={selected}
          onToggle={() => onSelectToggle?.()}
          label={tt("选择这条消息")}
        />
      )}
      <div className={`min-w-0 flex-1 ${selectMode ? "pointer-events-none" : ""}`}>
        {body}
        {actionable && (
          <MessageActions
            content={message.content}
            onRegenerate={onRegenerate}
            onShare={onShare}
          />
        )}
      </div>
    </div>
  );
}

/** 「复制 / 重做 / 分享」——平时淡出，鼠标移到这条回答上才显形。 */
function MessageActions({
  content,
  onRegenerate,
  onShare,
}: {
  content: string;
  onRegenerate?: () => void;
  onShare?: () => void;
}) {
  const tt = useUI();
  const [copied, setCopied] = useState(false);
  const showAigc = aigcLabelActive();
  const iconClass = "h-4 w-4";
  const buttonClass =
    "inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-stone-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-700";
  const actionsClass =
    "mt-1 flex items-center gap-0.5 opacity-0 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-hover/message:opacity-100 focus-within:opacity-100";
  const buttons = (
    <>
      <button
        type="button"
        title={tt("复制")}
        aria-label={tt("复制")}
        className={buttonClass}
        onClick={() => {
          void writeClipboardText(withAigcTextNotice(content)).then((ok) => {
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" strokeLinecap="round" />
        </svg>
        {copied && <span>{tt("已复制")}</span>}
      </button>
      {onRegenerate && (
        <button
          type="button"
          title={tt("重做")}
          aria-label={tt("重做")}
          className={buttonClass}
          onClick={onRegenerate}
        >
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 11a8 8 0 10-2.3 6.3" strokeLinecap="round" />
            <path d="M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {onShare && (
        <button
          type="button"
          title={tt("分享")}
          aria-label={tt("分享")}
          className={buttonClass}
          onClick={onShare}
        >
          <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </>
  );
  // 开关关：根节点 class 与今天的 MessageActions 逐字相同，不多一层包裹。
  if (!showAigc) {
    return <div className={actionsClass}>{buttons}</div>;
  }
  return (
    <div className="mt-1 flex items-center gap-0.5">
      <span
        data-testid="aigc-label"
        className="text-[11px] rounded px-1.5 py-0.5 border border-stone-200 text-stone-500 whitespace-nowrap shrink-0"
      >
        {AIGC_LABEL_TEXT}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-hover/message:opacity-100 focus-within:opacity-100">
        {buttons}
      </div>
    </div>
  );
}

function TranscriptBody({
  message,
  streaming = false,
  stopped = false,
  onBranch,
  onArtifactOpen,
  gateActive = false,
  gateBusy = false,
  onGate,
  taskRunning = false,
  onContinue,
  highlightQuery,
  onNativeAnswer,
}: AgentTranscriptBubbleProps) {
  const tt = useUI();
  const artifactLabels = agentArtifactLabels(tt);

  if (message.role === "user") {
    const attachments = message.meta?.attachments || [];
    return (
      <div className="group flex flex-col items-end gap-1.5">
        {attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {attachments.map((attachment, index) => (
              <TranscriptAttachment
                key={`${attachment.url || attachment.name || "attachment"}-${index}`}
                attachment={attachment}
              />
            ))}
          </div>
        )}
        {message.content && (
          <div className="min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-900 [overflow-wrap:anywhere]">
            <HighlightedText text={message.content} query={highlightQuery} />
          </div>
        )}
        {onBranch && (
          <button
            type="button"
            onClick={onBranch}
            className="px-1 text-[11px] text-stone-300 opacity-0 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-stone-600 group-hover:opacity-100 focus:opacity-100"
          >
            {tt("从这里重新开始")}
          </button>
        )}
      </div>
    );
  }

  if (message.kind === "ui_action") return null;
  if (message.kind === "gate" && message.meta?.native_permission) {
    return (
      <NativePermissionGate
        message={message}
        onAnswer={onNativeAnswer}
        highlightQuery={highlightQuery}
      />
    );
  }
  if (message.kind === "gate" && message.meta?.native_question) {
    return (
      <NativeQuestionGate
        message={message}
        onAnswer={onNativeAnswer}
        highlightQuery={highlightQuery}
      />
    );
  }
  if (message.kind === "gate") {
    return (
      <GateBubble
        message={message}
        active={gateActive}
        busy={gateBusy}
        onGate={onGate}
        highlightQuery={highlightQuery}
      />
    );
  }
  if (message.kind === "approval") {
    const payload = parseApprovalMessage(message.content);
    if (!payload) return null;
    return (
      <ApprovalCard
        payload={payload}
        taskRunning={taskRunning}
        onContinue={onContinue}
      />
    );
  }
  if (message.kind === "plan") {
    // 克制版（操作员 2026-07-12：agent 正文不许被色块包裹）：计划用极细左边线 + 中性小字，
    // 不再是一整块灰底圆角卡片。
    return (
      <div className="min-w-0 break-words border-l-2 border-stone-200 pl-3 [overflow-wrap:anywhere]">
        <Markdown
          className="text-[14px] leading-relaxed text-stone-500"
          highlightQuery={highlightQuery}
        >
          {message.content}
        </Markdown>
      </div>
    );
  }
  if (message.kind === "report") {
    return (
      <WorkerReportBubble message={message} highlightQuery={highlightQuery} />
    );
  }
  if (message.kind === "step") {
    return (
      <div className="min-w-0 break-words px-1 text-[13px] font-medium text-stone-500 [overflow-wrap:anywhere]">
        <HighlightedText text={message.content} query={highlightQuery} />
      </div>
    );
  }
  if (message.kind === "error") {
    return (
      <div className="min-w-0 whitespace-pre-wrap break-words rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-600 [overflow-wrap:anywhere]">
        <HighlightedText text={message.content} query={highlightQuery} />
      </div>
    );
  }
  if (message.kind === "notice") {
    // A program's informational notice (e.g. its process exited): neutral, not a failure.
    return (
      <div
        role="status"
        data-agent-notice={typeof message.meta?.native_notice === "string" ? message.meta.native_notice : ""}
        className="flex min-w-0 items-start gap-2 px-1 text-[13px] leading-relaxed text-stone-500"
      >
        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          <HighlightedText text={message.content} query={highlightQuery} />
        </span>
      </div>
    );
  }
  if (message.kind === "device_status") {
    return (
      <DeviceStatusNotice message={message} highlightQuery={highlightQuery} />
    );
  }
  if (
    message.meta?.artifact?.type === "preview" &&
    message.meta.artifact.url
  ) {
    return (
      <button
        type="button"
        onClick={onArtifactOpen}
        disabled={!onArtifactOpen}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left text-[13px] text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-stone-300 hover:bg-stone-50 disabled:cursor-default"
      >
        <span className="min-w-0 truncate">{tt("实时预览已就绪")}</span>
        <span className="shrink-0 text-[11px] text-stone-400">
          {tt("在右侧打开")}
        </span>
      </button>
    );
  }
  if (message.meta?.artifact) {
    const label =
      message.meta.artifact.title ||
      artifactLabels[message.meta.artifact.type] ||
      tt("结果");
    return (
      <button
        type="button"
        onClick={onArtifactOpen}
        disabled={!onArtifactOpen}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left text-[13px] text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-stone-300 hover:bg-stone-50 disabled:cursor-default"
      >
        <span className="min-w-0 truncate">
          <HighlightedText
            text={tt("已生成「{label}」", { label })}
            query={highlightQuery}
          />
        </span>
        <span className="shrink-0 text-[11px] text-stone-400">
          {tt("在右侧打开")}
        </span>
      </button>
    );
  }

  return (
    <div className="max-w-full px-1 text-neutral-900">
      <TypewriterMarkdown
        content={message.content}
        active={streaming}
        smooth={streaming}
        highlightQuery={highlightQuery}
      />
      {stopped && (
        <p
          data-testid="agent-stopped-note"
          className="mt-1.5 text-[12px] text-stone-400"
        >
          {tt("已停止生成")}
        </p>
      )}
    </div>
  );
}

function GateBubble({
  message,
  active,
  busy,
  onGate,
  highlightQuery,
}: {
  message: AgentMessage;
  active: boolean;
  busy: boolean;
  onGate?: (decision: "approve" | "reject", feedback: string) => void;
  highlightQuery?: string;
}) {
  const tt = useUI();
  const [feedback, setFeedback] = useState("");
  const prompt =
    (message.meta?.gate_prompt as string) ||
    message.content ||
    tt("请确认后继续。");
  return (
    <div className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3">
      <p className="text-[12px] font-semibold text-amber-800">
        {active ? tt("需要你确认") : tt("已确认")}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-amber-900 [overflow-wrap:anywhere]">
        <HighlightedText text={prompt} query={highlightQuery} />
      </p>
      {active && onGate && (
        <div className="mt-3 space-y-2">
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={2}
            placeholder={tt("如需调整，可在确认前补充说明")}
            className="w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-amber-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onGate("approve", feedback.trim())}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? tt("处理中…") : tt("确认继续")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGate("reject", feedback.trim())}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-700 disabled:opacity-50"
            >
              {tt("到此停止")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type NativeGateOption = { id: string; name: string; kind: string };

function nativePermissionOf(message: AgentMessage): {
  permId: string;
  options: NativeGateOption[];
  chosen: string;
} {
  const raw = message.meta?.native_permission as
    | { permId?: unknown; options?: unknown; chosen?: unknown }
    | undefined;
  const options = Array.isArray(raw?.options)
    ? raw.options.flatMap((item): NativeGateOption[] => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id : "";
        if (!id) return [];
        return [{
          id,
          name: typeof row.name === "string" && row.name ? row.name : id,
          kind: typeof row.kind === "string" ? row.kind : "",
        }];
      })
    : [];
  return {
    permId: typeof raw?.permId === "string" ? raw.permId : "",
    options,
    chosen: typeof raw?.chosen === "string" ? raw.chosen : "",
  };
}

/** allow_* 是主按钮（同 GateBubble「确认继续」），其余是次按钮（同「到此停止」）。 */
function isAllowKind(kind: string): boolean {
  return kind.startsWith("allow");
}

const GATE_PRIMARY =
  "rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50";
const GATE_SECONDARY =
  "rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-700 disabled:opacity-50";

function GateFrame({
  active,
  prompt,
  highlightQuery,
  children,
  attributes,
}: {
  active: boolean;
  prompt: string;
  highlightQuery?: string;
  children?: ReactNode;
  attributes?: Record<string, string>;
}) {
  const tt = useUI();
  return (
    <div className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3" {...attributes}>
      <p className="text-[12px] font-semibold text-amber-800">
        {active ? tt("需要你确认") : tt("已确认")}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-amber-900 [overflow-wrap:anywhere]">
        <HighlightedText text={prompt} query={highlightQuery} />
      </p>
      {children}
    </div>
  );
}

function NativePermissionGate({
  message,
  onAnswer,
  highlightQuery,
}: {
  message: AgentMessage;
  onAnswer?: (message: AgentMessage, answer: unknown) => void;
  highlightQuery?: string;
}) {
  const tt = useUI();
  const permission = nativePermissionOf(message);
  // Only the conversation's own record says what was chosen. A local click
  // just holds the buttons until that record arrives (or a short wait ends).
  const pending = useLocalHold(permission.chosen);
  const chosen = permission.chosen;
  const active = !chosen && Boolean(onAnswer);
  const prompt =
    (message.meta?.gate_prompt as string) || message.content || tt("请确认后继续。");
  return (
    <GateFrame
      active={active}
      prompt={prompt}
      highlightQuery={highlightQuery}
      attributes={{ "data-native-permission": permission.permId }}
    >
      {permission.options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {permission.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={!active || pending.held}
              data-native-permission-option={option.id}
              onClick={() => {
                if (!active || pending.held || !onAnswer) return;
                pending.hold();
                onAnswer(message, option.id);
              }}
              className={isAllowKind(option.kind) ? GATE_PRIMARY : GATE_SECONDARY}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <p
          data-native-permission-chosen=""
          className="mt-2 text-[12px] text-amber-800"
        >
          {tt("已选：{name}", { name: chosen })}
        </p>
      )}
    </GateFrame>
  );
}

/** How long a sent answer holds the controls before they unlock again if no record arrives. */
const NATIVE_ANSWER_HOLD_MS = 8000;

function useLocalHold(confirmed: string): { held: boolean; hold: () => void } {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (confirmed) setHeld(false);
  }, [confirmed]);
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setHeld(false), NATIVE_ANSWER_HOLD_MS);
    return () => clearTimeout(timer);
  }, [held]);
  return { held, hold: () => setHeld(true) };
}

type NativeQuestionField = {
  id: string;
  title: string;
  options: { id: string; label: string }[];
  allowMultiple: boolean;
};

/** 同 agent-dialog/questions.ts：认得出「标题 + 选项」就逐项渲染，否则退成一个文本框。 */
function nativeQuestionFields(raw: unknown): NativeQuestionField[] | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { questions?: unknown }).questions)
      ? ((raw as { questions: unknown[] }).questions)
      : [];
  if (!list.length) return null;
  const text = (...values: unknown[]) =>
    (values.find((value) => typeof value === "string" && value.trim()) as string | undefined) ?? "";
  const fields: NativeQuestionField[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const title = text(row.prompt, row.question, row.title, row.text, row.label);
    if (!title) return null;
    const rawOptions = row.options ?? row.choices;
    if (rawOptions !== undefined && !Array.isArray(rawOptions)) return null;
    const options: { id: string; label: string }[] = [];
    for (const option of (rawOptions as unknown[] | undefined) ?? []) {
      if (typeof option === "string" && option.trim()) {
        options.push({ id: option, label: option });
        continue;
      }
      if (!option || typeof option !== "object") return null;
      const choice = option as Record<string, unknown>;
      const label = text(choice.label, choice.name, choice.title, choice.value, choice.id);
      const id = text(choice.id, choice.value) || label;
      if (!label || !id) return null;
      options.push({ id, label });
    }
    fields.push({
      id: text(row.id) || `q${index}`,
      title,
      options,
      allowMultiple: row.allowMultiple === true,
    });
  }
  return fields;
}

function NativeQuestionGate({
  message,
  onAnswer,
  highlightQuery,
}: {
  message: AgentMessage;
  onAnswer?: (message: AgentMessage, answer: unknown) => void;
  highlightQuery?: string;
}) {
  const tt = useUI();
  const raw = message.meta?.native_question as
    | { questionId?: unknown; detail?: unknown; questions?: unknown; submitted?: unknown }
    | undefined;
  const [values, setValues] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const submitted = raw?.submitted === true;
  const pending = useLocalHold(submitted ? "submitted" : "");
  const active = !submitted && Boolean(onAnswer);
  const fields = nativeQuestionFields(raw?.questions);
  const detail = typeof raw?.detail === "string" ? raw.detail : "";
  const prompt =
    (message.meta?.gate_prompt as string) || message.content || tt("需要你回答");
  const questionId = typeof raw?.questionId === "string" ? raw.questionId : "";
  const ids = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean);
  const ready = fields
    ? fields.every((field) => (values[field.id] ?? "").trim() !== "")
    : Boolean(text.trim());
  const submit = () => {
    if (!active || !ready || pending.held || !onAnswer) return;
    pending.hold();
    onAnswer(message, fields ? values : { text });
  };
  return (
    <GateFrame
      active={active}
      prompt={prompt}
      highlightQuery={highlightQuery}
      attributes={{ "data-native-question": questionId }}
    >
      {detail && (
        <pre className="mt-1.5 max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words text-[12px] leading-relaxed text-amber-900/80 [overflow-wrap:anywhere]">
          {detail}
        </pre>
      )}
      {submitted ? (
        <p data-native-question-submitted="" className="mt-2 text-[12px] text-amber-800">
          {tt("已经提交")}
        </p>
      ) : active ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {fields ? (
            fields.map((field) => (
              <fieldset key={field.id} className="space-y-1.5">
                <legend className="max-w-full break-words text-[12px] text-amber-800 [overflow-wrap:anywhere]">{field.title}</legend>
                {field.options.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {field.options.map((option) => {
                      const pressed = ids(values[field.id] ?? "").includes(option.id);
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
                          aria-pressed={pressed}
                          data-native-question-option={option.id}
                          onClick={() =>
                            setValues((current) => {
                              if (!field.allowMultiple) return { ...current, [field.id]: option.id };
                              const have = ids(current[field.id] ?? "");
                              const next = have.includes(option.id)
                                ? have.filter((id) => id !== option.id)
                                : [...have, option.id];
                              return { ...current, [field.id]: next.join(",") };
                            })
                          }
                          className={pressed ? GATE_PRIMARY : GATE_SECONDARY}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    value={values[field.id] ?? ""}
                    data-native-question-input={field.id}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-amber-400"
                  />
                )}
              </fieldset>
            ))
          ) : (
            <textarea
              value={text}
              data-native-question-input=""
              onChange={(event) => setText(event.target.value)}
              rows={2}
              placeholder={tt("写下回答")}
              className="w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-amber-400"
            />
          )}
          <button
            type="submit"
            disabled={!ready || pending.held}
            data-native-question-submit=""
            className={GATE_PRIMARY}
          >
            {tt("提交")}
          </button>
        </form>
      ) : null}
    </GateFrame>
  );
}

/**
 * What the user's computer did while the cloud assistant was using it
 * (device-link protocol §13): "你的电脑没有回应…", "电脑已恢复…". The gateway
 * stores the fixed text of the kind (bridge doc §17.9, no clock times), so the
 * notice is rendered from the kind in the viewer's language (every kind of
 * C11 contract §3), with the time from `meta.health` in the viewer's own
 * clock. A kind this build does not know never shows untranslated Chinese
 * outside a Chinese UI.
 */
function DeviceStatusNotice({
  message,
  highlightQuery,
}: {
  message: AgentMessage;
  highlightQuery?: string;
}) {
  const tt = useUI();
  const health = message.meta?.health;
  const kind =
    health && typeof health === "object" && !Array.isArray(health)
      ? (health as { kind?: unknown }).kind
      : undefined;
  const tone = cloudHealthTone(kind);
  const text = deviceStatusNoticeLine(kind, message.meta?.text ?? message.content, tt);
  const time = deviceStatusNoticeTime(kind, health, tt);
  return (
    <div
      role="status"
      data-device-status={typeof kind === "string" ? kind : "unknown"}
      className={`flex min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
        tone === "ok"
          ? "bg-emerald-50 text-emerald-800"
          : tone === "pause"
            ? "bg-stone-100 text-stone-700"
            : "bg-amber-50 text-amber-800"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          tone === "ok" ? "bg-emerald-500" : tone === "pause" ? "bg-stone-400" : "bg-amber-500"
        }`}
      />
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
        <HighlightedText text={text} query={highlightQuery} />
        {time && (
          <span data-device-status-time className="ml-1.5 text-[11px] opacity-70">
            {time}
          </span>
        )}
      </span>
    </div>
  );
}

function WorkerReportBubble({
  message,
  highlightQuery,
}: {
  message: AgentMessage;
  highlightQuery?: string;
}) {
  const tt = useUI();
  const name =
    (message.meta?.worker_name as string) ||
    (message.meta?.worker as string) ||
    tt("成员");
  return (
    <div className="px-1">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="truncate text-[12px] font-medium text-stone-500">
          {name}
        </span>
        <span className="text-[10px] text-stone-400">
          {tt("成员回答")}
        </span>
      </div>
      <Markdown
        className="text-[14px] leading-relaxed text-neutral-800"
        highlightQuery={highlightQuery}
      >
        {message.content}
      </Markdown>
    </div>
  );
}

function TranscriptAttachment({
  attachment,
}: {
  attachment: AgentAttachment;
}) {
  const tt = useUI();
  const archive = (attachment as { native_archive?: { download_path?: unknown } })
    .native_archive;
  if (
    archive &&
    typeof archive.download_path === "string" &&
    !(attachment.url && (attachment.mime || "").startsWith("image/"))
  ) {
    return (
      <NativeArchivedAttachment
        name={attachment.name || tt("附件")}
        path={archive.download_path}
      />
    );
  }
  const isImage =
    (attachment.mime || "").startsWith("image/") ||
    attachment.media_type === "image" ||
    /\.(png|jpe?g|webp|gif)$/i.test(
      (attachment.url || "").split("?")[0],
    );
  if (isImage && attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        className="block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name || ""}
          className="h-16 w-16 rounded-lg border border-stone-200 object-cover"
        />
      </a>
    );
  }
  if (!attachment.url) {
    return (
      <span className={ATTACHMENT_CHIP} data-native-attachment="">
        <FileGlyph />
        <span className="max-w-[140px] truncate">
          {attachment.name || tt("附件")}
        </span>
      </span>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={ATTACHMENT_CHIP}
    >
      <svg
        className="h-4 w-4 shrink-0 text-stone-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
        <path
          d="M14 3v4h4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="max-w-[140px] truncate">
        {attachment.name || tt("附件")}
      </span>
    </a>
  );
}

const ATTACHMENT_CHIP =
  "flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[12px] text-stone-600 shadow-sm hover:bg-stone-50";

function FileGlyph() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-stone-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 原生对话里存到云端的附件：路径只指向本人可读的路由，点了才换一次性下载地址
 * （同 agent-dialog/ArchivedAttachment），不预取、不内联。
 */
function NativeArchivedAttachment({ name, path }: { name: string; path: string }) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState("");
  const allowed = /^\/v1\/computer-task-sessions\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}$/.test(path);
  async function open() {
    if (busy || !allowed) return;
    setBusy(true);
    setFailed(false);
    try {
      const api = await import("../lib/cloud-computer-api");
      const result = await api.cloudComputerRequest<{ url: string }>(path);
      const parsed = new URL(result.url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid");
      setUrl(parsed.href);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        download={name}
        className={ATTACHMENT_CHIP}
        data-native-archived-attachment="ready"
      >
        <FileGlyph />
        <span className="max-w-[140px] truncate">{name}</span>
        <span className="shrink-0 text-[11px] text-stone-400">{tt("下载")}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={busy || !allowed}
      onClick={() => void open()}
      className={`${ATTACHMENT_CHIP} disabled:cursor-default`}
      data-native-archived-attachment=""
      title={failed ? tt("附件读取失败") : name}
    >
      <FileGlyph />
      <span className="max-w-[140px] truncate">
        {busy ? tt("正在读取…") : failed ? tt("附件读取失败") : name}
      </span>
    </button>
  );
}
