"use client";

// 对话面板的连接和发送。帧进 reduce，这里只负责何时连、何时重连、何时把哪一帧写出去。
// 用户的话只出现在 JSON 帧里，不拼进任何命令字符串。

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { agentDialogWsUrl } from "../../../lib/cloud-computer-api";
import { installDirPayload } from "./install-dir";
import { isWsProgram } from "./parse";
import { applyDialog, initialDialogState } from "./reduce";
import { nextReconnectDelay } from "./reconnect";
import type { AgentDialogController, AgentProgram, WsProgram } from "./types";

const MAX_PROMPT_CHARS = 32000;

function sendJson(socket: WebSocket | null, frame: Record<string, unknown>): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(frame));
  return true;
}

export function useAgentDialog({
  computerId,
  sessionId,
  enabled,
}: {
  computerId: string;
  sessionId: string;
  enabled: boolean;
}): AgentDialogController {
  const [state, dispatch] = useReducer(applyDialog, undefined, initialDialogState);
  const [draft, setDraft] = useState("");
  const [fresh, setFresh] = useState(false);

  const stateRef = useRef(state);
  const draftRef = useRef(draft);
  const freshRef = useRef(fresh);
  const enabledRef = useRef(enabled);
  const computerIdRef = useRef(computerId);
  const sessionIdRef = useRef(sessionId);
  const socketRef = useRef<WebSocket | null>(null);
  const connectGen = useRef(0);
  const haltRef = useRef(false);
  const delayRef = useRef(1000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => Promise<WebSocket | null>>(async () => null);
  const inflightRef = useRef<Promise<WebSocket | null> | null>(null);

  stateRef.current = state;
  draftRef.current = draft;
  freshRef.current = fresh;
  enabledRef.current = enabled;
  computerIdRef.current = computerId;
  sessionIdRef.current = sessionId;

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
      return;
    }
    if (frame.t === "error" && frame.code === "computer_offline") {
      haltRef.current = true;
      clearTimer();
    }
    dispatch({ type: "frame", frame });
    if (frame.t === "install_done" || frame.t === "login_done") {
      sendJson(socketRef.current, { t: "status" });
    }
  }, [clearTimer]);

  const scheduleReconnect = useCallback(() => {
    if (!enabledRef.current || haltRef.current) return;
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
    if (!enabledRef.current || haltRef.current) return null;
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
    if (gen !== connectGen.current || !enabledRef.current || haltRef.current) return null;
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
          delayRef.current = 1000;
          sendJson(socket, { t: "status" });
          const program = stateRef.current.program;
          if (isWsProgram(program)) sendJson(socket, { t: "models", program });
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
        finish(null);
        if (!enabledRef.current || haltRef.current) return;
        scheduleReconnect();
      });
    });
    }
  }, [ingest, scheduleReconnect]);

  connectRef.current = connect;

  const ensureOpen = useCallback(() => connectRef.current(), []);

  useEffect(() => {
    dispatch({ type: "reset" });
    setDraft("");
    setFresh(false);
  }, [computerId, sessionId]);

  useEffect(() => {
    if (!enabled) {
      connectGen.current += 1;
      inflightRef.current = null;
      clearTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
      return;
    }
    haltRef.current = false;
    dispatch({ type: "clear-offline" });
    delayRef.current = 1000;
    void connect();
    return () => {
      connectGen.current += 1;
      inflightRef.current = null;
      clearTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    };
  }, [enabled, computerId, sessionId, clearTimer, connect]);

  const setProgram = useCallback((next: AgentProgram) => {
    if (!isWsProgram(next) || stateRef.current.busy) return;
    dispatch({ type: "program", program: next });
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendJson(socket, { t: "models", program: next });
    }
  }, []);

  const send = useCallback(async () => {
    const program = stateRef.current.program;
    if (!isWsProgram(program)) return;
    if (stateRef.current.busy || stateRef.current.agentBusy || stateRef.current.offline) return;
    const text = draftRef.current.trim();
    if (!text) return;
    if (text.length > MAX_PROMPT_CHARS) {
      dispatch({ type: "notice", code: "invalid_argument", program });
      return;
    }
    stateRef.current = { ...stateRef.current, busy: true };
    const model = stateRef.current.selectedModel;
    const mode = stateRef.current.selectedMode;
    const freshTurn = freshRef.current;
    dispatch({ type: "send-began" });
    const socket = await ensureOpen();
    if (!socket) {
      stateRef.current = { ...stateRef.current, busy: false };
      dispatch({ type: "send-failed" });
      return;
    }
    const frame: Record<string, unknown> = { t: "prompt", program, text };
    if (model) frame.model = model;
    if (mode) frame.mode = mode;
    if (freshTurn) frame.fresh = true;
    socket.send(JSON.stringify(frame));
    dispatch({ type: "user", text });
    setDraft("");
    setFresh(false);
  }, [ensureOpen]);

  const abort = useCallback(() => {
    const program = stateRef.current.program;
    if (isWsProgram(program)) sendJson(socketRef.current, { t: "cancel", program });
    dispatch({ type: "cancel-local" });
  }, []);

  const closeProgram = useCallback((program: WsProgram) => {
    const sent = sendJson(socketRef.current, { t: "close", program });
    dispatch({ type: "close-session", program });
    if (sent) return;
    void (async () => {
      const socket = await ensureOpen();
      sendJson(socket, { t: "close", program });
    })();
  }, [ensureOpen]);

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

  const setSelectedModel = useCallback((id: string) => {
    dispatch({ type: "set-model", id });
  }, []);

  const setMode = useCallback((value: string) => {
    const program = stateRef.current.program;
    const id = stateRef.current.mode?.id || "mode";
    dispatch({ type: "set-mode", value });
    if (!isWsProgram(program)) return;
    void (async () => {
      const socket = await ensureOpen();
      if (!socket) return;
      sendJson(socket, { t: "set_config", program, id, value });
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
    haltRef.current = false;
    delayRef.current = 1000;
    dispatch({ type: "clear-offline" });
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendJson(socket, { t: "status" });
      return;
    }
    void connect();
  }, [connect]);

  const setFreshValue = useCallback((value: boolean) => {
    setFresh(value);
  }, []);

  return {
    program: state.program,
    setProgram,
    messages: state.messages,
    draft,
    setDraft,
    busy: state.busy,
    send,
    abort,
    programs: state.programs,
    models: state.models,
    modelSource: state.modelSource,
    selectedModel: state.selectedModel,
    setSelectedModel,
    mode: state.mode,
    selectedMode: state.selectedMode,
    setMode,
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
    answerPermission,
    answerQuestion,
    openedPrograms: state.opened,
    closeProgram,
    retryConnect,
    offline: state.offline,
    agentBusy: state.agentBusy,
  };
}
