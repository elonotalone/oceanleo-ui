import assert from "node:assert/strict";
import test from "node:test";

import { document, window } from "./helpers/remote-desktop-dom.mjs";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const apiStubUrl = dataModule(`export const remoteDesktopClient = globalThis.__rdDefaultClient;`);
const stubs = { "../i18n/ui/useUI": uiTextStubUrl, "../api/remote-desktop": apiStubUrl };

const { RemoteDesktopPanel } = await import(await compileModule("src/pages/RemoteDesktopPanel.tsx", stubs));

const JPEG = "data:image/jpeg;base64,/9j/AAAA";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function settle(ms = 40) {
  await act(async () => {
    await wait(ms);
  });
}

function frameOf(sequence, extra = {}) {
  return { image: JPEG, width: 1280, height: 720, sequence, ...extra };
}

/** 假的网关客户端：记录每次调用，并追踪取帧并发数。 */
function makeClient(overrides = {}) {
  const log = { create: 0, frames: 0, inputs: [], closes: [], signals: [], maxInFlight: 0 };
  let inFlight = 0;
  let sequence = 0;
  const client = {
    log,
    async createSession(deviceId, options) {
      log.create += 1;
      log.signals.push(options?.signal);
      return { ok: true, data: { session_id: "sess-1", state: "connecting", expires_at: "2026-10-24T22:00:00Z" } };
    },
    async getFrame() {
      inFlight += 1;
      log.maxInFlight = Math.max(log.maxInFlight, inFlight);
      log.frames += 1;
      await wait(5);
      inFlight -= 1;
      sequence += 1;
      return { ok: true, data: { state: "active", frame: frameOf(sequence) } };
    },
    async sendInput(deviceId, sessionId, seq, action) {
      log.inputs.push({ sessionId, seq, action });
      return { ok: true, data: { accepted: true, seq } };
    },
    async closeSession(deviceId, sessionId) {
      log.closes.push(sessionId);
      return { ok: true, data: { closed: true } };
    },
    ...overrides,
  };
  return client;
}

test("pending consent shows waiting and blocks every input/frame until approval", async () => {
  let approved = false;
  const client = makeClient({
    async createSession() { return { ok: true, data: { session_id: "consent-1", state: "pending_consent", expires_at: "" } }; },
    async getFrame() { return { ok: true, data: approved ? { state: "active", frame: frameOf(1) } : { state: "pending_consent", frame: frameOf(1) } }; },
  });
  const view = await mount(client);
  try {
    assert.equal(view.host.querySelector("[data-remote-phase]").getAttribute("data-remote-phase"), "waiting");
    assert.match(view.text(), /等待这台电脑确认/);
    assert.equal(view.img(), null, "even a malformed injected pending client cannot show a frame");
    assert.equal(view.input().disabled, true);
    await view.key({ key: "Enter" });
    assert.equal(client.log.inputs.length, 0);
    approved = true;
    await settle(800);
    assert.ok(view.img());
    assert.equal(view.input().disabled, false);
    await view.key({ key: "Enter" });
    assert.equal(client.log.inputs.length, 1);
  } finally { await view.unmount(); }
});

for (const [error, phase, text] of [["denied", "denied", "拒绝了请求"], ["request_expired", "timed_out", "请求已超时"], ["revoked", "revoked", "访问权限已撤销"], ["signed_out", "signed_out", "尚未登录"]]) {
  test(`consent ${error} is a distinct terminal state with no frame or input`, async () => {
    const client = makeClient({ async getFrame() { return { ok: true, data: { state: "closed", frame: null, error } }; } });
    const view = await mount(client);
    try {
      assert.equal(view.host.querySelector("[data-remote-phase]").getAttribute("data-remote-phase"), phase);
      assert.ok(view.text().includes(text));
      assert.equal(view.img(), null);
      assert.equal(view.input().disabled, true);
      await view.key({ key: "Enter" });
      assert.equal(client.log.inputs.length, 0);
    } finally { await view.unmount(); }
  });
}

