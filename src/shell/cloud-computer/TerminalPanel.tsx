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

export type ComputerTerminalStatus = "live" | "exit" | "error";

export type ComputerTerminalHandle = {
  hostRef: RefObject<HTMLDivElement | null>;
  ready: boolean;
  status: ComputerTerminalStatus;
  detail?: string;
  /** 写到现有的 WS 输入通道，不加回车。 */
  sendText: (text: string) => void;
  /** 最近 4000 字纯文本输出。 */
  tail: () => string;
};

/**
 * xterm + WebSocket for one cloud-computer session. Shared by the AgentConsole
 * drawer (`TerminalPanel`) and the full-page `ShellTaskView`.
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
  const termRef = useRef<{
    dispose: () => void;
    write: (data: string) => void;
    focus: () => void;
    fit: () => void;
    cols: number;
    rows: number;
  } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ComputerTerminalStatus>("live");
  const [detail, setDetail] = useState<string | undefined>();
  const tailRef = useRef("");

  const sendText = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "in", data_b64: encodeTermText(text) }));
  }, []);

  const tail = useCallback(() => tailRef.current, []);

  const attachSocket = useCallback(
    async (sid: string) => {
      socketRef.current?.close();
      socketRef.current = null;
      const token = await accessToken();
      if (!token) return;
      const url = terminalWsUrl(computerId, sid, token);
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.addEventListener("message", (event) => {
        let frame: {
          t?: string;
          data_b64?: string;
          exit_code?: number;
          code?: string;
        } = {};
        try {
          frame = JSON.parse(String(event.data)) as typeof frame;
        } catch {
          return;
        }
        if (frame.t === "out" && frame.data_b64) {
          termRef.current?.write(decodeTermB64(frame.data_b64));
        } else if (frame.t === "exit") {
          setStatus("exit");
          setDetail(String(frame.exit_code ?? ""));
        } else if (frame.t === "error") {
          setStatus("error");
          setDetail(frame.code || "error");
        }
      });
    },
    [computerId],
  );

  useEffect(() => {
    if (!enabled || !sessionId) return;
    tailRef.current = "";
    let disposed = false;
    let removeResize: (() => void) | undefined;
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
      await attachSocket(sessionId);
      if (disposed) return;
      const sendResize = () => {
        fit.fit();
        const size = dims();
        const socket = socketRef.current;
        if (!size || !socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({ t: "resize", cols: size.cols, rows: size.rows }),
        );
      };
      const onResize = () => {
        if (fitTimer.current) clearTimeout(fitTimer.current);
        fitTimer.current = setTimeout(sendResize, 200);
      };
      window.addEventListener("resize", onResize);
      removeResize = () => window.removeEventListener("resize", onResize);
      sendResize();
      term.focus();
    })();
    return () => {
      disposed = true;
      if (pendingWrite) {
        tailRef.current = pushPlainTail(tailRef.current, pendingWrite);
        pendingWrite = "";
      }
      removeResize?.();
      if (fitTimer.current) clearTimeout(fitTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, [attachSocket, enabled, sendText, sessionId]);

  return { hostRef, ready, status, detail, sendText, tail };
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
      <div className="flex items-center gap-1 border-b border-neutral-800 px-2 py-1">
        <button
          type="button"
          className="rounded px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800"
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
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${
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
            className="rounded px-2 py-1 text-[12px] text-neutral-300 hover:bg-neutral-800"
          >
            +
          </button>
        )}
        <span className="ml-auto text-[10px] text-neutral-500">
          {terminal.ready ? "" : tt("终端加载中")}
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
