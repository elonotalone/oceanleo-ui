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
 *
 * Right-panel task / quote (session / sites wave 2026-11-21): `oceanleo:open-task-panel` shows ONE task (or a new
 * task draft) as `view === "task"`; `oceanleo:open-quote-panel` shows a quote card's snapshot read-only as
 * `view === "quote"`. No stack: a new request replaces what is shown; Back returns to the cards.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ImMessage } from "../lib/im/types";
import type { OPEN_TASK_PANEL_EVENT as ForwardTaskPanelEvent } from "./forward";
import type { WorkspaceLayer } from "./result-canvas-slot-state";
import { OPEN_QUOTE_PANEL_EVENT } from "./task-room/open-quote";
import { normalizeTaskEntry, workspaceMaterialAssetRef } from "./workspace-actions";

/** `OPEN_TASK_PANEL_EVENT` of `./forward` (bound to it by type; no runtime import of the picker module). */
const OPEN_TASK_PANEL_EVENT: typeof ForwardTaskPanelEvent = "oceanleo:open-task-panel";
import type {
  WorkspaceActionEnvelope,
  WorkspaceBayRequest,
  WorkspaceChatRequest,
  WorkspacePanelId,
  WorkspaceManagedPanelId,
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
  /** Product availability; both China and overseas support LeoBay and LeoChat. `task` (task + quote views) is on unless false. */
  panels: { bay: boolean; leochat: boolean; devices?: boolean; projects?: boolean; settings?: boolean; tasks?: boolean; task?: boolean };
  /** 回到卡片时调：宿主把自己的受控值改成 `"home"`，之后它再切栏位才算一次变化。 */
  onHome?: () => void;
  /**
   * Whether a task / quote request belongs to this workspace, given the element the person just clicked (null when
   * the request was made in code). `null` = another workspace's click. Default: code requests are taken, clicks ignored.
   * A click outside every `[data-workspace-split]` (a portalled menu) counts as a request made in code.
   */
  taskOrigin?: (target: Element | null) => TaskOpenOrigin | null;
  /** The project a new task draft opened here belongs to (project page / project session), else null. */
  draftProjectId?: () => string | null;
  /** A request opened the task / quote view: the host shows its right pane. */
  onTaskReveal?: () => void;
}

export type TaskOpenOrigin = "panel" | "main";

/** What the right panel's task view shows: one task, a new task draft, or a quote card's snapshot. */
export type WorkspaceTaskPanelEntry =
  | { kind: "task"; key: number; id: string; title: string }
  | { kind: "draft"; key: number; projectId: string | null }
  | { kind: "quote"; key: number; message: ImMessage };

/** A request made just before a lazy right pane mounted is still taken within this window. */
const PENDING_PANEL_MS = 3000;

type PanelRequest = { kind: "task"; id: string; title: string } | { kind: "draft" } | { kind: "quote"; message: ImMessage };

interface PendingPanelRequest {
  request: PanelRequest;
  origin: Element | null;
  at: number;
  taken: boolean;
}

/** `oceanleo:open-task-panel` detail → a task (valid id) or a draft (no id); anything malformed → null. */
export function normalizeTaskPanelDetail(value: unknown): PanelRequest | null {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (raw.taskId === undefined || raw.taskId === null || raw.taskId === "") return { kind: "draft" };
  const entry = normalizeTaskEntry({ kind: "agent_task", id: raw.taskId, title: raw.title });
  return entry ? { kind: "task", id: entry.id, title: entry.title } : null;
}

/** `oceanleo:open-quote-panel` detail → the quote message, or null unless it carries a quote card. */
export function normalizeQuotePanelDetail(value: unknown): PanelRequest | null {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const message = raw.message as ImMessage | undefined;
  if (!message || typeof message !== "object" || message.card?.type !== "quote") return null;
  return { kind: "quote", message };
}

// The element the person is clicking right now (cleared once that click has been dispatched), and the last
// task / quote request with the click it came from. Window-level: the request may arrive before any workspace
// mounted (a page whose right pane mounts on first open). The events are not cancelable: `taken` marks the one
// workspace that took a request.
let lastInteraction: Element | null = null;
let pendingPanel: PendingPanelRequest | null = null;
const recorderWindows = new WeakSet<object>();

