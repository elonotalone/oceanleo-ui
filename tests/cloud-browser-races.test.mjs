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
import { CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS } from "../src/shell/cloud-browser-transport-actions.ts";
import {
  createCloudBrowserProtocolState,
  reduceCloudBrowserProtocolMessage,
} from "../src/shell/cloud-browser-transport-model.ts";
import {
  canSendCloudBrowserControlMutation,
  cloudBrowserV3Message,
  isAuthoritativeCloudBrowserHumanLease,
} from "../src/shell/cloud-browser-wire.ts";
import { buildCloudBrowserV3Fixture } from "./cloud-browser-wire-fixture.ts";

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
    const connectionId = "connection-" + serial;
    context.connectionIdRef.current = connectionId;
    context.streamIdRef.current = "stream-" + serial;
    context.streamGenerationRef.current = serial;
    context.windowIdRef.current = "window-" + serial;
    context.helloFrameSequenceRef.current = 0;
    const lease = runtime.helloLeases.shift() || {
      leaseId: "",
      epoch: serial + 3,
      holderKind: "free",
    };
    context.setCurrentLease(
      lease,
      lease.holderKind === "human" &&
        lease.leaseId.length > 0 &&
        lease.epoch > 0 &&
        lease.connectionId === connectionId,
    );
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

function authTickets() {
  return FakeWebSocket.instances.flatMap((socket) =>
    socket.sent.map((message) => JSON.parse(message).ticket),
  );
}

function sentMessages(socket, type) {
  return socket.sent
    .map((message) => JSON.parse(message))
    .filter((message) => message.t === type);
}

test("a delayed decode rejection from an invalidated generation is silent", async () => {
  const pendingDecodes = [];
  const decodeErrors = [];
  const presented = [];
  const dropped = [];
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
      onDropped(meta) {
        dropped.push(meta.sequence);
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
    assert.equal(
      pendingDecodes.length,
      2,
      "the current generation must not wait on a stale decode",
    );
    assert.deepEqual(dropped, [1]);
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

test("latest-value frame decoding keeps one pending frame", async () => {
  const pendingDecodes = [];
  const presented = [];
  const dropped = [];
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
      onDropped(meta) {
        dropped.push(meta.sequence);
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
    const frame = new Blob([Uint8Array.of(1)], {
      type: "image/jpeg",
    });
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

    for (const sequence of [1, 2, 3]) {
      assert.equal(painter.acceptFrameMeta(meta(sequence)), true);
      assert.equal(painter.drawBlobFrame(frame), true);
    }
    assert.equal(pendingDecodes.length, 1);
    assert.deepEqual(dropped, [2]);

    pendingDecodes[0].resolve({
      width: 1,
      height: 1,
      close() {},
    });
    await flushMicrotasks();
    assert.equal(pendingDecodes.length, 2);
    assert.deepEqual(dropped, [2, 1]);

    pendingDecodes[1].resolve({
      width: 1,
      height: 1,
      close() {},
    });
    await flushMicrotasks();
    assert.deepEqual(presented, [3]);
  } finally {
    globalThis.createImageBitmap = previousCreateImageBitmap;
    await act(async () => root.unmount());
    container.remove();
  }
});

test("a failed paint receipt retains the frame and reconnects", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const socket = await openLive(runtime, "session-a");
    await establish(socket);
    socket.bufferedAmount = 300 * 1024;

    await presentFrame(runtime);

    assert.equal(runtime.transport.hasCanvasFrame, true);
    assert.equal(runtime.transport.transportState, "reconnecting");
    assert.equal(socket.closed?.code, 1001);
    await tick(runtime, 499);
    assert.equal(runtime.ticketCalls.length, 1);
    await tick(runtime, 1);
    assert.equal(runtime.ticketCalls.length, 2);
  } finally {
    await mounted.unmount();
  }
});

test("heartbeat backpressure cannot leave a stale socket live", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const socket = await openLive(runtime, "session-a");
    await establish(socket);
    await presentFrame(runtime);
    socket.bufferedAmount = 300 * 1024;

    await tick(runtime, 15_000);

    assert.equal(runtime.transport.transportState, "reconnecting");
    assert.equal(runtime.transport.hasCanvasFrame, true);
    assert.equal(socket.closed?.code, 1001);
    assert.equal(runtime.ticketCalls.length, 1);
  } finally {
    await mounted.unmount();
  }
});

