import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import {
  CLOUD_BROWSER_EN,
  CLOUD_BROWSER_KEYS,
  CLOUD_BROWSER_ZH,
} from "../src/i18n/ui/messages/cloud-browser-copy-base.ts";
import { CLOUD_BROWSER_EASTERN } from "../src/i18n/ui/messages/cloud-browser-copy-eastern.ts";
import { CLOUD_BROWSER_WESTERN } from "../src/i18n/ui/messages/cloud-browser-copy-western.ts";
import {
  createCloudBrowserTextCommitGate,
  parseCloudBrowserFrameMeta,
  pointInContainedFrame,
  validateCloudBrowserFrameMeta,
} from "../src/shell/cloud-browser-live.ts";
import { normalizeCloudBrowserCheckpoints } from "../src/shell/cloud-browser-session-data.ts";
import {
  createCloudBrowserProtocolState,
  decodeCloudBrowserProtocolMessage,
  isCloudBrowserTransportTransitionLegal,
  reduceCloudBrowserProtocolMessage,
} from "../src/shell/cloud-browser-transport-model.ts";
import {
  CLOUD_BROWSER_MAX_CONTROL_BYTES,
  canSendCloudBrowserControlMutation,
  cloudBrowserAuthMessage,
  cloudBrowserV3FrameReceipt,
  cloudBrowserV3Message,
  validateCloudBrowserMutation,
  validateCloudBrowserTicket,
} from "../src/shell/cloud-browser-wire.ts";
import { buildCloudBrowserV3Fixture } from "./cloud-browser-wire-fixture.ts";

const protocolFallbacks = {
  runtimeFailed: "runtime failed",
  operationFailed: "operation failed",
  protocolMismatch: "protocol mismatch",
  staleStream: "stale stream",
  leaseLost: "lease lost",
};

const frameContract = {
  transport: "adjacent-binary",
  codec: "image/jpeg",
  source: "native-chrome-window",
  max_frame_bytes: 2 * 1024 * 1024,
  max_width: 1920,
  max_height: 1080,
};
const capabilities = {
  page_bookmark: true,
  session_checkpoint: true,
  clipboard: true,
  ime_composition: true,
  viewport_resize: true,
};

function ticket(now = Date.now()) {
  return {
    ticket: "one-use-ticket",
    ticket_nonce: "ticket-nonce",
    expires_at: new Date(now + 45_000).toISOString(),
    expires_in: 45,
    protocol_version: 3,
    owner_principal: "user:test-owner",
    session_id: "session",
    runtime_id: "runtime",
    incarnation: 7,
    session_version: 11,
    binary_frames: true,
  };
}

const binding = {
  sessionId: "session",
  sessionVersion: 11,
  runtimeId: "runtime",
  runtimeVersion: "chrome-window-r42",
  incarnation: 7,
  nonce: "ticket-nonce",
  connectionId: "connection",
  streamId: "stream",
  streamGeneration: 4,
  windowId: "window",
};

function seededState(overrides = {}) {
  return createCloudBrowserProtocolState({
    transportState: "authenticated",
    socketSessionId: binding.sessionId,
    sessionVersion: binding.sessionVersion,
    runtimeId: binding.runtimeId,
    incarnation: binding.incarnation,
    nonce: binding.nonce,
    ...overrides,
  });
}

function hello(overrides = {}) {
  return {
    ...cloudBrowserV3Message(binding, "hello"),
    frame_contract: frameContract,
    capabilities,
    window: {
      window_id: "window",
      app: "chromium",
      native_chrome: true,
      maximized: true,
      tab_strip: true,
      omnibox: true,
      width: 1280,
      height: 800,
      native_band_height: 87,
    },
    lease: {
      lease_id: "",
      lease_epoch: 3,
      holder_kind: "free",
    },
    tabs: [{ id: "tab", title: "Google", status: "ready" }],
    action_sequence: 8,
    callback_sequence: 3,
    ...overrides,
  };
}

function frameMeta(now = Date.now(), overrides = {}) {
  return {
    ...cloudBrowserV3Message(binding, "frame.meta"),
    frame_sequence: 41,
    action_sequence: 8,
    width: 1280,
    height: 800,
    byte_length: 34567,
    captured_at_ms: now - 25,
    codec: "image/jpeg",
    source: "native-chrome-window",
    paint_state: "real",
    native_chrome: {
      window_id: "window",
      tab_strip: true,
      omnibox: true,
      maximized: true,
    },
    ...overrides,
  };
}

