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
  MAX_CLOUD_BROWSER_SESSION_TITLE_LENGTH,
  renameCloudBrowserSession,
} from "../src/lib/browser.ts";
import {
  createCloudBrowserTextCommitGate,
  parseCloudBrowserFrameMeta,
  playwrightKey,
  pointInContainedFrame,
  validateCloudBrowserFrameMeta,
} from "../src/shell/cloud-browser-live.ts";
import {
  cloudBrowserSessionNeedsResume,
  formatCloudBrowserLifecycleError,
  normalizeCloudBrowserCheckpoints,
  resolveCloudBrowserSessionSelection,
} from "../src/shell/cloud-browser-session-data.ts";
import {
  CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS,
  createCloudBrowserTransportActions,
} from "../src/shell/cloud-browser-transport-actions.ts";
import {
  createCloudBrowserProtocolState,
  decodeCloudBrowserProtocolMessage,
  isCloudBrowserTransportTransitionLegal,
  planCloudBrowserLiveRecovery,
  reduceCloudBrowserProtocolMessage,
} from "../src/shell/cloud-browser-transport-model.ts";
import { handleCloudBrowserProtocolMessage } from "../src/shell/cloud-browser-protocol.ts";
import {
  FIRST_FRAME_TIMEOUT_MS,
  LIVE_RECOVERY_DELAYS_MS,
} from "../src/shell/cloud-browser-transport-config.ts";
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
  max_width: 1280,
  max_height: 800,
};
const capabilities = {
  page_bookmark: true,
  session_checkpoint: true,
  clipboard: true,
  ime_composition: true,
  viewport_resize: false,
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
  runtimeVersion: "native-chrome-window-v3-test",
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

function streamRebind(
  currentBinding = binding,
  overrides = {},
) {
  return {
    ...cloudBrowserV3Message(currentBinding, "stream.rebind"),
    previous_stream_id: currentBinding.streamId,
    previous_stream_generation: currentBinding.streamGeneration,
    next_stream_id: `${currentBinding.streamId}-next`,
    next_stream_generation: currentBinding.streamGeneration + 1,
    active_tab_id: "tab-next",
    action_sequence: 8,
    callback_sequence: 4,
    ...overrides,
  };
}

const panelSource = readFileSync(
  new URL("../src/shell/CloudBrowserPanel.tsx", import.meta.url),
  "utf8",
);
const powerPromptSource = readFileSync(
  new URL("../src/shell/cloud-browser-power-prompt.tsx", import.meta.url),
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

test("flat auth advertises rebind without executor-derived binding", () => {
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
    client_capabilities: {
      stream_rebind: true,
    },
  });
  assert.doesNotMatch(
    JSON.stringify(auth.message),
    /protocol_versions|runtime_version|"nonce":|stream_id|window_id|frame_contract/,
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
  assert.equal(
    reduced.state.runtimeVersion,
    "native-chrome-window-v3-test",
  );
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
    hello({ runtime_version: "chrome-window-r42" }),
    hello({
      frame_contract: {
        ...frameContract,
        max_width: 1920,
      },
    }),
    hello({
      capabilities: {
        ...capabilities,
        clipboard: false,
      },
    }),
    hello({
      window: {
        ...hello().window,
        omnibox: false,
      },
    }),
    hello({
      window: {
        ...hello().window,
        width: 1279,
      },
    }),
    hello({
      window: {
        ...hello().window,
        native_band_height: 88,
      },
    }),
    hello({ tabs: [] }),
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

test("free and current agent leases acquire while stale fences fail closed", () => {
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
  const saved = reduceCloudBrowserProtocolMessage(
    acquired.state,
    {
      ...cloudBrowserV3Message(binding, "checkpoint.saved"),
      checkpoint_id: "checkpoint-ready",
      generation: 4,
      created_at: "2026-07-20T13:00:00Z",
      page_title: "Example",
      page_url: "https://example.com/",
      state: "ready",
      action_sequence: 9,
      callback_sequence: 5,
    },
    protocolFallbacks,
  );
  assert.equal(saved.state.transportState, acquired.state.transportState);
  assert.ok(
    saved.effects.some((effect) => effect.type === "refresh_checkpoints"),
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
  assert.equal(agentHeld.state.lease.leaseId, "agent-lease");
  assert.equal(agentHeld.state.lease.epoch, 4);
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      agentHeld.state.lease,
      agentHeld.state.leaseOwned,
      binding.connectionId,
    ),
    true,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      { ...agentHeld.state.lease, leaseId: "" },
      agentHeld.state.leaseOwned,
      binding.connectionId,
    ),
    false,
  );
  assert.equal(
    canSendCloudBrowserControlMutation(
      "control.acquire",
      { ...agentHeld.state.lease, epoch: 0 },
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

test("tab create and close rebind stream while human takeover remains owned", () => {
  const owned = reduceCloudBrowserProtocolMessage(
    seededState(),
    hello({
      lease: {
        lease_id: "human-lease",
        lease_epoch: 5,
        holder_kind: "human",
        holder_id: "user:test-owner",
        connection_id: binding.connectionId,
        expires_at: "2099-01-01T00:00:00+00:00",
        privacy_mode: true,
      },
    }),
    protocolFallbacks,
  ).state;
  const before = {
    ...owned,
    transportState: "streaming",
    helloFrameSequence: 1,
    lastFrameSequence: 41,
    controlPending: true,
    controlIntent: "release",
    controlIntentSent: true,
  };
  const leaseBefore = before.lease;
  const opened = reduceCloudBrowserProtocolMessage(
    before,
    streamRebind(),
    protocolFallbacks,
  );

  assert.equal(opened.state.streamId, "stream-next");
  assert.equal(opened.state.streamGeneration, 5);
  assert.equal(opened.state.transportState, "awaiting_first_frame");
  assert.equal(opened.state.helloFrameSequence, 0);
  assert.equal(opened.state.lastFrameSequence, 0);
  assert.equal(opened.state.pendingBinary, false);
  assert.strictEqual(opened.state.lease, leaseBefore);
  assert.equal(opened.state.leaseOwned, true);
  assert.equal(opened.state.controlPending, true);
  assert.equal(opened.state.controlIntent, "release");
  assert.equal(opened.state.controlIntentSent, true);
  assert.deepEqual(
    opened.effects.map((effect) => effect.type),
    ["reset_stream_paint", "arm_first_frame"],
  );
  assert.equal(
    opened.effects.some(
      (effect) =>
        effect.type === "reject" ||
        effect.type === "reconcile_control_intent",
    ),
    false,
  );

  const openedBinding = {
    ...binding,
    streamId: "stream-next",
    streamGeneration: 5,
  };
  const newFrame = reduceCloudBrowserProtocolMessage(
    opened.state,
    frameMeta(Date.now(), {
      stream_id: openedBinding.streamId,
      stream_generation: openedBinding.streamGeneration,
      frame_sequence: 1,
      action_sequence: 8,
    }),
    protocolFallbacks,
  );
  assert.equal(newFrame.state.pendingBinary, true);
  assert.equal(newFrame.state.lastFrameSequence, 1);

  const newStreamControl = reduceCloudBrowserProtocolMessage(
    opened.state,
    {
      ...cloudBrowserV3Message(openedBinding, "control.state"),
      lease: {
        lease_id: "human-lease",
        lease_epoch: 5,
        holder_kind: "human",
        holder_id: "user:test-owner",
        connection_id: binding.connectionId,
        expires_at: "2099-01-01T00:00:00+00:00",
        privacy_mode: true,
      },
      action_sequence: 8,
      callback_sequence: 5,
    },
    protocolFallbacks,
  );
  assert.equal(newStreamControl.state.leaseOwned, true);
  assert.deepEqual(newStreamControl.state.lease, leaseBefore);

  const staleOldFrame = reduceCloudBrowserProtocolMessage(
    opened.state,
    frameMeta(),
    protocolFallbacks,
  );
  assert.equal(staleOldFrame.state.transportState, "failed");
  assert.equal(staleOldFrame.state.failureKind, "protocol_mismatch");
  const staleOldControl = reduceCloudBrowserProtocolMessage(
    opened.state,
    {
      ...cloudBrowserV3Message(binding, "control.state"),
      lease: {
        lease_id: "human-lease",
        lease_epoch: 5,
        holder_kind: "human",
        connection_id: binding.connectionId,
      },
      action_sequence: 8,
      callback_sequence: 5,
    },
    protocolFallbacks,
  );
  assert.equal(staleOldControl.state.transportState, "failed");
  assert.equal(staleOldControl.state.failureKind, "protocol_mismatch");
  const replay = reduceCloudBrowserProtocolMessage(
    opened.state,
    streamRebind(),
    protocolFallbacks,
  );
  assert.equal(replay.state.transportState, "failed");

  const closeReady = {
    ...newFrame.state,
    pendingBinary: false,
    transportState: "streaming",
  };
  const closed = reduceCloudBrowserProtocolMessage(
    closeReady,
    streamRebind(openedBinding, {
      next_stream_id: "stream-returned-tab",
      active_tab_id: "tab",
      action_sequence: 8,
      callback_sequence: 5,
    }),
    protocolFallbacks,
  );
  assert.equal(closed.state.streamId, "stream-returned-tab");
  assert.equal(closed.state.streamGeneration, 6);
  assert.equal(closed.state.leaseOwned, true);
  assert.strictEqual(closed.state.lease, leaseBefore);
  assert.equal(closed.state.controlIntent, "release");
});

test("stream rebind rejects replay, skipped generations, and stale fences", () => {
  const validState = {
    ...reduceCloudBrowserProtocolMessage(
      seededState(),
      hello(),
      protocolFallbacks,
    ).state,
    transportState: "streaming",
  };
  const adversarial = [
    streamRebind(binding, { previous_stream_id: "old-other" }),
    streamRebind(binding, { previous_stream_generation: 3 }),
    streamRebind(binding, { next_stream_id: binding.streamId }),
    streamRebind(binding, { next_stream_generation: 6 }),
    streamRebind(binding, { active_tab_id: "" }),
    streamRebind(binding, { action_sequence: 7 }),
    streamRebind(binding, { callback_sequence: 3 }),
    streamRebind(binding, { connection_id: "stale-connection" }),
    streamRebind(binding, { runtime_id: "stale-runtime" }),
    streamRebind(binding, { window_id: "stale-window" }),
    streamRebind(binding, { stream_id: "stale-stream" }),
    { ...streamRebind(), unknown_field: true },
  ];
  for (const message of adversarial) {
    const rejected = reduceCloudBrowserProtocolMessage(
      validState,
      message,
      protocolFallbacks,
    );
    assert.equal(rejected.state.transportState, "failed");
    assert.ok(
      ["stale_stream", "protocol_mismatch"].includes(
        rejected.state.failureKind,
      ),
    );
  }

  const pending = reduceCloudBrowserProtocolMessage(
    { ...validState, pendingBinary: true },
    streamRebind(),
    protocolFallbacks,
  );
  assert.equal(pending.state.transportState, "failed");
  assert.equal(pending.state.failureKind, "stale_stream");

  const postNewFrame = reduceCloudBrowserProtocolMessage(
    validState,
    frameMeta(Date.now(), {
      stream_id: "stream-next",
      stream_generation: 5,
      frame_sequence: 1,
    }),
    protocolFallbacks,
  );
  assert.equal(postNewFrame.state.transportState, "failed");
  assert.equal(postNewFrame.state.failureKind, "protocol_mismatch");
});

test("stream rebind commits refs and fence serial before paint reset", () => {
  const state = {
    ...reduceCloudBrowserProtocolMessage(
      seededState(),
      hello({
        lease: {
          lease_id: "human-lease",
          lease_epoch: 5,
          holder_kind: "human",
          connection_id: binding.connectionId,
        },
      }),
      protocolFallbacks,
    ).state,
    transportState: "streaming",
    controlPending: true,
    controlIntent: "release",
    controlIntentSent: true,
  };
  const ref = (current) => ({ current });
  const observations = [];
  const context = {
    tt: (value) => value,
    protocolRef: ref(state.protocol),
    handshakeRef: ref(state.handshake),
    socketSessionRef: ref(state.socketSessionId),
    sessionVersionRef: ref(state.sessionVersion),
    runtimeIdRef: ref(state.runtimeId),
    runtimeVersionRef: ref(state.runtimeVersion),
    incarnationRef: ref(state.incarnation),
    nonceRef: ref(state.nonce),
    connectionIdRef: ref(state.connectionId),
    streamIdRef: ref(state.streamId),
    streamGenerationRef: ref(state.streamGeneration),
    windowIdRef: ref(state.windowId),
    frameContractRef: ref(state.frameContract),
    capabilitiesRef: ref(state.capabilities),
    tabsRef: ref(state.tabs),
    helloFrameSequenceRef: ref(state.helloFrameSequence),
    lastFrameSequenceRef: ref(state.lastFrameSequence),
    lastActionSequenceRef: ref(state.lastActionSequence),
    lastCallbackSequenceRef: ref(state.lastCallbackSequence),
    leaseRef: ref(state.lease),
    leaseOwnedRef: ref(state.leaseOwned),
    controlIntentRef: ref(state.controlIntent),
    controlIntentSentRef: ref(state.controlIntentSent),
    controlPendingRef: ref(state.controlPending),
    pendingBinaryRef: ref(state.pendingBinary),
    failureKindRef: ref(state.failureKind),
    transportStateRef: ref(state.transportState),
    fenceSerialRef: ref(30),
    setProtocolVersion(version) {
      this.protocolRef.current = version;
    },
    setCurrentLease(next, owned) {
      this.leaseRef.current = next;
      this.leaseOwnedRef.current = owned;
    },
    setCapabilities(next) {
      this.capabilitiesRef.current = next;
    },
    setControlPending(next) {
      this.controlPendingRef.current =
        typeof next === "function"
          ? next(this.controlPendingRef.current)
          : next;
    },
    setControlIntentSent(next) {
      this.controlIntentSentRef.current = next;
    },
    setFailureKind(next) {
      this.failureKindRef.current = next;
    },
    setError() {},
    rejectProtocol(message) {
      throw new Error(message);
    },
    transition(next) {
      this.transportStateRef.current = next;
    },
    armFirstFrameTimeout() {
      observations.push(["armed", this.streamIdRef.current]);
    },
    cancelFrameDecode() {},
    resetStreamPaint() {
      observations.push([
        "reset",
        this.streamIdRef.current,
        this.streamGenerationRef.current,
        this.fenceSerialRef.current,
        this.leaseOwnedRef.current,
        this.controlIntentRef.current,
      ]);
    },
    acceptFrameMeta() {
      return true;
    },
    reconcileControlIntent() {
      throw new Error("rebind must not reacquire control");
    },
    recordDiagnostic() {},
    async refreshCheckpoints() {},
  };

  handleCloudBrowserProtocolMessage(
    streamRebind(),
    context,
  );
  assert.equal(context.streamIdRef.current, "stream-next");
  assert.equal(context.streamGenerationRef.current, 5);
  assert.equal(context.fenceSerialRef.current, 31);
  assert.equal(context.leaseOwnedRef.current, true);
  assert.equal(context.controlIntentRef.current, "release");
  assert.deepEqual(observations, [
    ["reset", "stream-next", 5, 31, true, "release"],
    ["armed", "stream-next"],
  ]);
  assert.match(
    transportSource,
    /cancelFrameDecode\(false,\s*false,\s*false\)/,
  );
  assert.doesNotMatch(
    modelSource.match(/if \(type === "stream\.rebind"\)[\s\S]*?return \{ state, effects \};/)?.[0] || "",
    /reconnect|control\.acquire|leaseOwned:\s*false/,
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
    "client_capabilities",
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
  assert.equal(
    fixture.hello.runtime_version,
    "native-chrome-window-v3-ui-fixture",
  );
  assert.equal(fixture.hello.stream_id, "stream-fixture");
  assert.equal(fixture.hello.window_id, "window-fixture");
  assert.equal(fixture.hello.frame_contract.max_width, 1280);
  assert.equal(fixture.hello.frame_contract.max_height, 800);
  assert.equal(fixture.hello.window.native_band_height, 87);
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
    holder_id: "user:fixture-owner",
    connection_id: "connection-fixture",
    expires_at: "2099-01-01T00:00:00+00:00",
    privacy_mode: true,
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

test("modifier chords keep lowercase letters so Control+t creates a tab", () => {
  // V5 CLOUD_TAB_MUTATION_FAILED: forced uppercase became xdotool ctrl+T
  // (Ctrl+Shift+t reopen) and durable active_tab_id never changed.
  const chord = (key, init = {}) =>
    playwrightKey({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
    });
  assert.equal(chord("t", { ctrlKey: true }), "Control+t");
  assert.equal(chord("T", { ctrlKey: true }), "Control+t");
  assert.equal(chord("w", { ctrlKey: true }), "Control+w");
  assert.equal(
    chord("T", { ctrlKey: true, shiftKey: true }),
    "Control+Shift+t",
  );
  assert.equal(chord("l", { metaKey: true }), "Meta+l");
  assert.equal(chord("a"), "A");
  assert.equal(chord("Enter", { ctrlKey: true }), "Control+Enter");
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
  // Remote focus (windowactivate) must never sit in the pointer chord,
  // after pointer up, on canvas/hidden-input focus, or immediately before
  // text.commit. Playwright focuses the canvas before pointerdown; an
  // extra activate races the page focus the click establishes before
  // paste. Executor pointer()/commit_text already windowactivate.
  assert.match(
    interactionSource,
    /sendMutation\("pointer", \{[\s\S]*?event: "down"[\s\S]*?\}\);\s*\/\/ Local keyboard sink only[\s\S]*?focusLocalInput\(\);/,
  );
  assert.doesNotMatch(
    interactionSource,
    /event: "down"[\s\S]{0,400}focusRemoteWindow\(\)/,
  );
  assert.doesNotMatch(
    interactionSource,
    /event: event\.type === "pointercancel" \? "cancel" : "up"[\s\S]{0,500}focusRemoteWindow\(\)/,
  );
  assert.match(
    interactionSource,
    /event: event\.type === "pointercancel" \? "cancel" : "up"[\s\S]*?focusLocalInput\(\);/,
  );
  assert.match(
    interactionSource,
    /function handleCanvasFocus\(\) \{\s*\/\/ Tab\/programmatic canvas focus[\s\S]*?focusLocalInput\(\);\s*\}/,
  );
  assert.doesNotMatch(
    interactionSource,
    /function handleCanvasFocus\(\) \{[^}]*sendMutation/,
  );
  assert.doesNotMatch(interactionSource, /function focusRemoteWindow\(/);
  assert.match(
    interactionSource,
    /function handleHiddenFocus\(\) \{\s*\/\/ The hidden textarea is only a local keyboard/,
  );
  assert.match(
    interactionSource,
    /function handleHiddenFocus\(\) \{\s*\/\/ The hidden textarea[\s\S]*?\}\s*function handleHiddenBlur/,
  );
  assert.doesNotMatch(
    interactionSource,
    /function handleHiddenFocus\(\) \{[^}]*sendMutation/,
  );
  assert.doesNotMatch(
    interactionSource,
    /function sendText\([^)]*\) \{[^}]*sendMutation\("focus"/,
  );
  assert.match(interactionSource, /"clipboard\.paste"/);
  assert.match(interactionSource, /"composition\.start"/);
  assert.match(interactionSource, /"composition\.update"/);
  assert.match(interactionSource, /"composition\.end"/);
  assert.match(interactionSource, /const INPUT_COALESCE_MS = 32/);
  assert.match(interactionSource, /schedulePointerMove\(/);
  assert.match(interactionSource, /scheduleWheel\(/);
  assert.match(interactionSource, /flushPointerMove\(\)/);
  assert.match(interactionSource, /flushWheel\(\)/);
  assert.match(transportSource, /const LIVE_HEARTBEAT_MS = 15_000/);
  assert.match(
    transportSource,
    /v3Envelope\("heartbeat", \{ sent_at: Date\.now\(\) \}\)/,
  );
  // Executor successful receipts include JSON null for optional code/message.
  assert.match(modelSource, /message\.code != null/);
  assert.match(modelSource, /message\.message != null/);
  assert.doesNotMatch(
    modelSource,
    /message\.code !== undefined &&\s*!boundedString\(message\.code/,
  );
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
  // The old "更多" dropdown is flattened into first-class bottom-bar
  // buttons: 历史 (checkpoint history), 新建/连接/恢复 (power) and 休眠.
  assert.doesNotMatch(chromeSource, /data-cloud-browser-more/);
  assert.match(chromeSource, /tt\("历史"\)/);
  assert.match(chromeSource, /data-cloud-browser-power/);
  assert.match(chromeSource, /data-cloud-browser-hibernate/);
  assert.match(chromeSource, /tt\("新建"\)/);
  assert.match(chromeSource, /tt\("恢复"\)/);
  assert.match(chromeSource, /tt\("连接"\)/);
  assert.match(chromeSource, /tt\("休眠"\)/);
  assert.match(panelSource, /transport\.stopLive\(true\);[\s\S]*?hibernateCloudBrowser/);
});

test("viewport recovery is spinner-only and retained frames keep takeover available", () => {
  const presentation = `${panelSource}\n${powerPromptSource}\n${chromeSource}\n${historySource}`;
  assert.match(powerPromptSource, /data-cloud-browser-spinner/);
  assert.match(powerPromptSource, /animate-spin/);
  assert.match(
    panelSource,
    /retainedFrame=\{transport\.hasCanvasFrame\}/,
  );
  assert.match(chromeSource, /connected \|\| hasCanvasFrame/);
  assert.match(chromeSource, /aria-busy=\{controlPending\}/);
  assert.match(chromeSource, /data-cloud-browser-control-spinner/);
  for (const removedCopy of [
    "连接出现波动，正在自动重连",
    "实时浏览器连接失败",
    "使用新票据重试连接",
    "client did not present the in-flight frame",
    "冷启动最长可能需要十几秒",
    "当前仅保留最后一帧作为故障上下文",
    "浏览会话未连接；点击底栏",
    "租约代",
  ]) {
    assert.doesNotMatch(presentation, new RegExp(removedCopy));
  }
});

test("power-on stays explicit while task sessions outrank global history", () => {
  const sessions = [
    { id: "task-session", task_id: "task-current" },
    { id: "global-session", task_id: "task-other" },
  ];
  assert.equal(
    resolveCloudBrowserSessionSelection({
      sessions,
      effectiveTaskId: "task-current",
    }),
    "task-session",
  );
  assert.equal(
    resolveCloudBrowserSessionSelection({
      sessions: [sessions[1]],
      effectiveTaskId: "task-current",
    }),
    "",
    "another task's global history must not take over the empty state",
  );
  assert.equal(
    resolveCloudBrowserSessionSelection({
      sessions,
      effectiveTaskId: "",
    }),
    "",
    "loading global history alone must not implicitly select a session",
  );
  assert.equal(
    resolveCloudBrowserSessionSelection({
      sessions,
      effectiveTaskId: "task-current",
      currentId: "global-session",
      keepCurrent: true,
    }),
    "global-session",
    "an explicit history selection remains user-controlled",
  );
  assert.doesNotMatch(
    panelSource,
    /if\s*\(\s*!session\.sessions\.length\s*\)/,
  );
  assert.match(panelSource, /!liveRequested && \(\s*<BrowserPowerPrompt/);
  assert.match(panelSource, /showPowerButton=\{liveRequested\}/);
  assert.match(powerPromptSource, /data-cloud-browser-power-prompt/);
  assert.match(powerPromptSource, /data-cloud-browser-resume/);
  assert.match(panelSource, /resumeLabel=\{/);
  assert.doesNotMatch(sessionSource, /items\[0\]\?\.id/);
});

test("hibernated and failed sessions require explicit fenced resume", () => {
  const active = {
    status: "active",
    runtime_id: "runtime",
    incarnation: 4,
    runtime_state: "ready",
  };
  assert.equal(cloudBrowserSessionNeedsResume(active), false);
  assert.equal(
    cloudBrowserSessionNeedsResume({
      ...active,
      status: "hibernated",
      runtime_id: "",
    }),
    true,
  );
  assert.equal(
    cloudBrowserSessionNeedsResume({
      ...active,
      status: "failed",
    }),
    true,
  );
  assert.equal(
    cloudBrowserSessionNeedsResume({
      ...active,
      runtime_id: "",
    }),
    true,
    "an absent runtime must re-enter the lifecycle CAS path",
  );
  assert.match(
    panelSource,
    /cloudBrowserSessionNeedsResume\(selected\)[\s\S]*?restorePrevious\(\)/,
  );
  assert.match(
    panelSource,
    /historyLabel=\{cloudBrowserOpenHistoryLabel\(tt\)\}/,
  );
  assert.match(panelSource, /newLabel=\{tt\("新建"\)\}/);
  assert.doesNotMatch(panelSource, /tt\("开机"\)/);
});

test("terminal configuration and v3 failures are visible instead of spinning forever", () => {
  assert.equal(
    formatCloudBrowserLifecycleError(
      { error: "BROWSER_NOT_CONFIGURED", status: 503 },
      "start failed",
    ),
    "start failed: BROWSER_NOT_CONFIGURED",
  );
  assert.equal(
    formatCloudBrowserLifecycleError(
      { error: "EXECUTOR_ORIGIN_REJECTED", status: 503 },
      "start failed",
    ),
    "start failed: EXECUTOR_ORIGIN_REJECTED",
  );
  assert.equal(
    formatCloudBrowserLifecycleError(
      { error: "HTTP 503", status: 503 },
      "start failed",
    ),
    "start failed: BROWSER_SERVICE_UNAVAILABLE",
  );
  assert.equal(
    formatCloudBrowserLifecycleError(
      {
        error:
          "executor.py:417 database host=private token=should-not-render",
        status: 500,
      },
      "start failed",
    ),
    "start failed",
    "untrusted gateway details must never become product error copy",
  );
  assert.match(powerPromptSource, /data-cloud-browser-lifecycle-error/);
  assert.match(panelSource, /data-cloud-browser-terminal-failure/);
  assert.match(panelSource, /data-cloud-browser-retry/);
  assert.match(panelSource, /v3 protocol_mismatch/);
  assert.match(
    sessionSource,
    /cloudBrowserLifecycleIssue\(\s*\{\s*operation:\s*"session_list",\s*\.\.\.recentResult\s*\}/,
  );
  assert.match(
    sessionSource,
    /formatCloudBrowserLifecycleError\(\s*\{\s*operation:\s*"checkpoint_list",\s*\.\.\.result\s*\},\s*tt\("会话快照加载失败"\)/,
  );
  assert.match(
    panelSource,
    /transport\.transportState !== "failed"[\s\S]*?transport\.transportState !== "closed"/,
  );
});

test("takeover pending is cancellable and bounded without bypassing lease fences", () => {
  assert.equal(CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS, 12_000);
  assert.match(
    chromeSource,
    /if \(!takeoverPending \|\| !controlIntentSent\) return/,
  );
  const intents = [];
  const refs = {
    transportStateRef: { current: "streaming" },
    leaseOwnedRef: { current: false },
    controlPendingRef: { current: false },
    capabilitiesRef: {
      current: {
        page_bookmark: false,
        session_checkpoint: false,
        clipboard: false,
        ime_composition: false,
        viewport_resize: false,
      },
    },
  };
  const actions = createCloudBrowserTransportActions({
    ...refs,
    sendMutation: () => {
      throw new Error("control cancellation must not bypass transport fences");
    },
    requestControlIntent: (intent) => {
      intents.push(intent);
      refs.controlPendingRef.current = intent === "acquire";
    },
  });
  actions.toggleControl();
  assert.deepEqual(intents, ["acquire"]);
  actions.toggleControl();
  assert.deepEqual(intents, ["acquire", "release"]);
  assert.equal(actions.cancelTakeover(), false);
  assert.deepEqual(intents, ["acquire", "release"]);
  refs.controlPendingRef.current = true;
  refs.leaseOwnedRef.current = true;
  assert.equal(actions.cancelTakeover(), false);
  assert.match(chromeSource, /CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS/);
  assert.match(chromeSource, /cancelTakeoverRef\.current\(\)/);
  assert.match(chromeSource, /data-cloud-browser-control-cancel/);
});

test("history is a viewport-safe focus-trapped portal with metadata and no images", () => {
  assert.match(historySource, /createPortal\(/);
  assert.match(historySource, /data-cloud-browser-history-portal/);
  assert.match(historySource, /role="dialog"/);
  assert.match(historySource, /aria-modal="true"/);
  assert.match(historySource, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(historySource, /FOCUSABLE_SELECTOR/);
  assert.match(historySource, /previous\.focus\(\{ preventScroll: true \}\)/);
  assert.match(historySource, /data-cloud-browser-session-list/);
  assert.match(historySource, /data-cloud-browser-work-id/);
  assert.match(historySource, /data-cloud-browser-app-session-id/);
  assert.match(historySource, /data-cloud-browser-rename-session/);
  assert.match(historySource, /data-cloud-browser-history-spinner/);
  assert.doesNotMatch(historySource, /<img|has_screenshot|cloudBrowserScreenshot/);
  assert.doesNotMatch(historySource, /正在加载会话快照|正在恢复此会话快照/);
});

test("user session naming uses the canonical browse PATCH contract", async () => {
  const calls = [];
  const updated = {
    id: "session-1",
    session_version: 21,
    runtime_id: "runtime-1",
    incarnation: 4,
    protocol_version: 3,
    binary_frames: true,
    status: "active",
    title: "Research sources",
    title_source: "user",
    created_at: "2026-07-20T00:00:00.000Z",
  };
  const result = await renameCloudBrowserSession(
    updated.id,
    "  Research sources  ",
    async (path, init) => {
      calls.push({ path, init });
      return { ok: true, data: { session: updated } };
    },
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/v1/browse/sessions/session-1");
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    title: "Research sources",
  });

  const invalidCalls = [];
  const invalid = await renameCloudBrowserSession(
    updated.id,
    "x".repeat(MAX_CLOUD_BROWSER_SESSION_TITLE_LENGTH + 1),
    async (...args) => {
      invalidCalls.push(args);
      return { ok: true, data: { session: updated } };
    },
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 400);
  assert.equal(invalidCalls.length, 0);
});

test("lifecycle success reloads the durable session before ticketing", () => {
  assert.match(
    panelSource,
    /session\.upsertSession\(created\);[\s\S]*?await session\.reload\(created\.id\);[\s\S]*?await transport\.openLive\(created\.id\);/,
  );
  assert.match(
    panelSource,
    /const selectedId = session\.selectedId;[\s\S]*?await session\.reload\(selectedId\);[\s\S]*?await transport\.openLive\(selectedId\);/,
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
        state: "ready",
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

test("live validation failures recover twice with fresh-ticket backoff", () => {
  assert.equal(FIRST_FRAME_TIMEOUT_MS, 15_000);
  assert.deepEqual([...LIVE_RECOVERY_DELAYS_MS], [1_000, 3_000]);
  for (const kind of [
    "first_paint",
    "protocol_mismatch",
    "stale_stream",
  ]) {
    assert.deepEqual(planCloudBrowserLiveRecovery(kind, 0), {
      retry: true,
      delayMs: 1_000,
    });
    assert.deepEqual(planCloudBrowserLiveRecovery(kind, 1), {
      retry: true,
      delayMs: 3_000,
    });
    assert.deepEqual(planCloudBrowserLiveRecovery(kind, 2), {
      retry: false,
    });
  }
  for (const kind of ["connection", "ticket_expired", "lease_lost", null]) {
    assert.deepEqual(planCloudBrowserLiveRecovery(kind, 0), {
      retry: false,
    });
  }
  assert.deepEqual(planCloudBrowserLiveRecovery("first_paint", -1), {
    retry: false,
  });
  assert.match(
    transportSource,
    /connectLive\(sessionId,\s*generation,\s*false\)/,
    "automatic recovery must re-enter the one-use ticket path",
  );
  assert.match(
    transportSource,
    /transportStateRef\.current === "reconnecting"[\s\S]*reconnectTimerRef\.current !== null/,
    "duplicate rejects must not schedule duplicate recovery timers",
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
