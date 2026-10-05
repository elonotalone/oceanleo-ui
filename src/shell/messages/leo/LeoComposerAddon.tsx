"use client";

// @leo 时输入框上的付款人选择（Team 群：个人 / Team 钱包）。占位，由 W06 实现（work-chat 契约 §8.2）。
import type { ImConversationDetail } from "../../../lib/im/types";

export interface LeoPayerChoice {
  kind: "personal" | "team";
  org_id: string | null;
}

export interface LeoComposerAddonProps {
  conversation: ImConversationDetail;
  mentionActive: boolean;
  value: LeoPayerChoice | null;
  onChange: (value: LeoPayerChoice | null) => void;
}

export function LeoComposerAddon(_props: LeoComposerAddonProps) {
  return null;
}
