"use client";

// 对话面板的连接和发送。帧进 reduce，这里只负责何时连、何时重连、何时把哪一帧写出去。
// 用户的话只出现在 JSON 帧里，不拼进任何命令字符串。

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getTask, stopTask, type TaskDetail } from "../../../lib/agent";
import { agentDialogWsUrl } from "../../../lib/cloud-computer-api";
import * as computerApi from "../../../lib/cloud-computer-api";
import { agentReset, agentState, agentTurn } from "../../../lib/cloud-computer-agent-api";
import { useUI } from "../../../i18n/ui/useUI";
import { installDirPayload } from "./install-dir";
import { mapTaskMessages, nextOceanleoPoll, oceanMessageFingerprint } from "./oceanleo-program";
import { isWsProgram } from "./parse";
import { applyDialog, initialDialogState } from "./reduce";
import { nextReconnectDelay } from "./reconnect";
import { isReconnectingNotice } from "./notice";
import { composerOccupancy, confirmedBusySessions, confirmedWaitingSessions, occupancyBusyAfterFrame, occupancyFresh, OCCUPANCY_STALE_MS } from "./occupancy";
import { createOccupancyProbe } from "./occupancy-probe";
import { isCompletedStop, sessionInterrupted } from "./session-status";
import { readUnreadSessions, writeUnreadSessions } from "./session-unread";
import { createSessionRefresh } from "./session-refresh";
import { readProgramSelection, rememberProgramSelection, rememberModelParam } from "./model-param-memory";
import type {
  AgentDialogController,
  AgentDialogMessage,
  AgentProgram,
  DialogAttachment,
  UserMessageAttachment,
  WsProgram,
} from "./types";

function isInboxReady(item: DialogAttachment): item is DialogAttachment & { path: string } {
  const path = (item.path ?? "").trim();
  return item.state === "done" && path.startsWith("/") && !path.includes("://") && !path.includes("\0");
}

function promptFiles(items: DialogAttachment[]): Array<{ name: string; mime: string; path: string }> {
  return items.filter(isInboxReady).map((item) => ({
    name: item.name,
    mime: item.mime,
    path: item.path,
  }));
}

function userFileRows(items: DialogAttachment[]): UserMessageAttachment[] {
  return items.filter(isInboxReady).map((item) => ({
    name: item.name,
    mime: item.mime,
    path: item.path,
    ...(item.archive ? { archive: item.archive } : {}),
  }));
}

// 合同 I3/I6 需要、W3 的 types.ts 尚未落地的控制器成员（见 signals/W6A-interface.md）。
// W3 把这些成员并入 AgentDialogController 后，这个交叉类型删除、恢复用 types 里的。
export type AgentDialogControllerV2 = AgentDialogController & {
  /** oceanleo 程序标题「OceanLeo agent · 电脑名」用；agentState 未回到前为空串。 */
  computerName: string;
  /** 登录卡贴码输入框的受控草稿（W3 的 LoginCard 也可以自己持局部 state）。 */
  setLoginCodeDraft: (code: string) => void;
};

const MAX_PROMPT_CHARS = 32000;
// oceanleo turn 的上限 = 后端 TurnBody text max_length=8000（cloud_computer_agent_router.py），
// 与 cloud-computer-agent-api.MAX_AGENT_TURN_CHARS 同数。这里本地持有一份而不 import：
// W3 的测试桩按导出名单替身整份 agent-api 模块，控制器每多 import 一个命名导出，
// 那份文件就在加载期炸一次（2026-09-23 实测）。同数改动时两处一起改。
const MAX_OCEAN_PROMPT_CHARS = 8000;

const SESSIONS_REFRESH_MS = 15_000;

function sendJson(socket: WebSocket | null, frame: Record<string, unknown>): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(frame));
  return true;
}

function usesDialogSocket(
  program: AgentProgram | null,
  localOceanleo: boolean,
): program is AgentProgram {
  return isWsProgram(program) || (program === "oceanleo" && localOceanleo);
}

// Only parsed presentation state is retained; authentication and socket URLs never enter this cache.
type Presentation = Pick<ReturnType<typeof initialDialogState>, "programs" | "sessions" | "sessionsSupported">;
type ViewSnap = {
  messages: AgentDialogMessage[];
  activeSession: string;
  draftRef?: string;
  sessions: ReturnType<typeof initialDialogState>["sessions"];
  sessionsSupported: boolean | null;
  sessionLoading: boolean;
  historyOffset: number;
  historyTotal: number;
  hasOlder: boolean;
  historyLoading: boolean;
  sessionPath: string;
  sessionPathResolved: boolean;
  models: ReturnType<typeof initialDialogState>["models"];
  modelSource: string;
  selectedModel: string;
  mode: ReturnType<typeof initialDialogState>["mode"];
  selectedMode: string;
  configOptions: ReturnType<typeof initialDialogState>["configOptions"];
  commands: ReturnType<typeof initialDialogState>["commands"];
  occupancyPendingAt: number | null;
  occupancyPendingSession: string | null;
};
const presentationCache = new Map<string, { programs: Presentation["programs"]; sessions: Map<string, Pick<Presentation, "sessions" | "sessionsSupported">>; views: Map<string, ViewSnap>; last: Map<string, string> }>();
function presentationFor(id: string) {
  let cached = presentationCache.get(id);
  if (!cached) {
    cached = { programs: [], sessions: new Map(), views: new Map(), last: new Map() };
    presentationCache.set(id, cached);
  }
  return cached;
}
function viewSnapOf(state: ReturnType<typeof initialDialogState>): ViewSnap {
  return {
    messages: state.messages,
    activeSession: state.activeSession,
    draftRef: state.draftRef,
    sessions: state.sessions,
    sessionsSupported: state.sessionsSupported,
    sessionLoading: state.sessionLoading,
    historyOffset: state.historyOffset,
    historyTotal: state.historyTotal,
    hasOlder: state.hasOlder,
    historyLoading: state.historyLoading,
    sessionPath: state.sessionPath,
    sessionPathResolved: state.sessionPathResolved,
    models: state.models,
    modelSource: state.modelSource,
    selectedModel: state.selectedModel,
    mode: state.mode,
    selectedMode: state.selectedMode,
    configOptions: state.configOptions,
    commands: state.commands,
    occupancyPendingAt: state.occupancyPendingAt,
    occupancyPendingSession: state.occupancyPendingSession,
  };
}
function hydratePresentation(id: string, state: ReturnType<typeof initialDialogState>) {
  const cached = presentationFor(id);
  const selection = readProgramSelection(id, state.program ?? "");
  return { ...state, programs: cached.programs, ...cached.sessions.get(state.program ?? ""),
    ...(!state.activeSession ? { selectedModel: selection.model || state.selectedModel,
      selectedMode: selection.mode || state.selectedMode } : {}) };
}

