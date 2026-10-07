"use client";

// 一条消息的正文：人发的走自己的 `message-format`（不走完整 Markdown，免得把普通文字误解析）。
import { useMemo, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImMessage, ImProfile } from "../../../lib/im/types";
import { LEO_MENTION } from "../leo/leo-mention";
import { renderMessageBody, type MentionRef } from "./message-format";

/** 把消息的 mentions / mention_all / mention_leo 变成解析器要的名字表。 */
export function mentionRefsFor(
  message: Pick<ImMessage, "mentions" | "mention_all" | "mention_leo">,
  profiles: Record<string, ImProfile | undefined>,
  allLabel: string,
): MentionRef[] {
  const refs: MentionRef[] = [];
  for (const id of message.mentions) {
    const name = profiles[id]?.display_name;
    if (name) refs.push({ id, label: name, kind: "user" });
  }
  if (message.mention_all) refs.push({ id: "all", label: allLabel, kind: "all" });
  if (message.mention_leo) refs.push({ id: LEO_MENTION.id, label: LEO_MENTION.label, kind: "leo" });
  return refs;
}

export function MessageBody({
  message,
  profiles,
  viewerId,
  onOpenProfile,
  highlight,
}: {
  message: ImMessage;
  profiles: Record<string, ImProfile | undefined>;
  viewerId: string | null;
  onOpenProfile?: (userId: string) => void;
  highlight?: ReactNode;
}) {
  const tt = useUI();
  const allLabel = tt("所有人");
  const nodes = useMemo(
    () =>
      renderMessageBody(
        message.body,
        { mentions: mentionRefsFor(message, profiles, allLabel) },
        { onMentionClick: onOpenProfile, viewerId },
      ),
    [message, profiles, allLabel, onOpenProfile, viewerId],
  );
  if (!message.body) return null;
  return (
    <div className="space-y-1 text-[14px] leading-[1.55] text-neutral-900" data-message-body="">
      {nodes}
      {highlight}
    </div>
  );
}