test("same-session open is idempotent while ticketing and connected", async () => {
  const runtime = createRuntime();
  const pendingTicket = deferred();
  runtime.ticketQueue.push(pendingTicket.promise);
  const mounted = await mountTransport(runtime);
  try {
    let firstOpen;
    let duplicateOpen;
    await act(async () => {
      firstOpen = runtime.transport.openLive("session-a");
      duplicateOpen = await runtime.transport.openLive("session-a");
      await flushMicrotasks();
    });

    assert.equal(duplicateOpen, true);
    assert.equal(runtime.ticketCalls.length, 1);
    assert.equal(FakeWebSocket.instances.length, 0);

    pendingTicket.resolve(ticketResult("session-a", 1));
    let firstResult;
    await act(async () => {
      firstResult = await firstOpen;
      await flushMicrotasks();
    });
    assert.equal(firstResult, true);
    assert.equal(runtime.ticketCalls.length, 1);
    assert.equal(FakeWebSocket.instances.length, 1);

    let connectedDuplicate;
    await act(async () => {
      connectedDuplicate = await runtime.transport.openLive("session-a");
      await flushMicrotasks();
    });
    assert.equal(connectedDuplicate, true);
    assert.equal(runtime.ticketCalls.length, 1);
    assert.equal(FakeWebSocket.instances.length, 1);
  } finally {
    await mounted.unmount();
  }
});

test("an expired ticket is replaced by a fresh bounded retry", async () => {
  const runtime = createRuntime();
  const expired = ticketResult("session-a", 1);
  expired.data.expires_at = new Date(Date.now() - 1).toISOString();
  runtime.ticketQueue.push(Promise.resolve(expired));
  const mounted = await mountTransport(runtime);
  try {
    let opened;
    await act(async () => {
      opened = await runtime.transport.openLive("session-a");
      await flushMicrotasks();
    });
    assert.equal(opened, false);
    assert.equal(runtime.transport.transportState, "reconnecting");
    assert.equal(FakeWebSocket.instances.length, 0);

    await tick(runtime, 499);
    assert.equal(runtime.ticketCalls.length, 1);
    await tick(runtime, 1);
    assert.equal(runtime.ticketCalls.length, 2);
    const socket = FakeWebSocket.instances.at(-1);
    await act(async () => socket.open());
    assert.deepEqual(authTickets(), ["one-use-ticket-2"]);
  } finally {
    await mounted.unmount();
  }
});

test("stale socket callbacks cannot disturb a fresh reconnect", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const staleSocket = await openLive(runtime, "session-a");
    await establish(staleSocket);
    await act(async () => staleSocket.close(1006, "network lost"));
    await tick(runtime, 500);

    const freshSocket = FakeWebSocket.instances.at(-1);
    await establish(freshSocket);
    const helloCount = runtime.helloSerial;
    const ticketCount = runtime.ticketCalls.length;

    staleSocket.onmessage?.({
      data: JSON.stringify({ t: "hello" }),
    });
    staleSocket.onclose?.({ code: 1006, reason: "late close" });
    await tick(runtime, 5_000);

    assert.equal(runtime.helloSerial, helloCount);
    assert.equal(runtime.ticketCalls.length, ticketCount);
    assert.equal(runtime.transport.transportState, "awaiting_first_frame");
  } finally {
    await mounted.unmount();
  }
});

test("takeover intent survives reconnect and sends only after paint", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const firstSocket = await openLive(runtime, "session-a");
    await establish(firstSocket);
    await presentFrame(runtime);
    assert.equal(runtime.transport.transportState, "streaming");

    await act(async () => firstSocket.close(1006, "network lost"));
    assert.equal(runtime.transport.hasCanvasFrame, true);
    await act(async () => runtime.transport.toggleControl());
    assert.equal(runtime.transport.controlPending, true);

    await tick(runtime, 500);
    const freshSocket = FakeWebSocket.instances.at(-1);
    await establish(freshSocket);
    assert.equal(
      freshSocket.sent
        .map((message) => JSON.parse(message).t)
        .includes("control.acquire"),
      false,
    );

    await presentFrame(runtime);
    const messages = freshSocket.sent.map((message) =>
      JSON.parse(message),
    );
    const presentedIndex = messages.findIndex(
      (message) => message.t === "frame.presented",
    );
    const acquireIndex = messages.findIndex(
      (message) => message.t === "control.acquire",
    );
    assert.ok(presentedIndex >= 0);
    assert.ok(acquireIndex > presentedIndex);
    assert.equal(messages[acquireIndex].connection_id, "connection-2");
    assert.equal(messages[acquireIndex].lease_epoch, 5);
    await act(async () => {
      runtime.protocolContext.reconcileControlIntent();
      runtime.protocolContext.reconcileControlIntent();
      await flushMicrotasks();
    });
    assert.equal(sentMessages(freshSocket, "control.acquire").length, 1);
  } finally {
    await mounted.unmount();
  }
});

