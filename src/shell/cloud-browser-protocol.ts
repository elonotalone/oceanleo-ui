"use client";

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type {
  CloudBrowserControlLease,
  CloudBrowserTab,
  CloudBrowserTransportState,
} from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";
import {
  createCloudBrowserProtocolState,
  reduceCloudBrowserProtocolMessage,
  type CloudBrowserProtocolState,
} from "./cloud-browser-transport-model";

type Ref<T> = MutableRefObject<T>;
type Setter<T> = Dispatch<SetStateAction<T>>;

export interface CloudBrowserProtocolContext {
  tt: UITranslate;
  protocolRef: Ref<1 | 2 | null>;
  handshakeRef: Ref<boolean>;
  connectionIdRef: Ref<string>;
  runtimeIdRef: Ref<string>;
  incarnationRef: Ref<number>;
  streamIdRef: Ref<string>;
  streamGenerationRef: Ref<number>;
  activeTabIdRef: Ref<string>;
  tabsRef: Ref<CloudBrowserTab[]>;
  leaseRef: Ref<CloudBrowserControlLease>;
  leaseOwnedRef: Ref<boolean>;
  legacyDrivingRef: Ref<boolean>;
  controlIntentRef: Ref<"acquire" | "release" | "">;
  controlPendingRef: Ref<boolean>;
  addressRef: Ref<string>;
  dropNextBinaryRef: Ref<boolean>;
  pendingV2BinaryRef: Ref<boolean>;
  socketSessionRef: Ref<string>;
  transportStateRef: Ref<CloudBrowserTransportState>;
  setProtocolVersion: (version: 1 | 2 | null) => void;
  setCurrentLease: (
    lease: CloudBrowserControlLease,
    owned: boolean,
  ) => void;
  setTabs: Setter<CloudBrowserTab[]>;
  setActiveTabId: Setter<string>;
  setLegacyDriving: Setter<boolean>;
  setControlPending: Setter<boolean>;
  setAddress: Setter<string>;
  setError: (message: string) => void;
  rejectProtocol: (message: string) => void;
  transition: (state: CloudBrowserTransportState) => void;
  armFirstFrameTimeout: () => void;
  cancelFrameDecode: (clearCanvas?: boolean) => void;
  acceptFrameMeta: (message: Record<string, unknown>) => unknown;
  drawTextFrame: (
    base64: string,
    message: Record<string, unknown>,
  ) => void;
  refreshEvents: () => Promise<void>;
}

function snapshot(
  context: CloudBrowserProtocolContext,
): CloudBrowserProtocolState {
  return createCloudBrowserProtocolState({
    transportState: context.transportStateRef.current,
    protocol: context.protocolRef.current,
    handshake: context.handshakeRef.current,
    socketSessionId: context.socketSessionRef.current,
    connectionId: context.connectionIdRef.current,
    runtimeId: context.runtimeIdRef.current,
    incarnation: context.incarnationRef.current,
    streamId: context.streamIdRef.current,
    streamGeneration: context.streamGenerationRef.current,
    activeTabId: context.activeTabIdRef.current,
    tabs: context.tabsRef.current,
    lease: context.leaseRef.current,
    leaseOwned: context.leaseOwnedRef.current,
    legacyDriving: context.legacyDrivingRef.current,
    controlPending: context.controlPendingRef.current,
    controlIntent: context.controlIntentRef.current,
    address: context.addressRef.current,
    dropNextBinary: context.dropNextBinaryRef.current,
    pendingV2Binary: context.pendingV2BinaryRef.current,
  });
}

function commit(
  previous: CloudBrowserProtocolState,
  next: CloudBrowserProtocolState,
  context: CloudBrowserProtocolContext,
) {
  context.handshakeRef.current = next.handshake;
  context.connectionIdRef.current = next.connectionId;
  context.runtimeIdRef.current = next.runtimeId;
  context.incarnationRef.current = next.incarnation;
  context.streamIdRef.current = next.streamId;
  context.streamGenerationRef.current = next.streamGeneration;
  context.activeTabIdRef.current = next.activeTabId;
  context.tabsRef.current = next.tabs;
  context.leaseRef.current = next.lease;
  context.leaseOwnedRef.current = next.leaseOwned;
  context.legacyDrivingRef.current = next.legacyDriving;
  context.controlIntentRef.current = next.controlIntent;
  context.controlPendingRef.current = next.controlPending;
  context.addressRef.current = next.address;
  context.dropNextBinaryRef.current = next.dropNextBinary;
  context.pendingV2BinaryRef.current = next.pendingV2Binary;

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
  if (next.tabs !== previous.tabs) context.setTabs(next.tabs);
  if (next.activeTabId !== previous.activeTabId) {
    context.setActiveTabId(next.activeTabId);
  }
  if (next.legacyDriving !== previous.legacyDriving) {
    context.setLegacyDriving(next.legacyDriving);
  }
  if (next.controlPending !== previous.controlPending) {
    context.setControlPending(next.controlPending);
  }
  if (next.address !== previous.address) context.setAddress(next.address);
}

/**
 * React/WebSocket adapter around the pure protocol reducer. The reducer owns
 * all binding, tab, lease and transport decisions; this adapter only commits
 * the immutable result and executes explicit effects.
 */
export function handleCloudBrowserProtocolMessage(
  message: Record<string, unknown>,
  context: CloudBrowserProtocolContext,
) {
  const previous = snapshot(context);
  const reduction = reduceCloudBrowserProtocolMessage(previous, message, {
    runtimeFailed: context.tt("浏览器运行失败"),
    navigationRejected: context.tt("网址被安全策略拒绝"),
    operationFailed: context.tt("浏览器操作失败"),
  });
  commit(previous, reduction.state, context);
  for (const effect of reduction.effects) {
    if (effect.type === "reject") {
      context.rejectProtocol(effect.message);
    } else if (effect.type === "error") {
      context.setError(effect.message);
    } else if (effect.type === "clear_error") {
      context.setError("");
    } else if (effect.type === "arm_first_frame") {
      context.armFirstFrameTimeout();
    } else if (effect.type === "cancel_frame_decode") {
      context.cancelFrameDecode(false);
    } else if (effect.type === "accept_frame_meta") {
      context.acceptFrameMeta(effect.message);
    } else if (effect.type === "draw_text_frame") {
      context.drawTextFrame(effect.data, effect.message);
    } else if (effect.type === "refresh_events") {
      void context.refreshEvents();
    }
  }
}
