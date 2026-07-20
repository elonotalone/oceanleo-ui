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
  normalizeCloudBrowserLease,
  normalizeCloudBrowserTab,
  normalizeCloudBrowserTabs,
  parseCloudBrowserFrameMeta,
  redactedDisplayUrl,
} from "./cloud-browser-live";

type Ref<T> = MutableRefObject<T>;
type Setter<T> = Dispatch<SetStateAction<T>>;

export type CloudBrowserProtocolContext = {
  tt: UITranslate;
  protocolRef: Ref<1 | 2 | null>;
  handshakeRef: Ref<boolean>;
  connectionIdRef: Ref<string>;
  runtimeIdRef: Ref<string>;
  incarnationRef: Ref<number>;
  streamIdRef: Ref<string>;
  streamGenerationRef: Ref<number>;
  activeTabIdRef: Ref<string>;
  leaseRef: Ref<CloudBrowserControlLease>;
  controlIntentRef: Ref<"acquire" | "release" | "">;
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
  adoptLegacyHandshake: () => void;
  cancelFrameDecode: (clearCanvas?: boolean) => void;
  acceptFrameMeta: (message: Record<string, unknown>) => unknown;
  drawTextFrame: (
    base64: string,
    message: Record<string, unknown>,
  ) => void;
  refreshEvents: () => Promise<void>;
};

function upsertTab(
  setTabs: Setter<CloudBrowserTab[]>,
  tab: CloudBrowserTab,
) {
  setTabs((current) => {
    const index = current.findIndex((item) => item.id === tab.id);
    if (index < 0) return [...current, tab];
    const next = [...current];
    next[index] = {
      ...next[index],
      ...tab,
      title: tab.title || next[index].title,
      displayUrl: tab.displayUrl || next[index].displayUrl,
      faviconUrl: tab.faviconUrl || next[index].faviconUrl,
    };
    return next;
  });
}

function updateActiveTab(
  context: CloudBrowserProtocolContext,
  patch: Partial<Omit<CloudBrowserTab, "id">>,
) {
  const id = context.activeTabIdRef.current;
  if (!id) return;
  context.setTabs((current) =>
    current.map((tab) =>
      tab.id === id
        ? {
            ...tab,
            ...patch,
            displayUrl: patch.displayUrl ?? tab.displayUrl,
          }
        : tab,
    ),
  );
}

function setExpectedStream(
  message: Record<string, unknown>,
  context: CloudBrowserProtocolContext,
) {
  context.streamIdRef.current = String(message.stream_id || "");
  context.streamGenerationRef.current = Number(
    message.stream_generation || message.generation || 0,
  );
  context.transition("awaiting_first_frame");
  context.armFirstFrameTimeout();
}