async function mount(client, props = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const closed = { count: 0 };
  await act(async () => {
    root.render(
      React.createElement(RemoteDesktopPanel, {
        deviceId: "d-1",
        deviceName: "工作室",
        client,
        onClose: () => {
          closed.count += 1;
        },
        frameIntervalMs: 10,
        doubleClickWindowMs: 40,
        ...props,
      }),
    );
  });
  await settle(60);
  const stage = () => host.querySelector("[data-remote-stage]");
  const img = () => host.querySelector("[data-remote-frame]");
  const view = {
    host,
    closed,
    stage,
    img,
    text: () => host.textContent || "",
    button: (label) => [...host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === label),
    /** 给画面元素一个与帧同比例的矩形：左 100 上 50 宽 640 高 360（帧 1280×720）。 */
    pin(width = 640, height = 360) {
      img().getBoundingClientRect = () => ({ left: 100, top: 50, width, height, right: 100 + width, bottom: 50 + height });
    },
    async mouse(type, x, y, init = {}) {
      await act(async () => {
        img().dispatchEvent(
          new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init }),
        );
      });
    },
    input: () => host.querySelector("[data-remote-input]"),
    async key(init) {
      await act(async () => {
        stage().dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
      });
    },
    async compose(type, data) {
      await act(async () => {
        view.input().dispatchEvent(new window.CompositionEvent(type, { bubbles: true, data }));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
  return view;
}

const actions = (client) => client.log.inputs.map((entry) => entry.action);

test("进入即开一个会话，单帧循环从不并发，画面带传输尺寸", async () => {
  const client = makeClient();
  const view = await mount(client);
  assert.equal(client.log.create, 1);
  assert.ok(client.log.frames >= 2, "应持续取帧");
  assert.equal(client.log.maxInFlight, 1);
  assert.equal(view.img().getAttribute("src"), JPEG);
  assert.match(view.text(), /1280×720/);
  assert.match(view.text(), /已连接/);
  assert.equal(view.host.querySelector("[data-oceanleo-remote-desktop]").getAttribute("data-remote-phase"), "active");
  await view.unmount();
});

test("鼠标：比例坐标、单击等双击窗口、双击只发一条 double_click、右键立即发", async () => {
  const client = makeClient();
  const view = await mount(client);
  view.pin();

  await view.mouse("mousedown", 420, 230, { button: 0, detail: 1 });
  await view.mouse("mouseup", 420, 230, { button: 0, detail: 1 });
  assert.equal(client.log.inputs.length, 0, "单击要等双击窗口");
  await settle(80);
  assert.deepEqual(actions(client), [{ kind: "click", x: 0.5, y: 0.5, button: "left" }]);

  client.log.inputs.length = 0;
  await view.mouse("mousedown", 260, 140, { button: 0, detail: 1 });
  await view.mouse("mouseup", 260, 140, { button: 0, detail: 1 });
  await view.mouse("mousedown", 260, 140, { button: 0, detail: 2 });
  await view.mouse("mouseup", 260, 140, { button: 0, detail: 2 });
  await settle(100);
  assert.deepEqual(actions(client), [{ kind: "double_click", x: 0.25, y: 0.25, button: "left" }]);

  client.log.inputs.length = 0;
  await view.mouse("mousedown", 740, 410, { button: 2 });
  await view.mouse("mouseup", 740, 410, { button: 2 });
  await settle(30);
  assert.deepEqual(actions(client), [{ kind: "click", x: 1, y: 1, button: "right" }]);
  await view.unmount();
});

test("拖动只在抬起时发一条 drag；右键菜单被拦下交给对方", async () => {
  const client = makeClient();
  const view = await mount(client);
  view.pin();
  await view.mouse("mousedown", 164, 86, { button: 0, detail: 1 });
  await view.mouse("mousemove", 300, 150, { button: 0 });
  await view.mouse("mouseup", 612, 194, { button: 0, detail: 1 });
  await settle(30);
  assert.deepEqual(actions(client), [{ kind: "drag", x: 0.1, y: 0.1, toX: 0.8, toY: 0.4, button: "left" }]);
  const menu = new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  await act(async () => {
    view.stage().dispatchEvent(menu);
  });
  assert.equal(menu.defaultPrevented, true);
  await view.unmount();
});

test("移动被节流并合并，滚轮用非被动监听并按比例坐标发送", async () => {
  const client = makeClient();
  const view = await mount(client);
  view.pin();
  await view.mouse("mousemove", 200, 100);
  await view.mouse("mousemove", 220, 110);
  await view.mouse("mousemove", 240, 120);
  await settle(30);
  assert.equal(actions(client).filter((a) => a.kind === "move").length, 1, "150ms 内只发一次移动");

  client.log.inputs.length = 0;
  const wheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 420,
    clientY: 230,
    deltaY: 120,
    deltaMode: 0,
  });
  await act(async () => {
    view.img().dispatchEvent(wheel);
  });
  await settle(30);
  assert.equal(wheel.defaultPrevented, true, "画面上的滚轮不该滚动网页");
  assert.deepEqual(actions(client), [{ kind: "scroll", x: 0.5, y: 0.5, deltaX: 0, deltaY: 120 }]);
  await view.unmount();
});

