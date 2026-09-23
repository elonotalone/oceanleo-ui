"use client";

// 对话面板的连接和发送。帧进 reduce，这里只负责何时连、何时重连、何时把哪一帧写出去。
// 用户的话只出现在 JSON 帧里，不拼进任何命令字符串。

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getTask, stopTask, type TaskDetail } from "../../../lib/agent";
import { agentDialogWsUrl } from "../../../lib/cloud-computer-api";
import { agentReset, agentState, agentTurn } from "../../../lib/cloud-computer-agent-api";
import { useUI } from "../../../i18n/ui/useUI";
import { installDirPayload } from "./install-dir";
import { mapTaskMessages, nextOceanleoPoll } from "./oceanleo-program";
import { isWsProgram } from "./parse";
import { applyDialog, initialDialogState } from "./reduce";
import { nextReconnectDelay } from "./reconnect";
import type {
  AgentDialogController,
  AgentDialogMessage,
  AgentProgram,
  WsProgram,
} from "./types";

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
}): AgentDialogControllerV2 {
  const tt = useUI();
  const [state, dispatch] = useReducer(applyDialog, undefined, initialDialogState);
  const [draft, setDraft] = useState("");
  const [fresh, setFresh] = useState(false);
  const [computerName, setComputerName] = useState("");

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
  const messagesCacheRef = useRef(new Map<string, AgentDialogMessage[]>());

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

  /** 任务详情 → 消息列表。刚发的那句服务端还没落库时这一轮不替换（本地回显不闪没）。 */
  const applyOceanDetail = useCallback(
    (detail: TaskDetail) => {
      const mapped = mapTaskMessages(detail, { step: tt("步骤"), error: tt("出错") });
      const pending = oceanSendRef.current;
      if (pending) {
        // 落地判定按用户消息计数、不按文本：重发同一句不算落地，服务端改写文本也不卡死。
        // 任务已到终态则无条件应用——服务端真相优先，busy 不许因此卡住。
        const userCount = mapped.reduce(
          (count, message) => (message.kind === "user" ? count + 1 : count),
          0,
        );
        const terminal = typeof detail.task?.status === "string" && detail.task.status !== "running";
        if (!terminal && userCount <= pending.baseUsers) return;
        oceanSendRef.current = null;
      }
      messagesCacheRef.current.set("oceanleo", mapped);
      if (stateRef.current.program === "oceanleo") {
        dispatch({ type: "messages-replace", messages: mapped });
        const running = detail.task?.status === "running";
        if (running !== stateRef.current.busy) {
          dispatch(running ? { type: "send-began" } : { type: "cancel-local" });
        }
      }
    },
    [tt],
  );

  /** 轮询直到任务离开 running；代际变了（重进程序/复位/卸载）立即收手。 */
  const pollOcean = useCallback(
    async (taskId: string, gen: number) => {
      let idleStep = -1;
      let waitedMs = 0;
      let lastCount = -1;
      for (;;) {
        if (gen !== oceanGen.current) return;
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
          // 网络/权限抖动：不擦列表、不假装结束，按退避节奏再来。
          const cadence = nextOceanleoPoll({ hidden: false, changed: false, idleStep, waitedMs });
          idleStep = cadence.idleStep;
          waitedMs = cadence.waitedMs;
          if (!(await oceanWait(cadence.delayMs))) return;
          continue;
        }
        const detail = result.data;
        const changed = (detail.messages?.length ?? 0) !== lastCount;
        lastCount = detail.messages?.length ?? 0;
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
    if (!computerId || !enabledRef.current) return;
    const gen = (oceanGen.current += 1);
    clearOceanWait();
    const result = await agentState(computerId);
    if (gen !== oceanGen.current) return;
    if (!result.ok || !result.data) {
      setComputerName("");
      oceanTaskRef.current = "";
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
        dispatch({ type: "cancel-local" });
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
        dispatch({ type: "cancel-local" });
      }
      return;
    }
    const detail = await getTask(taskId);
    if (gen !== oceanGen.current) return;
    if (!detail.ok || !detail.data) return;
    applyOceanDetail(detail.data);
    if (detail.data.task?.status === "running") void pollOcean(taskId, gen);
  }, [applyOceanDetail, clearOceanWait, pollOcean]);

  refreshOceanRef.current = refreshOcean;

  const sendOcean = useCallback(async () => {
    const computerId = computerIdRef.current;
    if (!computerId) return;
    if (stateRef.current.busy || stateRef.current.offline) return;
    const text = draftRef.current.trim();
    if (!text) return;
    // 后端 turn 上限 8000：超了明说，不静默截断（WS 程序的 32000 是另一条协议）。
    if (text.length > MAX_OCEAN_PROMPT_CHARS) {
      dispatch({ type: "notice", code: "invalid_argument", program: "oceanleo" });
      return;
    }
    const gen = (oceanGen.current += 1);
    clearOceanWait();
    // 与 WS send 同款乐观写：dispatch 到重渲染之间再按发送不能发出第二句。
    stateRef.current = { ...stateRef.current, busy: true };
    dispatch({ type: "user", text });
    setDraft("");
    const freshTurn = freshRef.current;
    setFresh(false);
    if (freshTurn) {
      // 「新对话」：先丢掉服务端任务指针，下一句必然新建任务。
      await agentReset(computerId);
      if (gen !== oceanGen.current) return;
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
      text,
      shell_session_id: sessionIdRef.current || undefined,
    });
    if (gen !== oceanGen.current) return;
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
      return;
    }
    oceanTaskRef.current = result.data.task_id;
    void pollOcean(result.data.task_id, gen);
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
    haltRef.current = false;
    dispatch({ type: "clear-offline" });
    delayRef.current = 1000;
    void connect();
    // 默认程序就是 oceanleo（合同 I6）：打开对话框即拉 agentState 回放当前任务。
    if (stateRef.current.program === "oceanleo") void refreshOceanRef.current();
    return () => {
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

  const setProgram = useCallback(
    (next: AgentProgram) => {
      // 合同 I6：oceanleo 也是可选程序；模型帧只对走 WS 的程序发。
      if (!isWsProgram(next) && next !== "oceanleo") return;
      if (stateRef.current.busy) return;
      const prev = stateRef.current.program;
      if (prev && prev !== next) messagesCacheRef.current.set(prev, stateRef.current.messages);
      dispatch({ type: "program", program: next });
      dispatch({
        type: "messages-replace",
        messages: messagesCacheRef.current.get(next) ?? [],
      });
      if (next === "oceanleo") {
        // 进入即拉服务端真相（覆盖上面的缓存过渡）；离开 oceanleo 则停掉轮询。
        void refreshOcean();
        return;
      }
      if (prev === "oceanleo") {
        oceanGen.current += 1;
        clearOceanWait();
      }
      const socket = socketRef.current;
      if (isWsProgram(next) && socket && socket.readyState === WebSocket.OPEN) {
        sendJson(socket, { t: "models", program: next });
      }
    },
    [clearOceanWait, refreshOcean],
  );

  const send = useCallback(async () => {
    const program = stateRef.current.program;
    // 合同 I6：oceanleo 走 REST turn + 轮询，不碰 WS（P7：不为它等 15s 连接超时）。
    if (program === "oceanleo") {
      await sendOcean();
      return;
    }
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
    if (program === "oceanleo") {
      // 「停止」真的停：停轮询、停服务端任务，再拉一次终态消息。
      oceanGen.current += 1;
      clearOceanWait();
      oceanSendRef.current = null;
      const taskId = oceanTaskRef.current;
      dispatch({ type: "cancel-local" });
      if (taskId) {
        const gen = oceanGen.current;
        void stopTask(taskId).then(async () => {
          if (gen !== oceanGen.current) return;
          const detail = await getTask(taskId);
          if (gen !== oceanGen.current || !detail.ok || !detail.data) return;
          applyOceanDetail(detail.data);
        });
      }
      return;
    }
    if (isWsProgram(program)) sendJson(socketRef.current, { t: "cancel", program });
    dispatch({ type: "cancel-local" });
  }, [applyOceanDetail, clearOceanWait]);

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
    // oceanleo 程序的「重试」= 重拉 agentState；WS 程序维持原来的重连。
    if (stateRef.current.program === "oceanleo") {
      dispatch({ type: "clear-offline" });
      void refreshOcean();
      return;
    }
    haltRef.current = false;
    delayRef.current = 1000;
    dispatch({ type: "clear-offline" });
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendJson(socket, { t: "status" });
      return;
    }
    void connect();
  }, [connect, refreshOcean]);

  const setFreshValue = useCallback((value: boolean) => {
    setFresh(value);
  }, []);

  return {
    program: state.program,
    setProgram,
    computerName,
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
    submitLoginCode,
    cancelLogin,
    setLoginCodeDraft,
    answerPermission,
    answerQuestion,
    openedPrograms: state.opened,
    closeProgram,
    retryConnect,
    offline: state.offline,
    agentBusy: state.agentBusy,
  };
}
