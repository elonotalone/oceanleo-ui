import { pathToFileURL } from "node:url";

import {
  validateCloudBrowserFrameMeta,
} from "../src/shell/cloud-browser-live.ts";
import {
  createCloudBrowserProtocolState,
  reduceCloudBrowserProtocolMessage,
} from "../src/shell/cloud-browser-transport-model.ts";
import {
  canSendCloudBrowserControlMutation,
  cloudBrowserAuthMessage,
  cloudBrowserV3FrameReceipt,
  cloudBrowserV3Message,
  validateCloudBrowserMutation,
  validateCloudBrowserTicket,
  type CloudBrowserWireBinding,
} from "../src/shell/cloud-browser-wire.ts";

const FALLBACKS = {
  runtimeFailed: "runtime failed",
  operationFailed: "operation failed",
  protocolMismatch: "protocol mismatch",
  staleStream: "stale stream",
  leaseLost: "lease lost",
};

export function buildCloudBrowserV3Fixture(now = Date.now()) {
  const ticket = {
    ticket: "one-use-ticket",
    ticket_nonce: "ticket-nonce-fixture",
    expires_at: new Date(now + 45_000).toISOString(),
    expires_in: 45,
    protocol_version: 3 as const,
    owner_principal: "user:fixture-owner",
    session_id: "session-fixture",
    runtime_id: "runtime-fixture",
    incarnation: 9,
    session_version: 12,
    binary_frames: true as const,
  };
  const ticketValidation = validateCloudBrowserTicket(
    ticket,
    ticket.session_id,
    now,
  );
  if (!ticketValidation.ok) {
    throw new Error(`flat v3 ticket rejected: ${ticketValidation.reason}`);
  }
  const auth = cloudBrowserAuthMessage(
    ticket,
    ticket.session_id,
    now,
  );
  if (!auth.ok) throw new Error("flat ticket did not produce v3 auth");
  if (
    "streamId" in auth.binding ||
    "windowId" in auth.binding ||
    "runtimeVersion" in auth.binding
  ) {
    throw new Error("executor-derived binding leaked before hello");
  }

  const frameContract = {
    transport: "adjacent-binary" as const,
    codec: "image/jpeg" as const,
    source: "native-chrome-window" as const,
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
  const binding: CloudBrowserWireBinding = {
    sessionId: ticket.session_id,
    sessionVersion: ticket.session_version,
    runtimeId: ticket.runtime_id,
    runtimeVersion: "chrome-window-r42",
    incarnation: ticket.incarnation,
    nonce: ticket.ticket_nonce,
    connectionId: "connection-fixture",
    streamId: "stream-fixture",
    streamGeneration: 5,
    windowId: "window-fixture",
  };
  const hello = {
    ...cloudBrowserV3Message(binding, "hello"),
    frame_contract: frameContract,
    capabilities,
    window: {
      window_id: binding.windowId,
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
      lease_epoch: 4,
      holder_kind: "free",
    },
    tabs: [
      {
        id: "tab-fixture",
        title: "Fixture page",
        status: "ready",
      },
    ],
    action_sequence: 10,
    callback_sequence: 6,
  };
  const preHelloState = createCloudBrowserProtocolState({
    transportState: "authenticated",
    socketSessionId: auth.binding.sessionId,
    sessionVersion: auth.binding.sessionVersion,
    runtimeId: auth.binding.runtimeId,
    incarnation: auth.binding.incarnation,
    nonce: auth.binding.ticketNonce,
  });
  if (
    preHelloState.streamId ||
    preHelloState.windowId ||
    preHelloState.runtimeVersion ||
    preHelloState.frameContract
  ) {
    throw new Error("stream/window binding exists before executor hello");
  }
  const helloReduction = reduceCloudBrowserProtocolMessage(
    preHelloState,
    hello,
    FALLBACKS,
    now,
  );
  if (
    !helloReduction.state.handshake ||
    helloReduction.state.transportState !== "awaiting_first_frame"
  ) {
    throw new Error("canonical executor hello was rejected");
  }

  const frameMeta = {
    ...cloudBrowserV3Message(binding, "frame.meta"),
    frame_sequence: 41,
    action_sequence: 10,
    width: 1280,
    height: 800,
    byte_length: 34_567,
    captured_at_ms: now - 25,
    codec: "image/jpeg",
    source: "native-chrome-window",
    paint_state: "real",
    native_chrome: {
      window_id: binding.windowId,
      tab_strip: true,
      omnibox: true,
      maximized: true,
    },
  };
  const validatedFrame = validateCloudBrowserFrameMeta(
    frameMeta,
    {
      binding,
      contract: frameContract,
      afterSequence: 0,
      minimumActionSequence: hello.action_sequence,
    },
    now,
  );
  if (!validatedFrame.ok) {
    throw new Error(`canonical frame rejected: ${validatedFrame.reason}`);
  }
  const frameReduction = reduceCloudBrowserProtocolMessage(
    helloReduction.state,
    frameMeta,
    FALLBACKS,
    now,
  );
  if (
    !frameReduction.state.pendingBinary ||
    !frameReduction.effects.some(
      (effect) => effect.type === "accept_frame_meta",
    )
  ) {
    throw new Error("frame meta did not arm exactly one adjacent binary");
  }

  const freeLease = helloReduction.state.lease;
  if (
    !canSendCloudBrowserControlMutation(
      "control.acquire",
      freeLease,
      helloReduction.state.leaseOwned,
      binding.connectionId,
    ) ||
    canSendCloudBrowserControlMutation(
      "control.renew",
      freeLease,
      helloReduction.state.leaseOwned,
      binding.connectionId,
    )
  ) {
    throw new Error("free lease did not allow only control.acquire");
  }
  const receipts = [
    cloudBrowserV3FrameReceipt(
      binding,
      "frame.received",
      frameMeta.frame_sequence,
      frameMeta.action_sequence,
    ),
    cloudBrowserV3FrameReceipt(
      binding,
      "frame.dropped",
      frameMeta.frame_sequence,
      frameMeta.action_sequence,
    ),
    cloudBrowserV3FrameReceipt(
      binding,
      "frame.presented",
      frameMeta.frame_sequence,
      frameMeta.action_sequence,
    ),
  ];
  for (const receipt of receipts) {
    if (
      "lease_id" in receipt ||
      "lease_epoch" in receipt ||
      "client_event_id" in receipt
    ) {
      throw new Error("frame receipt incorrectly carries an OS lease fence");
    }
  }

  const acquire = cloudBrowserV3Message(binding, "control.acquire", {
    lease_id: freeLease.leaseId,
    lease_epoch: freeLease.epoch,
    action_sequence: 11,
    client_event_id: `${binding.connectionId}.4.11`,
    holder_kind: "human",
  });
  const controlState = cloudBrowserV3Message(binding, "control.state", {
    lease: {
      lease_id: "lease-fixture",
      lease_epoch: 5,
      holder_kind: "human",
      connection_id: binding.connectionId,
    },
    action_sequence: 11,
    callback_sequence: 7,
  });
  const acquiredReduction = reduceCloudBrowserProtocolMessage(
    {
      ...frameReduction.state,
      pendingBinary: false,
      transportState: "streaming",
    },
    controlState,
    FALLBACKS,
    now,
  );
  if (
    !acquiredReduction.state.leaseOwned ||
    acquiredReduction.state.lease.leaseId !== "lease-fixture" ||
    acquiredReduction.state.lease.epoch !== 5 ||
    acquiredReduction.state.lastActionSequence !== 11 ||
    acquiredReduction.state.lastCallbackSequence !== 7
  ) {
    throw new Error("free-to-human control.state callback was rejected");
  }
  const ownedLease = acquiredReduction.state.lease;
  if (
    canSendCloudBrowserControlMutation(
      "control.acquire",
      ownedLease,
      acquiredReduction.state.leaseOwned,
      binding.connectionId,
    ) ||
    !canSendCloudBrowserControlMutation(
      "control.renew",
      ownedLease,
      acquiredReduction.state.leaseOwned,
      binding.connectionId,
    ) ||
    !canSendCloudBrowserControlMutation(
      "control.release",
      ownedLease,
      acquiredReduction.state.leaseOwned,
      binding.connectionId,
    )
  ) {
    throw new Error("owned lease did not allow only renew/release");
  }
  const ownedFence = {
    lease_id: ownedLease.leaseId,
    lease_epoch: ownedLease.epoch,
  };
  const clientMessage = (
    type: string,
    actionSequence: number,
    payload: Record<string, unknown>,
  ) => {
    if (!validateCloudBrowserMutation(type, payload)) {
      throw new Error(`canonical ${type} payload rejected`);
    }
    return cloudBrowserV3Message(binding, type, {
      ...payload,
      ...ownedFence,
      action_sequence: actionSequence,
      client_event_id:
        `${binding.connectionId}.${ownedLease.epoch}.${actionSequence}`,
    });
  };
  const messages = [
    acquire,
    clientMessage("pointer", 12, {
      event: "down",
      nx: 0.25,
      ny: 0.75,
      button: "left",
      pointer_id: 1,
    }),
    clientMessage("wheel", 13, {
      nx: 0.25,
      ny: 0.75,
      dx: 0,
      dy: 120,
    }),
    clientMessage("key", 14, {
      event: "press",
      key: "Control+L",
    }),
    clientMessage("text.commit", 15, {
      composition_id: "text-fixture",
      text: "OceanLeo",
    }),
    clientMessage("composition.start", 16, {
      composition_id: "composition-fixture",
      text: "",
    }),
    clientMessage("composition.update", 17, {
      composition_id: "composition-fixture",
      text: "中文かな",
    }),
    clientMessage("composition.end", 18, {
      composition_id: "composition-fixture",
      text: "中文かな한글🙂",
    }),
    clientMessage("clipboard.paste", 19, {
      composition_id: "paste-fixture",
      text: "bounded clipboard",
    }),
    clientMessage("focus", 20, { focused: true }),
    clientMessage("viewport.set", 21, {
      width: 1280,
      height: 800,
      dpr: 2,
    }),
    clientMessage("page.bookmark", 22, {}),
    clientMessage("checkpoint.create", 23, {}),
    cloudBrowserV3Message(binding, "control.renew", {
      ...ownedFence,
      action_sequence: 24,
      client_event_id:
        `${binding.connectionId}.${ownedLease.epoch}.24`,
    }),
    cloudBrowserV3Message(binding, "control.release", {
      ...ownedFence,
      action_sequence: 25,
      client_event_id:
        `${binding.connectionId}.${ownedLease.epoch}.25`,
    }),
  ];
  const flow = [
    { direction: "server", message: hello },
    { direction: "server", message: frameMeta },
    {
      direction: "server",
      binary: { byte_length: frameMeta.byte_length },
    },
    ...[receipts[0], receipts[2]].map((message) => ({
      direction: "client",
      message,
    })),
    { direction: "client", message: acquire },
    { direction: "server", message: controlState },
    ...messages
      .slice(1)
      .map((message) => ({ direction: "client", message })),
  ];

  return {
    ticket,
    auth: auth.message,
    hello,
    frame_meta: frameMeta,
    binding,
    control_state: controlState,
    messages,
    receipts,
    flow,
  };
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  process.stdout.write(JSON.stringify(buildCloudBrowserV3Fixture()));
}