const panelSource = readFileSync(
  new URL("../src/shell/CloudBrowserPanel.tsx", import.meta.url),
  "utf8",
);
const chromeSource = readFileSync(
  new URL("../src/shell/cloud-browser-chrome.tsx", import.meta.url),
  "utf8",
);
const historySource = readFileSync(
  new URL("../src/shell/cloud-browser-history-view.tsx", import.meta.url),
  "utf8",
);
const transportSource = readFileSync(
  new URL("../src/shell/cloud-browser-transport.ts", import.meta.url),
  "utf8",
);
const interactionSource = readFileSync(
  new URL("../src/shell/cloud-browser-interaction.ts", import.meta.url),
  "utf8",
);
const liveSource = readFileSync(
  new URL("../src/shell/cloud-browser-live.ts", import.meta.url),
  "utf8",
);
const protocolSource = readFileSync(
  new URL("../src/shell/cloud-browser-protocol.ts", import.meta.url),
  "utf8",
);
const modelSource = readFileSync(
  new URL("../src/shell/cloud-browser-transport-model.ts", import.meta.url),
  "utf8",
);
const wireSource = readFileSync(
  new URL("../src/shell/cloud-browser-wire.ts", import.meta.url),
  "utf8",
);
const sessionSource = readFileSync(
  new URL("../src/shell/cloud-browser-session-data.ts", import.meta.url),
  "utf8",
);

test("object-contain mapping targets the complete Chrome-window frame", () => {
  const bounds = { left: 10, top: 20, width: 1000, height: 1000 };
  const frame = { width: 1280, height: 800 };
  assert.equal(pointInContainedFrame(510, 100, bounds, frame), null);
  assert.deepEqual(
    pointInContainedFrame(10, 207.5, bounds, frame),
    { nx: 0, ny: 0 },
  );
  assert.deepEqual(
    pointInContainedFrame(1010, 832.5, bounds, frame),
    { nx: 1, ny: 1 },
  );
  assert.deepEqual(
    pointInContainedFrame(510, 520, bounds, frame),
    { nx: 0.5, ny: 0.5 },
  );
});

test("flat ticket and auth expose no executor-derived binding", () => {
  const now = Date.now();
  const valid = validateCloudBrowserTicket(ticket(now), "session", now);
  assert.equal(valid.ok, true);
  assert.equal("streamId" in valid.binding, false);
  assert.equal("windowId" in valid.binding, false);
  assert.equal("runtimeVersion" in valid.binding, false);
  const auth = cloudBrowserAuthMessage(ticket(now), "session", now);
  assert.equal(auth.ok, true);
  assert.deepEqual(auth.message, {
    v: 3,
    t: "auth",
    ticket: "one-use-ticket",
    ticket_nonce: "ticket-nonce",
    owner_principal: "user:test-owner",
    session_id: "session",
    runtime_id: "runtime",
    incarnation: 7,
    session_version: 11,
    binary_frames: true,
  });
  assert.doesNotMatch(
    JSON.stringify(auth.message),
    /protocol_versions|runtime_version|"nonce":|stream_id|window_id|frame_contract|capabilities/,
  );

  assert.equal(
    validateCloudBrowserTicket(
      { ...ticket(now), protocol_version: 2 },
      "session",
      now,
    ).reason,
    "protocol_mismatch",
  );
  assert.equal(
    validateCloudBrowserTicket(ticket(now), "other", now).reason,
    "session_mismatch",
  );
  const expired = ticket(now);
  expired.expires_at = new Date(now - 1).toISOString();
  assert.equal(
    validateCloudBrowserTicket(expired, "session", now).reason,
    "ticket_expired",
  );
  const leaked = ticket(now);
  leaked.stream_id = "not-known-before-hello";
  assert.equal(
    validateCloudBrowserTicket(leaked, "session", now).reason,
    "invalid_ticket",
  );
  const missingFence = ticket(now);
  delete missingFence.runtime_id;
  assert.equal(
    validateCloudBrowserTicket(missingFence, "session", now).reason,
    "invalid_ticket",
  );
  assert.doesNotMatch(wireSource, /protocol_versions/);
  assert.doesNotMatch(wireSource, /cloudBrowserV[12]Message|adoptLegacy/);
});

