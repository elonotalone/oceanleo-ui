"use client";

// ============================================================================
// @oceanleo/ui — 「叫真人」入口按钮（talent-market-v1 W13）
// ----------------------------------------------------------------------------
// 这是本产品最值钱的那一个按钮：用户在 AI 对话里卡住，按一下，真人就被叫进来，
// 而**不用离开当前场景**、不用把 AI 已经讲过的东西再用人话重讲一遍。
//
// 按钮本身只做两件事：把当前会话里可授权的消息与产物摘成候选清单，然后开弹窗。
// 勾选、白名单与撤回的语义都在 HumanHandoffDialog / HumanHandoffStatus 里。
// ============================================================================

import { useMemo, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  HumanHandoffDialog,
  type HandoffContextCandidate,
} from "./HumanHandoffDialog";
import type { Handoff, HandoffOriginKind } from "../api/talent-handoff";
import type { AgentMessage } from "../lib/agent";

export interface HumanHandoffButtonProps {
  /** 会话 id（合同 §3.1 的 `origin_ref`）。空 = 还没有会话，本按钮不渲染。 */
  originRef: string;
  /** 当前对话流。用来摘出可勾选的消息与产物；**不会**被整段送出去。 */
  messages?: AgentMessage[];
  originKind?: HandoffOriginKind;
  accent?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
  onCreated?: (handoff: Handoff) => void;
}

const PREVIEW_MAX_LENGTH = 140;

function previewOf(content: string): string {
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_MAX_LENGTH);
}

/**
 * 从对话流摘出「可以逐条勾选交出去」的候选。
 *   - 消息：有正文的对话条（`id <= 0` 的乐观占位不算，它还没有服务端 ref）。
 *   - 产物：只收有 durable id 的（`agent_artifacts` 那一行），没 id 的产物无法授权。
 * 这里刻意**不**返回任何「已选中」标记：默认全不选是产品判据。
 */
export function handoffContextCandidates(
  messages: readonly AgentMessage[],
): HandoffContextCandidate[] {
  const candidates: HandoffContextCandidate[] = [];
  let userTurn = 0;
  let agentTurn = 0;
  for (const message of messages) {
    if (!Number.isSafeInteger(message.id) || message.id <= 0) continue;
    const artifact = message.meta?.artifact;
    if (artifact?.id) {
      candidates.push({
        kind: "artifact",
        ref: artifact.id,
        label: artifact.title || artifact.type || "产物",
        preview: previewOf(message.content || artifact.url || ""),
      });
    }
    const body = previewOf(message.content);
    if (!body) continue;
    if (message.kind && !["text", "report", "answer"].includes(message.kind)) {
      continue;
    }
    if (message.role === "user") {
      userTurn += 1;
      candidates.push({
        kind: "message",
        ref: String(message.id),
        label: `我说的第 ${userTurn} 句`,
        preview: body,
      });
    } else {
      agentTurn += 1;
      candidates.push({
        kind: "message",
        ref: String(message.id),
        label: `AI 的第 ${agentTurn} 段回答`,
        preview: body,
      });
    }
  }
  return candidates;
}

export function HumanHandoffButton({
  originRef,
  messages = [],
  originKind = "conversation",
  accent = "#4f46e5",
  disabled = false,
  label,
  className,
  onCreated,
}: HumanHandoffButtonProps) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const candidates = useMemo(
    () => handoffContextCandidates(messages),
    [messages],
  );

  // 还没有会话就没有「正在进行的一段工作」可交，按钮不该存在。
  if (!originRef) return null;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={tt("把这段工作交给真人（你勾选的内容才会给对方看到）")}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 active:scale-95 disabled:opacity-50"
        }
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          style={{ color: accent }}
        >
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
        </svg>
        {label ?? tt("叫真人")}
      </button>
      {open && (
        <HumanHandoffDialog
          originRef={originRef}
          originKind={originKind}
          candidates={candidates}
          accent={accent}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
