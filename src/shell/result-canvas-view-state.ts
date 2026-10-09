"use client";

/**
 * 右侧栏此刻给人看的是哪一层：卡片首页、五个槽位之一、LeoBay、LeoChat。
 *
 * 层本身（`layer`）和槽位选中值都在 `useWorkspaceSlotState` 里——明确的请求（点卡片、agent 的
 * action、深链、`focusNonce`、宿主改 `active`）在那里直接换层，会话快照恢复不换层。这里是它的
 * 另一半：把 `layer + selected` 合成一个 `view`，管 LeoBay / LeoChat 两块的进出和它们收到的请求。
 *
 *   - 宿主一开始把受控 `active` 给成 `"home"`（各站的 agent 对话页都是这样）→ 先显示卡片。
 *     别的宿主（各站的操作台页，自己管着一组结果标签）→ 先显示它选中的那个槽位，与改版前相同。
 *   - 这一层不存进会话：每次进页面，对话页的右侧栏都从卡片开始。
 *
 * 纯状态，不渲染任何东西；`tests/workspace-view-state.test.mjs` 把两个 hook 接起来直接跑。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceLayer } from "./result-canvas-slot-state";
import type {
  WorkspaceActionEnvelope,
  WorkspaceBayRequest,
  WorkspaceChatRequest,
  WorkspacePanelId,
  WorkspaceSlotId,
  WorkspaceViewId,
} from "./workspace-actions";

export interface WorkspaceViewStateInput {
  /** 下面五项原样取自 `useWorkspaceSlotState` 的返回值。 */
  selected: WorkspaceSlotId;
  layer: WorkspaceLayer;
  setLayer: (layer: WorkspaceLayer) => void;
  panelAction: WorkspaceActionEnvelope | null;
  select: (slot: WorkspaceSlotId) => void;
  /** 这两块在本站可不可用（境内都不可用）。不可用的那一块进不去，指向它的 action 被忽略。 */
  panels: { bay: boolean; leochat: boolean };
  /** 回到卡片时调：宿主把自己的受控值改成 `"home"`，之后它再切栏位才算一次变化。 */
  onHome?: () => void;
}

export interface WorkspaceViewState {
  view: WorkspaceViewId;
  /** 点某个槽位的卡片。 */
  openSlot: (slot: WorkspaceSlotId) => void;
  /** 点 LeoBay / LeoChat 的卡片。 */
  openPanel: (panel: WorkspacePanelId) => void;
  /** 「返回」：回到卡片首页。 */
  goHome: () => void;
  /** agent 的「找相关服务」请求；没有过就是 null。 */
  bayRequest: WorkspaceBayRequest | null;
  /** 「先聊聊」带过来的会话；没有过就是 null。 */
  chatRequest: WorkspaceChatRequest | null;
  /** 从 LeoBay 那一块进 LeoChat 的某条会话。 */
  openChat: (conversationId: string) => void;
}

export function useWorkspaceViewState(
  input: WorkspaceViewStateInput,
): WorkspaceViewState {
  const { selected, layer, setLayer, panelAction, select, panels, onHome } =
    input;
  const bayOn = panels.bay;
  const chatOn = panels.leochat;
  const [bayRequest, setBayRequest] = useState<WorkspaceBayRequest | null>(
    null,
  );
  const [chatRequest, setChatRequest] = useState<WorkspaceChatRequest | null>(
    null,
  );
  const onHomeRef = useRef(onHome);
  onHomeRef.current = onHome;

  // agent 的「找相关服务」：同一条 action 只接一次（回到卡片后不能再被它拉回去）。
  const seenPanelNonce = useRef<string | null>(null);
  useEffect(() => {
    if (!panelAction || panelAction.nonce === seenPanelNonce.current) return;
    seenPanelNonce.current = panelAction.nonce;
    if (panelAction.action.tab !== "bay" || !bayOn) return;
    const category = panelAction.action.category;
    setBayRequest({
      nonce: panelAction.nonce,
      query: panelAction.action.query ?? "",
      ...(category ? { category } : {}),
    });
    setLayer("bay");
  }, [bayOn, panelAction, setLayer]);

  // 停在某一块上时它变得不可用了（登出、切到境内）：回到卡片。
  useEffect(() => {
    if ((layer === "bay" && !bayOn) || (layer === "leochat" && !chatOn)) {
      setLayer("home");
    }
  }, [bayOn, chatOn, layer, setLayer]);

  // `select` 自己会把层换成槽位。
  const openSlot = useCallback(
    (slot: WorkspaceSlotId) => {
      select(slot);
    },
    [select],
  );

  const openPanel = useCallback(
    (panel: WorkspacePanelId) => {
      if (panel === "bay" ? !bayOn : !chatOn) return;
      setLayer(panel);
    },
    [bayOn, chatOn, setLayer],
  );

  const goHome = useCallback(() => {
    setLayer("home");
    onHomeRef.current?.();
  }, [setLayer]);

  const chatSeq = useRef(0);
  const openChat = useCallback(
    (conversationId: string) => {
      if (!chatOn || !conversationId) return;
      chatSeq.current += 1;
      setChatRequest({ nonce: `chat:${chatSeq.current}`, conversationId });
      setLayer("leochat");
    },
    [chatOn, setLayer],
  );

  const view: WorkspaceViewId = layer === "slot" ? selected : layer;
  return {
    view,
    openSlot,
    openPanel,
    goHome,
    bayRequest,
    chatRequest,
    openChat,
  };
}
