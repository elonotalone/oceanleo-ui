"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { accessToken } from "../../lib/auth/client";
import {
  terminalWsUrl,
  type CloudComputerClient,
  type TerminalSession,
} from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import { SHELL_ENDED_ZH } from "../../i18n/ui/messages/shell-ended-copy";
import {
  nextTerminalState,
  RECONNECT_BUDGET_MS,
  type TerminalConnState,
  type TerminalEvent,
  type TerminalFrameLike,
} from "./terminal-status";

export function encodeTermText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

export function decodeTermB64(dataB64: string): string {
  const bin = atob(dataB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const TERMINAL_TAIL_LIMIT = 4000;

/** 终端尾巴给 agent 当上下文：只要屏幕上的字，不要颜色控制码。 */
export function stripTerminalAnsi(text: string): string {
  return text
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-Z\\-_]/g, "")
    .replace(/\u009b[0-?]*[ -/]*[@-~]/g, "");
}

function pushPlainTail(current: string, chunk: string): string {
  const plain = stripTerminalAnsi(chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!plain) return current;
  return (current + plain).slice(-TERMINAL_TAIL_LIMIT);
}

/**
 * 连接状态（合同 I2）：
 * - live         管道活着；
 * - reconnecting 管道断了（detached 帧 / WS 非正常关闭），退避重连中，屏幕内容保留；
 * - exit         服务端 exit 帧，进程真退出，detail 是退出码（"0" 也是真退出码）；
 * - gone         服务端 error 帧 code=session_not_found，节点说会话没了；
 * - error        重连 60 s 预算耗尽（detail="connection_lost"），界面给「重试」。
 */
export type ComputerTerminalStatus = "live" | "reconnecting" | "exit" | "gone" | "error";

export type ComputerTerminalHandle = {
  hostRef: RefObject<HTMLDivElement | null>;
  ready: boolean;
  status: ComputerTerminalStatus;
  detail?: string;
  /** 写到现有的 WS 输入通道，不加回车。 */
  sendText: (text: string) => void;
  /** 最近 4000 字纯文本输出。 */
  tail: () => string;
  /** 「连接断了」后的手动重试：从头起退避，复用同一 session_id，不新建会话。 */
  retry: () => void;
};

type TermHandle = {
  dispose: () => void;
  write: (data: string) => void;
  focus: () => void;
  fit: () => void;
  /** 重连成功后清屏，再接受节点回放。 */
  reset: () => void;
  cols: number;
  rows: number;
};

/**
 * xterm + WebSocket for one cloud-computer session. Shared by the AgentConsole
 * drawer (`TerminalPanel`) and the full-page `ShellTaskView`.
 *
 * 断线语义全部在 `./terminal-status` 的纯状态机里；这里只负责执行它给出的
 * effect（排重连定时器、清屏）与维护 60 s 总预算的 give_up 计时。
 */