export function handleCloudBrowserProtocolMessage(
  message: Record<string, unknown>,
  context: CloudBrowserProtocolContext,
) {
  const type = String(message.t || message.type || "");
  const isV2 = message.v === 2 || type.includes(".");

  if (type === "hello") {
    const sessionId = String(message.session_id || "");
    const runtimeId = String(message.runtime_id || "");
    const incarnation = Number(message.incarnation || 0);
    const connectionId = String(message.connection_id || "");
    if (
      message.v !== 2 ||
      !sessionId ||
      sessionId !== context.socketSessionRef.current ||
      !runtimeId ||
      (context.runtimeIdRef.current &&
        runtimeId !== context.runtimeIdRef.current) ||
      !Number.isInteger(incarnation) ||
      incarnation <= 0 ||
      (context.incarnationRef.current &&
        incarnation !== context.incarnationRef.current) ||
      !connectionId
    ) {
      context.rejectProtocol(context.tt("浏览器运行失败"));
      return;
    }
    context.setProtocolVersion(2);
    context.handshakeRef.current = true;
    context.connectionIdRef.current = connectionId;
    context.runtimeIdRef.current = runtimeId;
    context.incarnationRef.current = incarnation;
    context.streamIdRef.current = String(message.stream_id || "");
    context.streamGenerationRef.current = Number(
      message.stream_generation || message.generation || 0,
    );
    const tabs = normalizeCloudBrowserTabs(message.tabs);
    context.setTabs(tabs);
    const activeId = String(
      message.active_tab_id ||
        tabs.find((tab) => tab.status !== "closed")?.id ||
        "",
    );
    context.activeTabIdRef.current = activeId;
    context.setActiveTabId(activeId);
    const lease = normalizeCloudBrowserLease(message.lease || message.control);
    const owned =
      lease.holderKind === "human" &&
      Boolean(
        lease.connectionId &&
          lease.connectionId === context.connectionIdRef.current,
      );
    context.setCurrentLease(lease, owned);
    context.transition("awaiting_first_frame");
    context.armFirstFrameTimeout();
    context.setError("");
    return;
  }

  if (
    message.v === 2 &&
    !(type === "error" && !context.handshakeRef.current) &&
    (
      !context.handshakeRef.current ||
      String(message.session_id || "") !==
        context.socketSessionRef.current ||
      String(message.runtime_id || "") !== context.runtimeIdRef.current ||
      Number(message.incarnation || 0) !== context.incarnationRef.current ||
      String(message.connection_id || "") !==
        context.connectionIdRef.current
    )
  ) {
    if (type === "frame.meta") context.dropNextBinaryRef.current = true;
    context.rejectProtocol(context.tt("浏览器运行失败"));
    return;
  }

  if (type === "frame.meta" || type === "frame-meta") {
    if (type === "frame-meta" && context.protocolRef.current === 2) {
      return;
    }
    if (isV2 && !context.handshakeRef.current) {
      context.dropNextBinaryRef.current = true;
      return;
    }
    if (!isV2) context.adoptLegacyHandshake();
    const meta = parseCloudBrowserFrameMeta(message);
    const staleStream =
      context.protocolRef.current === 2 &&
      Boolean(
        context.streamIdRef.current &&
          meta.streamId &&
          meta.streamId !== context.streamIdRef.current &&
          (!meta.generation ||
            meta.generation <= context.streamGenerationRef.current),
      );
    const staleGeneration =
      context.protocolRef.current === 2 &&
      Boolean(
        meta.generation &&
          context.streamGenerationRef.current &&
          meta.generation < context.streamGenerationRef.current,
      );
    const wrongRuntime =
      (meta.runtimeId &&
        context.runtimeIdRef.current &&
        meta.runtimeId !== context.runtimeIdRef.current) ||
      (meta.incarnation &&
        context.incarnationRef.current &&
        meta.incarnation !== context.incarnationRef.current) ||
      (meta.tabId &&
        context.activeTabIdRef.current &&
        meta.tabId !== context.activeTabIdRef.current);
    if (
      context.protocolRef.current === 2 &&
      (staleStream || staleGeneration || wrongRuntime)
    ) {
      context.dropNextBinaryRef.current = true;
      context.pendingV2BinaryRef.current = false;
      return;
    }
    const streamChanged =
      Boolean(
        meta.streamId &&
          meta.streamId !== context.streamIdRef.current,
      ) ||
      Boolean(
        meta.generation &&
          meta.generation > context.streamGenerationRef.current,
      );
    if (streamChanged) {
      if (meta.streamId) context.streamIdRef.current = meta.streamId;
      if (meta.generation) {
        context.streamGenerationRef.current = meta.generation;
      }
      context.cancelFrameDecode(false);
      context.transition("awaiting_first_frame");
      context.armFirstFrameTimeout();
    }
    context.acceptFrameMeta(message);
    context.pendingV2BinaryRef.current =
      context.protocolRef.current === 2;
    return;
  }

  if (type === "frame" && message.data) {
    if (isV2 && !context.handshakeRef.current) return;
    if (!isV2) context.adoptLegacyHandshake();
    context.drawTextFrame(String(message.data), message);
    return;
  }

  if (type === "tabs.snapshot") {
    const tabs = normalizeCloudBrowserTabs(message.tabs || message.items);
    context.setTabs(tabs);
    const activeId = String(
      message.active_tab_id ||
        tabs.find((tab) => tab.id === context.activeTabIdRef.current)?.id ||
        tabs[0]?.id ||
        "",
    );
    context.activeTabIdRef.current = activeId;
    context.setActiveTabId(activeId);
    if (message.stream_id) setExpectedStream(message, context);
    return;
  }

  if (
    type === "tab.opened" ||
    type === "tab.updated" ||
    type === "tab.activated"
  ) {
    const tab = normalizeCloudBrowserTab(message.tab || message);
    if (tab) upsertTab(context.setTabs, tab);
    const activate =
      type === "tab.activated" ||
      message.active === true ||
      message.active_tab_id === tab?.id;
    if (activate && tab) {
      context.activeTabIdRef.current = tab.id;
      context.setActiveTabId(tab.id);
      setExpectedStream(message, context);
    }
    return;
  }

  if (type === "tab.closed") {
    const closedId = String(message.tab_id || "");
    context.setTabs((current) =>
      current.filter((tab) => tab.id !== closedId),
    );
    const activeId = String(message.active_tab_id || "");
    if (activeId) {
      context.activeTabIdRef.current = activeId;
      context.setActiveTabId(activeId);
      setExpectedStream(message, context);
    }
    return;
  }

  if (type === "control.state") {
    const lease = normalizeCloudBrowserLease(message.lease || message);
    const intent = context.controlIntentRef.current;
    const owned =
      lease.holderKind === "human" &&
      ((lease.connectionId &&
        lease.connectionId === context.connectionIdRef.current) ||
        (!lease.connectionId && intent === "acquire"));
    context.setCurrentLease(lease, Boolean(owned));
    context.controlIntentRef.current = "";
    context.setControlPending(false);
    return;
  }

  if (type === "lock") {
    if (context.protocolRef.current === 2) return;
    context.adoptLegacyHandshake();
    context.setLegacyDriving(message.driving === "human");
    context.setControlPending(false);
    return;
  }

  if (type === "meta") {
    if (context.protocolRef.current === 2) return;
    context.adoptLegacyHandshake();
    const url = redactedDisplayUrl(String(message.url || ""));
    const title = String(message.title || "");
    context.setAddress(url);
    const id = `legacy:${context.socketSessionRef.current}`;
    context.setTabs([{ id, title, displayUrl: url, status: "ready" }]);
    context.activeTabIdRef.current = id;
    context.setActiveTabId(id);
    return;
  }

  if (type === "navigation") {
    const failed =
      message.ok === false ||
      message.state === "failed" ||
      message.status === "failed";
    if (failed) {
      context.setError(
        String(
          message.message ||
            message.msg ||
            context.tt("网址被安全策略拒绝"),
        ),
      );
      return;
    }
    const url = redactedDisplayUrl(
      String(message.display_url || message.url || ""),
    );
    if (url) context.setAddress(url);
    const loading =
      message.state === "started" || message.status === "started";
    if (loading) {
      context.transition("awaiting_first_frame");
      context.armFirstFrameTimeout();
    }
    if (message.stream_id) {
      setExpectedStream(message, context);
      context.cancelFrameDecode(false);
    }
    updateActiveTab(context, {
      displayUrl: url || undefined,
      title: typeof message.title === "string" ? message.title : undefined,
      status: loading ? "loading" : "ready",
    });
    if (!loading) context.setError("");
    return;
  }

  if (type === "history.saved") {
    void context.refreshEvents();
    return;
  }

  if (type === "checkpoint.saved") {
    return;
  }

  if (type === "session.state") {
    const failed =
      message.state === "failed" ||
      message.durable_state === "failed" ||
      message.runtime_state === "dead" ||
      message.live_state === "failed";
    if (failed) {
      context.transition("failed");
      context.setError(
        String(message.reason || context.tt("浏览器运行失败")),
      );
    } else if (
      message.live_state === "awaiting_first_frame" &&
      context.transportStateRef.current !== "streaming"
    ) {
      context.transition("awaiting_first_frame");
      context.armFirstFrameTimeout();
    }
    return;
  }

  if (type === "error" || type === "warn") {
    if (String(message.code || "") === "LEASE_NOT_HELD") {
      context.setCurrentLease(
        { ...context.leaseRef.current, holderKind: "free" },
        false,
      );
      context.setControlPending(false);
    }
    context.setError(
      String(message.message || message.msg || context.tt("浏览器操作失败")),
    );
  }
}