test("agent-held lease hands off once across connection identities and gates input", async () => {
  const runtime = createRuntime();
  runtime.helloLeases.push({
    leaseId: "agent-lease-17",
    epoch: 17,
    holderKind: "agent",
    holderId: "agent:browser-task",
    connectionId: "agent-connection",
    expiresAt: "2099-01-01T00:00:00Z",
  });
  const mounted = await mountTransport(runtime);
  const pointer = {
    event: "down",
    nx: 0.25,
    ny: 0.75,
    button: "left",
    pointer_id: 1,
  };
  try {
    const socket = await openLive(runtime, "session-a");
    await establish(socket);

    assert.equal(runtime.transport.driving, false);
    assert.equal(runtime.transport.sendMutation("pointer", pointer), false);
    await act(async () => runtime.transport.toggleControl());
    assert.equal(runtime.transport.controlPending, true);
    assert.equal(sentMessages(socket, "control.acquire").length, 0);
    await presentFrame(runtime);
    await act(async () => {
      runtime.protocolContext.reconcileControlIntent();
      runtime.protocolContext.reconcileControlIntent();
      await flushMicrotasks();
    });

    const acquires = sentMessages(socket, "control.acquire");
    assert.equal(acquires.length, 1);
    assert.equal(acquires[0].lease_id, "agent-lease-17");
    assert.equal(acquires[0].lease_epoch, 17);
    assert.equal(acquires[0].connection_id, "connection-1");
    assert.equal(acquires[0].holder_kind, "human");
    assert.equal(runtime.transport.sendMutation("pointer", pointer), false);

    await act(async () => {
      runtime.protocolContext.setCurrentLease(
        {
          leaseId: "other-human-lease-18",
          epoch: 18,
          holderKind: "human",
          holderId: "user:other",
          connectionId: "other-human-connection",
        },
        true,
      );
      await flushMicrotasks();
    });
    assert.equal(runtime.transport.driving, false);
    assert.equal(runtime.transport.sendMutation("pointer", pointer), false);

    await act(async () => {
      runtime.protocolContext.controlIntentRef.current = "";
      runtime.protocolContext.setControlIntentSent(false);
      runtime.protocolContext.setControlPending(false);
      runtime.protocolContext.setCurrentLease(
        {
          leaseId: "human-lease-19",
          epoch: 19,
          holderKind: "human",
          holderId: "user:test-owner",
          connectionId: "connection-1",
          expiresAt: "2099-01-01T00:01:00Z",
        },
        true,
      );
      await flushMicrotasks();
    });
    assert.equal(runtime.transport.driving, true);
    assert.equal(runtime.transport.sendMutation("pointer", pointer), true);
    assert.equal(sentMessages(socket, "pointer").length, 1);
  } finally {
    await mounted.unmount();
  }
});

test("free lease sends exactly one fenced acquire", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const socket = await openLive(runtime, "session-a");
    await establish(socket);
    await presentFrame(runtime);
    await act(async () => {
      runtime.transport.toggleControl();
      runtime.protocolContext.reconcileControlIntent();
      runtime.protocolContext.reconcileControlIntent();
      await flushMicrotasks();
    });

    const acquires = sentMessages(socket, "control.acquire");
    assert.equal(acquires.length, 1);
    assert.equal(acquires[0].lease_id, "");
    assert.equal(acquires[0].lease_epoch, 4);
    assert.equal(acquires[0].connection_id, "connection-1");
  } finally {
    await mounted.unmount();
  }
});

