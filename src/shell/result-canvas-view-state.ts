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
 * Task stack (`view === "task"`): sub tasks and tasks opened beside the main column. A request from inside
 * this right panel pushes; one from the main column (or a host request) replaces the stack with that one entry
 * and shows the panel. Back pops; an empty stack returns to the cards.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { WorkspaceLayer } from "./result-canvas-slot-state";
import { OPEN_TASK_CHILD_EVENT, normalizeTaskEntry, workspaceMaterialAssetRef } from "./workspace-actions";
import type {
  WorkspaceTaskEntry,
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
  /** Product availability; both China and overseas support LeoBay and LeoChat. `task` (the task stack) is on unless false. */
  panels: { bay: boolean; leochat: boolean; devices?: boolean; projects?: boolean; settings?: boolean; tasks?: boolean; task?: boolean };
  /** 回到卡片时调：宿主把自己的受控值改成 `"home"`，之后它再切栏位才算一次变化。 */
  onHome?: () => void;
  /**
   * Where an `oceanleo:open-task-child` request came from, given the element the person just clicked (null when
   * the request was made in code). `null` = not this workspace's business (another workspace's click).
   * Default: code requests count as the main column, clicks are ignored.
   */
  taskOrigin?: (target: Element | null) => TaskOpenOrigin | null;
  /** Host request: replace the stack with these entries and show the panel (task page: `[this sub task]`). */
  taskRequest?: WorkspaceTaskRequest | null;
  /** A main-column request (or host request) opened the stack: the host shows its right pane. */
  onTaskReveal?: () => void;
}

export type TaskOpenOrigin = "panel" | "main";

export interface WorkspaceTaskRequest {
  nonce: string;
  entries: WorkspaceTaskEntry[];
}

/** Deep enough for any real chain of cards; an endless card loop cannot grow memory. */
const TASK_STACK_LIMIT = 20;
/** A request made just before a lazy right pane mounted is still taken within this window. */
const PENDING_TASK_CHILD_MS = 3000;

interface PendingTaskChild {
  entry: WorkspaceTaskEntry;
  origin: Element | null;
  at: number;
  taken: boolean;
}

// The element the person is clicking right now (cleared once that click has been dispatched), and the last
// open-task-child request with the click it came from. Window-level: the request may arrive before any
// workspace mounted (a page whose right pane mounts on first open).
let lastInteraction: Element | null = null;
let pendingTaskChild: PendingTaskChild | null = null;
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
  win.addEventListener(OPEN_TASK_CHILD_EVENT, (event) => {
    const entry = normalizeTaskEntry((event as CustomEvent).detail);
    pendingTaskChild = entry ? { entry, origin: lastInteraction, at: Date.now(), taken: false } : null;
  });
}
installTaskChildRecorder();

const defaultTaskOrigin = (target: Element | null): TaskOpenOrigin | null => target ? null : "main";

export interface WorkspaceViewState {
  view: WorkspaceViewId;
  /** 点某个槽位的卡片。 */
  openSlot: (slot: WorkspaceSlotId) => void;
  /** 点 LeoBay / LeoChat 的卡片；`task` 回到仍在的任务栈。 */
  openPanel: (panel: WorkspacePanelId | WorkspaceManagedPanelId | "task") => void;
  /** 「返回」：回到卡片首页。 */
  goHome: () => void;
  /** agent 的「找相关服务」请求；没有过就是 null。 */
  bayRequest: WorkspaceBayRequest | null;
  /** 「先聊聊」带过来的会话；没有过就是 null。 */
  chatRequest: WorkspaceChatRequest | null;
  /** 从 LeoBay 那一块进 LeoChat 的某条会话。 */
  openChat: (conversationId: string) => void;
  /** The task stack, bottom first; the last entry is the one shown. */
  taskStack: WorkspaceTaskEntry[];
  /** Open a sub task / task: `panel` pushes onto the shown stack, `main` replaces it and shows the panel. */
  openTask: (entry: WorkspaceTaskEntry, from: TaskOpenOrigin) => void;
  /** Back from the shown entry; the last one returns to the cards. */
  popTask: () => void;
}