test("键盘：点画面聚焦后可输入；快速连按合并成一次 type，组合键走 keypress", async () => {
  const client = makeClient({
    async sendInput(deviceId, sessionId, seq, action) {
      client.log.inputs.push({ sessionId, seq, action });
      await wait(20);
      return { ok: true, data: { accepted: true, seq } };
    },
  });
  const view = await mount(client);
  view.pin();
  await view.mouse("mousedown", 420, 230, { button: 0, detail: 1 });
  assert.equal(document.activeElement, view.input(), "点击画面后键盘焦点在输入口上");
  await view.mouse("mouseup", 420, 230, { button: 0, detail: 1 });
  await settle(80);
  client.log.inputs.length = 0;

  await view.key({ key: "h" });
  await view.key({ key: "i" });
  await view.key({ key: "!" });
  await view.key({ key: "Enter" });
  await view.key({ key: "c", ctrlKey: true });
  await view.key({ key: "Shift", shiftKey: true });
  await settle(150);
  assert.deepEqual(actions(client), [
    { kind: "type", text: "h" },
    { kind: "type", text: "i!" },
    { kind: "keypress", key: "Enter" },
    { kind: "keypress", key: "c", modifiers: ["ctrl"] },
  ]);
  const seqs = client.log.inputs.map((entry) => entry.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
  assert.equal(new Set(seqs).size, seqs.length, "seq 单调且不重复");
  assert.ok(seqs[0] >= 1);
  await view.unmount();
});

for (const source of ["key", "paste", "composition"]) {
  test(`单击后立即${source}：先提交定位单击，再发送键盘输入，不等双击窗口`, async () => {
    const client = makeClient();
    const view = await mount(client, { doubleClickWindowMs: 10000 });
    try {
      view.pin();
      await view.mouse("mousedown", 420, 230, { button: 0, detail: 1 });
      await view.mouse("mouseup", 420, 230, { button: 0, detail: 1 });
      assert.equal(client.log.inputs.length, 0);
      if (source === "key") {
        await view.key({ key: "Enter" });
      } else if (source === "paste") {
        const event = new window.Event("paste", { bubbles: true, cancelable: true });
        event.clipboardData = { getData: () => "test" };
        await act(async () => view.stage().dispatchEvent(event));
      } else {
        await view.compose("compositionstart", "");
        await view.compose("compositionend", "test");
      }
      await settle(20);
      assert.deepEqual(actions(client), [
        { kind: "click", x: 0.5, y: 0.5, button: "left" },
        source === "key" ? { kind: "keypress", key: "Enter" } : { kind: "type", text: "test" },
      ]);
    } finally {
      await view.unmount();
    }
  });
}

test("键盘提前提交单击后，原双击计时器不再补发第二次单击", async () => {
  const client = makeClient();
  const view = await mount(client);
  try {
    view.pin();
    await view.mouse("mousedown", 420, 230, { button: 0, detail: 1 });
    await view.mouse("mouseup", 420, 230, { button: 0, detail: 1 });
    await view.key({ key: "Enter" });
    await settle(100);
    assert.deepEqual(actions(client), [
      { kind: "click", x: 0.5, y: 0.5, button: "left" },
      { kind: "keypress", key: "Enter" },
    ]);
  } finally {
    await view.unmount();
  }
});

test("粘贴文字按块发送，Ctrl+V 的按键本身不被送出", async () => {
  const client = makeClient();
  const view = await mount(client);
  const keydown = new window.KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
  await act(async () => {
    view.stage().dispatchEvent(keydown);
  });
  assert.equal(keydown.defaultPrevented, false, "要让浏览器触发 paste");
  assert.equal(client.log.inputs.length, 0);

  const paste = new window.Event("paste", { bubbles: true, cancelable: true });
  paste.clipboardData = { getData: () => "你".repeat(450) };
  await act(async () => {
    view.stage().dispatchEvent(paste);
  });
  await settle(60);
  const typed = actions(client).filter((a) => a.kind === "type");
  assert.equal(typed.map((a) => a.text).join(""), "你".repeat(450));
  assert.ok(typed.every((a) => [...a.text].length <= 200));
  assert.equal(paste.defaultPrevented, true);
  await view.unmount();
});

test("输入队列有上限：灌入大量按键不会无限堆积", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const client = makeClient({
    async sendInput(deviceId, sessionId, seq, action) {
      client.log.inputs.push({ sessionId, seq, action });
      await gate;
      return { ok: true, data: { accepted: true, seq } };
    },
  });
  const view = await mount(client);
  for (let i = 0; i < 200; i += 1) await view.key({ key: "F5" });
  assert.equal(client.log.inputs.length, 1, "同一时刻只有一个输入请求在飞");
  assert.match(view.text(), /部分输入被丢弃/);
  release();
  await settle(100);
  assert.ok(client.log.inputs.length <= 65, `实际送出 ${client.log.inputs.length}`);
  await view.unmount();
});

