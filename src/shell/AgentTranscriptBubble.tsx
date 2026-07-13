"use client";

import { useState } from "react";
import type { AgentAttachment, AgentMessage } from "../lib/agent";
import { useUI, type UITranslate } from "../i18n/ui/useUI";
import { Markdown, TypewriterMarkdown } from "./Markdown";

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

export function AgentTranscriptBubble({
  message,
  streaming = false,
  onBranch,
  gateActive = false,
  gateBusy = false,
  onGate,
}: {
  message: AgentMessage;
  streaming?: boolean;
  onBranch?: () => void;
  gateActive?: boolean;
  gateBusy?: boolean;
  onGate?: (decision: "approve" | "reject", feedback: string) => void;
}) {
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
            {message.content}
          </div>
        )}
        {onBranch && (
          <button
            type="button"
            onClick={onBranch}
            className="px-1 text-[11px] text-stone-300 opacity-0 transition hover:text-stone-600 group-hover:opacity-100 focus:opacity-100"
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
      />
    );
  }
  if (message.kind === "plan") {
    // 克制版（操作员 2026-07-12：agent 正文不许被色块包裹）：计划用极细左边线 + 中性小字，
    // 不再是一整块灰底圆角卡片。
    return (
      <div className="border-l-2 border-stone-200 pl-3">
        <Markdown className="text-[14px] leading-relaxed text-stone-500">
          {message.content}
        </Markdown>
      </div>
    );
  }
  if (message.kind === "report") {
    return <WorkerReportBubble message={message} />;
  }
  if (message.kind === "step") {
    return (
      <div className="px-1 text-[13px] font-medium text-stone-500">
        {message.content}
      </div>
    );
  }
  if (message.kind === "error") {
    return (
      <div className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-600">
        {message.content}
      </div>
    );
  }
  if (
    message.meta?.artifact?.type === "preview" &&
    message.meta.artifact.url
  ) {
    // 克制版（操作员 2026-07-12：不许色块 + 不许 ✓/✅ 图标）：预览就绪 = 一行中性小字 +
    // 文字链接，无 emerald 底色、无对钩图标。
    return (
      <div className="flex items-center gap-2 px-1 text-[13px] text-stone-500">
        <span className="min-w-0 flex-1">
          {tt("实时预览已就绪，已显示在右侧。")}
        </span>
        <a
          href={message.meta.artifact.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
        >
          {tt("新窗口打开")}
        </a>
      </div>
    );
  }
  if (message.meta?.artifact && message.meta.final) {
    // 克制版（操作员 2026-07-12）：已生成结果 = 中性小字提示，无 emerald 底色、无 ✅。
    return (
      <div className="px-1 text-[13px] text-stone-500">
        {tt("已生成结果，见右侧「{label}」面板。", {
          label:
            artifactLabels[message.meta.artifact.type] || tt("结果"),
        })}
      </div>
    );
  }

  return (
    <div className="max-w-full px-1 text-neutral-900">
      <TypewriterMarkdown content={message.content} active={streaming} />
    </div>
  );
}

function GateBubble({
  message,
  active,
  busy,
  onGate,
}: {
  message: AgentMessage;
  active: boolean;
  busy: boolean;
  onGate?: (decision: "approve" | "reject", feedback: string) => void;
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
        {prompt}
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

function WorkerReportBubble({ message }: { message: AgentMessage }) {
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
      <Markdown className="text-[14px] leading-relaxed text-neutral-800">
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
