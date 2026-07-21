import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

import { useCloudBrowserFramePainter } from "../src/shell/cloud-browser-live.ts";

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
  url: "https://chat.oceanleo.com/workspace",
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

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const reactUrl = pathToFileURL(require.resolve("react")).href;
const browserStubUrl = dataModule(`
  export function cloudBrowserLiveUrl(sessionId) {
    return "wss://browser.test/" + encodeURIComponent(sessionId);
  }
  export function createCloudBrowserTicket(sessionId) {
    return globalThis.__cloudBrowserRaceRuntime.createTicket(sessionId);
  }
`);
const liveStubUrl = dataModule(`
  import { useCallback, useRef } from ${JSON.stringify(reactUrl)};

  export function useCloudBrowserFramePainter(options = {}) {
    const canvasRef = useRef(null);
    const frameSizeRef = useRef({ width: 1280, height: 720 });
    const cancelFrameDecode = useCallback((clearCanvas = false) => {
      const runtime = globalThis.__cloudBrowserRaceRuntime;
      runtime.cancelFrameDecodeCalls.push(clearCanvas);
    }, []);
    const acceptFrameMeta = useCallback(() => true, []);
    const drawBlobFrame = useCallback(() => true, []);
    globalThis.__cloudBrowserRaceRuntime.frameCallbacks = options;
    return {
      canvasRef,
      frameSizeRef,
      cancelFrameDecode,
      acceptFrameMeta,
      drawBlobFrame,
    };
  }
`);
const protocolStubUrl = dataModule(`
  export function handleCloudBrowserProtocolMessage(message, context) {
    const runtime = globalThis.__cloudBrowserRaceRuntime;
    runtime.protocolContext = context;
    if (message.t !== "hello") return;
    const serial = ++runtime.helloSerial;
    context.handshakeRef.current = true;
    context.runtimeVersionRef.current = "runtime-version-" + serial;
    context.connectionIdRef.current = "connection-" + serial;
    context.streamIdRef.current = "stream-" + serial;
    context.streamGenerationRef.current = serial;
    context.windowIdRef.current = "window-" + serial;
    context.helloFrameSequenceRef.current = 0;
    context.setProtocolVersion(3);
    context.transition("awaiting_first_frame");
    context.armFirstFrameTimeout();
  }
`);

const sourcePath = resolve("src/shell/cloud-browser-transport.ts");
let transportSource = await readFile(sourcePath, "utf8");
for (const [specifier, replacement] of Object.entries({
  react: reactUrl,
  "../lib/browser": browserStubUrl,
  "./cloud-browser-live": liveStubUrl,
  "./cloud-browser-protocol": protocolStubUrl,
  "./cloud-browser-transport-actions": pathToFileURL(
    resolve("src/shell/cloud-browser-transport-actions.ts"),
  ).href,
  "./cloud-browser-transport-config": pathToFileURL(
    resolve("src/shell/cloud-browser-transport-config.ts"),
  ).href,
  "./cloud-browser-transport-model": pathToFileURL(
    resolve("src/shell/cloud-browser-transport-model.ts"),
  ).href,
  "./cloud-browser-wire": pathToFileURL(
    resolve("src/shell/cloud-browser-wire.ts"),
  ).href,
})) {
  transportSource = transportSource.replaceAll(
    JSON.stringify(specifier),
    JSON.stringify(replacement),
  );
}
const compiledTransport = ts.transpileModule(transportSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;
const { useCloudBrowserTransport } = await import(
  dataModule(compiledTransport)
);

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

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
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.closed = { code, reason };
    this.onclose?.({ code, reason });
  }
}

function ticketResult(sessionId, serial) {
  return {
    ok: true,
    data: {
      ticket: `one-use-ticket-${serial}`,
      ticket_nonce: `ticket-nonce-${serial}`,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      expires_in: 60,
      protocol_version: 3,
      owner_principal: "user:test-owner",
      session_id: sessionId,
      runtime_id: `runtime-${sessionId}`,
      incarnation: serial,
      session_version: serial,
      binary_frames: true,
    },
  };
}