test("未知 ACK（网络错）的输入不重放，下一条照常发送", async () => {
  let calls = 0;
  const client = makeClient({
    async sendInput(deviceId, sessionId, seq, action) {
      calls += 1;
      client.log.inputs.push({ sessionId, seq, action });
      return calls === 1 ? { ok: false, error: "network_error", status: 0 } : { ok: true, data: { accepted: true, seq } };
    },
  });
  const view = await mount(client);
  await view.key({ key: "Enter" });
  await settle(30);
  await view.key({ key: "Tab" });
  await settle(30);
  assert.deepEqual(actions(client), [
    { kind: "keypress", key: "Enter" },
    { kind: "keypress", key: "Tab" },
  ]);
  assert.deepEqual(client.log.inputs.map((e) => e.seq), [1, 2]);
  await view.unmount();
});

test("断开：取消在途请求、幂等关闭一次、不再取帧并通知父层", async () => {
  const client = makeClient();
  const view = await mount(client);
  await act(async () => {
    view.button("断开").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(client.log.closes, ["sess-1"]);
  assert.equal(view.closed.count, 1);
  assert.equal(client.log.signals[0].aborted, true);
  const frames = client.log.frames;
  await settle(80);
  assert.equal(client.log.frames, frames, "断开后不再取帧");
  await view.unmount();
  assert.deepEqual(client.log.closes, ["sess-1"], "卸载不重复关闭");
});

test("卸载面板即关闭会话", async () => {
  const client = makeClient();
  const view = await mount(client);
  await view.unmount();
  assert.deepEqual(client.log.closes, ["sess-1"]);
});

test("创建会话在取消前才落地：补一次关闭，不留空会话占着设备", async () => {
  let resolveCreate;
  const client = makeClient({
    createSession() {
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    },
  });
  const view = await mount(client);
  await view.unmount();
  await act(async () => {
    resolveCreate({ ok: true, data: { session_id: "late", state: "connecting", expires_at: "" } });
    await wait(10);
  });
  assert.deepEqual(client.log.closes, ["late"]);
  assert.equal(client.log.frames, 0);
});

test("进入被拒：B 的真实码各说各的，只有 session_active 才算「别人占着」，其余不重试", async () => {
  const cases = [
    [{ error: "remote_desktop_unavailable", status: 409 }, /联系不上这台电脑上的 OceanLeo/, 1],
    [{ error: "remote_desktop_disabled", status: 403 }, /更新.*OceanLeo/, 1],
    [{ error: "device_offline", status: 409 }, /不在线/, 1],
    [{ error: "too_many_sessions", status: 429 }, /远程会话太多/, 1],
    [{ error: "rate_limited", status: 429 }, /操作太频繁/, 1],
    [{ error: "HTTP 409", status: 409 }, /这一步没有完成/, 1],
  ];
  for (const [failure, pattern, creates] of cases) {
    const client = makeClient({
      async createSession() {
        client.log.create += 1;
        return { ok: false, ...failure };
      },
    });
    const view = await mount(client);
    await settle(150);
    assert.match(view.text(), pattern, JSON.stringify(failure));
    assert.equal(client.log.create, creates, `${failure.error} 不该等待重试`);
    assert.equal(client.log.frames, 0);
    assert.ok(view.host.querySelector("[data-remote-error]"));
    assert.match(view.text(), /已断开/);
    assert.ok(view.button("关闭"));
    await view.unmount();
  }
});

test("session_active 才会重试（吸收上一个面板刚关的间隙），仍占用则报已有会话", async () => {
  const client = makeClient({
    async createSession() {
      client.log.create += 1;
      return { ok: false, error: "session_active", status: 409 };
    },
  });
  const view = await mount(client);
  await settle(1700);
  assert.equal(client.log.create, 3);
  assert.match(view.text(), /已有一个正在进行的远程会话/);
  await view.unmount();
});

test("设备失联 / 会话结束：停止取帧并清除旧画面", async () => {
  let n = 0;
  const client = makeClient({
    async getFrame() {
      n += 1;
      if (n < 3) return { ok: true, data: { state: "active", frame: frameOf(n) } };
      return { ok: true, data: { state: "closed", frame: null, error: "device_offline" } };
    },
  });
  const view = await mount(client);
  await settle(100);
  assert.equal(n, 3, "closed 之后不再轮询");
  assert.match(view.text(), /已断开/);
  assert.equal(view.host.querySelector("[data-remote-frame]"), null, "结束后不残留受控屏幕");
  assert.match(view.host.querySelector("[data-remote-error]").textContent, /不在线/);
  await view.unmount();
});

test("取帧 404 / 401 立即结束；偶发网络错只提示并自动恢复", async () => {
  const gone = makeClient({
    async getFrame() {
      return { ok: false, error: "HTTP 404", status: 404 };
    },
  });
  let view = await mount(gone);
  assert.equal(gone.log.closes.length, 1, "致命错误也要关会话");
  assert.match(view.text(), /会话已结束/);
  await view.unmount();

  let n = 0;
  const flaky = makeClient({
    async getFrame() {
      n += 1;
      if (n === 1) return { ok: false, error: "network_error", status: 0 };
      return { ok: true, data: { state: "active", frame: frameOf(n) } };
    },
  });
  view = await mount(flaky);
  await settle(600);
  assert.match(view.text(), /已连接/);
  assert.equal(view.host.querySelector("[data-remote-notice]"), null, "恢复后提示消失");
  await view.unmount();
});

test("连续取帧失败超过上限就判定失联并停止，不无限重试", async () => {
  const client = makeClient({
    async getFrame() {
      client.log.frames += 1;
      return { ok: false, error: "network_error", status: 0 };
    },
  });
  const view = await mount(client);
  await settle(6500);
  assert.match(view.text(), /失去联系/);
  assert.equal(client.log.frames, 6);
  assert.equal(client.log.closes.length, 1);
  await view.unmount();
});

test("单帧图像损坏时给出提示，下一帧到来后清除", async () => {
  let advance = false;
  let sequence = 1;
  const client = makeClient({
    async getFrame() {
      if (advance) sequence += 1;
      return { ok: true, data: { state: "active", frame: frameOf(sequence) } };
    },
  });
  const view = await mount(client);
  await act(async () => {
    view.img().dispatchEvent(new window.Event("error"));
  });
  assert.ok(view.host.querySelector("[data-remote-image-error]"));
  advance = true;
  await settle(60);
  assert.equal(view.host.querySelector("[data-remote-image-error]"), null);
  await view.unmount();
});

test("全屏按钮请求面板全屏；浏览器不允许时给出说明", async () => {
  const client = makeClient();
  const view = await mount(client);
  const root = view.host.querySelector("[data-oceanleo-remote-desktop]");
  let requested = 0;
  root.requestFullscreen = async () => {
    requested += 1;
  };
  await act(async () => {
    view.button("全屏").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(requested, 1);
  root.requestFullscreen = async () => {
    throw new Error("denied");
  };
  await act(async () => {
    view.button("全屏").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await wait(5);
  });
  assert.match(view.text(), /不允许进入全屏/);
  await view.unmount();
});

test("缩放留白：点在 object-contain 留白上不产生点击，画面内按画面真实区域取比例", async () => {
  const client = makeClient();
  const view = await mount(client);
  // 元素 400×200，帧 1280×720 ⇒ 画面 355.6×200，左右各留白约 22.2。
  view.pin(400, 200);
  await view.mouse("mousedown", 110, 150, { button: 0, detail: 1 });
  await view.mouse("mouseup", 110, 150, { button: 0, detail: 1 });
  await settle(80);
  assert.deepEqual(actions(client), [], "留白上不点击");
  assert.equal(document.activeElement, view.input(), "但键盘焦点仍回到输入口");

  await view.mouse("mousedown", 300, 150, { button: 0, detail: 1 });
  await view.mouse("mouseup", 300, 150, { button: 0, detail: 1 });
  await settle(80);
  assert.deepEqual(actions(client), [{ kind: "click", x: 0.5, y: 0.5, button: "left" }]);

  client.log.inputs.length = 0;
  await view.mouse("mousemove", 105, 100);
  await settle(30);
  assert.deepEqual(actions(client), [], "留白上的移动也不发");

  const wheel = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 105, clientY: 100, deltaY: 50 });
  await act(async () => {
    view.img().dispatchEvent(wheel);
  });
  await settle(30);
  assert.equal(wheel.defaultPrevented, false, "留白上的滚轮留给网页");
  assert.deepEqual(actions(client), []);
  await view.unmount();
});

test("中文输入法：组字中不发半成品，compositionend 整段只发一次 type", async () => {
  const client = makeClient();
  const view = await mount(client);
  await view.compose("compositionstart", "");
  for (const key of ["n", "i", "h"]) {
    await view.key({ key: "Process", isComposing: true, keyCode: 229 });
    await view.key({ key, isComposing: true });
  }
  await view.compose("compositionupdate", "ni h");
  await settle(30);
  assert.deepEqual(actions(client), [], "组字中一个字节都不发");
  view.input().value = "你好";
  await view.compose("compositionend", "你好");
  await settle(40);
  assert.deepEqual(actions(client), [{ kind: "type", text: "你好" }]);
  assert.equal(view.input().value, "", "输入口被清空，不累积");

  // Safari：确认键的 keydown 在 compositionend 之后，keyCode 仍是 229，不能再发一次 Enter。
  await view.key({ key: "Enter", keyCode: 229 });
  await settle(30);
  assert.equal(actions(client).length, 1);
  // 组字结束后，普通按键恢复正常。
  await view.key({ key: "a" });
  await settle(30);
  assert.deepEqual(actions(client).at(-1), { kind: "type", text: "a" });
  await view.unmount();
});

test("粘贴 / 上屏文字被净化成网关接受的形状：换行统一、特殊空白变空格、控制与零宽符去掉", async () => {
  const client = makeClient();
  const view = await mount(client);
  const paste = new window.Event("paste", { bubbles: true, cancelable: true });
  paste.clipboardData = { getData: () => "a\r\nb c​d\u0007e\tf" };
  await act(async () => {
    view.stage().dispatchEvent(paste);
  });
  await settle(40);
  assert.deepEqual(actions(client), [{ kind: "type", text: "a\nb cde\tf" }]);
  await view.unmount();
});

test("设备失联 / 本机关闭 / 空闲 / 账号不符：服务端 closed 后各给人话，且之后所有输入全部停止", async () => {
  const cases = [
    ["device_lost", /失去联系/],
    ["disabled_locally", /那台电脑上已关闭远程桌面/],
    ["viewer_idle", /太久没有操作/],
    ["account_mismatch", /账号与当前网页账号不一致/],
    ["session_closed", /会话已结束/],
    ["expired", /已到期/],
  ];
  for (const [code, pattern] of cases) {
    let n = 0;
    const client = makeClient({
      async getFrame() {
        n += 1;
        if (n < 3) return { ok: true, data: { state: "active", frame: frameOf(n) } };
        return { ok: true, data: { state: "closed", frame: null, error: code } };
      },
    });
    const view = await mount(client);
    await settle(100);
    assert.match(view.host.querySelector("[data-remote-error]").textContent, pattern, code);
    assert.equal(view.img(), null, "closed clears the last desktop frame");
    assert.equal(view.input().disabled, true, "输入口停用");
    client.log.inputs.length = 0;
    // 关闭后的一切输入：按键、鼠标、滚轮、粘贴、输入法
    await view.key({ key: "a" });
    await view.key({ key: "Enter" });
    for (const type of ["mousedown", "mouseup", "mousemove"]) await act(async () => view.stage().dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: 420, clientY: 230, button: 0 })));
    const wheel = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 420, clientY: 230, deltaY: 40 });
    await act(async () => {
      view.stage().dispatchEvent(wheel);
    });
    const paste = new window.Event("paste", { bubbles: true, cancelable: true });
    paste.clipboardData = { getData: () => "x" };
    await act(async () => {
      view.stage().dispatchEvent(paste);
    });
    await view.compose("compositionend", "中");
    await settle(300);
    assert.deepEqual(client.log.inputs, [], `${code} 之后不该再有任何输入`);
    assert.equal(wheel.defaultPrevented, false);
    await view.unmount();
  }
});

