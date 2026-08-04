"use client";

/**
 * 右栏五个固定槽位的**选中状态**。从 `ResultCanvas.tsx` 原样搬出来的一段，行为逐字
 * 未变：受控 `active`、`focusNonce`、会话快照恢复、总线 action 与深链 pin 的优先级
 * 全部照抄。拆分理由只有尺寸闸（工作台模块 600 软顶 / 800 硬顶）。
 *
 * 这里**不新增也不删除任何槽位**：槽位表仍然只有 `workspace-actions.ts` 的
 * `FIXED_WORKSPACE_SLOTS` 一份，本模块只从中过滤出可见的那几个。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FIXED_WORKSPACE_SLOTS,
  WORKSPACE_ACTION_EVENT,
  normalizeWorkspaceAction,
  type WorkspaceActionEnvelope,
  type WorkspaceSlotId,
} from "./workspace-actions";
import type { RuntimeHydrationValue } from "./workspace-runtime-hydration";

export interface WorkspaceSlotStateInput {
  active?: string;
  showTemplate: boolean;
  focusNonce?: number;
  externalAction?: WorkspaceActionEnvelope | null;
  runtimeHydration: RuntimeHydrationValue | null;
  slotForId: (id: string) => WorkspaceSlotId;
  callerIdForSlot: (id: WorkspaceSlotId) => string | null;
  onChange?: (id: string) => void;
}

export interface WorkspaceSlotState {
  selected: WorkspaceSlotId;
  visibleSlots: WorkspaceSlotId[];
  templatePageId: string;
  setTemplatePageId: (id: string) => void;
  select: (id: WorkspaceSlotId) => void;
  actionFor: (slot: WorkspaceSlotId) => WorkspaceActionEnvelope | null;
}

export function useWorkspaceSlotState({
  active,
  showTemplate,
  focusNonce,
  externalAction,
  runtimeHydration,
  slotForId,
  callerIdForSlot,
  onChange,
}: WorkspaceSlotStateInput): WorkspaceSlotState {
  const restoredSlot = slotForId(runtimeHydration?.rightTab || "");
  // 身份必须稳定：调用方把它放进 layout effect 的依赖里，每帧换一个新数组会让右栏
  // 标签条每帧重注册一次。
  const visibleSlots = useMemo(
    () =>
      FIXED_WORKSPACE_SLOTS.filter((slot) => showTemplate || slot !== "template"),
    [showTemplate],
  );
  const [internal, setInternal] = useState<WorkspaceSlotId>(() => {
    const requested = runtimeHydration?.rightTab
      ? restoredSlot
      : active
        ? slotForId(active)
        : showTemplate
          ? "template"
          : "preview";
    return !showTemplate && requested === "template" ? "preview" : requested;
  });
  const [templatePageId, setTemplatePageId] = useState(() => {
    const restoredTemplate = runtimeHydration?.rightTab || "";
    if (restoredTemplate && slotForId(restoredTemplate) === "template") {
      return restoredTemplate;
    }
    return active && slotForId(active) === "template" ? active : "";
  });
  const [workspaceAction, setWorkspaceAction] =
    useState<WorkspaceActionEnvelope | null>(null);
  // ── 显式请求 vs 会话恢复的优先级 ────────────────────────────────────────────
  // 深链在挂载那一刻**同步**派发（`useCatalogDeepLink` → 总线 → 下面的监听），可是会话
  // 快照是**异步**回来的（`FunctionAgentChat` 取到 session 才调 `restoreSharedUi`）。
  // 快照一落地，下面那条恢复 effect 就会无条件 `setInternal(快照栏位)`，把用户此刻明确
  // 请求的落点覆盖掉——「预览&编辑」跳错面的第二个成因就是这个，与 `mine` 常量那条叠加。
  //
  // 修法是**显式的优先级**，不是定时器也不是抢跑：凡是走过总线的 action（深链与 agent
  // receipt 同一条通道）都在这里留下一枚 pin，恢复 effect 见到 pin 就让路——谁先落地都
  // 得到同一个结果，所以这条不会随渲染时序漂移。pin 只认总线 action，不认用户手点标签页
  // 与 `focusNonce`：那两条不是深链，无深链时的恢复行为必须逐字不变。
  const explicitSlotRef = useRef<{
    identity: string;
    slot: WorkspaceSlotId;
  } | null>(null);
  const pinExplicitSlot = useCallback(
    (slot: WorkspaceSlotId) => {
      explicitSlotRef.current = {
        identity: runtimeHydration?.identity || "",
        slot,
      };
    },
    [runtimeHydration?.identity],
  );
  const selected =
    !showTemplate && internal === "template" ? "preview" : internal;
  const previousActive = useRef(active);

  const select = useCallback(
    (id: WorkspaceSlotId) => {
      if (!showTemplate && id === "template") return;
      setInternal(id);
      // Existing sites persist their local `result/material/mine` ids in app
      // snapshots. Keep that callback contract while the shared runtime stores
      // the canonical fixed-slot id below.
      const callerId = callerIdForSlot(id);
      if (callerId) onChange?.(callerId);
      runtimeHydration?.setRightTab(id);
    },
    [callerIdForSlot, onChange, runtimeHydration, showTemplate],
  );

  useEffect(() => {
    if (active === undefined) {
      previousActive.current = undefined;
      return;
    }
    if (active === previousActive.current) return;
    previousActive.current = active;
    const requested = slotForId(active);
    const slot =
      !showTemplate && requested === "template" ? "preview" : requested;
    setInternal(slot);
    if (slot === "template") setTemplatePageId(active);
  }, [active, showTemplate, slotForId]);

  useEffect(() => {
    runtimeHydration?.setDefaultRightTab(showTemplate ? "template" : "preview");
  }, [runtimeHydration?.identity, showTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!runtimeHydration?.restoredSnapshot) return;
    const pinned =
      explicitSlotRef.current?.identity === runtimeHydration.identity
        ? explicitSlotRef.current.slot
        : null;
    if (pinned) {
      // 深链/receipt 赢。同时把快照带回来的 `rightTab` 覆盖成这个栏位：`restoreSharedUi`
      // 刚刚改写了 hydration 里的 rightTab，不覆盖回来的话下一次保存会把旧栏位写回去，
      // 用户再进来又跑偏——那等于这条竞态只修了看得见的那一半。
      if (runtimeHydration.rightTab !== pinned) {
        runtimeHydration.setRightTab(pinned);
      }
      return;
    }
    const restoredRightTab = runtimeHydration.rightTab || "";
    const requested = slotForId(restoredRightTab);
    const slot =
      !showTemplate && requested === "template" ? "preview" : requested;
    setInternal(
      restoredRightTab
        ? slot
        : active
          ? !showTemplate && slotForId(active) === "template"
            ? "preview"
            : slotForId(active)
          : showTemplate
            ? "template"
            : "preview",
    );
    if (restoredRightTab && slot === "template") {
      setTemplatePageId(restoredRightTab);
    }
  }, [
    runtimeHydration?.snapshotRestoreEpoch,
    runtimeHydration?.identity,
    showTemplate,
    slotForId,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const previousFocusNonce = useRef(focusNonce);
  useEffect(() => {
    if (focusNonce === previousFocusNonce.current) return;
    previousFocusNonce.current = focusNonce;
    select("preview");
  }, [focusNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceActionEnvelope>).detail;
      const action = normalizeWorkspaceAction(detail?.action);
      if (!action) return;
      const envelope = {
        nonce: String(detail?.nonce || Date.now()),
        action,
      };
      setWorkspaceAction(envelope);
      pinExplicitSlot(action.tab);
      select(action.tab);
    };
    window.addEventListener(WORKSPACE_ACTION_EVENT, receive);
    return () => window.removeEventListener(WORKSPACE_ACTION_EVENT, receive);
  }); // select intentionally reads the latest controlled props.

  useEffect(() => {
    if (!externalAction) return;
    const action = normalizeWorkspaceAction(externalAction.action);
    if (!action) return;
    setWorkspaceAction({ nonce: externalAction.nonce, action });
    pinExplicitSlot(action.tab);
    select(action.tab);
  }, [externalAction?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionFor = useCallback(
    (slot: WorkspaceSlotId) =>
      workspaceAction?.action.tab === slot ? workspaceAction : null,
    [workspaceAction],
  );

  return {
    selected,
    visibleSlots,
    templatePageId,
    setTemplatePageId,
    select,
    actionFor,
  };
}