/** Idempotent per window; runs at import in the browser. Hosts and tests may call it earlier. */
export function installTaskChildRecorder(): void {
  if (typeof window === "undefined" || recorderWindows.has(window)) return;
  const win = window;
  recorderWindows.add(win);
  win.document.addEventListener("click", (event) => {
    lastInteraction = event.target instanceof win.Element ? event.target : null;
    win.setTimeout(() => { lastInteraction = null; }, 0);
  }, true);
  // Registered before any workspace listener, so it runs first for every request.
  const record = (normalize: (detail: unknown) => PanelRequest | null) => (event: Event) => {
    const request = normalize((event as CustomEvent).detail);
    pendingPanel = request ? { request, origin: lastInteraction, at: Date.now(), taken: false } : null;
  };
  win.addEventListener(OPEN_TASK_PANEL_EVENT, record(normalizeTaskPanelDetail));
  win.addEventListener(OPEN_QUOTE_PANEL_EVENT, record(normalizeQuotePanelDetail));
}
installTaskChildRecorder();

/** A click outside every workspace split (a portalled menu, a dialog) is treated like a request made in code. */
function effectiveOrigin(target: Element | null): Element | null {
  return target && target.isConnected && target.closest("[data-workspace-split]") ? target : null;
}

const defaultTaskOrigin = (target: Element | null): TaskOpenOrigin | null => target ? null : "main";

export interface WorkspaceViewState {
  view: WorkspaceViewId;
  /** 点某个槽位的卡片。 */
  openSlot: (slot: WorkspaceSlotId) => void;
  /** 点 LeoBay / LeoChat 的卡片；`task` 回到仍在的任务。 */
  openPanel: (panel: WorkspacePanelId | WorkspaceManagedPanelId | "task") => void;
  /** 「返回」：回到卡片首页。 */
  goHome: () => void;
  /** agent 的「找相关服务」请求；没有过就是 null。 */
  bayRequest: WorkspaceBayRequest | null;
  /** 「先聊聊」带过来的会话；没有过就是 null。 */
  chatRequest: WorkspaceChatRequest | null;
  /** 从 LeoBay 那一块进 LeoChat 的某条会话。 */
  openChat: (conversationId: string) => void;
  /** What the task / quote view shows (kept while another view is in front); null = nothing opened yet. */
  taskPanel: WorkspaceTaskPanelEntry | null;
  /** Show one task in the panel (replaces whatever it showed); `main` also reveals the pane. */
  openTask: (entry: { id: string; title: string }, from: TaskOpenOrigin) => void;
  /** The draft shown in the panel became a real task: keep the same view mounted, now naming the task. */
  draftCreated: (taskId: string) => void;
  /** Back from the task / quote view: the cards. */
  closeTask: () => void;
}