function createRuntime() {
  const clock = new FakeClock();
  const runtime = {
    clock,
    ticketCalls: [],
    ticketQueue: [],
    ticketSerial: 0,
    frameCallbacks: null,
    protocolContext: null,
    helloSerial: 0,
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
      return Promise.resolve(ticketResult(sessionId, serial));
    },
  };
  globalThis.__cloudBrowserRaceRuntime = runtime;
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
  window.setTimeout = clock.setTimeout.bind(clock);
  window.clearTimeout = clock.clearTimeout.bind(clock);
  window.setInterval = clock.setInterval.bind(clock);
  window.clearInterval = clock.clearInterval.bind(clock);
  return runtime;
}

async function mountTransport(runtime, initialSelectedId = "session-a") {
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
    socket.message(JSON.stringify({ t: "hello" }));
    await flushMicrotasks();
  });
}

async function rejectFrame(runtime, reason = "forced decode reject") {
  await act(async () => {
    runtime.frameCallbacks.onDecodeError(reason);
    await flushMicrotasks();
  });
}

async function tick(runtime, milliseconds) {
  await act(async () => {
    runtime.clock.tick(milliseconds);
    await flushMicrotasks();
  });
}

function authTickets() {
  return FakeWebSocket.instances.flatMap((socket) =>
    socket.sent.map((message) => JSON.parse(message).ticket),
  );
}

test("a delayed decode rejection from an invalidated generation is silent", async () => {
  const pendingDecodes = [];
  const decodeErrors = [];
  const presented = [];
  const closed = [];
  const previousCreateImageBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = () => {
    const pending = deferred();
    pendingDecodes.push(pending);
    return pending.promise;
  };

  let painter;
  function PainterHarness() {
    painter = useCloudBrowserFramePainter({
      onPresented(meta) {
        presented.push(meta.sequence);
      },
      onDecodeError(reason) {
        decodeErrors.push(reason);
      },
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(PainterHarness)));
    painter.canvasRef.current = {
      width: 0,
      height: 0,
      dataset: {},
      getContext() {
        return {
          clearRect() {},
          drawImage() {},
        };
      },
    };
    const frame = new Blob([Uint8Array.of(1)], { type: "image/jpeg" });
    const meta = (sequence) => ({
      width: 1,
      height: 1,
      byteLength: 1,
      sequence,
      actionSequence: 0,
      capturedAtMs: Date.now(),
      source: "native-chrome-window",
      paintState: "real",
      nativeChromeWindow: true,
    });

    assert.equal(painter.acceptFrameMeta(meta(1)), true);
    assert.equal(painter.drawBlobFrame(frame), true);
    assert.equal(pendingDecodes.length, 1);

    painter.cancelFrameDecode(false);
    assert.equal(painter.acceptFrameMeta(meta(2)), true);
    assert.equal(painter.drawBlobFrame(frame), true);
    pendingDecodes[0].reject(new Error("old generation failed"));
    await flushMicrotasks();

    assert.deepEqual(decodeErrors, []);
    assert.equal(pendingDecodes.length, 2);
    pendingDecodes[1].resolve({
      width: 1,
      height: 1,
      close() {
        closed.push(2);
      },
    });
    await flushMicrotasks();

    assert.deepEqual(decodeErrors, []);
    assert.deepEqual(presented, [2]);
    assert.deepEqual(closed, [2]);
  } finally {
    globalThis.createImageBitmap = previousCreateImageBitmap;
    await act(async () => root.unmount());
    container.remove();
  }
});

test("duplicate decode rejects share one pending recovery ticket", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const firstSocket = await openLive(runtime, "session-a");
    await establish(firstSocket);
    const pendingTicket = deferred();
    runtime.ticketQueue.push(pendingTicket.promise);

    await rejectFrame(runtime, "first reject");
    await tick(runtime, 1_000);
    assert.deepEqual(
      runtime.ticketCalls.map((call) => call.sessionId),
      ["session-a", "session-a"],
    );

    await rejectFrame(runtime, "duplicate while ticketing");
    await tick(runtime, 10_000);
    assert.equal(runtime.ticketCalls.length, 2);

    pendingTicket.resolve(ticketResult("session-a", 2));
    await act(async () => flushMicrotasks());
    assert.equal(FakeWebSocket.instances.length, 2);
    const recoveredSocket = FakeWebSocket.instances[1];
    await act(async () => recoveredSocket.open());
    assert.deepEqual(authTickets(), ["one-use-ticket-1", "one-use-ticket-2"]);
  } finally {
    await mounted.unmount();
  }
});

