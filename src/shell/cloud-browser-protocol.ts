"use client";

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type {
  CloudBrowserCapabilitiesV3,
  CloudBrowserControlLease,
  CloudBrowserFrameContractV3,
  CloudBrowserTransportState,
} from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";
import type { ValidatedCloudBrowserFrameMeta } from "./cloud-browser-live";
import {
  createCloudBrowserProtocolState,
  reduceCloudBrowserProtocolMessage,
  type CloudBrowserFailureKind,
  type CloudBrowserHelloTab,
  type CloudBrowserProtocolState,
} from "./cloud-browser-transport-model";

type Ref<T> = MutableRefObject<T>;
type Setter<T> = Dispatch<SetStateAction<T>>;

export interface CloudBrowserProtocolContext {
  tt: UITranslate;
  protocolRef: Ref<3 | null>;
  handshakeRef: Ref<boolean>;
  socketSessionRef: Ref<string>;
  sessionVersionRef: Ref<number>;
  runtimeIdRef: Ref<string>;
  runtimeVersionRef: Ref<string>;
  incarnationRef: Ref<number>;
  nonceRef: Ref<string>;
  connectionIdRef: Ref<string>;
  streamIdRef: Ref<string>;
  streamGenerationRef: Ref<number>;
  windowIdRef: Ref<string>;
  frameContractRef: Ref<CloudBrowserFrameContractV3 | null>;
  capabilitiesRef: Ref<CloudBrowserCapabilitiesV3>;
  tabsRef: Ref<CloudBrowserHelloTab[]>;
  helloFrameSequenceRef: Ref<number>;
  lastFrameSequenceRef: Ref<number>;
  lastActionSequenceRef: Ref<number>;
  lastCallbackSequenceRef: Ref<number>;
  leaseRef: Ref<CloudBrowserControlLease>;
  leaseOwnedRef: Ref<boolean>;
  controlIntentRef: Ref<"acquire" | "release" | "">;
  controlPendingRef: Ref<boolean>;
  pendingBinaryRef: Ref<boolean>;
  failureKindRef: Ref<CloudBrowserFailureKind>;
  transportStateRef: Ref<CloudBrowserTransportState>;
  setProtocolVersion: (version: 3 | null) => void;
  setCurrentLease: (
    lease: CloudBrowserControlLease,
    owned: boolean,
  ) => void;
  setCapabilities: Setter<CloudBrowserCapabilitiesV3>;
  setControlPending: Setter<boolean>;
  setFailureKind: (kind: CloudBrowserFailureKind) => void;
  setError: (message: string) => void;
  rejectProtocol: (
    message: string,
    kind: Exclude<CloudBrowserFailureKind, "lease_lost" | null>,
  ) => void;
  transition: (state: CloudBrowserTransportState) => void;
  armFirstFrameTimeout: () => void;
  cancelFrameDecode: (clearCanvas?: boolean) => void;
  acceptFrameMeta: (meta: ValidatedCloudBrowserFrameMeta) => boolean;
  refreshCheckpoints: () => Promise<void>;
}

function snapshot(
  context: CloudBrowserProtocolContext,
): CloudBrowserProtocolState {
  return createCloudBrowserProtocolState({
    transportState: context.transportStateRef.current,
    protocol: context.protocolRef.current,
    handshake: context.handshakeRef.current,
    socketSessionId: context.socketSessionRef.current,
    sessionVersion: context.sessionVersionRef.current,
    runtimeId: context.runtimeIdRef.current,
    runtimeVersion: context.runtimeVersionRef.current,
    incarnation: context.incarnationRef.current,
    nonce: context.nonceRef.current,
    connectionId: context.connectionIdRef.current,
    streamId: context.streamIdRef.current,
    streamGeneration: context.streamGenerationRef.current,
    windowId: context.windowIdRef.current,
    frameContract: context.frameContractRef.current,
    capabilities: context.capabilitiesRef.current,
    tabs: context.tabsRef.current,
    helloFrameSequence: context.helloFrameSequenceRef.current,
    lastFrameSequence: context.lastFrameSequenceRef.current,
    lastActionSequence: context.lastActionSequenceRef.current,
    lastCallbackSequence: context.lastCallbackSequenceRef.current,
    lease: context.leaseRef.current,
    leaseOwned: context.leaseOwnedRef.current,
    controlPending: context.controlPendingRef.current,
    controlIntent: context.controlIntentRef.current,
    pendingBinary: context.pendingBinaryRef.current,
    failureKind: context.failureKindRef.current,
  });
}