test("hello is bound to nonce, versions, lease, and native Chrome window", () => {
  const beforeHello = seededState();
  assert.equal(beforeHello.runtimeVersion, "");
  assert.equal(beforeHello.streamId, "");
  assert.equal(beforeHello.streamGeneration, 0);
  assert.equal(beforeHello.windowId, "");
  assert.equal(beforeHello.frameContract, null);
  const reduced = reduceCloudBrowserProtocolMessage(
    beforeHello,
    hello(),
    protocolFallbacks,
  );
  assert.equal(reduced.state.protocol, 3);
  assert.equal(reduced.state.handshake, true);
  assert.equal(reduced.state.transportState, "awaiting_first_frame");
  assert.equal(reduced.state.connectionId, "connection");
  assert.equal(reduced.state.runtimeVersion, "chrome-window-r42");
  assert.equal(reduced.state.streamId, "stream");
  assert.equal(reduced.state.windowId, "window");
  assert.equal(reduced.state.lastCallbackSequence, 3);
  assert.deepEqual(reduced.state.lease, {
    leaseId: "",
    epoch: 3,
    holderKind: "free",
    holderId: undefined,
    connectionId: undefined,
    expiresAt: undefined,
    privacyMode: false,
  });
  assert.equal(reduced.state.leaseOwned, false);
  assert.deepEqual(reduced.state.tabs, [
    { id: "tab", title: "Google", status: "ready" },
  ]);
  assert.ok(
    reduced.effects.some((effect) => effect.type === "arm_first_frame"),
  );

  for (const bad of [
    hello({ nonce: "stale" }),
    hello({ runtime_id: "stale-runtime" }),
    hello({ runtime_version: "" }),
    hello({
      window: {
        ...hello().window,
        omnibox: false,
      },
    }),
    hello({
      lease: {
        lease_id: "incoherent",
        lease_epoch: 3,
        holder_kind: "free",
      },
    }),
    hello({
      lease: {
        lease_id: "",
        lease_epoch: 3,
        holder_kind: "free",
        connection_id: "connection",
      },
    }),
    hello({
      lease: {
        lease_id: "",
        lease_epoch: 3,
        holder_kind: "human",
        connection_id: "connection",
      },
    }),
    hello({
      lease: {
        lease_id: "agent-lease",
        lease_epoch: 3,
        holder_kind: "agent",
      },
    }),
    { ...hello(), v: 2 },
    { ...hello(), unknown_binding: true },
  ]) {
    const rejected = reduceCloudBrowserProtocolMessage(
      seededState(),
      bad,
      protocolFallbacks,
    );
    assert.equal(rejected.state.transportState, "failed");
    assert.equal(rejected.state.failureKind, "protocol_mismatch");
  }
});

