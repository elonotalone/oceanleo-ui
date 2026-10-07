"use client";

// leo 在会话里的回复（流式）与只给提问人看的提示行（work-chat 契约 §5、§8.2、§9.9）。
// 正文走 Markdown / TypewriterMarkdown：不渲染原始 HTML（契约 §10）。
import { useEffect, useState } from "react";
import type { ImMessage } from "../../../lib/im/types";
import { cancelLeo, fetchMyUserId } from "../../../lib/im/leo-api";
import { useUI } from "../../../i18n/ui/useUI";
import { Markdown, TypewriterMarkdown } from "../../Markdown";
import { portalHref } from "../../cloud-computer/server-page/href";

export interface LeoMessageBodyProps {
  message: ImMessage;
  streamingText?: string;
}

export type LeoNoticeCode = "insufficient_balance" | "disabled" | "queued" | "failed";

export type LeoStatusKind = "streaming" | "done" | "failed" | "cancelled";

/** 画哪段字：流式中取（本地累积的增量 / 已落库的正文）里更长的；结束后以落库正文为准。 */
export function leoDisplayText(message: ImMessage, streamingText?: string): string {
  const stored = message.body ?? "";
  const status = message.leo?.status ?? "done";
  if (status === "streaming") {
    const live = streamingText ?? "";
    return live.length >= stored.length ? live : stored;
  }
  return stored || streamingText || "";
}

/** 触发人 = 这条回复引用的那条消息的发送人；只有他能停。 */
export function leoTriggerId(message: ImMessage): string | null {
  return message.quote?.sender_id ?? null;
}

/** 余额不足的充值入口：沿用现有 `/settings/billing`，在子站上指向门户。 */
export function leoTopUpHref(): string {
  return portalHref("/settings/billing");
}

/** 只有触发人在回复还在生成时能停。 */
export function leoCanStop(message: ImMessage, myUserId: string | null): boolean {
  return (
    (message.leo?.status ?? "done") === "streaming" &&
    Boolean(myUserId) &&
    leoTriggerId(message) === myUserId
  );
}

function useMyUserId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMyUserId().then((value) => {
      if (!cancelled) setId(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return id;
}

export function LeoMessageBody({ message, streamingText }: LeoMessageBodyProps) {
  const tt = useUI();
  const myId = useMyUserId();
  const [stopping, setStopping] = useState(false);
  const status: LeoStatusKind = message.leo?.status ?? "done";
  const streaming = status === "streaming";
  const text = leoDisplayText(message, streamingText);
  const canStop = leoCanStop(message, myId);

  const stop = () => {
    if (stopping) return;
    setStopping(true);
    cancelLeo(message.id).catch(() => setStopping(false));
  };

  let footer: string | null = null;
  if (status === "cancelled") footer = tt("已停止生成");
  else if (status === "failed") {
    footer =
      message.leo?.error_code === "interrupted"
        ? tt("这条回复被中断了，没有完成。")
        : tt("leo 出错了，这条回复没有完成。");
  }

  return (
    <div className="min-w-0" data-leo-message="" data-leo-status={status}>
      {text ? (
        streaming ? (
          <TypewriterMarkdown content={text} active />
        ) : (
          <Markdown className="text-[15px] leading-relaxed">{text}</Markdown>
        )
      ) : streaming ? (
        <div className="flex items-center gap-1.5 text-[13px] text-neutral-400" data-leo-thinking="">
          <span className="inline-flex gap-0.5" aria-hidden="true">
            <span className="v-typing-dot" />
            <span className="v-typing-dot" />
            <span className="v-typing-dot" />
          </span>
          {tt("leo 正在回复…")}
        </div>
      ) : null}
      {canStop ? (
        <button
          type="button"
          onClick={stop}
          disabled={stopping}
          data-leo-stop=""
          className="mt-1.5 rounded-md px-2 py-0.5 text-[12px] text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
        >
          {tt("停止")}
        </button>
      ) : null}
      {footer ? (
        <div
          className={
            "mt-1 text-[12px] " + (status === "failed" ? "text-red-600" : "text-neutral-400")
          }
          data-leo-footer={status}
        >
          {footer}
        </div>
      ) : null}
      {status === "done" && message.leo?.payer === "team" ? (
        <div className="mt-1 text-[11.5px] text-neutral-400" data-leo-payer-note="team">
          {tt("由 Team 钱包付费")}
        </div>
      ) : null}
    </div>
  );
}

/** 只有提问人自己看得到的提示，画在触发消息下方；不落库、不广播。 */
export function LeoNoticeLine({ code }: { code: LeoNoticeCode }) {
  const tt = useUI();
  const text =
    code === "insufficient_balance"
      ? tt("余额不足，leo 没有回复。")
      : code === "disabled"
        ? tt("这个会话里 leo 已被关闭。")
        : code === "queued"
          ? tt("前面还有一轮 leo 在回复，轮到你时会自动开始。")
          : tt("leo 这次没能开始回复，请稍后再试。");
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 text-[12px] text-neutral-500"
      data-leo-notice={code}
      role="status"
    >
      <span>{text}</span>
      {code === "insufficient_balance" ? (
        <a
          href={leoTopUpHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-neutral-800 underline"
          data-leo-topup=""
        >
          {tt("去充值")}
        </a>
      ) : null}
      <span className="text-neutral-400">{tt("仅你可见")}</span>
    </div>
  );
}
