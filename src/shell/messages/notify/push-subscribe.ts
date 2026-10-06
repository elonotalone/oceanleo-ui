"use client";

// 浏览器推送的订阅流程与 Service Worker 消息桥（work-chat W03，契约 §9.8）。
//
// 推送只在门户 oceanleo.com 开：Service Worker 文件在门户 `public/im-sw.js`，别的站拿不到它。
// 开启顺序：向网关要公钥 → 请求通知权限 → 注册 /im-sw.js → pushManager.subscribe → 把订阅交给网关
// → 把「推送」开关置为开。任何一步失败都返回一个明确的原因，面板据此给人话提示。

import {
  fetchPushConfig,
  registerPushSubscription,
  removePushSubscription,
  saveImSettings,
  type ImPushConfig,
} from "../../../lib/im/notify-api";

export const IM_SW_PATH = "/im-sw.js";

/** 点通知（本页的桌面通知或推送 SW 的 `im.open`）后要打开某个会话时派发的 window 事件；W08 监听。 */
export const IM_OPEN_EVENT = "oceanleo:im-open";

export interface ImOpenDetail {
  conversationId: string;
}

export function dispatchImOpen(detail: ImOpenDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ImOpenDetail>(IM_OPEN_EVENT, { detail }));
}

export type EnablePushResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unsupported" | "wrong_origin" | "server_off" | "denied" | "network" | "rejected" | "failed";
    };

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/** 当前页面是不是网关指定的门户域（推送只在这里开）。 */
export function isPortalOrigin(portalOrigin: string, currentOrigin?: string): boolean {
  const current = currentOrigin ?? (typeof window === "undefined" ? "" : window.location.origin);
  try {
    return new URL(portalOrigin).origin === current && current.startsWith("https://");
  } catch {
    return false;
  }
}

export function urlBase64ToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bufferToUrlBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  return !!current && bufferToUrlBase64(current as ArrayBuffer) === publicKey.replace(/=+$/, "");
}

/** 这台电脑此刻有没有订阅（只看浏览器本地，不问网关）。 */
export async function hasLocalSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(IM_SW_PATH);
    return !!(registration && (await registration.pushManager.getSubscription()));
  } catch {
    return false;
  }
}

export async function enablePush(known?: ImPushConfig): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  let config = known;
  if (!config) {
    const result = await fetchPushConfig();
    if (!result.ok) return { ok: false, reason: "network" };
    config = result.data;
  }
  if (!config.enabled || !config.vapid_public_key) return { ok: false, reason: "server_off" };
  if (!isPortalOrigin(config.portal_origin)) return { ok: false, reason: "wrong_origin" };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    await navigator.serviceWorker.register(IM_SW_PATH, { scope: "/" });
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, config.vapid_public_key)) {
      // 网关换过密钥：旧订阅永远发不通，先退掉再订。
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(config.vapid_public_key) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) return { ok: false, reason: "failed" };

    const saved = await registerPushSubscription({
      endpoint: json.endpoint,
      keys: { p256dh, auth },
      user_agent: navigator.userAgent.slice(0, 300),
    });
    if (!saved.ok) return { ok: false, reason: saved.status === 422 ? "rejected" : "network" };

    const flag = await saveImSettings({ push_enabled: true });
    if (!flag.ok) return { ok: false, reason: "network" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** 关闭这台电脑的推送：退订阅、通知网关删掉、把开关置为关。浏览器侧失败也要把开关关掉。 */
export async function disablePush(): Promise<boolean> {
  try {
    if (pushSupported()) {
      const registration = await navigator.serviceWorker.getRegistration(IM_SW_PATH);
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        const endpoint = subscription.endpoint;
        await removePushSubscription(endpoint);
        await subscription.unsubscribe();
      }
    }
  } catch {
    /* 浏览器那头出错不阻止关开关 */
  }
  const flag = await saveImSettings({ push_enabled: false });
  return flag.ok;
}

const CONVERSATION_ID = /^[A-Za-z0-9:_-]{1,80}$/;

/**
 * 点推送通知时 Service Worker 会给已打开的门户标签页发 `{type:"im.open", conversation_id}`。
 * 这里只认「来自本源 Service Worker」的这一种消息，转成统一的 `oceanleo:im-open` window 事件。
 * 幂等：重复调用只装一次；返回卸载函数。
 */
let bridgeCleanup: (() => void) | null = null;

export function installImOpenBridge(): () => void {
  if (bridgeCleanup) return bridgeCleanup;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !navigator.serviceWorker) {
    return () => {};
  }
  const container = navigator.serviceWorker;
  const onMessage = (event: MessageEvent) => {
    if (event.origin && event.origin !== window.location.origin) return;
    const source = event.source as { scriptURL?: string } | null;
    if (!source || typeof source.scriptURL !== "string") return; // 不是 ServiceWorker 发来的
    try {
      const script = new URL(source.scriptURL);
      if (script.origin !== window.location.origin || script.pathname !== IM_SW_PATH) return;
    } catch {
      return;
    }
    const data = event.data as { type?: unknown; conversation_id?: unknown } | null;
    if (!data || data.type !== "im.open") return;
    const id = data.conversation_id;
    if (typeof id !== "string" || !CONVERSATION_ID.test(id)) return; // 空 id = 只聚焦，不跳转
    dispatchImOpen({ conversationId: id });
  };
  container.addEventListener("message", onMessage);
  bridgeCleanup = () => {
    container.removeEventListener("message", onMessage);
    bridgeCleanup = null;
  };
  return bridgeCleanup;
}
