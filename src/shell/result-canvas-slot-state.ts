"use client";

/**
 * 右栏五个固定槽位的**选中状态**。从 `ResultCanvas.tsx` 原样搬出来的一段，行为逐字
 * 未变：受控 `active`、`focusNonce`、会话快照恢复、总线 action 与深链 pin 的优先级
 * 全部照抄。拆分理由只有尺寸闸（工作台模块 600 软顶 / 800 硬顶）。
 *
 * 这里**不新增也不删除任何槽位**：槽位表仍然只有 `workspace-actions.ts` 的
 * `FIXED_WORKSPACE_SLOTS` 一份，本模块只从中过滤出可见的那几个。
 *
 * 2026-10-09：右侧栏顶上那一行标签换成了卡片首页，所以本模块多管一个值 `layer`——
 * 此刻给人看的是卡片（home）、选中的那个槽位（slot）、还是 LeoBay / LeoChat 那两块。
 * 槽位选中值怎么定一行没改；`layer` 只在「明确的请求」到来时变：
 *   - `select`、总线 / 属性 action、`focusNonce`、宿主改受控 `active` → `slot`；
 *   - 宿主把 `active` 改成 `"home"` → `home`；
 *   - 会话快照恢复**不动** `layer`（它只改选中值）。
 * `layer` 用同一个 hook 里的 state，而不是另起一个计数器让别人去追：这些请求大多发生在
 * effect 里，多一次无谓的重渲染会让 `actionFor()` 提前变回 null（action 已被消费），
 * 正在按 id 取素材的那次请求就被取消了（`g3-website-material-restore` 钉着这条）。
 * 值没变时 `setLayer` 不触发渲染，所以原来停在槽位上的宿主一帧都不多画。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FIXED_WORKSPACE_SLOTS,
  WORKSPACE_ACTION_EVENT,
  isWorkspaceActionConsumed,
  normalizeWorkspaceAction,
  type WorkspaceActionEnvelope,
  type WorkspacePanelId,
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

/** 右侧栏此刻给人看的是哪一层。`slot` = 看 `selected`。 */
export type WorkspaceLayer = "home" | "slot" | WorkspacePanelId;

/** 受控 `active` 的这两个值表示「卡片首页」，不对应任何槽位。 */
export function isWorkspaceHomeId(id: string | undefined): boolean {
  return id === "home" || id === "";
}

export interface WorkspaceSlotState {
  selected: WorkspaceSlotId;
  visibleSlots: WorkspaceSlotId[];
  templatePageId: string;
  setTemplatePageId: (id: string) => void;
  select: (id: WorkspaceSlotId) => void;
  actionFor: (slot: WorkspaceSlotId) => WorkspaceActionEnvelope | null;
  /**
   * 此刻的层。宿主一开始把受控 `active` 给成 `"home"`（各站的 agent 对话页）→ 从卡片开始；
   * 别的宿主（操作台页，自己管着一组结果标签）→ 从槽位开始，与改版前相同。
   */
  layer: WorkspaceLayer;
  /** 换层（点卡片进 LeoBay / LeoChat、返回卡片）。进槽位请用 `select`。 */
  setLayer: (layer: WorkspaceLayer) => void;
  /** 最近一条指向 LeoBay 那一块的 action（`tab === "bay"`）；它不是槽位，不参与选中。 */
  panelAction: WorkspaceActionEnvelope | null;
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
  const [layer, setLayer] = useState<WorkspaceLayer>(() =>
    isWorkspaceHomeId(active) ? "home" : "slot",
  );
  const [panelAction, setPanelAction] =
    useState<WorkspaceActionEnvelope | null>(null);
  // ── 显式请求 vs 会话恢复的优先级 ────────────────────────────────────────────
  // 深链在挂载那一刻**同步**派发（`useCatalogDeepLink` → 总线 → 下面的监听），可是会话
  // 快照是**异步**回来的（`FunctionAgentChat` 取到 session 才调 `restoreSharedUi`）。
  // 快照一落地，下面那条恢复 effect 就会无条件 `setInternal(快照栏位)`，把用户此刻明确
  // 请求的落点覆盖掉——「预览&编辑」跳错面的第二个成因就是这个，与 `mine` 常量那条叠加。
  //
  // 修法是**显式的优先级**，不是定时器也不是抢跑：凡是走过总线的 action（深链与 agent
  // receipt 同一条通道）都在这里留下一枚 pin，恢复 effect 见到 pin 就让路——谁先落地都
  // 得到同一个结果，所以这条不会随渲染时序漂移。用户手点标签页和总线 action 都会 pin；
  // 受控 active/focusNonce 同步仍不产生 pin，无显式选择时的恢复行为保持不变。
  const explicitSlotRef = useRef<{
    identity: string;
    slot: WorkspaceSlotId;
  } | null>(null);
  const knownIdentityRef = useRef(runtimeHydration?.identity || "");
  useEffect(() => {
    const identity = runtimeHydration?.identity || "";
    const previousIdentity = knownIdentityRef.current;
    if (identity && previousIdentity && identity !== previousIdentity) {
      explicitSlotRef.current = null;
    }
    knownIdentityRef.current = identity;
    if (identity && explicitSlotRef.current?.identity === "") {
      explicitSlotRef.current.identity = identity;
    }
  }, [runtimeHydration?.identity]);
  const pinExplicitSlot = useCallback(
    (slot: WorkspaceSlotId) => {
      explicitSlotRef.current = {
        identity: runtimeHydration?.identity || "",
        slot,
      };
    },
    [runtimeHydration?.identity],
  );
  const pinnedSlot = (): WorkspaceSlotId | null =>
    runtimeHydration &&
    explicitSlotRef.current?.identity === runtimeHydration.identity
      ? explicitSlotRef.current.slot
      : null;
  const appliedRestoreRef = useRef<{ identity: string; epoch: number } | null>(
    null,
  );
  const hasPendingRestore = () =>
    Boolean(
      runtimeHydration?.restoredSnapshot &&
        (appliedRestoreRef.current?.identity !== runtimeHydration.identity ||
          appliedRestoreRef.current?.epoch !==
            runtimeHydration.snapshotRestoreEpoch),
    );
  const selected =
    !showTemplate && internal === "template" ? "preview" : internal;
  const previousActive = useRef(active);