function commit(
  previous: CloudBrowserProtocolState,
  next: CloudBrowserProtocolState,
  context: CloudBrowserProtocolContext,
) {
  context.handshakeRef.current = next.handshake;
  context.sessionVersionRef.current = next.sessionVersion;
  context.runtimeIdRef.current = next.runtimeId;
  context.runtimeVersionRef.current = next.runtimeVersion;
  context.incarnationRef.current = next.incarnation;
  context.nonceRef.current = next.nonce;
  context.connectionIdRef.current = next.connectionId;
  context.streamIdRef.current = next.streamId;
  context.streamGenerationRef.current = next.streamGeneration;
  context.windowIdRef.current = next.windowId;
  context.frameContractRef.current = next.frameContract;
  context.capabilitiesRef.current = next.capabilities;
  context.tabsRef.current = next.tabs;
  context.helloFrameSequenceRef.current = next.helloFrameSequence;
  context.lastFrameSequenceRef.current = next.lastFrameSequence;
  context.lastActionSequenceRef.current = next.lastActionSequence;
  context.lastCallbackSequenceRef.current = next.lastCallbackSequence;
  context.leaseRef.current = next.lease;
  context.leaseOwnedRef.current = next.leaseOwned;
  context.controlIntentRef.current = next.controlIntent;
  context.controlPendingRef.current = next.controlPending;
  context.pendingBinaryRef.current = next.pendingBinary;
  context.failureKindRef.current = next.failureKind;

  if (next.transportState !== previous.transportState) {
    context.transition(next.transportState);
  }
  if (next.protocol !== previous.protocol) {
    context.setProtocolVersion(next.protocol);
  }
  if (
    next.lease !== previous.lease ||
    next.leaseOwned !== previous.leaseOwned
  ) {
    context.setCurrentLease(next.lease, next.leaseOwned);
  }
  if (next.capabilities !== previous.capabilities) {
    context.setCapabilities(next.capabilities);
  }
  if (next.controlPending !== previous.controlPending) {
    context.setControlPending(next.controlPending);
  }
  if (next.failureKind !== previous.failureKind) {
    context.setFailureKind(next.failureKind);
  }
}

export function handleCloudBrowserProtocolMessage(
  message: Record<string, unknown>,
  context: CloudBrowserProtocolContext,
) {
  const previous = snapshot(context);
  const reduction = reduceCloudBrowserProtocolMessage(previous, message, {
    runtimeFailed: context.tt("浏览器运行失败"),
    operationFailed: context.tt("浏览器操作失败"),
    protocolMismatch: context.tt("云浏览器协议不匹配，已拒绝连接"),
    staleStream: context.tt("收到过期画面流，已停止输入"),
    leaseLost: context.tt("控制租约已失效，请重新接管"),
  });
  commit(previous, reduction.state, context);
  for (const effect of reduction.effects) {
    if (effect.type === "reject") {
      context.rejectProtocol(effect.message, effect.kind);
    } else if (effect.type === "error") {
      context.setError(effect.message);
      if (effect.kind) context.setFailureKind(effect.kind);
    } else if (effect.type === "clear_error") {
      context.setError("");
    } else if (effect.type === "arm_first_frame") {
      context.armFirstFrameTimeout();
    } else if (effect.type === "cancel_frame_decode") {
      context.cancelFrameDecode(false);
    } else if (effect.type === "accept_frame_meta") {
      if (!context.acceptFrameMeta(effect.meta)) {
        context.rejectProtocol(
          context.tt("二进制画面与元数据未按顺序配对"),
          "protocol_mismatch",
        );
      }
    } else if (effect.type === "refresh_checkpoints") {
      void context.refreshCheckpoints();
    }
  }
}
