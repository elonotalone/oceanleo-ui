"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentDialogWsUrl } from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";

export const CURSOR_INSTALL_COMMAND = "curl https://cursor.com/install -fsS | bash";
export const CLAUDE_INSTALL_COMMAND = "curl -fsSL https://claude.ai/install.sh | bash";

const MAX_PROMPT_CHARS = 32000;

export type AgentProgram = "cursor" | "claude";

export type AgentDialogMessage =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "tool"; name: string; title: string; status: "running" | "done" }
  | { id: string; kind: "notice"; code: string; program: string };

export type AgentDialogController = {
  program: AgentProgram | null;
  setProgram: (program: AgentProgram) => void;
  messages: AgentDialogMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  send: () => Promise<void>;
  abort: () => void;
};

function nextId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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
  const [program, setProgramState] = useState<AgentProgram | null>(null);
  const [messages, setMessages] = useState<AgentDialogMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const programRef = useRef<AgentProgram | null>(null);
  const busyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const assistantIdRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const generationRef = useRef(0);
  programRef.current = program;
  enabledRef.current = enabled;

  const pushNotice = useCallback((code: string, programName = "") => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.kind === "notice" &&
        last.code === code &&
        last.program === programName
      ) {
        return prev;
      }
      return [...prev, { id: nextId(), kind: "notice", code, program: programName }];
    });
  }, []);

  const applyFrame = useCallback(
    (raw: string) => {
      let frame: Record<string, unknown> | null = null;
      try {
        frame = asRecord(JSON.parse(raw));
      } catch {
        frame = null;
      }
      if (!frame) {
        pushNotice("dialog_unreachable");
        return;
      }
      if (frame.t === "delta") {
        const text = typeof frame.text === "string" ? frame.text : "";
        if (!text) return;
        setMessages((prev) => {
          const id = assistantIdRef.current;
          if (id) {
            return prev.map((item) =>
              item.id === id && item.kind === "assistant"
                ? { ...item, text: item.text + text }
                : item,
            );
          }
          const created = nextId();
          assistantIdRef.current = created;
          return [...prev, { id: created, kind: "assistant", text }];
        });
        return;
      }
      if (frame.t === "tool") {
        assistantIdRef.current = null;
        const name = typeof frame.name === "string" ? frame.name : "";
        const title = typeof frame.title === "string" ? frame.title : "";
        const status = frame.status === "done" ? "done" : "running";
        setMessages((prev) => [
          ...prev,
          { id: nextId(), kind: "tool", name, title, status },
        ]);
        return;
      }
      if (frame.t === "done") {
        assistantIdRef.current = null;
        busyRef.current = false;
        setBusy(false);
        return;
      }
      if (frame.t === "error") {
        assistantIdRef.current = null;
        busyRef.current = false;
        setBusy(false);
        const code =
          typeof frame.code === "string" && frame.code.trim()
            ? frame.code.trim()
            : "node_error";
        const fromFrame =
          frame.program === "cursor" || frame.program === "claude" ? frame.program : "";
        const programName =
          fromFrame || (code === "missing_program" ? programRef.current || "" : "");
        pushNotice(code, programName);
      }
    },
    [pushNotice],
  );

  const retireSocket = useCallback((abortTurn: boolean) => {
    generationRef.current += 1;
    const socket = socketRef.current;
    socketRef.current = null;
    if (
      abortTurn &&
      socket &&
      socket.readyState === WebSocket.OPEN &&
      busyRef.current
    ) {
      try {
        socket.send(JSON.stringify({ t: "abort" }));
      } catch {
        /* already closing */
      }
    }
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    busyRef.current = false;
    assistantIdRef.current = null;
    setBusy(false);
  }, []);

  useEffect(() => {
    setMessages([]);
    setProgramState(null);
    setDraft("");
    assistantIdRef.current = null;
  }, [computerId, sessionId]);

  useEffect(() => {
    if (enabled) return;
    retireSocket(true);
  }, [enabled, retireSocket]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState === WebSocket.OPEN && busyRef.current) {
        try {
          socket.send(JSON.stringify({ t: "abort" }));
        } catch {
          /* already closing */
        }
      }
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
      busyRef.current = false;
      assistantIdRef.current = null;
      setBusy(false);
    };
  }, [computerId, sessionId]);

  const openSocket = useCallback(async (): Promise<WebSocket | null> => {
    const existing = socketRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) return existing;
    generationRef.current += 1;
    const gen = generationRef.current;
    if (existing && existing.readyState !== WebSocket.CLOSED) existing.close();
    socketRef.current = null;

    let token = "";
    try {
      const client = await import("../../lib/auth/client");
      const value =
        typeof client.accessToken === "function" ? await client.accessToken() : "";
      token = typeof value === "string" ? value : "";
    } catch {
      pushNotice("dialog_unreachable");
      return null;
    }
    if (!token || !enabledRef.current || generationRef.current !== gen) {
      if (enabledRef.current && generationRef.current === gen) {
        pushNotice("dialog_unreachable");
      }
      return null;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(agentDialogWsUrl(computerId, sessionId, token));
    } catch {
      pushNotice("dialog_unreachable");
      return null;
    }
    socketRef.current = socket;
    socket.addEventListener("message", (event) => {
      if (generationRef.current !== gen) return;
      if (typeof event.data !== "string") return;
      applyFrame(event.data);
    });
    socket.addEventListener("close", () => {
      if (generationRef.current !== gen) return;
      if (socketRef.current === socket) socketRef.current = null;
      if (!busyRef.current) return;
      busyRef.current = false;
      assistantIdRef.current = null;
      setBusy(false);
      pushNotice("dialog_unreachable");
    });

    const opened = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 15000);
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      };
      socket.addEventListener("open", () => finish(true), { once: true });
      socket.addEventListener("error", () => finish(false), { once: true });
      socket.addEventListener("close", () => finish(false), { once: true });
    });

    if (generationRef.current !== gen || !enabledRef.current) {
      if (socketRef.current === socket) socketRef.current = null;
      if (socket.readyState !== WebSocket.CLOSED) socket.close();
      return null;
    }
    if (!opened || socket.readyState !== WebSocket.OPEN) {
      generationRef.current += 1;
      if (socketRef.current === socket) socketRef.current = null;
      if (socket.readyState !== WebSocket.CLOSED) socket.close();
      pushNotice("dialog_unreachable");
      return null;
    }
    return socket;
  }, [applyFrame, computerId, pushNotice, sessionId]);

  const send = useCallback(async () => {
    if (!program || busyRef.current) return;
    const text = draft.trim();
    if (!text) return;
    if (text.length > MAX_PROMPT_CHARS) {
      pushNotice("invalid_argument", program);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    assistantIdRef.current = null;
    const socket = await openSocket();
    if (!socket) {
      busyRef.current = false;
      setBusy(false);
      return;
    }
    setDraft("");
    setMessages((prev) => [...prev, { id: nextId(), kind: "user", text }]);
    socket.send(JSON.stringify({ t: "prompt", program, text }));
  }, [draft, openSocket, program, pushNotice]);

  const abort = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ t: "abort" }));
    }
  }, []);

  const setProgram = useCallback((next: AgentProgram) => {
    if (busyRef.current) return;
    setProgramState(next);
  }, []);

  return {
    program,
    setProgram,
    messages,
    draft,
    setDraft,
    busy,
    send,
    abort,
  };
}

