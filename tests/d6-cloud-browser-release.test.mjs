import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import {
  FIRST_FRAME_TIMEOUT_MS,
} from "../src/shell/cloud-browser-transport-config.ts";
import { buildCloudBrowserV3Fixture } from "./cloud-browser-wire-fixture.ts";

import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://browser.test/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const liveRealUrl = realModule("src/shell/cloud-browser-live.ts");
const browserStubUrl = dataModule(`
  export function cloudBrowserLiveUrl(sessionId) {
    return "wss://browser.test/" + encodeURIComponent(sessionId);
  }
  export function createCloudBrowserTicket(sessionId) {
    return globalThis.__d6BrowserRuntime.createTicket(sessionId);
  }
`);
// 真模块全量转出再覆盖画家：transport-model 等图内兄弟也从同一路径取
// `normalizeCloudBrowserLease`，桩不齐会把整份文件在加载期打哑。
const liveStubUrl = dataModule(`
  export * from ${JSON.stringify(liveRealUrl)};
  import { useCallback, useRef } from ${JSON.stringify(reactUrl)};

  export function useCloudBrowserFramePainter(options = {}) {
    const canvasRef = useRef(null);
    const frameSizeRef = useRef({ width: 1280, height: 720 });
    const cancelFrameDecode = useCallback((clearCanvas = false) => {
      const runtime = globalThis.__d6BrowserRuntime;
      runtime.cancelFrameDecodeCalls.push(clearCanvas);
    }, []);
    const acceptFrameMeta = useCallback(() => true, []);
    const drawBlobFrame = useCallback(() => true, []);
    globalThis.__d6BrowserRuntime.frameCallbacks = options;
    return {
      canvasRef,
      frameSizeRef,
      cancelFrameDecode,
      acceptFrameMeta,
      drawBlobFrame,
    };
  }
`);
// Exercise the real reducer and protocol commit, retaining its context for
// asynchronous callback races. Only the network and pixel decoder are fakes.
const protocolStubUrl = dataModule(`
  import { handleCloudBrowserProtocolMessage as handle } from ${JSON.stringify(realModule("src/shell/cloud-browser-protocol.ts"))};
  export function handleCloudBrowserProtocolMessage(message, context) {
    globalThis.__d6BrowserRuntime.protocolContext = context;
    return handle(message, context);
  }
`);

const { useCloudBrowserTransport } = await import(
  await compileModule("src/shell/cloud-browser-transport.ts", {
    "../lib/browser": browserStubUrl,
    "./cloud-browser-live": liveStubUrl,
    "./cloud-browser-protocol": protocolStubUrl,
  })
);

async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.timers = new Map();
  }

  setTimeout(callback, delay = 0, ...args) {
    const id = this.nextId++;
    this.timers.set(id, {
      at: this.now + Math.max(0, Number(delay) || 0),
      callback: () => callback(...args),
      interval: 0,
    });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  setInterval(callback, delay = 0, ...args) {
    const id = this.nextId++;
    const interval = Math.max(1, Number(delay) || 0);
    this.timers.set(id, {
      at: this.now + interval,
      callback: () => callback(...args),
      interval,
    });
    return id;
  }

  clearInterval(id) {
    this.timers.delete(id);
  }

  tick(milliseconds) {
    const target = this.now + milliseconds;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(
          ([leftId, left], [rightId, right]) =>
            left.at - right.at || leftId - rightId,
        )[0];
      if (!due) break;
      const [id, timer] = due;
      this.now = timer.at;
      if (timer.interval > 0) {
        timer.at += timer.interval;
      } else {
        this.timers.delete(id);
      }
      timer.callback();
    }
    this.now = target;
  }
}

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.bufferedAmount = 0;
    this.binaryType = "";
    this.sent = [];
    this.closed = null;
    FakeWebSocket.instances.push(this);
    const runtime = globalThis.__d6BrowserRuntime;
    runtime.maxActiveSockets = Math.max(runtime.maxActiveSockets,
      FakeWebSocket.instances.filter(s => s.readyState < FakeWebSocket.CLOSING).length);
  }

  open() {
    assert.equal(this.readyState, FakeWebSocket.CONNECTING);
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  message(data) {
    assert.equal(this.readyState, FakeWebSocket.OPEN);
    this.onmessage?.({ data });
  }

  send(data) {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("socket is not open");
    }
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    // Match the browser API: protocol-only status codes throw before closing.
    globalThis.__d6BrowserRuntime.closeCodes.push(code);
    if (code !== 1000 && !(code >= 3000 && code <= 4999)) {
      throw new DOMException("invalid client close code", "InvalidAccessError");
    }
    if (this.readyState >= FakeWebSocket.CLOSING) return;
    this.readyState = FakeWebSocket.CLOSING;
    this.closed = { code, reason };
    // Closing handshake completion can arrive after the replacement socket.
  }
}