test("reconnect emits one fresh fenced acquire without replaying its event identity", async () => {
  const runtime = createRuntime();
  runtime.helloLeases.push(
    {
      leaseId: "agent-lease-30",
      epoch: 30,
      holderKind: "agent",
      holderId: "agent:browser-task",
      connectionId: "agent-connection-a",
    },
    {
      leaseId: "agent-lease-31",
      epoch: 31,
      holderKind: "agent",
      holderId: "agent:browser-task",
      connectionId: "agent-connection-b",
    },
  );
  const mounted = await mountTransport(runtime);
  try {
    const firstSocket = await openLive(runtime, "session-a");
    await establish(firstSocket);
    await presentFrame(runtime);
    await act(async () => runtime.transport.toggleControl());
    const firstAcquire = sentMessages(
      firstSocket,
      "control.acquire",
    );
    assert.equal(firstAcquire.length, 1);

    await act(async () =>
      firstSocket.close(1006, "network lost before grant"),
    );
    await tick(runtime, 500);
    const freshSocket = FakeWebSocket.instances.at(-1);
    await establish(freshSocket);
    assert.equal(
      sentMessages(freshSocket, "control.acquire").length,
      0,
    );
    await presentFrame(runtime);

    const freshAcquire = sentMessages(
      freshSocket,
      "control.acquire",
    );
    assert.equal(freshAcquire.length, 1);
    assert.equal(freshAcquire[0].lease_id, "agent-lease-31");
    assert.equal(freshAcquire[0].lease_epoch, 31);
    assert.equal(freshAcquire[0].connection_id, "connection-2");
    assert.notEqual(
      freshAcquire[0].client_event_id,
      firstAcquire[0].client_event_id,
    );
  } finally {
    await mounted.unmount();
  }
});

test("takeover timeout cancels the old writer path without replay", async () => {
  const runtime = createRuntime();
  runtime.helloLeases.push({
    leaseId: "agent-lease-timeout",
    epoch: 21,
    holderKind: "agent",
    holderId: "agent:browser-task",
    connectionId: "agent-connection",
  });
  const mounted = await mountTransport(runtime);
  try {
    const socket = await openLive(runtime, "session-a");
    await establish(socket);
    await presentFrame(runtime);
    await act(async () => runtime.transport.toggleControl());
    assert.equal(sentMessages(socket, "control.acquire").length, 1);
    assert.equal(runtime.transport.controlPending, true);

    await tick(runtime, CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS - 1);
    assert.equal(runtime.transport.controlPending, true);
    await tick(runtime, 1);

    assert.equal(runtime.transport.controlPending, false);
    assert.equal(runtime.transport.driving, false);
    assert.equal(runtime.transport.transportState, "reconnecting");
    assert.equal(socket.closed?.code, 1001);
    assert.equal(sentMessages(socket, "control.acquire").length, 1);
    assert.equal(runtime.ticketCalls.length, 1);
  } finally {
    await mounted.unmount();
  }
});

test("explicit takeover cancellation closes the in-flight socket once", async () => {
  const runtime = createRuntime();
  runtime.helloLeases.push({
    leaseId: "agent-lease-cancel",
    epoch: 24,
    holderKind: "agent",
    holderId: "agent:browser-task",
    connectionId: "agent-connection",
  });
  const mounted = await mountTransport(runtime);
  try {
    const socket = await openLive(runtime, "session-a");
    await establish(socket);
    await presentFrame(runtime);
    await act(async () => runtime.transport.toggleControl());
    assert.equal(runtime.transport.controlPending, true);

    let cancelled;
    await act(async () => {
      cancelled = runtime.transport.cancelTakeover();
      await flushMicrotasks();
    });
    assert.equal(cancelled, true);
    assert.equal(runtime.transport.controlPending, false);
    assert.equal(runtime.transport.driving, false);
    assert.equal(socket.closed?.code, 1001);
    assert.equal(sentMessages(socket, "control.acquire").length, 1);
    assert.equal(sentMessages(socket, "control.release").length, 0);

    await tick(runtime, CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS);
    assert.equal(
      FakeWebSocket.instances.flatMap((item) =>
        sentMessages(item, "control.acquire"),
      ).length,
      1,
    );
  } finally {
    await mounted.unmount();
  }
});