  const applySelection = useCallback(
    (id: WorkspaceSlotId, persist = true) => {
      if (!showTemplate && id === "template") return;
      setInternal(id);
      if (persist) {
        const callerId = callerIdForSlot(id);
        if (callerId) onChange?.(callerId);
        runtimeHydration?.setRightTab(id);
      }
    },
    [callerIdForSlot, onChange, runtimeHydration, showTemplate],
  );

  const select = useCallback(
    (id: WorkspaceSlotId) => {
      pinExplicitSlot(id);
      applySelection(id);
      setLayer("slot");
    },
    [applySelection, pinExplicitSlot],
  );

  useEffect(() => {
    if (active === undefined) {
      previousActive.current = undefined;
      return;
    }
    if (active === previousActive.current) return;
    previousActive.current = active;
    // 「回到卡片」不是槽位：不动选中值，只换层。
    if (isWorkspaceHomeId(active)) {
      setLayer("home");
      return;
    }
    // 这份受控值是快照恢复的一部分，与 `right_tab` 同一优先级：显式 pin 赢，
    // 由下面的恢复 effect 让路并把宿主的值改回 pin 住的栏位。
    const restoring = hasPendingRestore();
    if (restoring && pinnedSlot()) {
      return;
    }
    const requested = slotForId(active);
    const slot =
      !showTemplate && requested === "template" ? "preview" : requested;
    setInternal(slot);
    if (slot === "template") setTemplatePageId(active);
    // 恢复带回来的受控值只改选中，不把人从卡片首页拉走。
    if (!restoring) setLayer("slot");
  }, [active, showTemplate, slotForId]);

  useEffect(() => {
    runtimeHydration?.setDefaultRightTab(showTemplate ? "template" : "preview");
  }, [runtimeHydration?.identity, showTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!runtimeHydration || !hasPendingRestore()) return;
    // 宿主重渲染会重建 slotForId；同一份快照只能裁定一次，不能把后续主动切页拉回去。
    appliedRestoreRef.current = {
      identity: runtimeHydration.identity,
      epoch: runtimeHydration.snapshotRestoreEpoch,
    };
    const pinned = pinnedSlot();
    if (pinned) {
      // 深链/receipt 赢。同时把快照带回来的 `rightTab` 覆盖成这个栏位：`restoreSharedUi`
      // 刚刚改写了 hydration 里的 rightTab，不覆盖回来的话下一次保存会把旧栏位写回去，
      // 用户再进来又跑偏——那等于这条竞态只修了看得见的那一半。
      if (runtimeHydration.rightTab !== pinned) {
        runtimeHydration.setRightTab(pinned);
      }
      // 宿主那份受控值同理：它跟着快照回到了旧栏位，不改回来就会被存回去。
      const callerId = callerIdForSlot(pinned);
      if (active !== undefined && slotForId(active) !== pinned && callerId) {
        onChange?.(callerId);
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
      if (action.tab === "bay") {
        setPanelAction(envelope);
        return;
      }
      setWorkspaceAction(envelope);
      pinExplicitSlot(action.tab);
      applySelection(action.tab);
      setLayer("slot");
    };
    window.addEventListener(WORKSPACE_ACTION_EVENT, receive);
    return () => window.removeEventListener(WORKSPACE_ACTION_EVENT, receive);
  }); // select intentionally reads the latest controlled props.

  useEffect(() => {
    if (!externalAction) return;
    const action = normalizeWorkspaceAction(externalAction.action);
    if (!action) return;
    if (action.tab === "bay") {
      setPanelAction({ nonce: externalAction.nonce, action });
      return;
    }
    setWorkspaceAction({ nonce: externalAction.nonce, action });
    pinExplicitSlot(action.tab);
    applySelection(action.tab);
    setLayer("slot");
  }, [externalAction?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionFor = useCallback(
    (slot: WorkspaceSlotId) => {
      if (!workspaceAction || workspaceAction.action.tab !== slot) return null;
      if (isWorkspaceActionConsumed(workspaceAction.nonce)) return null;
      return workspaceAction;
    },
    [workspaceAction],
  );

  return {
    selected,
    visibleSlots,
    templatePageId,
    setTemplatePageId,
    select,
    actionFor,
    layer,
    setLayer,
    panelAction,
  };
}