export function useWorkspaceViewState(
  input: WorkspaceViewStateInput,
): WorkspaceViewState {
  const { selected, layer, setLayer, panelAction, select, panels, onHome, taskRequest } =
    input;
  const bayOn = panels.bay;
  const chatOn = panels.leochat;
  const taskOn = panels.task !== false;
  const [taskStack, setTaskStack] = useState<WorkspaceTaskEntry[]>([]);
  const taskStackRef = useRef(taskStack);
  taskStackRef.current = taskStack;
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const taskOriginRef = useRef(input.taskOrigin);
  taskOriginRef.current = input.taskOrigin;
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
        (layer === "task" && (!taskOn || taskStack.length === 0))) {
      setLayer("home");
    }
  }, [bayOn, chatOn, layer, panels.tasks, setLayer, taskOn, taskStack.length]);

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
        if (taskOn && taskStackRef.current.length) setLayer("task");
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

  const openTask = useCallback(
    (entry: WorkspaceTaskEntry, from: TaskOpenOrigin) => {
      if (!taskOn) return;
      const current = taskStackRef.current;
      const top = current[current.length - 1];
      let next: WorkspaceTaskEntry[];
      if (from === "panel" && layerRef.current === "task" && top) {
        next = top.kind === entry.kind && top.id === entry.id ? current : [...current, entry].slice(-TASK_STACK_LIMIT);
      } else {
        next = [entry];
      }
      taskStackRef.current = next;
      setTaskStack(next);
      setLayer("task");
      if (from === "main") onTaskRevealRef.current?.();
    },
    [setLayer, taskOn],
  );

  const popTask = useCallback(() => {
    const next = taskStackRef.current.slice(0, -1);
    taskStackRef.current = next;
    setTaskStack(next);
    if (!next.length) goHome();
  }, [goHome]);

  // The host's request (task page: the sub task beside its parent task). Each nonce applies once.
  const seenTaskRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!taskOn || !taskRequest || taskRequest.nonce === seenTaskRequest.current) return;
    seenTaskRequest.current = taskRequest.nonce;
    const entries = taskRequest.entries
      .map(normalizeTaskEntry)
      .filter((entry): entry is WorkspaceTaskEntry => Boolean(entry))
      .slice(-TASK_STACK_LIMIT);
    if (!entries.length) return;
    taskStackRef.current = entries;
    setTaskStack(entries);
    setLayer("task");
    onTaskRevealRef.current?.();
  }, [setLayer, taskOn, taskRequest]);

  // `oceanleo:open-task-child` from anywhere. The first workspace that recognises the click takes the request
  // (`preventDefault`, so `openTaskChild` knows it was handled); a click elsewhere is left to its own workspace.
  useEffect(() => {
    if (!taskOn || typeof window === "undefined") return undefined;
    installTaskChildRecorder();
    const classify = (target: Element | null) => (taskOriginRef.current ?? defaultTaskOrigin)(target);
    const receive = (event: Event) => {
      if (event.defaultPrevented || pendingTaskChild?.taken) return;
      const entry = normalizeTaskEntry((event as CustomEvent).detail);
      if (!entry) return;
      const from = classify(lastInteraction);
      if (!from) return;
      event.preventDefault();
      if (pendingTaskChild) pendingTaskChild.taken = true;
      openTask(entry, from);
    };
    window.addEventListener(OPEN_TASK_CHILD_EVENT, receive);
    const pending = pendingTaskChild;
    if (pending && !pending.taken && Date.now() - pending.at < PENDING_TASK_CHILD_MS) {
      const from = classify(pending.origin);
      if (from) {
        pending.taken = true;
        openTask(pending.entry, from);
      }
    }
    return () => window.removeEventListener(OPEN_TASK_CHILD_EVENT, receive);
  }, [openTask, taskOn]);

  const view: WorkspaceViewId = layer === "slot" ? (selected === "materials" ? "bay" : selected) : layer;
  return {
    view,
    openSlot,
    openPanel,
    goHome,
    bayRequest,
    chatRequest,
    openChat,
    taskStack,
    openTask,
    popTask,
  };
}

/**
 * For the host that owns a split whose right pane mounts on first open (and so has no ResultCanvas listening
 * yet): an `oceanleo:open-task-child` request from this split's main column (or made in code) opens the pane.
 * The request is marked handled at once; the ResultCanvas that then mounts takes it from the window-level
 * record and shows it. With a ResultCanvas already mounted in the split this does nothing (that one handles it).
 * `anchorRef`: any element inside the split's main column.
 */
export function useTaskChildPaneOpener(anchorRef: RefObject<Element | null>, open: () => void): void {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    installTaskChildRecorder();
    const receive = (event: Event) => {
      const pending = pendingTaskChild;
      if (event.defaultPrevented || !pending || pending.taken) return;
      const split = anchorRef.current?.closest("[data-workspace-split]");
      if (!split || split.querySelector("[data-workspace-view]")) return;
      if (pending.origin && !split.contains(pending.origin)) return;
      event.preventDefault();
      openRef.current();
    };
    window.addEventListener(OPEN_TASK_CHILD_EVENT, receive);
    return () => window.removeEventListener(OPEN_TASK_CHILD_EVENT, receive);
  }, [anchorRef]);
}