function noticeBody(
  tt: ReturnType<typeof useUI>,
  code: string,
  program: string,
): { text: string; command?: string } {
  if (code === "missing_program") {
    if (program === "claude") {
      return {
        text: tt("这台电脑上没有 Claude Code。安装命令如下，网站不会替你执行。"),
        command: CLAUDE_INSTALL_COMMAND,
      };
    }
    if (program === "cursor") {
      return {
        text: tt("这台电脑上没有 Cursor。安装命令如下，网站不会替你执行。"),
        command: CURSOR_INSTALL_COMMAND,
      };
    }
    return { text: tt("这台电脑上没有这个程序。") };
  }
  switch (code) {
    case "not_logged_in":
      return { text: tt("还没登录。回到终端里登录后再试。") };
    case "agent_busy":
      return { text: tt("上一轮还在跑，等它结束或先停止。") };
    case "computer_offline":
      return { text: tt("云电脑离线，先到我的设备里检查节点") };
    case "computer_not_confirmed":
      return { text: tt("这台电脑还没确认。") };
    case "not_owner":
      return { text: tt("这不是你的电脑。") };
    case "computer_not_found":
      return { text: tt("找不到这台电脑。") };
    case "session_not_found":
      return { text: tt("找不到这个 Shell 会话。") };
    case "invalid_argument":
      return { text: tt("这句话发不出去。") };
    case "node_error":
      return { text: tt("这台电脑上的程序出错了。") };
    case "feature_disabled":
      return { text: tt("这个功能在当前站点不可用。") };
    default:
      return { text: tt("对话连不上这台电脑。") };
  }
}