test("an owned lease reconnects with one fenced reacquire after fresh paint", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const firstSocket = await openLive(runtime, "session-a");
    await establish(firstSocket);
    await presentFrame(runtime);
    await act(async () => {
      runtime.protocolContext.setCurrentLease(
        {
          leaseId: "human-lease-5",
          epoch: 5,
          holderKind: "human",
          holderId: "user:test-owner",
          connectionId: "connection-1",
          expiresAt: "2099-01-01T00:00:00Z",
        },
        true,
      );
      await flushMicrotasks();
    });
    assert.equal(runtime.transport.driving, true);

    await act(async () => firstSocket.close(1006, "network lost"));
    assert.equal(runtime.transport.controlPending, true);
    await tick(runtime, 500);

    const freshSocket = FakeWebSocket.instances.at(-1);
    await establish(freshSocket);
    assert.equal(
      freshSocket.sent.some(
        (raw) => JSON.parse(raw).t === "control.acquire",
      ),
      false,
    );

    await presentFrame(runtime);
    const acquires = freshSocket.sent
      .map((raw) => JSON.parse(raw))
      .filter((message) => message.t === "control.acquire");
    assert.equal(acquires.length, 1);
    assert.equal(acquires[0].connection_id, "connection-2");
    assert.equal(acquires[0].lease_epoch, 5);
  } finally {
    await mounted.unmount();
  }
});

