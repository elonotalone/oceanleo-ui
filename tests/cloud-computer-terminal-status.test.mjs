// 终端连接状态机全路径（合同 I2）：
//   live →（detached / 非正常关闭 / 其它 error）→ reconnecting →（reconnect_ok）→ live+清屏
//   reconnecting →（60 s 预算耗尽 give_up）→ error("connection_lost")
//   任何状态 →（exit 帧）→ exit(code)；→（error session_not_found）→ gone；两者都是终局。
import assert from "node:assert/strict";
import test from "node:test";

import {
  nextTerminalState,
  reconnectDelayMs,
  RECONNECT_BUDGET_MS,
  RECONNECT_GAVE_UP_CODE,
} from "../src/shell/cloud-computer/terminal-status.ts";

const LIVE = { kind: "live" };

function frame(f) {
  return { type: "frame", frame: f };
}

test("退避序列 1s→2s→4s→8s→10s 封顶，总预算 60 s", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((attempt) => reconnectDelayMs(attempt)),
    [1000, 2000, 4000, 8000, 10000, 10000, 10000],
  );
  assert.equal(RECONNECT_BUDGET_MS, 60_000);
  assert.equal(RECONNECT_GAVE_UP_CODE, "connection_lost");
});

test("out 帧与未知帧不改变连接状态", () => {
  for (const state of [LIVE, { kind: "reconnecting", attempt: 2 }]) {
    const out = nextTerminalState(state, frame({ t: "out", data_b64: "eQ==" }));
    assert.equal(out.state, state);
    assert.equal(out.effect.type, "none");
    const unknown = nextTerminalState(state, frame({ t: "mystery" }));
    assert.equal(unknown.state, state);
  }
});

test("exit 帧只在服务端真退出时来：退出码原样保留，0 也是 0，缺省为空串", () => {
  assert.deepEqual(nextTerminalState(LIVE, frame({ t: "exit", exit_code: 0 })).state, {
    kind: "exit",
    code: "0",
  });
  assert.deepEqual(nextTerminalState(LIVE, frame({ t: "exit", exit_code: 137 })).state, {
    kind: "exit",
    code: "137",
  });
  assert.deepEqual(nextTerminalState(LIVE, frame({ t: "exit" })).state, {
    kind: "exit",
    code: "",
  });
});

test("error session_not_found → gone；其它 error 帧只是管道断了 → reconnecting", () => {
  const gone = nextTerminalState(LIVE, frame({ t: "error", code: "session_not_found" }));
  assert.deepEqual(gone.state, { kind: "gone" });
  assert.equal(gone.effect.type, "none");

  const lost = nextTerminalState(LIVE, frame({ t: "error", code: "transport" }));
  assert.deepEqual(lost.state, { kind: "reconnecting", attempt: 1 });
  assert.deepEqual(lost.effect, { type: "schedule_reconnect", waitMs: 1000 });
});

test("detached 帧与 WS 非正常关闭 → reconnecting，第一次等 1 s", () => {
  const detached = nextTerminalState(LIVE, frame({ t: "detached", reason: "transport" }));
  assert.deepEqual(detached.state, { kind: "reconnecting", attempt: 1 });
  assert.deepEqual(detached.effect, { type: "schedule_reconnect", waitMs: 1000 });

  const closed = nextTerminalState(LIVE, { type: "socket_closed" });
  assert.deepEqual(closed.state, { kind: "reconnecting", attempt: 1 });
  assert.deepEqual(closed.effect, { type: "schedule_reconnect", waitMs: 1000 });
});

test("重连失败按 attempt 推进退避；重连中再收到 detached/error/close 不重置退避", () => {
  let state = nextTerminalState(LIVE, frame({ t: "detached" })).state;
  for (const [attempt, wait] of [
    [2, 2000],
    [3, 4000],
    [4, 8000],
    [5, 10000],
    [6, 10000],
  ]) {
    const next = nextTerminalState(state, { type: "reconnect_failed" });
    assert.deepEqual(next.state, { kind: "reconnecting", attempt });
    assert.deepEqual(next.effect, { type: "schedule_reconnect", waitMs: wait });
    state = next.state;
  }
  // 已在重连：迟到的 detached / error / 旧 socket 的 close 都不重新起退避。
  for (const event of [
    frame({ t: "detached" }),
    frame({ t: "error", code: "transport" }),
    { type: "socket_closed" },
  ]) {
    const again = nextTerminalState(state, event);
    assert.equal(again.state, state);
    assert.equal(again.effect.type, "none");
  }
});

test("reconnect_ok → live 并要求清屏（reset_screen）；非重连态收到它是空操作", () => {
  const back = nextTerminalState({ kind: "reconnecting", attempt: 3 }, { type: "reconnect_ok" });
  assert.deepEqual(back.state, { kind: "live" });
  assert.deepEqual(back.effect, { type: "reset_screen" });

  const noop = nextTerminalState(LIVE, { type: "reconnect_ok" });
  assert.equal(noop.state.kind, "live");
  assert.equal(noop.effect.type, "none");
});

test("60 s 预算耗尽 give_up → error(connection_lost)，不是 Shell 结束", () => {
  const gave = nextTerminalState({ kind: "reconnecting", attempt: 4 }, { type: "give_up" });
  assert.deepEqual(gave.state, { kind: "error", code: "connection_lost" });
  // live 态收到迟到的 give_up 不动。
  assert.equal(nextTerminalState(LIVE, { type: "give_up" }).state.kind, "live");
});

test("「连接断了」后用户点重试（socket_closed）→ 从头起退避", () => {
  const retry = nextTerminalState(
    { kind: "error", code: "connection_lost" },
    { type: "socket_closed" },
  );
  assert.deepEqual(retry.state, { kind: "reconnecting", attempt: 1 });
  assert.deepEqual(retry.effect, { type: "schedule_reconnect", waitMs: 1000 });
});

test("重连途中服务端帧仍然算数：exit → exit，session_not_found → gone", () => {
  const reconnecting = { kind: "reconnecting", attempt: 2 };
  assert.deepEqual(
    nextTerminalState(reconnecting, frame({ t: "exit", exit_code: 1 })).state,
    { kind: "exit", code: "1" },
  );
  assert.deepEqual(
    nextTerminalState(reconnecting, frame({ t: "error", code: "session_not_found" })).state,
    { kind: "gone" },
  );
});

test("exit 与 gone 是终局：之后任何事件都不改状态", () => {
  const terminal_states = [
    { kind: "exit", code: "0" },
    { kind: "gone" },
  ];
  const events = [
    frame({ t: "out", data_b64: "eQ==" }),
    frame({ t: "exit", exit_code: 3 }),
    frame({ t: "detached" }),
    frame({ t: "error", code: "session_not_found" }),
    { type: "socket_closed" },
    { type: "reconnect_ok" },
    { type: "reconnect_failed" },
    { type: "give_up" },
  ];
  for (const state of terminal_states) {
    for (const event of events) {
      const next = nextTerminalState(state, event);
      assert.equal(next.state, state);
      assert.equal(next.effect.type, "none");
    }
  }
});