export function useWorkspaceViewState(
  input: WorkspaceViewStateInput,
): WorkspaceViewState {
  const { selected, layer, setLayer, panelAction, select, panels, onHome } = input;
  const bayOn = panels.bay;
  const chatOn = panels.leochat;
  const taskOn = panels.task !== false;
  const [taskPanel, setTaskPanel] = useState<WorkspaceTaskPanelEntry | null>(null);
  const taskPanelRef = useRef(taskPanel);
  taskPanelRef.current = taskPanel;
  const panelKey = useRef(0);
  const taskOriginRef = useRef(input.taskOrigin);
  taskOriginRef.current = input.taskOrigin;
  const draftProjectRef = useRef(input.draftProjectId);
  draftProjectRef.current = input.draftProjectId;
  const onTaskRevealRef = useRef(input.onTaskReveal);
  onTaskRevealRef.current = input.onTaskReveal;
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
      ...(panelAction.action.view ? { view: panelAction.action.view } : {}),
      ...(workspaceMaterialAssetRef(panelAction.action) ? { target: workspaceMaterialAssetRef(panelAction.action) } : {}),
      ...(panelAction.action.intent ? { intent: panelAction.action.intent } : {}),
    });
    setLayer("bay");
  }, [bayOn, panelAction, setLayer]);

  // 停在某一块上时它变得不可用了（功能不可用）：回到卡片。
  useEffect(() => {
    if ((layer === "bay" && !bayOn) || (layer === "leochat" && !chatOn) || (layer === "tasks" && !panels.tasks) ||
        ((layer === "task" || layer === "quote") && (!taskOn || !taskPanel))) {
      setLayer("home");
    }
  }, [bayOn, chatOn, layer, panels.tasks, setLayer, taskOn, taskPanel]);

  // `select` 自己会把层换成槽位。
  const openSlot = useCallback(
    (slot: WorkspaceSlotId) => {
      select(slot);
    },
    [select],
  );

  const openPanel = useCallback(
    (panel: WorkspacePanelId | WorkspaceManagedPanelId | "task") => {
      if (panel === "task") {
        const current = taskPanelRef.current;
        if (taskOn && current) setLayer(current.kind === "quote" ? "quote" : "task");
        return;
      }
      const enabled = panel === "bay" ? bayOn : panel === "leochat" ? chatOn : panel === "tasks" ? panels.tasks === true : panels[panel] !== false;
      if (!enabled) return;
      if (panel === "bay") setBayRequest(null);
      setLayer(panel);
    },
    [bayOn, chatOn, panels, setLayer, taskOn],
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

  const show = useCallback((request: PanelRequest, from: TaskOpenOrigin) => {
    if (!taskOn) return;
    const key = ++panelKey.current;
    const next: WorkspaceTaskPanelEntry = request.kind === "task"
      ? { kind: "task", key, id: request.id, title: request.title }
      : request.kind === "quote"
        ? { kind: "quote", key, message: request.message }
        : { kind: "draft", key, projectId: draftProjectRef.current?.() ?? null };
    taskPanelRef.current = next;
    setTaskPanel(next);
    setLayer(next.kind === "quote" ? "quote" : "task");
    if (from === "main") onTaskRevealRef.current?.();
  }, [setLayer, taskOn]);

  const openTask = useCallback((entry: { id: string; title: string }, from: TaskOpenOrigin) => {
    const normal = normalizeTaskEntry({ kind: "agent_task", id: entry.id, title: entry.title });
    if (!normal) return;
    const current = taskPanelRef.current;
    if (current?.kind === "task" && current.id === normal.id && layer === "task") return;
    show({ kind: "task", id: normal.id, title: normal.title }, from);
  }, [layer, show]);

  const draftCreated = useCallback((taskId: string) => {
    const current = taskPanelRef.current;
    if (current?.kind !== "draft" || !taskId) return;
    const next: WorkspaceTaskPanelEntry = { kind: "task", key: current.key, id: taskId, title: "" };
    taskPanelRef.current = next;
    setTaskPanel(next);
  }, []);

  const closeTask = useCallback(() => {
    taskPanelRef.current = null;
    setTaskPanel(null);
    goHome();
  }, [goHome]);

  // `oceanleo:open-task-panel` / `oceanleo:open-quote-panel` from anywhere. The first workspace that recognises the
  // click takes the request (marks it taken); a click in another workspace's split is left to that workspace.
  useEffect(() => {
    if (!taskOn || typeof window === "undefined") return undefined;
    installTaskChildRecorder();
    const classify = (target: Element | null) => (taskOriginRef.current ?? defaultTaskOrigin)(effectiveOrigin(target));
    const receive = () => {
      const pending = pendingPanel;
      if (!pending || pending.taken) return;
      const from = classify(pending.origin);
      if (!from) return;
      pending.taken = true;
      show(pending.request, from);
    };
    window.addEventListener(OPEN_TASK_PANEL_EVENT, receive);
    window.addEventListener(OPEN_QUOTE_PANEL_EVENT, receive);
    const pending = pendingPanel;
    if (pending && !pending.taken && Date.now() - pending.at < PENDING_PANEL_MS) receive();
    return () => {
      window.removeEventListener(OPEN_TASK_PANEL_EVENT, receive);
      window.removeEventListener(OPEN_QUOTE_PANEL_EVENT, receive);
    };
  }, [show, taskOn]);

  const view: WorkspaceViewId = layer === "slot" ? (selected === "materials" ? "bay" : selected) : layer;
  return {
    view,
    openSlot,
    openPanel,
    goHome,
    bayRequest,
    chatRequest,
    openChat,
    taskPanel,
    openTask,
    draftCreated,
    closeTask,
  };
}

/**
 * For the host that owns a split whose right pane mounts on first open (and so has no ResultCanvas listening
 * yet): a task / quote request from this split's main column (or made in code) opens the pane. The ResultCanvas
 * that then mounts takes the request from the window-level record and shows it. With a ResultCanvas already
 * mounted in the split this does nothing (that one handles it). `anchorRef`: any element inside the split's main
 * column. (Name kept from the previous wave; `TaskWorkspaceShell` calls it.)
 */
export function useTaskChildPaneOpener(anchorRef: RefObject<Element | null>, open: () => void): void {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    installTaskChildRecorder();
    const receive = () => {
      const pending = pendingPanel;
      if (!pending || pending.taken) return;
      const split = anchorRef.current?.closest("[data-workspace-split]");
      if (!split || split.querySelector("[data-workspace-view]")) return;
      const origin = effectiveOrigin(pending.origin);
      if (origin && !split.contains(origin)) return;
      openRef.current();
    };
    window.addEventListener(OPEN_TASK_PANEL_EVENT, receive);
    window.addEventListener(OPEN_QUOTE_PANEL_EVENT, receive);
    return () => {
      window.removeEventListener(OPEN_TASK_PANEL_EVENT, receive);
      window.removeEventListener(OPEN_QUOTE_PANEL_EVENT, receive);
    };
  }, [anchorRef]);
}
