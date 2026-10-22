"use client";

// 远程控制组件共用的钩子：会话仓、短提示、控制方链路、倒计时用的「现在」、我是谁、参会者名字。
import { useEffect, useState, useSyncExternalStore } from "react";
import { AUTH_STATE_EVENT, getUserId } from "../../../../lib/auth/client";
import { useCall, type CallSnapshot } from "../engine";
import type { ControlLinkSnapshot } from "./control-socket";
import type { ControlStoreSnapshot } from "./control-store";
import type { ControlNotice } from "./notices";
import {
  controlNotices,
  controlStore,
  controllerLinksVersion,
  getControllerLink,
  subscribeControllerLinks,
  type ControllerLinkEntry,
} from "./runtime";

const EMPTY_STORE: ControlStoreSnapshot = { version: 0, sessions: [], requests: [] };
const EMPTY_NOTICES: readonly ControlNotice[] = [];

export function useControlSnapshot(): ControlStoreSnapshot {
  return useSyncExternalStore(controlStore.subscribe, controlStore.snapshot, () => EMPTY_STORE);
}

export function useControlNotices(): readonly ControlNotice[] {
  return useSyncExternalStore(controlNotices.subscribe, controlNotices.snapshot, () => EMPTY_NOTICES);
}

export function useControllerLink(sessionId: string | null): {
  entry: ControllerLinkEntry | null;
  link: ControlLinkSnapshot | null;
} {
  useSyncExternalStore(subscribeControllerLinks, controllerLinksVersion, () => 0);
  const entry = getControllerLink(sessionId);
  return { entry, link: entry ? entry.link.snapshot() : null };
}

/** 倒计时用：active 时每秒刷新一次。 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/** 我的 user_id：通话里的「我」优先，否则取登录态（异步，取到后刷新）。 */
export function useSelfUserId(call: CallSnapshot): string | null {
  const fromCall = call.participants.find((p) => p.isMe)?.userId ?? null;
  const [authId, setAuthId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    const load = () => {
      void getUserId()
        .then((id) => {
          if (alive) setAuthId(id ?? null);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(AUTH_STATE_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_STATE_EVENT, load);
    };
  }, []);
  return fromCall ?? authId;
}

export function useCallSnapshot(): CallSnapshot {
  return useCall();
}

/** 参会者显示名：通话名单里找不到就用兜底文字。 */
export function participantName(call: CallSnapshot, userId: string, fallback: string): string {
  const found = call.participants.find((p) => p.userId === userId);
  const name = found?.displayName?.trim();
  return name ? name : fallback;
}

export function callIsLive(call: Pick<CallSnapshot, "phase" | "callId">): boolean {
  return Boolean(call.callId) && (call.phase === "connected" || call.phase === "reconnecting");
}