function createRuntime() {
  const clock = new FakeClock();
  const runtime = {
    clock,
    ticketCalls: [],
    ticketQueue: [],
    ticketSerial: 0,
    maxActiveSockets: 0,
    closeCodes: [],
    fixture: buildCloudBrowserV3Fixture(),
    frameCallbacks: null,
    protocolContext: null,
    helloSerial: 0,
    helloLeases: [],
    cancelFrameDecodeCalls: [],
    liveRequestedUpdates: [],
    busyUpdates: [],
    errors: [],
    transport: null,
    createTicket(sessionId) {
      const serial = ++runtime.ticketSerial;
      runtime.ticketCalls.push({ sessionId, serial });
      const queued = runtime.ticketQueue.shift();
      if (queued !== undefined) return queued;
      return Promise.resolve({ ok: true, data: runtime.fixture.ticket });
    },
  };
  globalThis.__d6BrowserRuntime = runtime;
  FakeWebSocket.instances = [];
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: FakeWebSocket,
  });
  Object.defineProperty(window, "WebSocket", {
    configurable: true,
    writable: true,
    value: FakeWebSocket,
  });
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
  window.setTimeout = clock.setTimeout.bind(clock);
  window.clearTimeout = clock.clearTimeout.bind(clock);
  window.setInterval = clock.setInterval.bind(clock);
  window.clearInterval = clock.clearInterval.bind(clock);
  return runtime;
}

async function mountTransport(runtime, initialSelectedId = "session-fixture") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Harness({ selectedId, scopeKey }) {
    runtime.transport = useCloudBrowserTransport({
      selectedId,
      liveRequested: false,
      setLiveRequested(value) {
        runtime.liveRequestedUpdates.push(value);
      },
      scopeKey,
      tt(value) {
        return value;
      },
      setBusy(value) {
        runtime.busyUpdates.push(value);
      },
      setError(value) {
        runtime.errors.push(value);
      },
      async refreshCheckpoints() {},
    });
    return null;
  }

  async function render(selectedId, scopeKey = "task-1") {
    await act(async () => {
      root.render(React.createElement(Harness, { selectedId, scopeKey }));
      await flushMicrotasks();
    });
  }

  await render(initialSelectedId);
  return {
    render,
    async unmount() {
      await act(async () => {
        root.unmount();
        await flushMicrotasks();
      });
      container.remove();
    },
  };
}

async function openLive(runtime, sessionId) {
  let opened;
  await act(async () => {
    opened = await runtime.transport.openLive(sessionId);
    await flushMicrotasks();
  });
  assert.equal(opened, true);
  return FakeWebSocket.instances.at(-1);
}

async function establish(socket) {
  await act(async () => {
    socket.open();
    socket.message(JSON.stringify(globalThis.__d6BrowserRuntime.fixture.hello));
    await flushMicrotasks();
  });
}

async function presentFrame(runtime, sequence = 1) {
  await act(async () => {
    runtime.frameCallbacks.onPresented({
      sequence,
      actionSequence: 0,
      source: "native-chrome-window",
      paintState: "real",
      nativeChromeWindow: true,
    });
    await flushMicrotasks();
  });
}

async function tick(runtime, milliseconds) {
  await act(async () => {
    runtime.clock.tick(milliseconds);
    await flushMicrotasks();
  });
}

function sentMessages(socket, type) {
  return socket.sent
    .map((message) => JSON.parse(message))
    .filter((message) => message.t === type);
}


async function withStreaming(run) {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const socket = await openLive(runtime);
    await establish(socket);
    await presentFrame(runtime);
    assert.equal(runtime.transport.transportState, "streaming");
    await run(runtime, socket);
  } finally { await mounted.unmount(); }
}

async function acquire(runtime, socket) {
  await act(async () => {
    runtime.transport.toggleControl();
    socket.message(JSON.stringify(runtime.fixture.control_state));
  });
  assert.equal(runtime.transport.driving, true);
}

function freeMessage(runtime, overrides = {}) {
  const grant = runtime.fixture.control_state;
  return { ...grant, lease: { lease_id: "", lease_epoch: grant.lease.lease_epoch,
    holder_kind: "free", privacy_mode: false },
    action_sequence: grant.action_sequence + 1,
    callback_sequence: grant.callback_sequence + 1, ...overrides };
}

function observableState(runtime) {
  const t = runtime.transport;
  return { state: t.transportState, driving: t.driving, pending: t.controlPending,
    failure: t.failureKind, lease: t.lease, tickets: runtime.ticketCalls.length };
}

function capturedCallbacks(socket) {
  return { open: socket.onopen, message: socket.onmessage,
    close: socket.onclose, error: socket.onerror };
}

async function fireStaleCallbacks(callbacks, runtime) {
  await act(async () => {
    callbacks.message?.({ data: JSON.stringify(freeMessage(runtime)) });
    callbacks.message?.({ data: "invalid JSON" });
    callbacks.close?.({ code: 1006 });
    callbacks.error?.({});
    callbacks.open?.({});
    await flushMicrotasks();
  });
}