export function useComputerTerminal({
  computerId,
  sessionId,
  enabled = true,
}: {
  computerId: string;
  sessionId: string | null;
  enabled?: boolean;
}): ComputerTerminalHandle {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<TermHandle | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ComputerTerminalStatus>("live");
  const [detail, setDetail] = useState<string | undefined>();
  const tailRef = useRef("");
  const life = useRef(0);
  const connRef = useRef<TerminalConnState>({ kind: "live" });
  const ctxRef = useRef<{ sid: string; lifeToken: number } | null>(null);

  const sendText = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "in", data_b64: encodeTermText(text) }));
  }, []);

  const tail = useCallback(() => tailRef.current, []);

  const clearConnTimers = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (giveUpTimer.current) {
      clearTimeout(giveUpTimer.current);
      giveUpTimer.current = null;
    }
  }, []);

  /** 重算尺寸并通知节点；重连成功后也要做一次（节点侧 PTY 需要新尺寸）。 */
  const announceSize = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.fit();
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "resize", cols: term.cols, rows: term.rows }));
  }, []);

  const attachSocketRef = useRef<(sid: string, lifeToken: number) => Promise<boolean>>(
    async () => false,
  );
  const applyConnEventRef = useRef<(event: TerminalEvent) => void>(() => {});

  const applyConnEvent = useCallback(
    (event: TerminalEvent) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const prev = connRef.current;
      const applied = nextTerminalState(prev, event);
      connRef.current = applied.state;
      const kind = applied.state.kind;
      setStatus(kind);
      setDetail(kind === "exit" || kind === "error" ? applied.state.code : undefined);
      if (kind === "exit" || kind === "gone" || kind === "error") {
        // 终局与「连接断了」都不再有未决的重连计时。
        clearConnTimers();
      }
      if (applied.effect.type === "schedule_reconnect") {
        if (prev.kind !== "reconnecting") {
          // 第一次进入重连（含用户在「连接断了」后点重试）：60 s 总预算从这里起算。
          if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
          giveUpTimer.current = setTimeout(() => {
            giveUpTimer.current = null;
            applyConnEventRef.current({ type: "give_up" });
          }, RECONNECT_BUDGET_MS);
        }
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          // 复用同一 session_id 新开 WS；不重复 POST /terminals。
          void attachSocketRef.current(ctx.sid, ctx.lifeToken).then((opened) => {
            if (life.current !== ctx.lifeToken) return;
            if (!opened) applyConnEventRef.current({ type: "reconnect_failed" });
            // opened=true 时不直接算成功：等 socket 的 open 事件发 reconnect_ok，
            // 连不上会以 close 事件落成 reconnect_failed，退避不被重置。
          });
        }, applied.effect.waitMs);
      }
      if (applied.effect.type === "reset_screen") {
        // 重连成功：清屏、重算尺寸并通知节点，然后接受节点回放。
        clearConnTimers();
        termRef.current?.reset();
        announceSize();
      }
    },
    [announceSize, clearConnTimers],
  );
  applyConnEventRef.current = applyConnEvent;

  const attachSocket = useCallback(
    async (sid: string, lifeToken: number): Promise<boolean> => {
      if (life.current !== lifeToken) return false;
      const previous = socketRef.current;
      socketRef.current = null;
      previous?.close();
      const token = await accessToken();
      if (life.current !== lifeToken) return false;
      if (!token) return false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(terminalWsUrl(computerId, sid, token));
      } catch {
        return false;
      }
      if (life.current !== lifeToken) {
        socket.close();
        return false;
      }
      socketRef.current = socket;
      const isCurrent = () => life.current === lifeToken && socketRef.current === socket;
      socket.addEventListener("open", () => {
        if (!isCurrent()) return;
        applyConnEventRef.current({ type: "reconnect_ok" });
      });
      socket.addEventListener("message", (event) => {
        if (!isCurrent()) return;
        let frame: TerminalFrameLike = {};
        try {
          frame = JSON.parse(String(event.data)) as TerminalFrameLike;
        } catch {
          return;
        }
        if (frame.t === "out" && frame.data_b64) {
          termRef.current?.write(decodeTermB64(frame.data_b64));
        }
        applyConnEventRef.current({ type: "frame", frame });
      });
      socket.addEventListener("close", () => {
        if (!isCurrent()) return;
        socketRef.current = null;
        // 重连尝试中的关闭 = 这次没连上（退避继续）；live 时的关闭 = 管道断了（起退避）。
        applyConnEventRef.current(
          connRef.current.kind === "reconnecting"
            ? { type: "reconnect_failed" }
            : { type: "socket_closed" },
        );
      });
      if (socket.readyState === WebSocket.OPEN) {
        // 同步就绪的套接字（测试桩）没有 open 事件，补一次。
        queueMicrotask(() => {
          if (isCurrent()) applyConnEventRef.current({ type: "reconnect_ok" });
        });
      }
      return true;
    },
    [computerId],
  );
  attachSocketRef.current = attachSocket;

  const retry = useCallback(() => {
    if (connRef.current.kind !== "error") return;
    applyConnEventRef.current({ type: "socket_closed" });
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const lifeToken = ++life.current;
    connRef.current = { kind: "live" };
    ctxRef.current = { sid: sessionId, lifeToken };
    tailRef.current = "";
    let disposed = false;
    let removeResize: (() => void) | undefined;
    clearConnTimers();
    setReady(false);
    setStatus("live");
    setDetail(undefined);
    let pendingWrite = "";
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");
      if (disposed || !hostRef.current) return;
      hostRef.current.replaceChildren();
      const term = new Terminal({
        convertEol: true,
        fontSize: 13,
        theme: { background: "#0a0a0a", foreground: "#e5e5e5" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      fit.fit();
      const dims = () => fit.proposeDimensions() || { cols: term.cols, rows: term.rows };
      termRef.current = {
        dispose: () => term.dispose(),
        write: (data) => {
          pendingWrite += data;
          term.write(data);
        },
        focus: () => term.focus(),
        fit: () => fit.fit(),
        reset: () => term.reset(),
        get cols() {
          return dims().cols;
        },
        get rows() {
          return dims().rows;
        },
      };
      // 输出在 xterm 解析后落成纯文本。onData 仍只负责把按键送进同一条 WS。
      term.onWriteParsed(() => {
        if (!pendingWrite) return;
        const chunk = pendingWrite;
        pendingWrite = "";
        tailRef.current = pushPlainTail(tailRef.current, chunk);
      });
      term.onData((data) => {
        sendText(data);
      });
      setReady(true);
      const opened = await attachSocket(sessionId, lifeToken);
      if (disposed) return;
      if (!opened) {
        // 第一次就 attach 不上（没令牌 / 构造失败）：按管道断了处理，起退避而不是黑屏装活。
        applyConnEventRef.current({ type: "socket_closed" });
      }
      const onResize = () => {
        if (fitTimer.current) clearTimeout(fitTimer.current);
        fitTimer.current = setTimeout(announceSize, 200);
      };
      window.addEventListener("resize", onResize);
      removeResize = () => window.removeEventListener("resize", onResize);
      announceSize();
      term.focus();
    })();
    return () => {
      disposed = true;
      life.current += 1;
      ctxRef.current = null;
      connRef.current = { kind: "live" };
      if (pendingWrite) {
        tailRef.current = pushPlainTail(tailRef.current, pendingWrite);
        pendingWrite = "";
      }
      clearConnTimers();
      removeResize?.();
      if (fitTimer.current) clearTimeout(fitTimer.current);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, [announceSize, attachSocket, clearConnTimers, enabled, sendText, sessionId]);

  return { hostRef, ready, status, detail, sendText, tail, retry };
}

type TabState = {
  session: TerminalSession;
  status: ComputerTerminalStatus;
  detail?: string;
};

export function TerminalPanel({
  computerId,
  client,
  collapsed = false,
  onCollapsedChange,
}: {
  computerId: string;
  client: CloudComputerClient;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const tt = useUI();
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const terminal = useComputerTerminal({
    computerId,
    sessionId: collapsed ? null : activeId,
    enabled: !collapsed,
  });

  const refreshSessions = useCallback(async () => {
    const data = await client.listTerminals(computerId);
    const sessions = data.sessions || [];
    setTabs((current) => {
      const byId = new Map(current.map((tab) => [tab.session.id, tab]));
      return sessions.map((session) => {
        const prev = byId.get(session.id);
        return {
          session,
          status: prev?.status ?? (session.alive === false ? "exit" : "live"),
          detail: prev?.detail,
        };
      });
    });
    setActiveId((current) => {
      if (current && sessions.some((session) => session.id === current)) {
        return current;
      }
      return sessions[0]?.id ?? null;
    });
  }, [client, computerId]);

  useEffect(() => {
    void refreshSessions().catch(() => {
      /* empty list is fine */
    });
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeId) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.session.id === activeId
          ? { ...tab, status: terminal.status, detail: terminal.detail }
          : tab,
      ),
    );
  }, [activeId, terminal.detail, terminal.status]);

  async function addSession() {
    const opened = await client.openTerminal(computerId, { cols: 80, rows: 24 });
    await refreshSessions();
    setActiveId(opened.id);
  }

  async function removeSession(sessionId: string) {
    await client.closeTerminal(computerId, sessionId);
    await refreshSessions();
  }

  const body = (
    <div
      className="border-t border-neutral-200 bg-neutral-950 text-neutral-100"
      data-oceanleo-cc-terminal-drawer
      data-collapsed={collapsed ? "1" : "0"}
    >
      <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-800 px-2 py-1">
        <button
          type="button"
          className="shrink-0 rounded px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800"
          onClick={() => onCollapsedChange?.(!collapsed)}
        >
          {collapsed ? tt("展开终端") : tt("收起终端")}
        </button>
        {!collapsed &&
          tabs.map((tab) => (
            <button
              key={tab.session.id}
              type="button"
              onClick={() => setActiveId(tab.session.id)}
              data-oceanleo-cc-term-tab={tab.session.id}
              data-status={tab.status}
              className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] ${
                tab.session.id === activeId
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:bg-neutral-900"
              }`}
            >
              <span>{tab.session.title || tab.session.id.slice(0, 8)}</span>
              {tab.status !== "live" && (
                <span className="text-[10px] uppercase">{tab.status}</span>
              )}
              <span
                role="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void removeSession(tab.session.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
        {!collapsed && (
          <button
            type="button"
            onClick={() => void addSession()}
            aria-label={tt("新建 Shell")}
            className="shrink-0 rounded px-2 py-1 text-[12px] text-neutral-300 hover:bg-neutral-800"
          >
            +
          </button>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-neutral-500">
          {terminal.status === "reconnecting"
            ? tt(SHELL_ENDED_ZH.reconnecting)
            : terminal.ready
              ? ""
              : tt("终端加载中")}
        </span>
      </div>
      {!collapsed && (
        <div
          ref={terminal.hostRef}
          className="h-56 w-full px-2 py-1"
          data-oceanleo-cc-xterm
        />
      )}
    </div>
  );

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const slot = document.getElementById("oceanleo-cc-terminal-slot");
    setPortalTarget(slot || document.body);
  }, []);

  if (!portalTarget) return body;
  if (portalTarget.id === "oceanleo-cc-terminal-slot") {
    return createPortal(body, portalTarget);
  }
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[40]">{body}</div>,
    portalTarget,
  );
}