export function AgentDialogPane({
  dialog,
  onBack,
}: {
  dialog: AgentDialogController;
  onBack: () => void;
}) {
  const tt = useUI();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-oceanleo-cc-agent-dialog-pane>
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
        <p className="text-[12px] text-neutral-400">
          {dialog.program === "claude"
            ? "Claude Code"
            : dialog.program === "cursor"
              ? "Cursor"
              : tt("用对话界面继续")}
        </p>
        <button
          type="button"
          onClick={onBack}
          data-oceanleo-cc-dialog-back
          className="rounded-lg px-2 py-1 text-[12px] text-neutral-300 hover:bg-neutral-800"
        >
          {tt("回到终端")}
        </button>
      </div>
      {dialog.program ? (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[13px]">
            {dialog.messages.map((message) => {
              if (message.kind === "user") {
                return (
                  <p key={message.id} className="whitespace-pre-wrap text-neutral-100">
                    {message.text}
                  </p>
                );
              }
              if (message.kind === "assistant") {
                return (
                  <p key={message.id} className="whitespace-pre-wrap text-neutral-200">
                    {message.text}
                  </p>
                );
              }
              if (message.kind === "tool") {
                const status =
                  message.status === "done" ? tt("完成") : tt("进行中");
                const label = [message.name, message.title, status]
                  .filter((part) => part)
                  .join(" · ");
                return (
                  <p key={message.id} className="text-[12px] text-neutral-400">
                    {label}
                  </p>
                );
              }
              const notice = noticeBody(tt, message.code, message.program);
              return (
                <div key={message.id} className="text-[12px] text-amber-200">
                  <p>{notice.text}</p>
                  {notice.command ? (
                    <code className="mt-1 block whitespace-pre-wrap font-mono text-neutral-200">
                      {notice.command}
                    </code>
                  ) : null}
                </div>
              );
            })}
          </div>
          <form
            className="flex items-end gap-2 border-t border-neutral-800 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void dialog.send();
            }}
          >
            <textarea
              data-oceanleo-cc-dialog-input
              value={dialog.draft}
              onChange={(event) => dialog.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void dialog.send();
                }
              }}
              placeholder={tt("输入你想说的话")}
              rows={3}
              className="min-h-[4.5rem] flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-neutral-100 outline-none"
            />
            {dialog.busy ? (
              <button
                type="button"
                onClick={dialog.abort}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-[12px] text-neutral-200"
              >
                {tt("停止")}
              </button>
            ) : (
              <button
                type="submit"
                className="rounded-lg bg-neutral-100 px-3 py-2 text-[12px] font-medium text-neutral-900"
              >
                {tt("发送")}
              </button>
            )}
          </form>
        </>
      ) : (
        <div className="grid flex-1 content-center gap-3 px-6 py-8">
          <p className="text-[13px] leading-relaxed text-neutral-300">
            {tt(
              "选一个已经装在这台电脑上的程序。字打在这里，发到那台电脑上，程序用它自己保存的会话接着说。网站不保存这些字。",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-oceanleo-cc-dialog-cursor
              onClick={() => dialog.setProgram("cursor")}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-900"
            >
              Cursor
            </button>
            <button
              type="button"
              data-oceanleo-cc-dialog-claude
              onClick={() => dialog.setProgram("claude")}
              className="rounded-lg bg-neutral-800 px-3 py-1.5 text-[12px] text-neutral-100"
            >
              Claude Code
            </button>
          </div>
          <p className="text-[12px] text-neutral-500">
            {tt("Hermes 留在终端里。")}
          </p>
        </div>
      )}
    </div>
  );
}
