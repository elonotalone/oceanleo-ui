"use client";

/**
 * 审阅面板的自带宿主。
 *
 * 为什么要有它（`PARENT-red-1` 修完之后浮出来的第二半）：闸把 agent 的改动停成提案之后，
 * 用户必须**能在同一个面板里看到并点头**。`AgentReviewPanel` 原来只挂在 `AgentChat` 与
 * `AgentConsole` 里；`PluginAgentPanel`（13 件编辑器共用的「AI 助手」抽屉）走的是
 * `FunctionAgentChat`，那里一份都没有 —— 那样 agent 会说「改动已送审阅」，而用户在这个
 * 抽屉里翻不到任何东西可点。停写是对的，但人被卡住了，这不算做到。
 *
 * 所以接受/拒绝/回滚这套动作收成一份（原来在 `AgentChat` 与 `AgentConsole` 里各抄了一遍），
 * 由 `FunctionAgentChat` 自带一个 dock。宿主自己已经挂了面板时用
 * `AgentReviewHostProvided` 圈住那棵子树，dock 就让位，屏幕上永远只有一份面板。
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { currentPluginCommandSurface } from "../plugin-command/registry";
import { AgentReviewPanel } from "./AgentReviewPanel";
import { applyParkedReview } from "./gate";
import { emitReviewDecision } from "./install";
import { hostReviewSession, revisionNumber, type ReviewSession } from "./session";

const ReviewPanelMounted = createContext(false);

/** 圈住「这棵子树里已经有一份审阅面板了」，里面的 dock 一律让位。 */
export function AgentReviewHostProvided({ children }: { children: ReactNode }) {
  return (
    <ReviewPanelMounted.Provider value={true}>{children}</ReviewPanelMounted.Provider>
  );
}

export interface HostReviewActions {
  busy: boolean;
  accept: () => Promise<void>;
  reject: () => void;
  rollback: () => Promise<void>;
}

/**
 * 接受 / 拒绝 / 回滚三个动作。
 *
 * 接受与回滚都经 `applyParkedReview()` —— 只有它带 apply token，闸才让这一次写穿到文档；
 * agent 自己的 `run()` 永远拿不到这个 token。
 */
export function useHostReviewActions(
  session: ReviewSession = hostReviewSession,
): HostReviewActions {
  const [busy, setBusy] = useState(false);

  const accept = useCallback(async () => {
    const snap = session.snapshot();
    if (!snap.parked || snap.status !== "open") return;
    const surface = currentPluginCommandSurface();
    if (!surface) return;
    setBusy(true);
    const result = await applyParkedReview(surface, snap.parked);
    setBusy(false);
    if (!result.ok) return;
    session.markApplied(
      typeof result.revision === "number" ? result.revision : snap.currentRevision,
    );
    emitReviewDecision({
      proposalId: snap.parked.proposal.proposalId,
      decision: "accept",
      editorId: snap.parked.editorId,
    });
  }, [session]);

  const reject = useCallback(() => {
    const snap = session.snapshot();
    const proposalId = snap.parked?.proposal.proposalId;
    const editorId = snap.parked?.editorId;
    session.markDiscarded();
    if (proposalId) emitReviewDecision({ proposalId, decision: "reject", editorId });
  }, [session]);

  const rollback = useCallback(async () => {
    const inverse = session.rollback();
    if (!inverse) return;
    const surface = currentPluginCommandSurface();
    if (!surface) return;
    setBusy(true);
    const result = await applyParkedReview(surface, inverse);
    setBusy(false);
    if (!result.ok) return;
    session.markApplied(
      typeof result.revision === "number"
        ? result.revision
        : revisionNumber(inverse.proposal.revision),
    );
  }, [session]);

  return { busy, accept, reject, rollback };
}

/** 自带的审阅面板：宿主没挂过就由它挂，挂过就让位。 */
export function AgentReviewDock({
  session = hostReviewSession,
}: {
  session?: ReviewSession;
}) {
  const alreadyMounted = useContext(ReviewPanelMounted);
  const actions = useHostReviewActions(session);
  if (alreadyMounted) return null;
  return (
    <div data-agent-review-dock>
      <AgentReviewPanel
        session={session}
        busy={actions.busy}
        onAccept={() => void actions.accept()}
        onReject={actions.reject}
        onRollback={() => void actions.rollback()}
      />
    </div>
  );
}