test("D6: same-epoch free acknowledgment keeps streaming/viewing with zero reconnects", async () => {
  await withStreaming(async (runtime, socket) => {
    await acquire(runtime, socket);
    await act(async () => {
      runtime.transport.toggleControl();
      socket.message(JSON.stringify(freeMessage(runtime)));
    });
    assert.equal(sentMessages(socket, "control.release").length, 1);
    assert.equal(runtime.transport.transportState, "streaming");
    assert.equal(runtime.transport.driving, false);
    assert.equal(runtime.transport.controlPending, false);
    assert.equal(runtime.transport.failureKind, null);
    await tick(runtime, 20_000);
    assert.equal(runtime.transport.transportState, "streaming");
    assert.equal(runtime.ticketCalls.length - 1, 0, "no reconnect ticket");
    assert.equal(FakeWebSocket.instances.length, 1);
    assert.equal(runtime.maxActiveSockets, 1);
    assert.equal(socket.readyState, FakeWebSocket.OPEN);
    assert.equal(sentMessages(socket, "control.renew").length, 0);
    assert.ok(sentMessages(socket, "heartbeat").length >= 1);
  });
});

test("D6: release at the current epoch does not relax older epochs or replacement grants", async () => {
  for (const variant of ["older-free", "same-epoch-new-human", "free-with-owner", "stale-callback"]) {
    await withStreaming(async (runtime, socket) => {
      await acquire(runtime, socket);
      const message = freeMessage(runtime);
      if (variant === "older-free") message.lease.lease_epoch--;
      if (variant === "same-epoch-new-human") message.lease = {
        ...runtime.fixture.control_state.lease, lease_id: "different-grant" };
      if (variant === "free-with-owner") message.lease.connection_id = "unexpected-owner";
      if (variant === "stale-callback") message.callback_sequence--;
      await act(async () => socket.message(JSON.stringify(message)));
      assert.equal(runtime.transport.transportState, "reconnecting", variant);
      assert.equal(runtime.transport.driving, false, variant);
    });
  }
});

for (const cause of ["receipt-send-failed", "protocol-rejected", "first-frame-timeout", "expired-before-open"]) {
  test(`D6: ${cause} closes with a legal code, keeps one valid WS, and fences old callbacks`, async () => {
    const runtime = createRuntime();
    const mounted = await mountTransport(runtime);
    try {
      const socket = await openLive(runtime);
      const callbacks = capturedCallbacks(socket);
      if (cause === "expired-before-open") {
        const originalNow = Date.now;
        try {
          Date.now = () => originalNow() + 90_000;
          await act(async () => socket.open());
        } finally { Date.now = originalNow; }
      } else if (cause === "first-frame-timeout") {
        await establish(socket);
        await tick(runtime, FIRST_FRAME_TIMEOUT_MS);
      } else {
        await establish(socket);await presentFrame(runtime);
        await act(async () => {
          if (cause === "receipt-send-failed") {
            socket.bufferedAmount = 300_000;
            runtime.frameCallbacks.onReceived({ sequence: 2, actionSequence: 10 });
          } else socket.message("invalid JSON");
        });
      }
      assert.equal(socket.readyState, FakeWebSocket.CLOSING, "old socket must really close");
      assert.equal(socket.onmessage, null);
      assert.equal(socket.onclose, null);
      assert.equal(socket.onopen, null);
      assert.equal(socket.onerror, null);
      await tick(runtime, 1000);
      const replacement = FakeWebSocket.instances.at(-1);
      assert.notEqual(replacement, socket);
      await establish(replacement);await presentFrame(runtime);
      assert.equal(runtime.maxActiveSockets, 1);
      const before = observableState(runtime);
      await fireStaleCallbacks(callbacks, runtime);
      assert.deepEqual(observableState(runtime), before);
      assert.equal(replacement.readyState, FakeWebSocket.OPEN);
      assert.ok(runtime.closeCodes.every(code => code === 1000 || (code >= 3000 && code <= 4999)));
      await act(async () => runtime.transport.stopLive(true));
      assert.equal(replacement.closed.code, 1000, "UI stop is a normal close");
    } finally { await mounted.unmount(); }
  });
}

test("D6: explicit session replacement retires old callbacks before creating the new socket", async () => {
  await withStreaming(async (runtime, socket) => {
    const callbacks = capturedCallbacks(socket);
    // Failure paths also invalidate/recover; cover the independent openLive handoff.
    await act(async () => runtime.protocolContext.transition("failed"));
    await openLive(runtime);
    assert.equal(socket.readyState, FakeWebSocket.CLOSING);
    assert.equal(socket.onmessage, null);
    const replacement = FakeWebSocket.instances.at(-1);
    await establish(replacement);await presentFrame(runtime);
    const before = observableState(runtime);
    await fireStaleCallbacks(callbacks, runtime);
    assert.deepEqual(observableState(runtime), before);
    assert.equal(runtime.maxActiveSockets, 1);
  });
});