test("free lease acquires once while stale and agent-held fences fail closed", () => {
  const freeState = reduceCloudBrowserProtocolMessage(
    seededState(),
    hello(),
    protocolFallbacks,
  ).state;
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      freeState.lease,
      freeState.leaseOwned,
      binding.connectionId,
    ),
    true,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.renew",
      freeState.lease,
      freeState.leaseOwned,
      binding.connectionId,
    ),
    false,
  );
  assert.match(
    transportSource,
    /canSendCloudBrowserControlMutation\(\s*type,\s*currentLease,/,
  );
  assert.match(transportSource, /lease_id: currentLease\.leaseId/);
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      { ...freeState.lease, epoch: 0 },
      false,
      binding.connectionId,
    ),
    false,
  );

  const acquired = reduceCloudBrowserProtocolMessage(
    freeState,
    {
      ...cloudBrowserV3Message(binding, "control.state"),
      lease: {
        lease_id: "human-lease",
        lease_epoch: 4,
        holder_kind: "human",
        connection_id: binding.connectionId,
      },
      action_sequence: 9,
      callback_sequence: 4,
    },
    protocolFallbacks,
  );
  assert.equal(acquired.state.leaseOwned, true);
  assert.equal(acquired.state.lease.leaseId, "human-lease");
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      acquired.state.lease,
      acquired.state.leaseOwned,
      binding.connectionId,
    ),
    false,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.release",
      acquired.state.lease,
      acquired.state.leaseOwned,
      binding.connectionId,
    ),
    true,
  );
  const released = reduceCloudBrowserProtocolMessage(
    {
      ...acquired.state,
      controlPending: true,
      controlIntent: "release",
    },
    {
      ...cloudBrowserV3Message(binding, "control.state"),
      lease: {
        lease_id: "",
        lease_epoch: 5,
        holder_kind: "free",
      },
      action_sequence: 10,
      callback_sequence: 5,
    },
    protocolFallbacks,
  );
  assert.equal(released.state.leaseOwned, false);
  assert.equal(released.state.failureKind, null);
  assert.equal(
    released.effects.some(
      (effect) =>
        effect.type === "error" && effect.kind === "lease_lost",
    ),
    false,
  );

  const staleAcquire = reduceCloudBrowserProtocolMessage(
    freeState,
    {
      ...cloudBrowserV3Message(binding, "control.state"),
      lease: {
        lease_id: "stale-human-lease",
        lease_epoch: 3,
        holder_kind: "human",
        connection_id: binding.connectionId,
      },
      action_sequence: 9,
      callback_sequence: 4,
    },
    protocolFallbacks,
  );
  assert.equal(staleAcquire.state.transportState, "failed");
  assert.equal(staleAcquire.state.failureKind, "protocol_mismatch");

  const agentHeld = reduceCloudBrowserProtocolMessage(
    seededState(),
    hello({
      lease: {
        lease_id: "agent-lease",
        lease_epoch: 4,
        holder_kind: "agent",
        holder_id: "agent:browser-task",
        connection_id: "agent-connection",
      },
    }),
    protocolFallbacks,
  );
  assert.equal(agentHeld.state.handshake, true);
  assert.equal(agentHeld.state.leaseOwned, false);
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      agentHeld.state.lease,
      agentHeld.state.leaseOwned,
      binding.connectionId,
    ),
    false,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.renew",
      agentHeld.state.lease,
      agentHeld.state.leaseOwned,
      binding.connectionId,
    ),
    false,
  );
});

test("only a fresh real-paint native-window frame can reach paint gate", () => {
  const now = Date.now();
  const expectation = {
    binding,
    contract: frameContract,
    afterSequence: 40,
    minimumActionSequence: 8,
  };
  const valid = validateCloudBrowserFrameMeta(
    frameMeta(now),
    expectation,
    now,
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.meta.nativeChromeWindow, true);
  assert.equal(valid.meta.sequence, 41);
  assert.equal(parseCloudBrowserFrameMeta(frameMeta(now)).width, 1280);

  assert.equal(
    validateCloudBrowserFrameMeta(
      frameMeta(now, { frame_sequence: 40 }),
      expectation,
      now,
    ).reason,
    "stale_sequence",
  );
  assert.equal(
    validateCloudBrowserFrameMeta(
      frameMeta(now, { action_sequence: 7 }),
      expectation,
      now,
    ).reason,
    "stale_action",
  );
  assert.equal(
    validateCloudBrowserFrameMeta(
      frameMeta(now, { captured_at_ms: now - 20_000 }),
      expectation,
      now,
    ).reason,
    "stale_capture",
  );
  assert.equal(
    validateCloudBrowserFrameMeta(
      frameMeta(now, {
        native_chrome: {
          window_id: "window",
          tab_strip: true,
          omnibox: false,
          maximized: true,
        },
      }),
      expectation,
      now,
    ).reason,
    "native_chrome_missing",
  );
  assert.equal(
    validateCloudBrowserFrameMeta(
      frameMeta(now, {
        byte_length: frameContract.max_frame_bytes + 1,
      }),
      expectation,
      now,
    ).reason,
    "size_exceeded",
  );
  assert.equal(
    validateCloudBrowserFrameMeta(
      { ...frameMeta(now), unknown_field: true },
      expectation,
      now,
    ).reason,
    "invalid_schema",
  );

  const helloState = reduceCloudBrowserProtocolMessage(
    seededState(),
    hello(),
    protocolFallbacks,
  ).state;
  const metaState = reduceCloudBrowserProtocolMessage(
    helloState,
    frameMeta(now),
    protocolFallbacks,
    now,
  );
  assert.equal(metaState.state.transportState, "awaiting_first_frame");
  assert.equal(metaState.state.pendingBinary, true);
  assert.ok(
    metaState.effects.some(
      (effect) => effect.type === "accept_frame_meta",
    ),
  );
  const unpairedSecondMeta = reduceCloudBrowserProtocolMessage(
    metaState.state,
    frameMeta(now, { frame_sequence: 42 }),
    protocolFallbacks,
    now,
  );
  assert.equal(unpairedSecondMeta.state.transportState, "failed");
  assert.equal(unpairedSecondMeta.state.failureKind, "protocol_mismatch");
  assert.equal(
    (transportSource.match(/transition\("streaming"\)/g) || []).length,
    1,
    "only the validated frame-presented callback may become live",
  );
  assert.match(
    transportSource,
    /meta\.source !== "native-chrome-window"/,
  );
  assert.match(transportSource, /meta\.nativeChromeWindow/);
});