test("a stale recovery completion cannot clear a new generation attempt", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const firstSocket = await openLive(runtime, "session-a");
    await establish(firstSocket);
    const staleTicket = deferred();
    runtime.ticketQueue.push(staleTicket.promise);
    await rejectFrame(runtime, "session-a reject");
    await tick(runtime, 1_000);

    const secondSocket = await openLive(runtime, "session-b");
    await establish(secondSocket);
    await rejectFrame(runtime, "session-b reject");

    staleTicket.resolve(ticketResult("session-a", 2));
    await act(async () => flushMicrotasks());
    assert.equal(FakeWebSocket.instances.length, 2);

    await tick(runtime, 999);
    assert.equal(runtime.ticketCalls.length, 3);
    await tick(runtime, 1);
    assert.deepEqual(
      runtime.ticketCalls.map((call) => call.sessionId),
      ["session-a", "session-a", "session-b", "session-b"],
    );
    assert.equal(FakeWebSocket.instances.length, 3);
  } finally {
    await mounted.unmount();
  }
});

test("stop and selected-session changes cancel queued recovery", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    let socket = await openLive(runtime, "session-a");
    await establish(socket);
    await rejectFrame(runtime);
    await act(async () => runtime.transport.stopLive(true));
    await tick(runtime, 1_000);
    assert.equal(runtime.ticketCalls.length, 1);

    socket = await openLive(runtime, "session-a");
    await establish(socket);
    await rejectFrame(runtime);
    await mounted.render("session-b");
    await tick(runtime, 1_000);
    assert.equal(runtime.ticketCalls.length, 2);
    assert.equal(runtime.liveRequestedUpdates.at(-1), false);
  } finally {
    await mounted.unmount();
  }
});

test("a successful first frame invalidates recovery and resets its budget", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    let socket = await openLive(runtime, "session-a");
    await establish(socket);
    await rejectFrame(runtime, "first recovery");
    await tick(runtime, 1_000);
    assert.equal(runtime.ticketCalls.length, 2);

    socket = FakeWebSocket.instances.at(-1);
    await establish(socket);
    await act(async () => {
      runtime.frameCallbacks.onPresented({
        sequence: 1,
        actionSequence: 0,
        source: "native-chrome-window",
        paintState: "real",
        nativeChromeWindow: true,
      });
      await flushMicrotasks();
    });
    assert.equal(runtime.transport.transportState, "streaming");

    await rejectFrame(runtime, "post-paint recovery");
    await tick(runtime, 999);
    assert.equal(runtime.ticketCalls.length, 2);
    await tick(runtime, 1);
    assert.equal(runtime.ticketCalls.length, 3);
  } finally {
    await mounted.unmount();
  }
});

test("validation recovery uses exactly two fresh tickets at 1s and 3s", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    let socket = await openLive(runtime, "session-a");
    await establish(socket);

    await rejectFrame(runtime, "first recovery");
    await tick(runtime, 999);
    assert.equal(runtime.ticketCalls.length, 1);
    await tick(runtime, 1);
    assert.equal(runtime.ticketCalls.length, 2);
    socket = FakeWebSocket.instances.at(-1);
    await establish(socket);

    await rejectFrame(runtime, "second recovery");
    await tick(runtime, 2_999);
    assert.equal(runtime.ticketCalls.length, 2);
    await tick(runtime, 1);
    assert.equal(runtime.ticketCalls.length, 3);
    socket = FakeWebSocket.instances.at(-1);
    await establish(socket);

    await rejectFrame(runtime, "bounded terminal reject");
    await tick(runtime, 30_000);
    assert.equal(runtime.ticketCalls.length, 3);
    assert.equal(runtime.transport.transportState, "failed");
    assert.deepEqual(authTickets(), [
      "one-use-ticket-1",
      "one-use-ticket-2",
      "one-use-ticket-3",
    ]);
  } finally {
    await mounted.unmount();
  }
});
