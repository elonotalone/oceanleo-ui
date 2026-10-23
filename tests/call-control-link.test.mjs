// W09 返工 A-34①/D9：控制会话变 active 且我是控制方时，运行时必须自动打开中继 WebSocket；
// 会话结束/我离开通话时关闭。编译真实 runtime.ts（真 control-store/control-socket/protocol 单例），
// 只桩掉网关地址、token、REST 客户端；用假 WebSocket 驱动「active → 打开链路 → 收到 ready → 发出 md」。
import test from "node:test";
import assert from "node:assert/strict";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const runtimeUrl = await compileModule("src/shell/messages/call/control/runtime.ts", {
  "../../../../lib/auth/config": dataModule(`export const GATEWAY_BASE = "https://gw.test";`),
  "../../../../lib/auth/client": dataModule(`export async function accessToken(){ return "tok-1"; }`),
  "./control-api": dataModule(`
    export const controlApi = {
      request: async () => ({ session: null }),
      cancel: async () => ({ session: null }),
      decline: async () => ({ session: null }),
      stop: async () => ({ session: null }),
      get: async () => ({ session: null }),
    };
  `),
});
const runtime = await import(runtimeUrl);

const tick = () => new Promise((r) => setTimeout(r, 0));

function activeView(over = {}) {
  return {
    session_id: "s1",
    call_id: "c1",
    controller_id: "u-ctrl",
    target_id: "u-tgt",
    state: "active",
    created_at: "2026-10-23T00:00:00.000Z",
    expires_at: "2026-10-23T00:01:30.000Z",
    approved_at: "2026-10-23T00:00:05.000Z",
    ended_at: null,
    end_reason: null,
    ...over,
  };
}

function installFakeSocket() {
  const state = { socket: null };
  runtime.__setControllerSocketFactory((url) => {
    const ws = {
      url,
      sent: [],
      closedWith: null,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data) {
        this.sent.push(JSON.parse(data));
      },
      close(code) {
        this.closedWith = code ?? 1000;
        this.onclose?.({ code: this.closedWith });
      },
      // 测试辅助
      open() {
        this.onopen?.();
      },
      recv(obj) {
        this.onmessage?.({ data: JSON.stringify(obj) });
      },
    };
    state.socket = ws;
    return ws;
  });
  return state;
}

function reset() {
  runtime.setControlSelfId(null); // 关掉我所有控制方链路
  runtime.controlStore.retainCall(null); // 清空会话仓
  runtime.controlNotices.clear();
  runtime.__setControllerSocketFactory(null);
}

test("D9：会话 active 且我是控制方 → 自动开中继链路 → 收到 ready → 发出 md", async () => {
  const fake = installFakeSocket();
  runtime.setControlSelfId("u-ctrl");

  // 会话变 active（服务端事件）→ 对账应当开一条控制方链路。
  runtime.controlStore.ingest(activeView());
  const entry = runtime.getControllerLink("s1");
  assert.ok(entry, "active 之后应当创建了控制方链路（D9 的核心修复）");
  assert.deepEqual(runtime.controllerLinkIds(), ["s1"]);

  // connect() 异步（await getToken）→ 等一拍让 createSocket 跑起来。
  await tick();
  assert.ok(fake.socket, "链路应当真的开了一个 WebSocket");
  assert.equal(fake.socket.url, "wss://gw.test/v1/im/calls/control/s1/ws");

  // 首帧必须是 auth。
  fake.socket.open();
  assert.deepEqual(fake.socket.sent[0], { type: "auth", access_token: "tok-1" });

  // 服务端 ready → 链路可用。
  fake.socket.recv({ type: "ready", surface: { width: 1920, height: 1080 } });
  assert.equal(entry.link.snapshot().state, "ready");

  // 控制方发一个鼠标按下 → 经发送器到达设备。
  entry.sender.down("left", 0.5, 0.5);
  await tick();
  const md = fake.socket.sent.find((f) => f.t === "md");
  assert.deepEqual(md, { t: "md", b: "left", x: 0.5, y: 0.5 }, "md 必须真的发到了设备（D9 之前是空的）");

  reset();
});

test("会话结束 → 关闭链路并关 WebSocket", async () => {
  const fake = installFakeSocket();
  runtime.setControlSelfId("u-ctrl");
  runtime.controlStore.ingest(activeView());
  await tick();
  fake.socket.open();
  fake.socket.recv({ type: "ready", surface: { width: 800, height: 600 } });
  assert.ok(runtime.getControllerLink("s1"));

  runtime.controlStore.ingest(activeView({ state: "ended", end_reason: "controller_stopped", ended_at: "2026-10-23T00:02:00.000Z" }));
  assert.equal(runtime.getControllerLink("s1"), null, "ended 后链路应当关掉");
  assert.ok(fake.socket.closedWith != null, "WebSocket 应当被关闭");

  reset();
});

test("拒绝 / 超时 也关闭链路（会话离开 active 即关）", async () => {
  for (const [state, end_reason] of [
    ["declined", "share_entire_screen"],
    ["expired", "timeout"],
  ]) {
    const fake = installFakeSocket();
    runtime.setControlSelfId("u-ctrl");
    runtime.controlStore.ingest(activeView());
    await tick();
    fake.socket.open();
    fake.socket.recv({ type: "ready", surface: { width: 800, height: 600 } });
    assert.ok(runtime.getControllerLink("s1"), `${state}: 先有链路`);
    runtime.controlStore.ingest(activeView({ state, end_reason, ended_at: "2026-10-23T00:02:00.000Z" }));
    assert.equal(runtime.getControllerLink("s1"), null, `${state}: 链路应当关掉`);
    reset();
  }
});

test("离开通话 → 立刻关掉旧通话的控制方链路（不等服务端对账）", async () => {
  const fake = installFakeSocket();
  runtime.setControlSelfId("u-ctrl");
  runtime.controlStore.ingest(activeView());
  await tick();
  fake.socket.open();
  fake.socket.recv({ type: "ready", surface: { width: 800, height: 600 } });
  assert.ok(runtime.getControllerLink("s1"));

  // 会话在仓里仍 active（没收到 ended），但我已离开这通通话。
  runtime.closeControllerLinksOutsideCall(null);
  assert.equal(runtime.getControllerLink("s1"), null, "离开通话应当立刻关链路");
  assert.ok(fake.socket.closedWith != null);
  reset();
});

test("我不是控制方（我是被控方）→ 不开控制方链路", async () => {
  const fake = installFakeSocket();
  runtime.setControlSelfId("u-tgt"); // 我是被控方
  runtime.controlStore.ingest(activeView()); // controller 是 u-ctrl
  await tick();
  assert.equal(runtime.getControllerLink("s1"), null, "被控方不应开控制方链路");
  assert.equal(fake.socket, null, "没有 WebSocket 被打开");
  reset();
});

test("竞态：active 先到、selfId 后到 → setControlSelfId 补开链路", async () => {
  const fake = installFakeSocket();
  // selfId 还没设，先来 active 事件。
  runtime.controlStore.ingest(activeView());
  assert.equal(runtime.getControllerLink("s1"), null, "没有 selfId 时不开");
  // 现在才知道我是谁。
  runtime.setControlSelfId("u-ctrl");
  assert.ok(runtime.getControllerLink("s1"), "setControlSelfId 应当补开控制方链路");
  await tick();
  assert.ok(fake.socket, "补开后真的连了 WebSocket");
  reset();
});
