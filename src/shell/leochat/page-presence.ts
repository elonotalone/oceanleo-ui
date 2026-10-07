// LeoChat 整页在不在场、以及「请整页打开某个栏目/会话」的请求。
// 整页（LeoChatPage）挂载时登记；小窗入口据此决定点了弹不弹小窗。纯状态，不碰 DOM；服务端渲染时恒为不在场。
import { useSyncExternalStore } from "react";
import type { LeoChatTab } from "./leochat-links";

let mounted = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 整页挂载时调；返回卸载函数（重复调用只算一次）。 */
export function registerLeoChatPage(): () => void {
  mounted += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mounted = Math.max(0, mounted - 1);
    emit();
  };
}

export function leoChatPageMounted(): boolean {
  return mounted > 0;
}

export function useLeoChatPageMounted(): boolean {
  return useSyncExternalStore(subscribe, leoChatPageMounted, () => false);
}

export interface LeoChatPageRequest {
  tab?: LeoChatTab;
  conversationId?: string | null;
  seq?: number | null;
}

type RequestListener = (request: LeoChatPageRequest) => void;
const requestListeners = new Set<RequestListener>();

/** 整页在场时，把「打开某个栏目/会话」交给整页处理。返回 true = 整页接了，调用方不要再开小窗。 */
export function sendLeoChatPageRequest(request: LeoChatPageRequest): boolean {
  if (mounted === 0 || requestListeners.size === 0) return false;
  for (const listener of Array.from(requestListeners)) listener(request);
  return true;
}

/** 整页订阅上面的请求；返回退订函数。 */
export function onLeoChatPageRequest(listener: RequestListener): () => void {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}