test("lease takeover invalidates ownership and stale receipts are dropped", () => {
  const state = {
    ...reduceCloudBrowserProtocolMessage(
      seededState(),
      hello({
        lease: {
          lease_id: "lease-human",
          lease_epoch: 5,
          holder_kind: "human",
          connection_id: "connection",
        },
      }),
      protocolFallbacks,
    ).state,
    lastActionSequence: 12,
  };
  assert.equal(state.leaseOwned, true);
  const takeover = reduceCloudBrowserProtocolMessage(
    state,
    {
      ...cloudBrowserV3Message(binding, "control.state"),
      lease: {
        lease_id: "lease-other",
        lease_epoch: 6,
        holder_kind: "human",
        connection_id: "other-connection",
      },
      action_sequence: 13,
      callback_sequence: 4,
    },
    protocolFallbacks,
  );
  assert.equal(takeover.state.leaseOwned, false);
  assert.equal(takeover.state.failureKind, "lease_lost");
  assert.ok(
    takeover.effects.some(
      (effect) =>
        effect.type === "error" && effect.kind === "lease_lost",
    ),
  );

  const staleReceipt = reduceCloudBrowserProtocolMessage(
    takeover.state,
    {
      ...cloudBrowserV3Message(binding, "action.receipt"),
      action_sequence: 12,
      client_event_id: "connection.5.12",
      status: "accepted",
      callback_sequence: 5,
    },
    protocolFallbacks,
  );
  assert.deepEqual(staleReceipt.state, takeover.state);
  assert.match(transportSource, /const fence = currentFence\(\)/);
  assert.match(
    transportSource,
    /fence !== currentFence\(\) \|\| !sendRaw\(message, fence\)/,
  );
  assert.match(transportSource, /lease_epoch:/);
  assert.match(transportSource, /action_sequence:/);
  assert.match(transportSource, /client_event_id:/);
  assert.match(transportSource, /!leaseOwnedRef\.current/);
  assert.match(
    transportSource,
    /canSendCloudBrowserControlMutation\(/,
  );
  assert.doesNotMatch(
    transportSource,
    /inputQueue|pendingInputs|replayInput|retryMutation/,
  );
});

test("frame receipts and latest-value decoding provide bounded backpressure", () => {
  const receipt = cloudBrowserV3FrameReceipt(
    binding,
    "frame.presented",
    41,
    24,
  );
  assert.equal(receipt.frame_sequence, 41);
  assert.equal(receipt.action_sequence, 24);
  assert.equal(receipt.runtime_version, binding.runtimeVersion);
  assert.equal(receipt.stream_generation, binding.streamGeneration);
  assert.equal("lease_id" in receipt, false);
  assert.equal("lease_epoch" in receipt, false);
  assert.equal("client_event_id" in receipt, false);
  assert.match(transportSource, /"frame\.received"/);
  assert.match(transportSource, /"frame\.dropped"/);
  assert.match(transportSource, /"frame\.presented"/);
  assert.match(transportSource, /cloudBrowserV3FrameReceipt/);
  assert.match(transportSource, /MAX_SOCKET_BUFFER_BYTES/);
  assert.match(liveSource, /pendingBlobFrameRef\.current = null/);
  assert.match(
    liveSource,
    /newer\.meta\.sequence > pending\.meta\.sequence/,
  );
  assert.match(liveSource, /latest-frame-backpressure|onDropped/);
  assert.match(modelSource, /state\.pendingBinary/);
  assert.match(modelSource, /afterSequence: state\.lastFrameSequence/);
});

test("executable fixture covers canonical hello, UI mutations, and receipts", () => {
  const fixture = buildCloudBrowserV3Fixture(Date.now());
  assert.deepEqual(Object.keys(fixture.auth).sort(), [
    "binary_frames",
    "incarnation",
    "owner_principal",
    "runtime_id",
    "session_id",
    "session_version",
    "t",
    "ticket",
    "ticket_nonce",
    "v",
  ]);
  assert.equal(fixture.hello.runtime_version, "chrome-window-r42");
  assert.equal(fixture.hello.stream_id, "stream-fixture");
  assert.equal(fixture.hello.window_id, "window-fixture");
  assert.deepEqual(fixture.hello.lease, {
    lease_id: "",
    lease_epoch: 4,
    holder_kind: "free",
  });
  assert.equal(fixture.frame_meta.paint_state, "real");
  assert.equal(fixture.frame_meta.action_sequence, 10);
  assert.equal(fixture.messages[0].t, "control.acquire");
  assert.equal(fixture.messages[0].lease_id, "");
  assert.equal(fixture.messages[0].lease_epoch, 4);
  assert.equal(fixture.messages[0].action_sequence, 11);
  assert.deepEqual(fixture.control_state.lease, {
    lease_id: "lease-fixture",
    lease_epoch: 5,
    holder_kind: "human",
    connection_id: "connection-fixture",
  });
  assert.equal(fixture.control_state.action_sequence, 11);
  assert.equal(fixture.control_state.callback_sequence, 7);
  assert.deepEqual(
    fixture.messages.map((message) => message.t),
    [
      "control.acquire",
      "pointer",
      "wheel",
      "key",
      "text.commit",
      "composition.start",
      "composition.update",
      "composition.end",
      "clipboard.paste",
      "focus",
      "viewport.set",
      "page.bookmark",
      "checkpoint.create",
      "control.renew",
      "control.release",
    ],
  );
  assert.equal(
    fixture.messages
      .slice(1)
      .every(
        (message) =>
          message.lease_id === "lease-fixture" &&
          message.lease_epoch === 5,
      ),
    true,
  );
  assert.deepEqual(
    fixture.receipts.map((message) => message.t),
    ["frame.received", "frame.dropped", "frame.presented"],
  );
  assert.equal(
    fixture.receipts.every(
      (message) =>
        message.action_sequence === fixture.frame_meta.action_sequence &&
        !("lease_id" in message) &&
        !("client_event_id" in message),
    ),
    true,
  );
  assert.deepEqual(
    fixture.messages.map((message) => message.action_sequence),
    Array.from({ length: 15 }, (_, index) => index + 11),
  );
  assert.ok(
    fixture.control_state.callback_sequence >
      fixture.hello.callback_sequence,
  );
  assert.deepEqual(
    fixture.flow
      .filter((item) => "message" in item)
      .map((item) => item.message.t),
    [
      "hello",
      "frame.meta",
      "frame.received",
      "frame.presented",
      "control.acquire",
      "control.state",
      "pointer",
      "wheel",
      "key",
      "text.commit",
      "composition.start",
      "composition.update",
      "composition.end",
      "clipboard.paste",
      "focus",
      "viewport.set",
      "page.bookmark",
      "checkpoint.create",
      "control.renew",
      "control.release",
    ],
  );
  assert.equal("legacy" in fixture, false);
});

test("window input, IME, focus, and clipboard contracts are bounded", () => {
  const gate = createCloudBrowserTextCommitGate();
  const compositionId = gate.compositionStart();
  assert.match(compositionId, /^composition-/);
  assert.deepEqual(gate.compositionUpdate("中文"), {
    text: "中文",
    compositionId,
  });
  const commit = gate.compositionEnd("中文输入かな한글🙂");
  assert.equal(commit.text, "中文输入かな한글🙂");
  assert.equal(commit.compositionId, compositionId);
  assert.equal(
    gate.input("insertText", commit.text, commit.text),
    null,
    "composition input echo must not commit twice",
  );
  assert.equal(gate.paste("粘贴 once").text, "粘贴 once");
  assert.equal(
    gate.beforeInput("insertFromPaste", "粘贴 once"),
    null,
  );

  assert.equal(
    validateCloudBrowserMutation("pointer", {
      event: "down",
      nx: 0.5,
      ny: 0.25,
      button: "left",
      pointer_id: 1,
    }),
    true,
  );
  assert.equal(
    validateCloudBrowserMutation("wheel", {
      nx: 0.5,
      ny: 0.5,
      dx: 0,
      dy: 2001,
    }),
    false,
  );
  assert.equal(
    validateCloudBrowserMutation("pointer", {
      event: "move",
      nx: 0.5,
      ny: 0.5,
      x: 640,
      y: 400,
      button: "",
      pointer_id: 1,
    }),
    false,
  );
  for (const type of [
    "composition.start",
    "composition.update",
    "composition.end",
  ]) {
    assert.equal(
      validateCloudBrowserMutation(type, {
        composition_id: compositionId,
        text: "中文",
      }),
      true,
    );
  }
  assert.equal(
    validateCloudBrowserMutation("clipboard.paste", {
      composition_id: "paste",
      text: "x".repeat(40_000),
    }),
    false,
  );
  assert.equal(
    validateCloudBrowserMutation("page.bookmark", { url: "alias" }),
    false,
  );
  assert.match(interactionSource, /event\.key\.toLowerCase\(\) === "v"/);
  assert.doesNotMatch(interactionSource, /openOmnibox|nav\.open/);
  assert.match(interactionSource, /"focus"/);
  assert.match(interactionSource, /"clipboard\.paste"/);
  assert.match(interactionSource, /"composition\.start"/);
  assert.match(interactionSource, /"composition\.update"/);
  assert.match(interactionSource, /"composition\.end"/);
});

test("the panel has one session row and no synthetic browser controls", () => {
  const combined = `${panelSource}\n${chromeSource}`;
  assert.match(chromeSource, /data-cloud-browser-session-row/);
  assert.match(panelSource, /data-cloud-browser-native-window/);
  assert.match(
    panelSource,
    /直接操作画面内的标签栏和地址栏/,
  );
  assert.doesNotMatch(chromeSource, /role="tab"|role="tablist"/);
  assert.doesNotMatch(
    combined,
    /data-cloud-browser-tabs|data-cloud-browser-omnibox|data-cloud-browser-new-tab/,
  );
  assert.doesNotMatch(
    chromeSource,
    /onNavigate|onCreateTab|onActivateTab|onCloseTab|omnibox/,
  );
  assert.doesNotMatch(
    chromeSource,
    />\s*[←→↻＋]\s*</,
  );
  assert.match(chromeSource, /收藏当前页面/);
  assert.match(chromeSource, /会话快照与恢复/);
  assert.match(chromeSource, /data-cloud-browser-more/);
});

test("lifecycle success reloads the durable session before ticketing", () => {
  assert.match(
    panelSource,
    /session\.upsertSession\(created\);[\s\S]*?await session\.reload\(created\.id\);[\s\S]*?await transport\.openLive\(created\.id\);/,
  );
  assert.match(
    panelSource,
    /await session\.reload\(session\.selectedId\);[\s\S]*?await transport\.openLive\(session\.selectedId\);/,
  );
  assert.match(
    panelSource,
    /await session\.reload\(selectedId\);[\s\S]*?await session\.refreshCheckpoints\(\);[\s\S]*?await transport\.openLive\(selectedId\);/,
  );
});

test("checkpoint cards are durable pins rather than screenshot history", () => {
  const items = normalizeCloudBrowserCheckpoints(
    [
      {
        id: "new",
        session_id: "session",
        generation: 3,
        created_at: "2026-07-20T03:00:00.000Z",
        page_title: "New",
        page_url: "https://example.com/new",
        state: "warm",
        session_version: 9,
        runtime_version: "runtime-r2",
      },
      {
        id: "old",
        session_id: "session",
        generation: 2,
        created_at: "2026-07-20T02:00:00.000Z",
        page_title: "Old",
        page_url: "https://example.com/old",
        state: "restored",
        session_version: 8,
        runtime_version: "runtime-r1",
      },
    ],
    "session",
  );
  assert.deepEqual(
    items.map((item) => item.generation),
    [3, 2],
  );
  assert.equal(
    normalizeCloudBrowserCheckpoints(
      [items[0], { ...items[0], id: "duplicate" }],
      "session",
    ),
    null,
  );
  assert.match(historySource, /不是屏幕截图/);
  assert.match(historySource, /checkpoint\.generation/);
  assert.match(historySource, /checkpoint\.session_version/);
  assert.match(historySource, /checkpoint\.runtime_version/);
  assert.match(historySource, /data-cloud-browser-restore-error/);
  assert.match(historySource, /确认恢复此会话快照/);
  assert.doesNotMatch(
    `${panelSource}\n${historySource}\n${sessionSource}`,
    /cloudBrowserScreenshot|has_screenshot|<img/,
  );
});

test("immersive mode isolates shell chrome and auto-hides only the session row", () => {
  assert.match(
    interactionSource,
    /isolateCloudBrowserImmersiveRoot/,
  );
  assert.match(interactionSource, /sibling\.inert = true/);
  assert.match(interactionSource, /item\.element\.inert = item\.inert/);
  assert.match(
    interactionSource,
    /document\.documentElement\.dataset\.cloudBrowserImmersive/,
  );
  assert.match(interactionSource, /root\.requestFullscreen\(\)/);
  assert.match(interactionSource, /"fallback"/);
  assert.match(interactionSource, /new ResizeObserver\(schedule\)/);
  assert.match(chromeSource, /data-cloud-browser-auto-hidden/);
  assert.match(chromeSource, /motion-reduce:transition-none/);
  assert.match(panelSource, /fixed inset-0 z-\[2147483647\]/);
});

test("oversized control messages and illegal transitions fail closed", () => {
  assert.equal(decodeCloudBrowserProtocolMessage("{").ok, false);
  assert.equal(decodeCloudBrowserProtocolMessage([]).ok, false);
  assert.equal(
    decodeCloudBrowserProtocolMessage(
      JSON.stringify({
        t: "error",
        data: "x".repeat(CLOUD_BROWSER_MAX_CONTROL_BYTES),
      }),
    ).reason,
    "message_too_large",
  );
  assert.equal(
    isCloudBrowserTransportTransitionLegal(
      "authenticated",
      "awaiting_first_frame",
    ),
    true,
  );
  assert.equal(
    isCloudBrowserTransportTransitionLegal("authenticated", "streaming"),
    false,
  );
  assert.equal(
    isCloudBrowserTransportTransitionLegal("streaming", "ticketing"),
    false,
  );
});

test("every locale has all direct cloud-browser copy without Chinese fallback", () => {
  const CLOUD_BROWSER_MESSAGES = {
    zh: CLOUD_BROWSER_ZH,
    en: CLOUD_BROWSER_EN,
    ...Object.fromEntries(
      Object.entries({
        ...CLOUD_BROWSER_WESTERN,
        ...CLOUD_BROWSER_EASTERN,
      }).map(([locale, overrides]) => [
        locale,
        { ...CLOUD_BROWSER_EN, ...overrides },
      ]),
    ),
  };
  const usedKeys = [
    panelSource,
    chromeSource,
    historySource,
    transportSource,
    protocolSource,
    interactionSource,
    sessionSource,
  ].flatMap((source) =>
    [...source.matchAll(/(?:context\.)?tt\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    ),
  );
  assert.deepEqual(
    [...new Set(usedKeys)].filter(
      (key) => !CLOUD_BROWSER_KEYS.includes(key),
    ),
    [],
    "direct cloud-browser copy must be registered",
  );
  for (const locale of LOCALES) {
    const dictionary = CLOUD_BROWSER_MESSAGES[locale];
    for (const key of CLOUD_BROWSER_KEYS) {
      assert.equal(
        typeof dictionary[key],
        "string",
        `${locale} missing ${key}`,
      );
      assert.ok(dictionary[key].length > 0, `${locale} empty ${key}`);
      if (locale !== "zh" && locale !== "zh-TW") {
        assert.notEqual(
          dictionary[key],
          key,
          `${locale} leaked Chinese fallback for ${key}`,
        );
      }
    }
  }
  assert.equal(CLOUD_BROWSER_MESSAGES.en["收藏当前页面"], "Bookmark current page");
  assert.equal(CLOUD_BROWSER_MESSAGES.zh["开机"], "开机");
});