export function useAgentDialog({
  computerId,
  sessionId,
  enabled,
  localOceanleo = false,
  active = true,
  initialProgram = "oceanleo",
  initialSessionId,
  oceanleoReady = true,
  taskSessionId,
  onArchiveStatus,
  openActiveSession = true,
}: {
  computerId: string;
  sessionId?: string;
  enabled: boolean;
  localOceanleo?: boolean;
  active?: boolean;
  initialProgram?: AgentProgram;
  initialSessionId?: string;
  oceanleoReady?: boolean;
  taskSessionId?: string;
  onArchiveStatus?: (status: "saved" | "pending" | "error") => void;
  /**
   * When the sessions list arrives, open the gateway's active (or the mount
   * `initialSessionId`) conversation by itself. Hosts that open sessions
   * explicitly (the main-chat native thread, including draft mode) pass false.
   */
  openActiveSession?: boolean;
}): AgentDialogControllerV2 {
  const taskSessionRef = useRef(taskSessionId);
  taskSessionRef.current = taskSessionId;
  const archiveStatusRef = useRef(onArchiveStatus);
  archiveStatusRef.current = onArchiveStatus;
  const openActiveSessionRef = useRef(openActiveSession);
  openActiveSessionRef.current = openActiveSession;
  const tt = useUI();
  const [mountProgram] = useState(() => initialProgram);
  const [mountRef] = useState(() => `new_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
  const [state, dispatch] = useReducer(
    (previous: ReturnType<typeof initialDialogState>, event: Parameters<typeof applyDialog>[1]) => {
      const next = applyDialog(previous, event);
      if (event.type === "reset") {
        next.program = mountProgram;
        next.draftRef = `new:${mountRef}`;
      }
      return event.type === "reset" || event.type === "program" ? hydratePresentation(taskSessionId ? `${computerId}:${taskSessionId}` : computerId, next) : next;
    }, undefined, () => hydratePresentation(taskSessionId ? `${computerId}:${taskSessionId}` : computerId, { ...initialDialogState(), program: mountProgram, draftRef: `new:${mountRef}` }),
  );
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<DialogAttachment[]>([]);
  const inboxWaiters = useRef(new Map<string, Promise<void>>());
  const [fresh, setFresh] = useState(false);
  const [computerName, setComputerName] = useState("");
  const unreadRef = useRef<string[]>([]);
  const [unreadSessions, setUnreadSessions] = useState<string[]>([]);

  const stateRef = useRef(state);
  const draftRef = useRef(draft);
  const attachmentsRef = useRef(attachments);
  const freshRef = useRef(fresh);
  const openSessionRef = useRef<(id: string) => void>(() => {});
  const enabledRef = useRef(enabled);
  const activeRef = useRef(active);
  const oceanleoReadyRef = useRef(oceanleoReady);
  const computerIdRef = useRef(computerId);
  const sessionIdRef = useRef(sessionId);
  const localOceanleoRef = useRef(localOceanleo);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionsRefreshRef = useRef<ReturnType<typeof createSessionRefresh> | null>(null);
  if (!sessionsRefreshRef.current) sessionsRefreshRef.current = createSessionRefresh({
    allowed: (program) => enabledRef.current && activeRef.current
      && (typeof document === "undefined" || !document.hidden)
      && (isWsProgram(program) || (program === "oceanleo" && localOceanleoRef.current)),
    send: (program) => sendJson(socketRef.current, { t: "sessions", program }),
  });
  const occupancyProbeRef = useRef<ReturnType<typeof createOccupancyProbe> | null>(null);
  if (!occupancyProbeRef.current) occupancyProbeRef.current = createOccupancyProbe({
    allowed: (program) => enabledRef.current && activeRef.current
      && (typeof document === "undefined" || !document.hidden)
      && (isWsProgram(program) || (program === "oceanleo" && localOceanleoRef.current)),
    send: (program) => sendJson(socketRef.current, { t: "occupancy", program }),
  });
  const connectGen = useRef(0);
  const delayRef = useRef(1000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => Promise<WebSocket | null>>(async () => null);
  // refreshOcean 经 tt 间接依赖 useUI 的返回函数；enable effect 只认 ref，
  // tt 一旦不是 memo 稳定的（如测试桩），effect 也不会「渲染→dispatch→渲染」空转。
  const refreshOceanRef = useRef<() => Promise<void>>(async () => {});
  const inflightRef = useRef<Promise<WebSocket | null> | null>(null);
  // OceanLeo agent 程序（合同 I6）：任务指针、刚发出去那句的落地判定基线、
  // 轮询代际与可取消的等待器。代际一升，所有在飞的轮询/回放立即作废。
  const oceanTaskRef = useRef("");
  const oceanSendRef = useRef<{ baseUsers: number } | null>(null);
  const oceanGen = useRef(0);
  const oceanWaiterRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    resolve: (done: boolean) => void;
  } | null>(null);
  // 程序切换时消息列表按程序分开：切走前把当前列表存进缓存，切回来时恢复；
  // oceanleo 的缓存只是过渡，进入时一律用 agentState/getTask 的服务端真相覆盖。
  const messagesCacheRef = useRef(new Map<string, AgentDialogMessage[]>()); // REST OceanLeo only
  const newRefs = useRef(new Map<AgentProgram, string>([[mountProgram, mountRef]]));
  const pendingRefs = useRef(new Map<string, string>());
  const viewKeyRef = useRef(`${mountProgram}::new:${mountRef}`);
  const initialOpened = useRef(new Set<string>());
  const pendingConfig = useRef(new Map<string, Record<string, string | boolean>>());
  function clientRef(program: AgentProgram): string {
    let ref = newRefs.current.get(program);
    if (!ref) { ref = `new_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`; newRefs.current.set(program, ref); }
    return ref;
  }

  stateRef.current = state;
  if (state.program) {
    const cached = presentationFor(taskSessionId ? `${computerId}:${taskSessionId}` : computerId);
    cached.views.set(viewKeyRef.current, viewSnapOf(state));
    cached.last.set(state.program, viewKeyRef.current);
  }
  draftRef.current = draft;
  attachmentsRef.current = attachments;
  freshRef.current = fresh;
  enabledRef.current = enabled;
  activeRef.current = active;
  oceanleoReadyRef.current = oceanleoReady;
  computerIdRef.current = computerId;
  sessionIdRef.current = sessionId;
  localOceanleoRef.current = localOceanleo;

  const [occupancyClock, setOccupancyClock] = useState(() => Date.now());
  useEffect(() => {
    if (state.occupancyAt == null) return;
    const wait = OCCUPANCY_STALE_MS - (Date.now() - state.occupancyAt) + 25;
    const timer = setTimeout(() => setOccupancyClock(Date.now()), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [state.occupancyAt]);

  const persistUnread = useCallback((program: string, ids: string[]) => {
    writeUnreadSessions(computerIdRef.current, program, ids);
    if (program === (stateRef.current.program ?? "")) {
      unreadRef.current = ids;
      setUnreadSessions(ids);
    }
  }, []);
  const addUnread = useCallback((program: string, id: string) => {
    if (!id || !program) return;
    const current = program === (stateRef.current.program ?? "")
      ? unreadRef.current
      : readUnreadSessions(computerIdRef.current, program);
    if (current.includes(id)) return;
    persistUnread(program, [...current, id]);
  }, [persistUnread]);
  const clearUnread = useCallback((program: string, id: string) => {
    if (!id || !program) return;
    const current = program === (stateRef.current.program ?? "")
      ? unreadRef.current
      : readUnreadSessions(computerIdRef.current, program);
    if (!current.includes(id)) return;
    persistUnread(program, current.filter((item) => item !== id));
  }, [persistUnread]);

  useEffect(() => {
    const ids = readUnreadSessions(computerId, state.program ?? "");
    unreadRef.current = ids;
    setUnreadSessions(ids);
  }, [computerId, state.program]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const ingest = useCallback((raw: string) => {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const frame =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    if (!frame) {
      dispatch({ type: "notice", code: "dialog_unreachable", program: stateRef.current.program ?? "" });
      socketRef.current?.close();
      return;
    }
    if (frame.t === "archive_status") {
      if (taskSessionRef.current && frame.task_session_id !== taskSessionRef.current) return;
      const status = frame.sync_status;
      if (status === "saved" || status === "pending" || status === "error") archiveStatusRef.current?.(status);
      return;
    }
    const viewingSession = stateRef.current.activeSession;
    if (frame.t === "error" && isReconnectingNotice(String(frame.code))) {
      // A node reconnects after gateway replacement. Treat offline as a
      // retryable connection loss, not a permanent stop requiring a click.
      // Offline belongs to the computer, including when the focused view is
      // an existing session and the gateway error carries no session id.
      // A transport failure must not settle the running turn as a program
      // failure. Keep the current view while the socket reconnects.
      const event = frame.code === "dialog_unreachable"
        ? { type: "notice" as const, code: "dialog_unreachable", program: stateRef.current.program ?? "" }
        : { type: "frame" as const, frame };
      stateRef.current = applyDialog(stateRef.current, event);
      dispatch(event);
      socketRef.current?.close();
      return;
    }
    if (frame.t === "status") delayRef.current = 1000;
    const cached = presentationFor(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current);
    if (frame.t === "status") cached.programs = applyDialog(stateRef.current, { type: "frame", frame }).programs;
    if (frame.t === "occupancy" && typeof frame.program === "string") {
      occupancyProbeRef.current?.receive(frame.program);
    }
    if (frame.t === "sessions" && typeof frame.program === "string" && (isWsProgram(frame.program) || frame.program === "oceanleo")) {
      sessionsRefreshRef.current?.receive(frame.program, JSON.stringify([frame.sessions, frame.active, frame.busy]), frame.supported !== false);
      if (Array.isArray(frame.busy)) occupancyProbeRef.current?.receive(frame.program);
      const parsed = applyDialog({ ...stateRef.current, program: frame.program }, { type: "frame", frame });
      cached.sessions.set(frame.program, { sessions: parsed.sessions, sessionsSupported: parsed.sessionsSupported });
    }
    const frameSession = typeof frame.acp_session === "string" ? frame.acp_session : "";
    const frameProgram = typeof frame.program === "string" ? frame.program : stateRef.current.program ?? "";
    const related = new Set(["user_message", "turn_start", "delta", "thought", "tool", "plan", "usage", "permission", "question", "done", "models", "config", "commands", "session_opened", "transcript", "session_path", "error"]);
    if (related.has(String(frame.t)) && (isWsProgram(frameProgram) || frameProgram === "oceanleo")) {
      const ref = typeof frame.ref === "string" ? frame.ref : "";
      const pendingKey = ref ? pendingRefs.current.get(ref) : frame.t === "session_opened" && frameProgram === stateRef.current.program && !stateRef.current.activeSession ? viewKeyRef.current : undefined;
      if (ref && !pendingKey && !frameSession) return;
      let key = frameSession ? `${frameProgram}::${frameSession}` : `${frameProgram}::new`;
      if (pendingKey && !frameSession) key = pendingKey;
      // A model query may create a spare ACP session. It is metadata for the
      // new view, not a user-selected history session.
      if (!stateRef.current.activeSession && frameProgram === stateRef.current.program && ["models", "config", "commands"].includes(String(frame.t))) {
        key = viewKeyRef.current;
      }
      if (pendingKey && frameSession && pendingKey !== key) {
        const snapshot = cached.views.get(pendingKey);
        if (snapshot) {
          const pendingSession = snapshot.occupancyPendingSession
            && (snapshot.occupancyPendingSession === snapshot.draftRef || snapshot.occupancyPendingSession.startsWith("new:"))
            ? frameSession
            : snapshot.occupancyPendingSession;
          cached.views.set(key, {
            ...snapshot,
            activeSession: frameSession,
            draftRef: undefined,
            occupancyPendingSession: pendingSession ?? null,
          });
        }
        if (viewKeyRef.current === pendingKey) {
          viewKeyRef.current = key;
          const pendingSession = stateRef.current.occupancyPendingSession
            && (stateRef.current.occupancyPendingSession === stateRef.current.draftRef
              || stateRef.current.occupancyPendingSession.startsWith("new:"))
            ? frameSession
            : stateRef.current.occupancyPendingSession;
          stateRef.current = {
            ...stateRef.current,
            activeSession: frameSession,
            draftRef: undefined,
            occupancyPendingSession: pendingSession ?? null,
          };
          dispatch({ type: "restore-view", ...viewSnapOf(stateRef.current) });
        }
        cached.views.delete(pendingKey);
        pendingRefs.current.set(ref, key);
        const live = { ...stateRef.current.liveTurns };
        if (live[`${frameProgram}::new:${ref}`]) live[`${frameProgram}::${frameSession}`] = true;
        delete live[`${frameProgram}::new:${ref}`];
        stateRef.current = { ...stateRef.current, liveTurns: live };
        dispatch({ type: "set-live-turns", liveTurns: live });
        sessionsRefreshRef.current?.request(frameProgram, "activity");
      }
      // Frames without a session belong only to a new view.
      if (!frameSession && !pendingKey && stateRef.current.activeSession && frame.t !== "error") return;
      const isCurrent = key === viewKeyRef.current || (!frameSession && !stateRef.current.activeSession && frameProgram === stateRef.current.program);
      const source = isCurrent ? stateRef.current : {
        ...initialDialogState(), ...cached.views.get(key),
        program: frameProgram as AgentProgram, activeSession: frameSession,
        liveTurns: stateRef.current.liveTurns,
      };
      const next = applyDialog(source, { type: "frame", frame });
      cached.views.set(key, viewSnapOf(next));
      if (isCurrent) {
        stateRef.current = next;
        dispatch({ type: "frame", frame });
      } else {
        stateRef.current = applyDialog(stateRef.current, { type: "set-live-turns", liveTurns: next.liveTurns });
        dispatch({ type: "set-live-turns", liveTurns: next.liveTurns });
        if (frameProgram === (stateRef.current.program ?? "")) {
          const busy = occupancyBusyAfterFrame(stateRef.current.occupancyBusy, frame);
          if (busy !== null) {
            const occupancy = { t: "occupancy", program: frameProgram, busy };
            stateRef.current = applyDialog(stateRef.current, { type: "frame", frame: occupancy });
            dispatch({ type: "frame", frame: occupancy });
          }
        }
      }
    } else {
      stateRef.current = applyDialog(stateRef.current, { type: "frame", frame });
      dispatch({ type: "frame", frame });
    }
    if (openActiveSessionRef.current && frame.t === "sessions" && frameProgram === stateRef.current.program) {
      const program = frameProgram as AgentProgram;
      const listed = cached.sessions.get(program)?.sessions ?? [];
      const target = program === mountProgram && initialSessionId ? initialSessionId : taskSessionRef.current ? "" : typeof frame.active === "string" ? frame.active.trim() : "";
      if (
        target
        && listed.some((session) => session.id === target)
        && !initialOpened.current.has(program)
        && !stateRef.current.activeSession
        && !stateRef.current.sessionLoading
      ) {
        initialOpened.current.add(program);
        queueMicrotask(() => openSessionRef.current(target));
      }
    }
    if (frame.t === "install_done" || frame.t === "login_done") {
      sendJson(socketRef.current, { t: "status" });
    }
    // New sessions and fresh activity must show up in "Past sessions" without a manual refresh.
    if ((frame.t === "done" || frame.t === "session_opened" || frame.t === "turn_start") && frameProgram) {
      sessionsRefreshRef.current?.request(frameProgram, "activity");
    }
    if (frame.t === "done" && frameSession && frameProgram) {
      const viewingThis = frameProgram === (stateRef.current.program ?? "") && frameSession === viewingSession;
      if (viewingThis) clearUnread(frameProgram, frameSession);
      else if (isCompletedStop(typeof frame.stop === "string" ? frame.stop : "")) addUnread(frameProgram, frameSession);
    }
    if (frame.t === "turn_start" && frameSession && frameProgram) clearUnread(frameProgram, frameSession);
  }, [addUnread, clearTimer, clearUnread, initialSessionId, mountProgram]);

  const scheduleReconnect = useCallback(() => {
    if (!enabledRef.current || !activeRef.current) return;
    clearTimer();
    const wait = delayRef.current;
    delayRef.current = nextReconnectDelay(wait);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void connectRef.current();
    }, wait);
  }, [clearTimer]);

  const connect = useCallback((): Promise<WebSocket | null> => {
    const open = socketRef.current;
    if (open && open.readyState === WebSocket.OPEN) return Promise.resolve(open);
    if (inflightRef.current) return inflightRef.current;
    let run: Promise<WebSocket | null>;
    run = openSocket().finally(() => {
      if (inflightRef.current === run) inflightRef.current = null;
    });
    inflightRef.current = run;
    return run;

    async function openSocket(): Promise<WebSocket | null> {
    if (!enabledRef.current) return null;
    const gen = (connectGen.current += 1);
    const previous = socketRef.current;
    socketRef.current = null;
    if (previous && previous.readyState !== WebSocket.CLOSED) previous.close();

    let token = "";
    try {
      const client = await import("../../../lib/auth/client");
      const value = typeof client.accessToken === "function" ? await client.accessToken() : "";
      token = typeof value === "string" ? value : "";
    } catch {
      token = "";
    }
    if (gen !== connectGen.current || !enabledRef.current) return null;
    if (!token) {
      dispatch({ type: "notice", code: "dialog_unreachable", program: stateRef.current.program ?? "" });
      scheduleReconnect();
      return null;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(agentDialogWsUrl(computerIdRef.current, sessionIdRef.current, token));
    } catch {
      dispatch({ type: "notice", code: "dialog_unreachable", program: stateRef.current.program ?? "" });
      scheduleReconnect();
      return null;
    }
    if (gen !== connectGen.current) {
      socket.close();
      return null;
    }
    socketRef.current = socket;

    return await new Promise<WebSocket | null>((resolve) => {
      let settled = false;
      const finish = (value: WebSocket | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CLOSED) {
          socket.close();
        }
      }, 15000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          if (gen !== connectGen.current) {
            finish(null);
            return;
          }
          sendJson(socket, { t: "status" });
          sessionsRefreshRef.current?.reset();
          occupancyProbeRef.current?.reset();
          dispatch({ type: "occupancy-link", up: true });
          const program = stateRef.current.program;
          if (usesDialogSocket(program, localOceanleoRef.current)) {
            sessionsRefreshRef.current?.request(program);
            occupancyProbeRef.current?.request(program);
            sendJson(socket, { t: "models", program });
            const acpSession = stateRef.current.activeSession;
            // The initial openSession caller sends its own request once the
            // first socket resolves. Only reattach on subsequent connections.
            if (gen > 1 && acpSession) sendJson(socket, { t: "open_session", program, acp_session: acpSession, ...(taskSessionRef.current ? { task_session_id: taskSessionRef.current } : {}) });
          }
          finish(socket);
        },
        { once: true },
      );
      socket.addEventListener("message", (event) => {
        if (gen !== connectGen.current) return;
        if (typeof event.data !== "string") return;
        ingest(event.data);
      });
      socket.addEventListener("close", () => {
        clearTimeout(timer);
        if (socketRef.current === socket) socketRef.current = null;
        if (gen !== connectGen.current) {
          finish(null);
          return;
        }
        sessionsRefreshRef.current?.reset();
        occupancyProbeRef.current?.reset();
        dispatch({ type: "occupancy-lost" });
        if (!stateRef.current.messages.some((message) => message.kind === "notice" && isReconnectingNotice(message.code))) {
          dispatch({ type: "notice", code: "dialog_unreachable", program: stateRef.current.program ?? "" });
        }
        finish(null);
        if (!enabledRef.current) return;
        scheduleReconnect();
      });
    });
    }
  }, [ingest, scheduleReconnect]);

  connectRef.current = connect;

  const ensureOpen = useCallback(() => connectRef.current(), []);

  // --------------------------------------------------------------------- //
  // OceanLeo agent 程序（合同 I6）：REST turn + getTask 轮询，不走 WS。
  // --------------------------------------------------------------------- //

  const clearOceanWait = useCallback(() => {
    const waiter = oceanWaiterRef.current;
    if (!waiter) return;
    oceanWaiterRef.current = null;
    clearTimeout(waiter.timer);
    waiter.resolve(false);
  }, []);

  const oceanWait = useCallback(
    (ms: number) =>
      new Promise<boolean>((resolve) => {
        oceanWaiterRef.current = {
          timer: setTimeout(() => {
            oceanWaiterRef.current = null;
            resolve(true);
          }, ms),
          resolve,
        };
      }),
    [],
  );

  const dispatchOceanOccupancy = useCallback((running: boolean) => {
    const ids = [...new Set(
      [stateRef.current.activeSession, stateRef.current.draftRef, oceanTaskRef.current, "oceanleo"]
        .filter((id): id is string => Boolean(id)),
    )];
    dispatch({
      type: "frame",
      frame: { t: "occupancy", program: "oceanleo", busy: running ? ids : [] },
    });
  }, []);

  /** 任务详情 → 消息列表。刚发的那句服务端还没落库时这一轮不替换（本地回显不闪没）。 */
  const applyOceanDetail = useCallback(
    (detail: TaskDetail) => {
      const status = detail.task?.status || "";
      const mapped = mapTaskMessages({ ...detail, task: { ...detail.task, status } }, { step: tt("步骤"), error: tt("出错") });
      const pending = oceanSendRef.current;
      if (pending) {
        // 落地判定按用户消息计数、不按文本：重发同一句不算落地，服务端改写文本也不卡死。
        // 任务已到终态则无条件应用——服务端真相优先，busy 不许因此卡住。
        const userCount = mapped.reduce(
          (count, message) => (message.kind === "user" ? count + 1 : count),
          0,
        );
        const terminal = Boolean(status && status !== "running");
        if (!terminal && userCount <= pending.baseUsers) return;
        oceanSendRef.current = null;
      }
      messagesCacheRef.current.set("oceanleo", mapped);
      if (stateRef.current.program === "oceanleo") {
        dispatch({ type: "messages-replace", messages: mapped });
        const running = status === "running";
        if (running && !stateRef.current.busy) dispatch({ type: "send-began" });
        if (!running) dispatch({ type: "server-settled" });
        dispatchOceanOccupancy(running);
      }
    },
    [dispatchOceanOccupancy, tt],
  );

  /** 轮询直到任务离开 running；代际变了（重进程序/复位/卸载）立即收手。 */
  const pollOcean = useCallback(
    async (taskId: string, gen: number) => {
      let idleStep = -1;
      let waitedMs = 0;
      // Streaming assistant output updates one row repeatedly. Track a stable
      // fingerprint of row ids/content, rather than only the row count, so a
      // growing message is rendered on the next poll.
      let lastFingerprint = "";
      for (;;) {
        if (gen !== oceanGen.current || !activeRef.current) return;
        // 与 AgentChat 同语义：页面在后台这一轮不发请求，只留便宜定时器回来看。
        const hidden = typeof document !== "undefined" && document.hidden === true;
        if (hidden) {
          const cadence = nextOceanleoPoll({ hidden: true, changed: false, idleStep, waitedMs });
          idleStep = cadence.idleStep;
          waitedMs = cadence.waitedMs;
          if (!(await oceanWait(cadence.delayMs))) return;
          continue;
        }
        const result = await getTask(taskId);
        if (gen !== oceanGen.current) return;
        if (!result.ok || !result.data) {
          // 网络/权限抖动：不擦列表、不假装结束，按退避节奏再来。占用未知。
          dispatch({ type: "occupancy-lost" });
          const cadence = nextOceanleoPoll({ hidden: false, changed: false, idleStep, waitedMs });
          idleStep = cadence.idleStep;
          waitedMs = cadence.waitedMs;
          if (!(await oceanWait(cadence.delayMs))) return;
          continue;
        }
        const detail = result.data;
        const fingerprint = oceanMessageFingerprint(detail.messages ?? []);
        const changed = fingerprint !== lastFingerprint;
        lastFingerprint = fingerprint;
        applyOceanDetail(detail);
        if (detail.task?.status !== "running") return;
        const cadence = nextOceanleoPoll({ hidden: false, changed, idleStep, waitedMs });
        idleStep = cadence.idleStep;
        waitedMs = cadence.waitedMs;
        if (!(await oceanWait(cadence.delayMs))) return;
      }
    },
    [applyOceanDetail, oceanWait],
  );

  /** 进入 oceanleo 程序（或重试）：拉 agentState，回放当前任务的消息。 */
  const refreshOcean = useCallback(async () => {
    const computerId = computerIdRef.current;
    if (!computerId || !enabledRef.current || !activeRef.current || !oceanleoReadyRef.current) return;
    const gen = (oceanGen.current += 1);
    clearOceanWait();
    const result = await agentState(computerId);
    if (gen !== oceanGen.current) return;
    if (!result.ok || !result.data) {
      setComputerName("");
      oceanTaskRef.current = "";
      dispatch({ type: "occupancy-lost" });
      dispatch({
        type: "frame",
        frame: {
          t: "error",
          code: result.status === 0 ? "dialog_unreachable" : "node_error",
          program: "oceanleo",
        },
      });
      return;
    }
    const data = result.data;
    setComputerName(data.computer?.name ?? "");
    if (data.computer?.online !== true) {
      // 电脑不在线：消息区只留一行实话，输入禁用（offline 语义与 WS 程序一致）。
      oceanTaskRef.current = "";
      oceanSendRef.current = null;
      messagesCacheRef.current.set("oceanleo", []);
      if (stateRef.current.program === "oceanleo") {
        dispatch({ type: "messages-replace", messages: [] });
      }
      dispatch({ type: "frame", frame: { t: "error", code: "computer_offline", program: "oceanleo" } });
      return;
    }
    if (stateRef.current.offline) dispatch({ type: "clear-offline" });
    const taskId = typeof data.task_id === "string" ? data.task_id : "";
    oceanTaskRef.current = taskId;
    if (!taskId) {
      messagesCacheRef.current.set("oceanleo", []);
      if (stateRef.current.program === "oceanleo") {
        dispatch({ type: "messages-replace", messages: [] });
        dispatch({ type: "server-settled" });
        dispatchOceanOccupancy(false);
      }
      return;
    }
    const detail = await getTask(taskId);
    if (gen !== oceanGen.current) return;
    if (!detail.ok || !detail.data) {
      dispatch({ type: "occupancy-lost" });
      return;
    }
    applyOceanDetail(detail.data);
    if (detail.data.task?.status === "running") void pollOcean(taskId, gen);
  }, [applyOceanDetail, clearOceanWait, dispatchOceanOccupancy, pollOcean]);

  refreshOceanRef.current = refreshOcean;

  const sendOcean = useCallback(async (override?: string): Promise<boolean> => {
    const computerId = computerIdRef.current;
    if (!computerId) return false;
    const ocean = stateRef.current;
    const oceanMode = composerOccupancy({
      linkUp: ocean.occupancyLink,
      occupancyAt: ocean.occupancyAt,
      occupancyBusy: ocean.occupancyBusy,
      sessionId: ocean.activeSession || ocean.draftRef || oceanTaskRef.current || "oceanleo",
      messages: ocean.messages,
      pendingAt: ocean.occupancyPendingAt,
      pendingSession: ocean.occupancyPendingSession,
      offline: ocean.offline,
      sessionLoading: ocean.sessionLoading,
    });
    if (oceanMode !== "idle") return false;
    if (inboxWaiters.current.size) {
      await Promise.all([...inboxWaiters.current.values()]);
    }
    const pendingFiles = attachmentsRef.current.filter(isInboxReady);
    const text = (override ?? draftRef.current).trim();
    if (!text && pendingFiles.length === 0) return false;
    // 后端 turn 上限 8000：超了明说，不静默截断（WS 程序的 32000 是另一条协议）。
    if (text.length > MAX_OCEAN_PROMPT_CHARS) {
      dispatch({ type: "notice", code: "invalid_argument", program: "oceanleo" });
      return false;
    }
    const gen = (oceanGen.current += 1);
    clearOceanWait();
    // 与 WS send 同款乐观写：dispatch 到重渲染之间再按发送不能发出第二句。
    dispatch({ type: "send-began" });
    stateRef.current = applyDialog(stateRef.current, { type: "send-began" });
    const named = userFileRows(pendingFiles);
    const fileNote = pendingFiles.length
      ? `${text ? "\n\n" : ""}` + pendingFiles.map((item) => `附件：${item.path}`).join("\n")
      : "";
    const outgoing = `${text}${fileNote}`;
    dispatch({ type: "user", text: outgoing, attachments: named });
    setDraft("");
    setAttachments((current) => current.filter((item) => item.state === "error"));
    const freshTurn = freshRef.current;
    setFresh(false);
    if (freshTurn) {
      // 「新对话」：先丢掉服务端任务指针，下一句必然新建任务。
      await agentReset(computerId);
      if (gen !== oceanGen.current) return false;
      oceanTaskRef.current = "";
      // 新任务从 0 条用户消息计起；旧缓存的计数会把落地判定永远挡住。
      messagesCacheRef.current.set("oceanleo", []);
    }
    const baseUsers = (messagesCacheRef.current.get("oceanleo") ?? []).reduce(
      (count, message) => (message.kind === "user" ? count + 1 : count),
      0,
    );
    oceanSendRef.current = { baseUsers };
    const result = await agentTurn(computerId, {
      text: outgoing,
      shell_session_id: sessionIdRef.current || undefined,
    });
    if (gen !== oceanGen.current) return true;
    if (!result.ok || !result.data?.task_id) {
      oceanSendRef.current = null;
      if (result.status === 0) {
        dispatch({ type: "send-failed" });
      } else {
        dispatch({
          type: "frame",
          frame: { t: "error", code: "node_error", program: "oceanleo" },
        });
      }
      return false;
    }
    oceanTaskRef.current = result.data.task_id;
    void pollOcean(result.data.task_id, gen);
    return true;
  }, [clearOceanWait, pollOcean]);

  useEffect(() => {
    dispatch({ type: "reset" });
    setDraft("");
    setFresh(false);
    setComputerName("");
    oceanGen.current += 1;
    oceanTaskRef.current = "";
    oceanSendRef.current = null;
    messagesCacheRef.current.clear();
    clearOceanWait();
  }, [computerId, sessionId, clearOceanWait]);

  useEffect(() => {
    if (!enabled) {
      sessionsRefreshRef.current?.reset();
      connectGen.current += 1;
      inflightRef.current = null;
      clearTimer();
      oceanGen.current += 1;
      clearOceanWait();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
      return;
    }
    dispatch({ type: "clear-offline" });
    delayRef.current = 1000;
    void connect();
    // 默认程序就是 oceanleo（合同 I6）：打开对话框即拉 agentState 回放当前任务。
    if (stateRef.current.program === "oceanleo" && !localOceanleoRef.current) {
      dispatch({ type: "sessions-unavailable" });
      void refreshOceanRef.current();
    }
    return () => {
      sessionsRefreshRef.current?.reset();
      connectGen.current += 1;
      inflightRef.current = null;
      clearTimer();
      oceanGen.current += 1;
      clearOceanWait();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    };
  }, [enabled, computerId, sessionId, clearTimer, connect, clearOceanWait]);

  const readySeenRef = useRef(oceanleoReady);
  useEffect(() => {
    const wasReady = readySeenRef.current;
    readySeenRef.current = oceanleoReady;
    if (!wasReady && oceanleoReady && !localOceanleo && stateRef.current.program === "oceanleo") {
      void refreshOceanRef.current();
    }
  }, [oceanleoReady, localOceanleo]);

  const previousActive = useRef(active);
  useEffect(() => {
    if (previousActive.current === active) return;
    previousActive.current = active;
    if (!active) {
      clearTimer();
      oceanGen.current += 1;
      clearOceanWait();
      return;
    }
    if (enabled) {
      void connectRef.current();
      if (stateRef.current.program === "oceanleo" && !localOceanleoRef.current) void refreshOceanRef.current();
    }
  }, [active, enabled, clearTimer, clearOceanWait]);

  // 本地 OceanLeo agent 装上 / 卸掉时，正在看的 oceanleo 换到另一条通道（WS ↔ REST）。
  const localSeenRef = useRef(localOceanleo);
  useEffect(() => {
    if (localSeenRef.current === localOceanleo) return;
    localSeenRef.current = localOceanleo;
    if (!enabled || stateRef.current.program !== "oceanleo" || stateRef.current.busy) return;
    messagesCacheRef.current.delete("oceanleo");
    dispatch({ type: "program", program: "oceanleo" });
    dispatch({ type: "messages-replace", messages: [] });
    if (!localOceanleo) {
      dispatch({ type: "sessions-unavailable" });
      void refreshOceanRef.current();
      return;
    }
    oceanGen.current += 1;
    clearOceanWait();
    oceanTaskRef.current = "";
    oceanSendRef.current = null;
    void (async () => {
      const socket = await connectRef.current();
      sessionsRefreshRef.current?.request("oceanleo");
      sendJson(socket, { t: "models", program: "oceanleo" });
    })();
  }, [enabled, localOceanleo, clearOceanWait]);

  const setProgram = useCallback(
    (next: AgentProgram) => {
      // OceanLeo 本地安装后走同一条 ACP WS；没安装时保留既有 REST 云端 agent。
      if (!isWsProgram(next) && next !== "oceanleo") return;
      const prev = stateRef.current.program;
      // 同一程序再选一次（如对话中点当前 agent 的齿轮）不能清掉模型、会话和消息。
      if (prev === next) return;
      const cached = presentationFor(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current);
      if (prev) {
        cached.views.set(viewKeyRef.current, viewSnapOf(stateRef.current));
        cached.last.set(prev, viewKeyRef.current);
      }
      const key = cached.last.get(next) ?? `${next}::new:${clientRef(next)}`;
      const saved = cached.views.get(key);
      viewKeyRef.current = key;
      const switched = hydratePresentation(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current, applyDialog(stateRef.current, { type: "program", program: next }));
      stateRef.current = saved ? applyDialog(switched, { type: "restore-view", ...saved }) : { ...switched, messages: [], draftRef: `new:${clientRef(next)}` };
      dispatch({ type: "program", program: next });
      dispatch({ type: "restore-view", ...viewSnapOf(stateRef.current) });
      if (next === "oceanleo" && !localOceanleoRef.current) {
        dispatch({ type: "sessions-unavailable" });
        // 进入即拉服务端真相（覆盖上面的缓存过渡）；离开 oceanleo 则停掉轮询。
        void refreshOcean();
        return;
      }
      if (prev === "oceanleo" && !localOceanleoRef.current) {
        oceanGen.current += 1;
        clearOceanWait();
      }
      const socket = socketRef.current;
      if (usesDialogSocket(next, localOceanleoRef.current) && socket && socket.readyState === WebSocket.OPEN) {
        sessionsRefreshRef.current?.request(next);
        sendJson(socket, { t: "models", program: next });
      }
    },
    [clearOceanWait, refreshOcean],
  );

  const abortSendGuardRef = useRef(false);
  const armAbortSendGuard = useCallback(() => {
    if (abortSendGuardRef.current) return;
    abortSendGuardRef.current = true;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      abortSendGuardRef.current = false;
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    const onClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      release();
    };
    const onUp = () => {
      window.setTimeout(release, 0);
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  // `override` lets a host composer (main chat LeoComposer) send its own text
  // without first round-tripping it through this controller's draft state.
  const send = useCallback(async (override?: string): Promise<boolean> => {
    if (abortSendGuardRef.current) return false;
    const program = stateRef.current.program;
    // 合同 I6：oceanleo 走 REST turn + 轮询，不碰 WS（P7：不为它等 15s 连接超时）。
    if (program === "oceanleo" && !localOceanleoRef.current) {
      return await sendOcean(typeof override === "string" ? override : undefined);
    }
    if (!usesDialogSocket(program, localOceanleoRef.current)) return false;
    const current = stateRef.current;
    const sessionId = current.activeSession || current.draftRef || "";
    const occupancyMode = composerOccupancy({
      linkUp: current.occupancyLink,
      occupancyAt: current.occupancyAt,
      occupancyBusy: current.occupancyBusy,
      sessionId,
      messages: current.messages,
      pendingAt: current.occupancyPendingAt,
      pendingSession: current.occupancyPendingSession,
      offline: current.offline,
      sessionLoading: current.sessionLoading,
    });
    if (occupancyMode !== "idle") return false;
    const text = (typeof override === "string" ? override : draftRef.current).trim();
    if (inboxWaiters.current.size) {
      await Promise.all([...inboxWaiters.current.values()]);
    }
    const files = attachmentsRef.current.filter(isInboxReady);
    if (!text && files.length === 0) return false;
    if (text.length > MAX_PROMPT_CHARS) {
      dispatch({ type: "notice", code: "invalid_argument", program });
      return false;
    }
    stateRef.current = applyDialog(current, { type: "send-began" });
    const model = current.selectedModel;
    const mode = current.selectedMode;
    const origin = viewKeyRef.current;
    const acpSession = current.activeSession;
    const ref = acpSession ? "" : clientRef(program);
    if (ref) pendingRefs.current.set(ref, origin);
    const config = {
      ...Object.fromEntries(current.configOptions.filter((option) =>
        option.id !== "model" && option.category !== "model" && option.id !== current.mode?.id &&
        option.id !== "mode" && option.category !== "mode" &&
        option.options.some((choice) => choice.value === String(option.current)),
      ).map((option) => [option.id, option.current])),
      ...pendingConfig.current.get(origin),
    };
    presentationFor(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current).views.set(origin, viewSnapOf(stateRef.current));
    dispatch({ type: "send-began" });
    const socket = await ensureOpen();
    if (!socket) {
      ingest(JSON.stringify({ t: "error", code: "dialog_unreachable", program, ...(acpSession ? { acp_session: acpSession } : { ref }) }));
      return false;
    }
    const frame: Record<string, unknown> = { t: "prompt", program, text, ...(taskSessionRef.current ? { task_session_id: taskSessionRef.current } : {}) };
    if (acpSession) frame.acp_session = acpSession;
    else {
      frame.ref = ref;
      if (model) frame.model = model;
      if (mode) frame.mode = mode;
      if (Object.keys(config).length) frame.config = config;
    }
    if (files.length) {
      frame.files = promptFiles(files);
    }
    if (taskSessionRef.current) archiveStatusRef.current?.("pending");
    if (!sendJson(socket, frame)) {
      ingest(JSON.stringify({ t: "error", code: "dialog_unreachable", program, ...(acpSession ? { acp_session: acpSession } : { ref }) }));
      return false;
    }
    ingest(JSON.stringify({
      t: "user_message",
      program,
      text,
      ...(acpSession ? { acp_session: acpSession } : { ref }),
      attachments: userFileRows(files),
    }));
    pendingConfig.current.delete(origin);
    setDraft("");
    setAttachments((current) => current.filter((item) => item.state === "error"));
    setFresh(false);
    return true;
  }, [ensureOpen, ingest]);

  const abort = useCallback(() => {
    const program = stateRef.current.program;
    // Persist the requested state before a program/session switch can snapshot
    // this view. The request itself does not prove that the turn has ended.
    stateRef.current = applyDialog(stateRef.current, { type: "cancel-local" });
    dispatch({ type: "cancel-local" });
    if (program === "oceanleo" && !localOceanleoRef.current) {
      // 「停止」真的停：停轮询、停服务端任务，再拉一次终态消息。
      oceanGen.current += 1;
      clearOceanWait();
      oceanSendRef.current = null;
      const taskId = oceanTaskRef.current;
      if (taskId) {
        const gen = oceanGen.current;
        void stopTask(taskId).then(async () => {
          if (gen !== oceanGen.current) return;
          const detail = await getTask(taskId);
          if (gen !== oceanGen.current) return;
          if (!detail.ok || !detail.data) {
            dispatch({ type: "occupancy-lost" });
            void pollOcean(taskId, gen);
            return;
          }
          applyOceanDetail(detail.data);
          if (detail.data.task?.status === "running") void pollOcean(taskId, gen);
        }).catch(() => {
          if (gen !== oceanGen.current) return;
          dispatch({ type: "occupancy-lost" });
          void pollOcean(taskId, gen);
        });
      }
      return;
    }
    if (usesDialogSocket(program, localOceanleoRef.current)) {
      const frame: Record<string, unknown> = { t: "cancel", program };
      if (stateRef.current.activeSession) frame.acp_session = stateRef.current.activeSession;
      else frame.ref = newRefs.current.get(program);
      // Stop must never be dropped just because the socket happened to be
      // reconnecting when it was pressed: retry on a fresh connection.
      if (!sendJson(socketRef.current, frame)) {
        void (async () => {
          try {
            if (!sendJson(await ensureOpen(), frame)) dispatch({ type: "occupancy-lost" });
          } catch {
            dispatch({ type: "occupancy-lost" });
          }
        })();
      }
    }
  }, [applyOceanDetail, clearOceanWait, ensureOpen, pollOcean]);

  const closeProgram = useCallback((program: WsProgram) => {
    const sent = sendJson(socketRef.current, { t: "close", program });
    dispatch({ type: "close-session", program });
    if (sent) return;
    void (async () => {
      const socket = await ensureOpen();
      sendJson(socket, { t: "close", program });
    })();
  }, [ensureOpen]);

  const requestSessions = useCallback(() => {
    const program = stateRef.current.program;
    if (!usesDialogSocket(program, localOceanleoRef.current)) {
      dispatch({ type: "sessions-unavailable" });
      return;
    }
    sessionsRefreshRef.current?.request(program, "manual");
    if (socketRef.current?.readyState === WebSocket.OPEN) return;
    void (async () => {
      await ensureOpen();
      if (stateRef.current.program === program) sessionsRefreshRef.current?.request(program);
    })();
  }, [ensureOpen]);

  // Sessions can also be created or renamed outside this view (CLI, another tab),
  // so keep the list fresh while the dialog is on screen and when it regains focus.
  useEffect(() => {
    if (!enabled || !active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const probeProgram = () => (
      usesDialogSocket(stateRef.current.program, localOceanleoRef.current)
        ? stateRef.current.program
        : null
    );
    const refresh = (reason: "wake" | "poll" = "wake") => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (typeof document !== "undefined" && document.hidden) {
        sessionsRefreshRef.current?.pause();
        occupancyProbeRef.current?.stop();
        return;
      }
      const program = stateRef.current.program;
      if (usesDialogSocket(program, localOceanleoRef.current)) {
        sessionsRefreshRef.current?.request(program, reason);
        occupancyProbeRef.current?.request(program);
        if (occupancyProbeRef.current?.stale(program)) dispatch({ type: "occupancy-lost" });
        timer = setTimeout(() => refresh("poll"), SESSIONS_REFRESH_MS);
      }
    };
    const wake = () => {
      if (typeof document === "undefined" || !document.hidden) {
        occupancyProbeRef.current?.start(probeProgram);
      }
      refresh();
    };
    refresh();
    occupancyProbeRef.current?.start(probeProgram);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      if (timer) clearTimeout(timer);
      sessionsRefreshRef.current?.pause();
      occupancyProbeRef.current?.stop();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [enabled, active, state.program, localOceanleo]);

  useEffect(() => {
    if (!enabled || !active || !oceanleoReady) return;
    if (state.program !== "oceanleo" || localOceanleo) return;
    let alive = true;
    const tick = async () => {
      if (!alive || (typeof document !== "undefined" && document.hidden)) return;
      const computerId = computerIdRef.current;
      if (!computerId) return;
      const result = await agentState(computerId);
      if (!alive) return;
      if (!result.ok || !result.data) {
        dispatch({ type: "occupancy-lost" });
        return;
      }
      if (result.data.computer?.online !== true) {
        dispatch({ type: "frame", frame: { t: "error", code: "computer_offline", program: "oceanleo" } });
        return;
      }
      const taskId = typeof result.data.task_id === "string" ? result.data.task_id : "";
      if (!taskId) {
        dispatchOceanOccupancy(false);
        return;
      }
      const detail = await getTask(taskId);
      if (!alive) return;
      if (!detail.ok || !detail.data) {
        dispatch({ type: "occupancy-lost" });
        return;
      }
      dispatchOceanOccupancy(detail.data.task?.status === "running");
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 2_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [dispatchOceanOccupancy, enabled, active, oceanleoReady, state.program, localOceanleo]);

  const requestSessionPath = useCallback(() => {
    const program = stateRef.current.program;
    const acpSession = stateRef.current.activeSession.trim();
    if (!acpSession || !usesDialogSocket(program, localOceanleoRef.current)) return;
    const sent = sendJson(socketRef.current, { t: "session_path", program, acp_session: acpSession });
    if (sent) return;
    void (async () => {
      const socket = await ensureOpen();
      sendJson(socket, { t: "session_path", program, acp_session: acpSession });
    })();
  }, [ensureOpen]);

  const openSession = useCallback((id: string) => {
    const acpSession = id.trim();
    const program = stateRef.current.program;
    if (!acpSession || !usesDialogSocket(program, localOceanleoRef.current)) return;
    if (stateRef.current.activeSession === acpSession && stateRef.current.sessionLoading) return;
    clearUnread(program ?? "", acpSession);
    const cache = presentationFor(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current);
    cache.views.set(viewKeyRef.current, viewSnapOf(stateRef.current));
    const cacheKey = `${program}::${acpSession}`;
    const saved = cache.views.get(cacheKey);
    viewKeyRef.current = cacheKey;
    initialOpened.current.add(program);
    const restored = { ...initialDialogState(), ...saved, program, activeSession: acpSession, sessions: stateRef.current.sessions,
      sessionsSupported: stateRef.current.sessionsSupported, liveTurns: stateRef.current.liveTurns, sessionLoading: true };
    stateRef.current = { ...stateRef.current, ...viewSnapOf(restored) };
    dispatch({ type: "restore-view", ...viewSnapOf(stateRef.current) });
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) {
        dispatch({ type: "send-failed" });
        return;
      }
      sendJson(socket, { t: "open_session", program, acp_session: acpSession, ...(taskSessionRef.current ? { task_session_id: taskSessionRef.current } : {}) });
    })();
  }, [clearUnread, ensureOpen]);
  openSessionRef.current = openSession;

  const loadOlderHistory = useCallback(() => {
    const current = stateRef.current;
    const program = current.program;
    const acpSession = current.activeSession.trim();
    if (
      !acpSession
      || !current.hasOlder
      || current.historyLoading
      || current.sessionLoading
      || current.historyOffset < 1
      || !usesDialogSocket(program, localOceanleoRef.current)
    ) return;
    dispatch({ type: "history-loading" });
    stateRef.current = applyDialog(stateRef.current, { type: "history-loading" });
    const before = current.historyOffset;
    void (async () => {
      const socket = socketRef.current?.readyState === WebSocket.OPEN ? socketRef.current : await ensureOpen();
      const sent = sendJson(socket, { t: "load_history", program, acp_session: acpSession, before });
      if (!sent) {
        dispatch({ type: "history-idle" });
        stateRef.current = applyDialog(stateRef.current, { type: "history-idle" });
      }
    })();
  }, [ensureOpen]);

  const newSession = useCallback((cwd?: string) => {
    const program = stateRef.current.program;
    stateRef.current = {
      ...stateRef.current,
      activeSession: "",
      sessionPath: "",
      sessionPathResolved: false,
      sessionLoading: false,
      historyOffset: 0,
      historyTotal: 0,
      hasOlder: false,
      historyLoading: false,
      messages: [],
      commands: [],
      busy: false,
      agentBusy: false,
      occupancyPendingAt: null,
      occupancyPendingSession: null,
    };
    if (program) {
      newRefs.current.delete(program);
      const ref = clientRef(program);
      viewKeyRef.current = `${program}::new:${ref}`;
      stateRef.current = { ...stateRef.current, draftRef: `new:${ref}` };
      initialOpened.current.add(program);
    }
    dispatch({ type: "restore-view", ...viewSnapOf(stateRef.current) });
    if (program === "oceanleo" && !localOceanleoRef.current) {
      oceanGen.current += 1;
      clearOceanWait();
      oceanTaskRef.current = "";
      oceanSendRef.current = null;
      messagesCacheRef.current.set("oceanleo", []);
      void agentReset(computerIdRef.current).finally(() => {
        dispatch({
          type: "frame",
          frame: { t: "session_opened", program: "oceanleo", acp_session: "" },
        });
      });
      return;
    }
    // New adapter sessions are created only with the first prompt, but the
    // model/Fast/effort catalog must still be on this empty view.
    if (usesDialogSocket(program, localOceanleoRef.current)) {
      void (async () => {
        const socket = await ensureOpen();
        sendJson(socket, { t: "models", program });
      })();
    }
    void cwd;
  }, [clearOceanWait, ensureOpen]);

  const openInstall = useCallback((program: WsProgram) => {
    dispatch({ type: "open-install", program });
  }, []);

  const closeInstall = useCallback(() => {
    dispatch({ type: "close-install" });
  }, []);

  const setInstallDir = useCallback((dir: string) => {
    dispatch({ type: "set-install-dir", dir });
  }, []);

  const startInstall = useCallback(() => {
    const current = stateRef.current;
    const program = current.install.program;
    if (!program || current.install.running) return;
    const row = current.programs.find((item) => item.id === program);
    const dir = installDirPayload(current.install.dir, row?.dir_capability ?? "full");
    stateRef.current = {
      ...current,
      install: { ...current.install, running: true, lines: [], donePath: "", failedText: "" },
    };
    dispatch({ type: "install-began" });
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) {
        dispatch({ type: "install-local-fail" });
        return;
      }
      sendJson(socket, { t: "install", program, dir });
    })();
  }, [ensureOpen]);

  const openLogin = useCallback((program: WsProgram) => {
    dispatch({ type: "open-login", program });
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) return;
      sendJson(socket, { t: "login", program });
    })();
  }, [ensureOpen]);

  const closeLogin = useCallback(() => {
    dispatch({ type: "close-login" });
  }, []);

  // 合同 I3：Claude 这类 needs_code 的程序，把浏览器给的码贴进登录进程 stdin。
  const submitLoginCode = useCallback(
    (program: WsProgram, code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      dispatch({ type: "login-code-draft", code: "" });
      void (async () => {
        const socket = await ensureOpen();
        if (!socket) return;
        sendJson(socket, { t: "login_code", program, code: trimmed });
      })();
    },
    [ensureOpen],
  );

  // 取消登录：告诉服务端杀登录进程，本地立刻关卡（服务端随后补 login_failed cancelled）。
  const cancelLogin = useCallback((program: WsProgram) => {
    dispatch({ type: "close-login" });
    const sent = sendJson(socketRef.current, { t: "login_cancel", program });
    if (sent) return;
    void (async () => {
      const socket = await ensureOpen();
      sendJson(socket, { t: "login_cancel", program });
    })();
    // ensureOpen 也失败就算了：卡片已关，进程侧 15 分钟超时自己收。
  }, [ensureOpen]);

  const setLoginCodeDraft = useCallback((code: string) => {
    dispatch({ type: "login-code-draft", code });
  }, []);

  const setSelectedModel = useCallback((id: string) => {
    const program = stateRef.current.program;
    if (program) rememberProgramSelection(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current, program, { model: id });
    dispatch({ type: "set-model", id });
    stateRef.current = applyDialog(stateRef.current, { type: "set-model", id });
    if (!usesDialogSocket(program, localOceanleoRef.current)) return;
    const acpSession = stateRef.current.activeSession;
    if (!acpSession) {
      pendingConfig.current.delete(viewKeyRef.current);
      return;
    }
    const modelOption = stateRef.current.configOptions.find(
      (option) => option.id === "model" || option.category === "model",
    );
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) return;
      sendJson(socket, { t: "set_config", program, acp_session: acpSession, id: modelOption?.id || "model", value: id });
    })();
  }, [ensureOpen]);

  const setConfig = useCallback((id: string, value: string | boolean) => {
    const program = stateRef.current.program;
    if (program && stateRef.current.selectedModel) {
      rememberModelParam(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current, program, stateRef.current.selectedModel, id, String(value));
    }
    if (program && (id === "mode" || id === stateRef.current.mode?.id)) {
      rememberProgramSelection(taskSessionRef.current ? `${computerIdRef.current}:${taskSessionRef.current}` : computerIdRef.current, program, { mode: String(value) });
    }
    dispatch({ type: "set-config", id, value });
    stateRef.current = applyDialog(stateRef.current, { type: "set-config", id, value });
    if (!usesDialogSocket(program, localOceanleoRef.current)) return;
    const acpSession = stateRef.current.activeSession;
    if (!acpSession) {
      if (id !== "mode" && id !== stateRef.current.mode?.id) {
        pendingConfig.current.set(viewKeyRef.current, { ...pendingConfig.current.get(viewKeyRef.current), [id]: value });
      }
      return;
    }
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) return;
      sendJson(socket, { t: "set_config", program, acp_session: acpSession, id, value });
    })();
  }, [ensureOpen]);

  const setMode = useCallback((value: string) => {
    const id = stateRef.current.mode?.id || "mode";
    dispatch({ type: "set-mode", value });
    setConfig(id, value);
  }, [setConfig]);

  const logoutProgram = useCallback((program: WsProgram, provider?: string) => {
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) return;
      sendJson(socket, { t: "logout", program, ...(provider ? { provider } : {}) });
      sendJson(socket, { t: "status" });
    })();
  }, [ensureOpen]);

  const answerPermission = useCallback((id: string, option: string, name: string) => {
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) return;
      sendJson(socket, { t: "permission", id, option });
      dispatch({ type: "permission-chose", id, name });
    })();
  }, [ensureOpen]);

  const answerQuestion = useCallback((id: string, values: Record<string, string>) => {
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) return;
      sendJson(socket, { t: "answer", id, values });
      dispatch({ type: "question-submitted", id });
    })();
  }, [ensureOpen]);

  const retryConnect = useCallback(() => {
    // 「重试」对整个对话框一视同仁：WS 开着就重发 status（Key 保存后程序行靠它刷新，
    // key 的 POST/DELETE 是纯 REST、后端不推 status），没开着就重连；
    // oceanleo 额外再拉 agentState（REST 侧真相）。
    delayRef.current = 1000;
    dispatch({ type: "clear-offline" });
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendJson(socket, { t: "status" });
    } else {
      void connect();
    }
    if (stateRef.current.program === "oceanleo") void refreshOcean();
  }, [connect, refreshOcean]);

  const setFreshValue = useCallback((value: boolean) => {
    setFresh(value);
  }, []);

  const addAttachments = useCallback((files: File[]) => {
    const computerId = computerIdRef.current.trim();
    const room = Math.max(0, 20 - attachmentsRef.current.length);
    const accepted = files.slice(0, room);
    if (!accepted.length) return;
    const created: DialogAttachment[] = accepted.map((file) => ({
      id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name || "file",
      mime: file.type || "application/octet-stream",
      size: file.size,
      percent: 0,
      state: "uploading",
    }));
    setAttachments((current) => [...current, ...created].slice(0, 20));
    const put = computerApi.putComputerInbox;
    created.forEach((chip, index) => {
      const file = accepted[index];
      let settleWaiter: () => void = () => {};
      const waiter = new Promise<void>((resolve) => {
        settleWaiter = resolve;
      });
      inboxWaiters.current.set(chip.id, waiter);
      const finish = (patch: Partial<DialogAttachment>) => {
        setAttachments((current) =>
          current.map((item) => (item.id === chip.id ? { ...item, ...patch } : item)),
        );
      };
      const done = () => {
        inboxWaiters.current.delete(chip.id);
        settleWaiter();
      };
      if (typeof put !== "function" || !computerId) {
        finish({
          state: "error",
          error: !computerId ? "missing computer" : "inbox upload unavailable",
        });
        done();
        return;
      }
      void put(computerId, file, (percent) => {
        finish({ percent });
      }, taskSessionRef.current ? { task_session_id: taskSessionRef.current } : undefined)
        .then((result) => {
          finish({
            state: "done",
            percent: 100,
            path: result.path,
            archive: result.archive,
            name: result.name || chip.name,
            mime: result.mime || chip.mime,
            size: typeof result.size === "number" ? result.size : chip.size,
            error: undefined,
          });
        })
        .catch((err: unknown) => {
          const message =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message || "").trim()
              : "";
          finish({
            state: "error",
            error: message || "upload failed",
          });
        })
        .finally(done);
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }, []);

  return {
    computerId,
    program: state.program,
    setProgram,
    computerName,
    messages: state.messages,
    draft,
    setDraft,
    busy: state.busy,
    occupancyLink: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    occupancyPendingAt: state.occupancyPendingAt,
    occupancyPendingSession: state.occupancyPendingSession,
    busySessions: confirmedBusySessions(
      state.occupancyBusy,
      occupancyFresh({
        linkUp: state.occupancyLink,
        occupancyAt: state.occupancyAt,
        now: occupancyClock,
      }),
    ),
    waitingSessions: confirmedWaitingSessions(
      state.occupancyWaiting,
      occupancyFresh({
        linkUp: state.occupancyLink,
        occupancyAt: state.occupancyAt,
        now: occupancyClock,
      }),
    ),
    runningSessions: state.runningSessions,
    interruptedSessions: [...presentationFor(taskSessionId ? `${computerId}:${taskSessionId}` : computerId).views.entries()]
      .filter(([key, view]) => key.startsWith(`${state.program}::`) && view.activeSession && sessionInterrupted(view.messages))
      .map(([, view]) => view.activeSession),
    unreadSessions,
    send,
    abort,
    armAbortSendGuard,
    programs: state.programs,
    models: state.models,
    modelSource: state.modelSource,
    selectedModel: state.selectedModel,
    setSelectedModel,
    mode: state.mode,
    selectedMode: state.selectedMode,
    setMode,
    configOptions: state.configOptions,
    setConfig,
    commands: state.commands,
    sessions: state.sessions,
    sessionsSupported: state.sessionsSupported,
    activeSession: state.activeSession,
    draftRef: state.draftRef,
    sessionLoading: state.sessionLoading,
    historyOffset: state.historyOffset,
    hasOlder: state.hasOlder,
    historyLoading: state.historyLoading,
    requestSessions,
    requestSessionPath,
    sessionPath: state.sessionPath,
    sessionPathResolved: state.sessionPathResolved,
    openSession,
    loadOlderHistory,
    newSession,
    attachments,
    addAttachments,
    removeAttachment,
    fresh,
    setFresh: setFreshValue,
    install: state.install,
    openInstall,
    closeInstall,
    setInstallDir,
    startInstall,
    login: state.login,
    openLogin,
    closeLogin,
    submitLoginCode,
    cancelLogin,
    setLoginCodeDraft,
    answerPermission,
    answerQuestion,
    openedPrograms: state.opened,
    closeProgram,
    logoutProgram,
    retryConnect,
    offline: state.offline,
    agentBusy: state.agentBusy,
  };
}
