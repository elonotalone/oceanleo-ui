"use client";

// leo 在会话里的回复（流式）与只给触发人看的提示行。占位，由 W06 实现（work-chat 契约 §8.2）。
import type { ImMessage } from "../../../lib/im/types";

export interface LeoMessageBodyProps {
  message: ImMessage;
  streamingText?: string;
}

export function LeoMessageBody({ message, streamingText }: LeoMessageBodyProps) {
  return <div className="whitespace-pre-wrap">{streamingText ?? message.body}</div>;
}

export type LeoNoticeCode = "insufficient_balance" | "disabled" | "queued" | "failed";

export function LeoNoticeLine(_props: { code: LeoNoticeCode }) {
  return null;
}
