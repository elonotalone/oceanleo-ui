"use client";

// @leo 时输入框上的付款人选择（work-chat 契约 §8.2、§9.9）。
// 只在 Team 群（会话挂了 org_id）且正在 @leo 时出现：个人钱包 / Team 钱包。个人会话、普通群什么都不画。
import { useEffect, useState } from "react";
import type { ImConversationDetail } from "../../../lib/im/types";
import {
  fetchLeoStatus,
  initialPayerChoice,
  teamOption,
  type LeoPayerChoice,
  type LeoStatus,
  type LeoTeamPayerOption,
} from "../../../lib/im/leo-api";
import { persistedPayerOrgId } from "../../../lib/payer";
import { useUI } from "../../../i18n/ui/useUI";

export type { LeoPayerChoice } from "../../../lib/im/leo-api";

export interface LeoComposerAddonProps {
  conversation: ImConversationDetail;
  mentionActive: boolean;
  value: LeoPayerChoice | null;
  onChange: (value: LeoPayerChoice | null) => void;
}

/** 本次页面会话里每个 Team 选过什么，重新挂载输入框时不丢。 */
const chosenHere = new Map<string, "personal" | "team">();

export function resetLeoPayerMemoryForTests(): void {
  chosenHere.clear();
}

export function leoAddonEligible(conversation: ImConversationDetail, mentionActive: boolean): boolean {
  return (
    mentionActive &&
    Boolean(conversation.org_id) &&
    conversation.leo_enabled !== false &&
    !conversation.dissolved &&
    conversation.kind !== "talent"
  );
}

export function LeoPayerSwitch({
  option,
  value,
  onSelect,
}: {
  option: LeoTeamPayerOption;
  value: "personal" | "team";
  onSelect: (kind: "personal" | "team") => void;
}) {
  const tt = useUI();
  const teamLabel = option.name ? tt("{name} 钱包", { name: option.name }) : tt("Team 钱包");
  const choices: Array<{ kind: "personal" | "team"; label: string }> = [
    { kind: "personal", label: tt("个人钱包") },
    { kind: "team", label: teamLabel },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={tt("这次谁付钱")}
      title={tt("leo 的回复按用量计费，从所选钱包扣除。")}
      data-leo-payer=""
      className="inline-flex max-w-full items-center gap-1.5 text-[12px] text-neutral-500"
    >
      <span className="shrink-0">{tt("这次谁付钱")}</span>
      <span className="inline-flex min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {choices.map((choice) => {
          const selected = value === choice.kind;
          return (
            <button
              key={choice.kind}
              type="button"
              role="radio"
              aria-checked={selected}
              data-payer-kind={choice.kind}
              onClick={() => onSelect(choice.kind)}
              className={
                "max-w-[9.5rem] truncate px-2.5 py-1 transition-colors " +
                (selected
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800")
              }
            >
              {choice.label}
            </button>
          );
        })}
      </span>
    </div>
  );
}

export function LeoComposerAddon({ conversation, mentionActive, value, onChange }: LeoComposerAddonProps) {
  const eligible = leoAddonEligible(conversation, mentionActive);
  const conversationId = conversation.id;
  const [status, setStatus] = useState<LeoStatus | null>(null);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    fetchLeoStatus(conversationId)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        // 读不到付款人信息就不画控件：发消息照常走个人钱包，不挡住输入。
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eligible, conversationId]);

  const option = teamOption(status);
  const usable = eligible && option !== null && option.allowed;

  useEffect(() => {
    if (!eligible || !status) return;
    if (!option || !option.allowed) {
      if (value) onChange(null); // 我已经不能用这个 Team 的钱了（被移出 / Team 停用）
      return;
    }
    if (value === null) {
      onChange(
        initialPayerChoice({
          option,
          defaultPayer: status.default_payer,
          remembered: persistedPayerOrgId(),
          chosenHere: chosenHere.get(option.org_id) ?? null,
        }),
      );
    }
  }, [eligible, status, option, value, onChange]);

  if (!usable || !option) return null;
  const current: "personal" | "team" = value?.kind === "team" ? "team" : "personal";
  return (
    <LeoPayerSwitch
      option={option}
      value={current}
      onSelect={(kind) => {
        chosenHere.set(option.org_id, kind);
        onChange(kind === "team" ? { kind: "team", org_id: option.org_id } : { kind: "personal", org_id: null });
      }}
    />
  );
}