test("offline pauses the retry budget and online resumes immediately", async () => {
  const runtime = createRuntime();
  const mounted = await mountTransport(runtime);
  try {
    const socket = await openLive(runtime, "session-a");
    await establish(socket);
    await presentFrame(runtime);

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await act(async () => window.dispatchEvent(new window.Event("offline")));
    assert.equal(runtime.transport.transportState, "reconnecting");
    assert.equal(runtime.transport.hasCanvasFrame, true);
    await tick(runtime, 30_000);
    assert.equal(runtime.ticketCalls.length, 1);

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await act(async () => window.dispatchEvent(new window.Event("online")));
    await tick(runtime, 0);
    assert.equal(runtime.ticketCalls.length, 2);
    assert.equal(FakeWebSocket.instances.length, 2);
  } finally {
    await mounted.unmount();
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

const PROTOCOL_FALLBACKS = {
  runtimeFailed: "runtime failed",
  operationFailed: "operation failed",
  protocolMismatch: "protocol mismatch",
  staleStream: "stale stream",
  leaseLost: "lease lost",
};

function streamingFixtureState() {
  const fixture = buildCloudBrowserV3Fixture(Date.now());
  const seeded = createCloudBrowserProtocolState({
    transportState: "authenticated",
    socketSessionId: fixture.ticket.session_id,
    sessionVersion: fixture.ticket.session_version,
    runtimeId: fixture.ticket.runtime_id,
    incarnation: fixture.ticket.incarnation,
    nonce: fixture.ticket.ticket_nonce,
  });
  const hello = reduceCloudBrowserProtocolMessage(
    seeded,
    fixture.hello,
    PROTOCOL_FALLBACKS,
  );
  assert.equal(hello.state.transportState, "awaiting_first_frame");
  return {
    fixture,
    state: { ...hello.state, transportState: "streaming" },
  };
}

test("lease loss can queue and reconcile a fenced reacquire", () => {
  const { fixture, state } = streamingFixtureState();
  const acquired = reduceCloudBrowserProtocolMessage(
    state,
    fixture.control_state,
    PROTOCOL_FALLBACKS,
  );
  assert.equal(acquired.state.leaseOwned, true);

  const lost = reduceCloudBrowserProtocolMessage(
    acquired.state,
    {
      ...cloudBrowserV3Message(fixture.binding, "control.state"),
      lease: {
        lease_id: "agent-lease-6",
        lease_epoch: 6,
        holder_kind: "agent",
        holder_id: "agent:browser-task",
        connection_id: fixture.binding.connectionId,
      },
      action_sequence: 11,
      callback_sequence: 8,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(lost.state.leaseOwned, false);
  assert.equal(lost.state.failureKind, "lease_lost");

  const free = reduceCloudBrowserProtocolMessage(
    {
      ...lost.state,
      controlPending: true,
      controlIntent: "acquire",
      controlIntentSent: false,
    },
    {
      ...cloudBrowserV3Message(fixture.binding, "control.state"),
      lease: {
        lease_id: "",
        lease_epoch: 7,
        holder_kind: "free",
      },
      action_sequence: 11,
      callback_sequence: 9,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(free.state.controlPending, true);
  assert.equal(free.state.controlIntent, "acquire");
  assert.ok(
    free.effects.some(
      (effect) => effect.type === "reconcile_control_intent",
    ),
  );

  const reacquired = reduceCloudBrowserProtocolMessage(
    { ...free.state, controlIntentSent: true },
    {
      ...cloudBrowserV3Message(fixture.binding, "control.state"),
      lease: {
        lease_id: "human-lease-8",
        lease_epoch: 8,
        holder_kind: "human",
        connection_id: fixture.binding.connectionId,
      },
      action_sequence: 12,
      callback_sequence: 10,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(reacquired.state.leaseOwned, true);
  assert.equal(reacquired.state.controlPending, false);
  assert.equal(reacquired.state.failureKind, null);
  assert.ok(
    reacquired.effects.some((effect) => effect.type === "clear_error"),
  );
});

test("an in-flight acquire is not duplicated by an intermediate lease update", () => {
  const { fixture, state: base } = streamingFixtureState();
  const pending = {
    ...base,
    controlPending: true,
    controlIntent: "acquire",
    controlIntentSent: true,
  };
  const reduced = reduceCloudBrowserProtocolMessage(
    pending,
    {
      ...cloudBrowserV3Message(fixture.binding, "control.state"),
      lease: {
        lease_id: "agent-lease-5",
        lease_epoch: 5,
        holder_kind: "agent",
        holder_id: "agent:browser-task",
        connection_id: "agent-connection",
      },
      action_sequence: pending.lastActionSequence + 1,
      callback_sequence: pending.lastCallbackSequence + 1,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(reduced.state.leaseOwned, false);
  assert.equal(reduced.state.controlPending, true);
  assert.equal(reduced.state.controlIntent, "acquire");
  assert.equal(reduced.state.controlIntentSent, true);
  assert.equal(
    reduced.effects.some(
      (effect) => effect.type === "reconcile_control_intent",
    ),
    false,
  );
});

test("a rejected acquire is explicit and cannot remain queued for replay", () => {
  const { fixture, state: base } = streamingFixtureState();
  const pending = {
    ...base,
    controlPending: true,
    controlIntent: "acquire",
    controlIntentSent: true,
  };
  const reduced = reduceCloudBrowserProtocolMessage(
    pending,
    {
      ...cloudBrowserV3Message(fixture.binding, "action.receipt"),
      action_sequence: pending.lastActionSequence + 1,
      client_event_id: "connection-fixture.4.11",
      status: "rejected",
      code: "STALE_LEASE",
      message: "browser control lease was superseded",
      callback_sequence: pending.lastCallbackSequence + 1,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(reduced.state.controlPending, false);
  assert.equal(reduced.state.controlIntent, "");
  assert.equal(reduced.state.controlIntentSent, false);
  assert.ok(
    reduced.effects.some(
      (effect) =>
        effect.type === "error" &&
        effect.message.endsWith("(STALE_LEASE)"),
    ),
  );
});

test("executor action.receipt null code/message does not tear down the lease", () => {
  // Production executor serializes optional receipt fields as JSON null.
  // Treating null like a bad string caused protocol_mismatch → reconnect →
  // 只读/spinner and left V2-04/V2-05 with byte-identical frames.
  const { fixture, state } = streamingFixtureState();
  const acquired = reduceCloudBrowserProtocolMessage(
    state,
    fixture.control_state,
    PROTOCOL_FALLBACKS,
  ).state;
  assert.equal(acquired.leaseOwned, true);
  const reduced = reduceCloudBrowserProtocolMessage(
    acquired,
    {
      ...cloudBrowserV3Message(fixture.binding, "action.receipt"),
      action_sequence: acquired.lastActionSequence + 1,
      client_event_id: "connection-fixture.5.12",
      status: "accepted",
      code: null,
      message: null,
      callback_sequence: acquired.lastCallbackSequence + 1,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(reduced.state.leaseOwned, true);
  assert.equal(reduced.state.failureKind, null);
  assert.equal(
    reduced.state.lastActionSequence,
    acquired.lastActionSequence + 1,
  );
  assert.equal(
    reduced.effects.some((effect) => effect.type === "reject"),
    false,
  );
});

test("canonical stale-lease errors revoke driving immediately", () => {
  const { fixture, state } = streamingFixtureState();
  const acquired = reduceCloudBrowserProtocolMessage(
    state,
    fixture.control_state,
    PROTOCOL_FALLBACKS,
  ).state;
  assert.equal(acquired.leaseOwned, true);

  const reduced = reduceCloudBrowserProtocolMessage(
    acquired,
    {
      ...cloudBrowserV3Message(fixture.binding, "error"),
      code: "STALE_LEASE",
      message: "browser control lease was superseded",
      action_sequence: acquired.lastActionSequence,
      callback_sequence: acquired.lastCallbackSequence + 1,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(reduced.state.leaseOwned, false);
  assert.equal(reduced.state.failureKind, "lease_lost");
  assert.ok(
    reduced.effects.some(
      (effect) =>
        effect.type === "error" && effect.kind === "lease_lost",
    ),
  );
});

test("agent handoff uses lease id and epoch without sharing connection identity", () => {
  const lease = {
    leaseId: "agent-lease",
    epoch: 7,
    holderKind: "agent",
    holderId: "agent:browser-task",
    connectionId: "connection-current",
  };
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      lease,
      false,
      "connection-current",
    ),
    true,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      lease,
      false,
      "human-connection",
    ),
    true,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      { ...lease, epoch: 0 },
      false,
      "human-connection",
    ),
    false,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      { ...lease, leaseId: "" },
      false,
      "human-connection",
    ),
    false,
  );
  assert.equal(
    isAuthoritativeCloudBrowserHumanLease(
      {
        ...lease,
        holderKind: "human",
        connectionId: "other-human-connection",
      },
      "human-connection",
    ),
    false,
  );
});

test("hibernation callbacks leave the live transport contract unchanged", () => {
  const { fixture, state } = streamingFixtureState();
  const reduced = reduceCloudBrowserProtocolMessage(
    state,
    {
      ...cloudBrowserV3Message(fixture.binding, "session.state"),
      state: "hibernated",
      reason: "retention policy",
      action_sequence: state.lastActionSequence,
      callback_sequence: state.lastCallbackSequence + 1,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(reduced.state.transportState, "streaming");
  assert.equal(reduced.state.handshake, true);
  assert.deepEqual(reduced.state.lease, state.lease);
  assert.deepEqual(reduced.effects, []);
});

test("backend error codes stay explicit without exposing diagnostic detail", () => {
  const { fixture, state } = streamingFixtureState();
  const reduced = reduceCloudBrowserProtocolMessage(
    state,
    {
      ...cloudBrowserV3Message(fixture.binding, "error"),
      code: "INTERNAL_STACK",
      message: "executor.py:417 database host=private",
      action_sequence: state.lastActionSequence,
      callback_sequence: state.lastCallbackSequence + 1,
    },
    PROTOCOL_FALLBACKS,
  );
  const effect = reduced.effects.find(
    (candidate) => candidate.type === "error",
  );
  assert.equal(
    effect?.message,
    `${PROTOCOL_FALLBACKS.operationFailed} (INTERNAL_STACK)`,
  );
  assert.doesNotMatch(effect?.message || "", /executor\.py|private/);
  assert.equal(effect?.diagnostic?.code, "INTERNAL_STACK");
  assert.equal(
    effect?.diagnostic?.message,
    "executor.py:417 database host=private",
  );
});

test("PERSISTENCE_UNAVAILABLE fails takeover without an automatic replay", () => {
  const { fixture, state: base } = streamingFixtureState();
  const state = {
    ...base,
    controlPending: true,
    controlIntent: "acquire",
    controlIntentSent: true,
  };
  const reduced = reduceCloudBrowserProtocolMessage(
    state,
    {
      ...cloudBrowserV3Message(fixture.binding, "error"),
      code: "PERSISTENCE_UNAVAILABLE",
      message: "browser control ledger is temporarily unavailable; retry takeover",
      action_sequence: state.lastActionSequence,
      callback_sequence: state.lastCallbackSequence + 1,
    },
    PROTOCOL_FALLBACKS,
  );
  assert.equal(reduced.state.controlPending, false);
  assert.equal(reduced.state.controlIntent, "");
  assert.equal(reduced.state.controlIntentSent, false);
  assert.equal(
    reduced.effects.some(
      (effect) => effect.type === "reconcile_control_intent",
    ),
    false,
  );
  assert.ok(
    reduced.effects.some(
      (effect) =>
        effect.type === "error" &&
        effect.message.endsWith("(PERSISTENCE_UNAVAILABLE)"),
    ),
  );
});