test("致命的输入错误（session_closed 409 / account_mismatch）直接结束会话并停止输入", async () => {
  for (const code of ["session_closed", "account_mismatch", "device_lost"]) {
    const client = makeClient({
      async sendInput(deviceId, sessionId, seq, action) {
        client.log.inputs.push({ sessionId, seq, action });
        return { ok: false, error: code, status: 409 };
      },
    });
    const view = await mount(client);
    await view.key({ key: "Enter" });
    await settle(40);
    assert.equal(view.host.querySelector("[data-oceanleo-remote-desktop]").getAttribute("data-remote-phase"), "error");
    assert.equal(client.log.closes.length, 1);
    await view.key({ key: "Tab" });
    await view.key({ key: "Tab" });
    await settle(40);
    assert.equal(client.log.inputs.length, 1, "结束后不再送输入");
    await view.unmount();
  }
});

test("input_queue_full：失败的那条不重放，暂停期间不往外送，并明确提示；暂停后继续正常", async () => {
  let calls = 0;
  const client = makeClient({
    async sendInput(deviceId, sessionId, seq, action) {
      calls += 1;
      client.log.inputs.push({ sessionId, seq, action, at: Date.now() });
      return calls === 1
        ? { ok: false, error: "input_queue_full", status: 429 }
        : { ok: true, data: { accepted: true, seq } };
    },
  });
  const view = await mount(client, { backpressureMs: 250 });
  await view.key({ key: "F1" });
  for (let i = 0; i < 5; i += 1) await view.key({ key: "F2" });
  await settle(60);
  assert.match(view.host.querySelector("[data-remote-notice]").textContent, /处理不过来/);
  assert.equal(client.log.inputs.length, 1, "暂停期间不再往外送");
  await settle(400);
  const sent = client.log.inputs.map((entry) => entry.action.key);
  assert.deepEqual(sent, ["F1", "F2", "F2", "F2", "F2", "F2"], "F1 只送过一次（不重放），暂停后其余按序送出");
  assert.ok(client.log.inputs[1].at - client.log.inputs[0].at >= 200, "确实停过一段时间");
  const seqs = client.log.inputs.map((entry) => entry.seq);
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6]);
  await view.unmount();
});
