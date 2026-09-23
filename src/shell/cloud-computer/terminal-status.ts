// 终端连接状态机：Shell 页「断线重连 / 结束语义」的唯一真相（合同 I2）。
//
// 只有两种终局，且都只认服务端的话：
//   - exit(code)  服务端 exit 帧（进程真的退出，退出码原样保留，0 也是 0）
//   - gone        服务端 error 帧 code=session_not_found（节点说会话没了）
// 其余一切（detached 帧、WS 非正常关闭、其它 error 帧）都只是「管道断了」：
// 进入 reconnecting，按 1s→2s→4s→…→10s 退避重连，60 s 预算耗尽由 give_up
// 事件落到 error("connection_lost")，界面给「连接断了」+「重新连接」。
//
// 纯函数，不碰计时器：返回值里的 effect 由调用方（useComputerTerminal）执行。

export type TerminalConnState =
  | { kind: "live" }
  | { kind: "reconnecting"; attempt: number }
  | { kind: "exit"; code: string }
  | { kind: "gone" }
  | { kind: "error"; code: string };

/** 服务端 → 浏览器的终端 WS 帧（合同 I2）。 */
export type TerminalFrameLike = {
  t?: string;
  data_b64?: string;
  alive?: boolean;
  ended_at?: string | null;
  exit_code?: number | null;
  end_reason?: "exit" | "closed" | "node_restart" | null;
  record?: boolean;
  code?: string;
  reason?: string;
};

export type TerminalRecordNotice = {
  source: "record" | "exit";
  alive: boolean;
  endedAt: string | null;
  exitCode: number | null;
  endReason: "exit" | "closed" | "node_restart" | null;
};

/** I3 的只读回放会先发 record，再以 exit.record=true 收尾。 */
export function terminalRecordNotice(
  frame: TerminalFrameLike,
): TerminalRecordNotice | null {
  if (frame.t === "record") {
    return {
      source: "record",
      alive: frame.alive === true,
      endedAt: frame.ended_at ?? null,
      exitCode: frame.exit_code ?? null,
      endReason: frame.end_reason ?? null,
    };
  }
  if (frame.t === "exit" && frame.record === true) {
    return {
      source: "exit",
      alive: false,
      endedAt: frame.ended_at ?? null,
      exitCode: frame.exit_code ?? null,
      endReason: frame.end_reason ?? null,
    };
  }
  return null;
}

export type TerminalEvent =
  | { type: "frame"; frame: TerminalFrameLike }
  | { type: "socket_closed" }
  | { type: "reconnect_ok" }
  | { type: "reconnect_failed" }
  | { type: "give_up" };

export type TerminalSideEffect =
  | { type: "schedule_reconnect"; waitMs: number }
  /** 重连成功：先 term.reset() 清屏，再接受节点回放。 */
  | { type: "reset_screen" }
  | { type: "none" };

/** 重连总预算：从第一次断线起 60 s，耗尽后调用方发 give_up。 */
export const RECONNECT_BUDGET_MS = 60_000;

/** give_up 落地时的错误码；界面按它显示「连接断了」+ 重试，不当成 Shell 结束。 */
export const RECONNECT_GAVE_UP_CODE = "connection_lost";

/** 第 attempt 次重连前的等待（attempt 从 1 起）：1s→2s→4s→8s→10s→10s… */
export function reconnectDelayMs(attempt: number): number {
  const base = 1000 * 2 ** Math.max(0, Math.floor(attempt) - 1);
  return Math.min(base, 10_000);
}

function startReconnect(): { state: TerminalConnState; effect: TerminalSideEffect } {
  return {
    state: { kind: "reconnecting", attempt: 1 },
    effect: { type: "schedule_reconnect", waitMs: reconnectDelayMs(1) },
  };
}

const NONE: TerminalSideEffect = { type: "none" };

export function nextTerminalState(
  state: TerminalConnState,
  event: TerminalEvent,
): { state: TerminalConnState; effect: TerminalSideEffect } {
  // exit / gone 是终局：之后任何事件（迟到的帧、残留的定时器）都不改状态。
  if (state.kind === "exit" || state.kind === "gone") {
    return { state, effect: NONE };
  }
  switch (event.type) {
    case "frame": {
      const frame = event.frame;
      if (frame.t === "exit") {
        const code = frame.exit_code == null ? "" : String(frame.exit_code);
        return { state: { kind: "exit", code }, effect: NONE };
      }
      if (frame.t === "error" && frame.code === "session_not_found") {
        return { state: { kind: "gone" }, effect: NONE };
      }
      if (frame.t === "detached" || frame.t === "error") {
        // 传输断了（或 attaching 失败但不是「没有会话」）：重连；已在重连则不重置退避。
        if (state.kind === "reconnecting") return { state, effect: NONE };
        return startReconnect();
      }
      // out 与未知帧不改变连接状态。
      return { state, effect: NONE };
    }
    case "socket_closed": {
      // 非正常关闭（或用户在「连接断了」后点了重新连接）：从头退避重连。
      if (state.kind === "reconnecting") return { state, effect: NONE };
      return startReconnect();
    }
    case "reconnect_ok": {
      if (state.kind !== "reconnecting") return { state, effect: NONE };
      return { state: { kind: "live" }, effect: { type: "reset_screen" } };
    }
    case "reconnect_failed": {
      if (state.kind !== "reconnecting") return { state, effect: NONE };
      const attempt = state.attempt + 1;
      return {
        state: { kind: "reconnecting", attempt },
        effect: { type: "schedule_reconnect", waitMs: reconnectDelayMs(attempt) },
      };
    }
    case "give_up": {
      if (state.kind !== "reconnecting") return { state, effect: NONE };
      return { state: { kind: "error", code: RECONNECT_GAVE_UP_CODE }, effect: NONE };
    }
  }
}
