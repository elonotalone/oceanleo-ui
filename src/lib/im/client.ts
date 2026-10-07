// 消息板块的网关客户端（work-chat 契约 §4 / §8.3）：带 token、网关地址；错误抛 ImApiError。
// 只用 lib/auth 已提交的出口：GATEWAY_BASE、accessToken、cachedAccessToken、AUTH_STATE_EVENT。
import { useEffect, useState, useSyncExternalStore } from "react";
import { currentDomainFamily } from "../../contracts/domain-family";
import { GATEWAY_BASE } from "../auth/config";
import { AUTH_STATE_EVENT, accessToken, cachedAccessToken } from "../auth/client";
import { imEnabledFor } from "../../shell/messages/messages-family";
import type { ImErrorBody } from "./types";

export class ImApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ImApiError";
    this.status = status;
    this.code = code;
  }
}

/** 境内（域名家族为境内）或未登录 → false。 */
export function imEnabledHere(): boolean {
  let family: ReturnType<typeof currentDomainFamily>;
  try {
    family = currentDomainFamily();
  } catch {
    return false;
  }
  let signedIn = false;
  try {
    signedIn = Boolean(cachedAccessToken());
  } catch {
    signedIn = false;
  }
  return imEnabledFor(family, signedIn);
}

// ---- 登录态订阅：让「消息」入口随登录/退出自己出现或消失 ------------------------
const enabledListeners = new Set<() => void>();
let authListenerInstalled = false;
let primed = false;

function notifyEnabled(): void {
  for (const listener of Array.from(enabledListeners)) listener();
}

function installAuthListener(): void {
  if (authListenerInstalled || typeof window === "undefined") return;
  authListenerInstalled = true;
  window.addEventListener(AUTH_STATE_EVENT, notifyEnabled);
}

/** 登录态在内存里是懒加载的：首次订阅时主动取一次，取到后通知订阅者。 */
function primeSession(): void {
  if (primed) return;
  primed = true;
  void accessToken()
    .then(() => notifyEnabled())
    .catch(() => {
      primed = false;
    });
}

export function subscribeImEnabled(listener: () => void): () => void {
  enabledListeners.add(listener);
  installAuthListener();
  primeSession();
  return () => {
    enabledListeners.delete(listener);
  };
}

/** 响应式版本：服务端与水合首帧恒为 false，避免登录态把「消息」灌进 HTML。
 *  挂载之后一律读 `imEnabledHere()`：`useTransition` / View Transition 期间
 *  `useSyncExternalStore` 会短暂回到 getServerSnapshot=false，侧栏「消息」会
 *  从新快照里消失、比其它按键晚一拍才回来。 */
export function useImEnabled(): boolean {
  const snapshot = useSyncExternalStore(subscribeImEnabled, imEnabledHere, () => false);
  const [client, setClient] = useState(false);
  useEffect(() => {
    setClient(true);
  }, []);
  return client ? imEnabledHere() : snapshot;
}

function apiUrl(path: string): string {
  const base = (GATEWAY_BASE || "").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readError(response: Response): Promise<ImApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const detail = (body as { detail?: unknown } | null)?.detail;
  let code = `http_${response.status}`;
  let message = "";
  if (detail && typeof detail === "object") {
    const d = detail as Partial<ImErrorBody>;
    if (typeof d.code === "string" && d.code) code = d.code;
    if (typeof d.message === "string") message = d.message;
  } else if (typeof detail === "string") {
    message = detail;
  }
  return new ImApiError(response.status, code, message);
}

/**
 * 调网关。`init.json` 会被序列化为请求体。2xx 返回 JSON（204 返回 undefined）；
 * 202 `need_consent` 不是错误，照常返回体。其余抛 `ImApiError`。
 */
export async function imFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = await accessToken();
  if (!token) throw new ImApiError(401, "unauthorized", "请先登录");
  const merged = new Headers(headers);
  merged.set("Authorization", `Bearer ${token}`);
  let body = rest.body;
  if (json !== undefined) {
    merged.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...rest, headers: merged, body });
  } catch {
    throw new ImApiError(0, "network", "网络不通");
  }
  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ImApiError(response.status, "invalid", "服务返回的内容无法识别");
  }
}
