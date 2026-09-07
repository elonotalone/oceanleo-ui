"use client";

import { useState } from "react";
import type { AgentAttachment, AgentMessage } from "../lib/agent";
import { useUI, type UITranslate } from "../i18n/ui/useUI";
import { HighlightedText, Markdown, TypewriterMarkdown } from "./Markdown";
import { ShareCheckbox } from "./share/ShareActionBar";
import { writeClipboardText } from "./share/share-clipboard";

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
  const iconClass = "h-4 w-4";
  const buttonClass =
    "inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] text-stone-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-700";
  return (
    <div className="mt-1 flex items-center gap-0.5 opacity-0 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-hover/message:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        title={tt("复制")}
        aria-label={tt("复制")}
        className={buttonClass}
        onClick={() => {
          void writeClipboardText(content).then((ok) => {
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
  highlightQuery,
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
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed text-neutral-900">
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
  if (message.kind === "plan") {
    // 克制版（操作员 2026-07-12：agent 正文不许被色块包裹）：计划用极细左边线 + 中性小字，
    // 不再是一整块灰底圆角卡片。
    return (
      <div className="border-l-2 border-stone-200 pl-3">
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
      <div className="px-1 text-[13px] font-medium text-stone-500">
        <HighlightedText text={message.content} query={highlightQuery} />
      </div>
    );
  }
  if (message.kind === "error") {
    return (
      <div className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-600">
        <HighlightedText text={message.content} query={highlightQuery} />
      </div>
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
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3">
      <p className="text-[12px] font-semibold text-amber-800">
        {active ? tt("需要你确认") : tt("已处理的确认")}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-amber-900">
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
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[12px] text-stone-600 shadow-sm hover:bg-stone-50"
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
