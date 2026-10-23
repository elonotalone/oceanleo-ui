// 远程控制网页端的运行时（每个标签页一份）：会话仓、短提示、控制方链路、桌面桥、各方动作。
// 纯逻辑都在 protocol / control-store / control-socket / host-logic / banner-model 里；这里只做接线。
import { GATEWAY_BASE } from "../../../../lib/auth/config";
import { accessToken } from "../../../../lib/auth/client";
import { readCallControlBridge, type OceanLeoCallControlBridge } from "./bridge";
import { noticeForTransition, requestErrorNotice, type ControlNoticeCode } from "./banner-model";
import { controlApi, type ControlDeclineReason } from "./control-api";
import { createControlLink, type ControlLink, type ControlWebSocketLike } from "./control-socket";
import { createControlStore } from "./control-store";
import { gatewayOriginOf, type StorageLike } from "./host-logic";
import { createNoticeStore } from "./notices";
import { controlSocketUrl, createControlSender, type ControlSender } from "./protocol";

const setTimer = (fn: () => void, ms: number): unknown => setTimeout(fn, ms);
const clearTimer = (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>);
const now = (): number => Date.now();

export const controlStore = createControlStore({ now });
export const controlNotices = createNoticeStore({ now, setTimer, clearTimer });

// ---- 我是谁 & 本端刚停止过的会话 -------------------------------------------------------------
let selfId: string | null = null;

/** CallControlHost 每次渲染时告诉运行时「我」的 user_id（提示与安全兜底要用）。
 *  改变时重新对账控制方链路：这也兜住「active 事件先到、selfId 后到」的竞态（D9）。 */
export function setControlSelfId(id: string | null): void {
  if (selfId === id) return;
  selfId = id;
  syncControllerLinks();
}

export function controlSelfId(): string | null {
  return selfId;
}

const stoppedByMe = new Set<string>();

export function markStoppedByMe(sessionId: string): void {
  stoppedByMe.add(sessionId);
}

export function wasStoppedByMe(sessionId: string): boolean {
  return stoppedByMe.has(sessionId);
}

// ---- 环境 ---------------------------------------------------------------------------------
export function currentBridge(): OceanLeoCallControlBridge | null {
  if (typeof window === "undefined") return null;
  return readCallControlBridge(window);
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function pageOrigin(): string | null {
  try {
    return typeof window !== "undefined" ? window.location.origin : null;
  } catch {
    return null;
  }
}

export function controlGatewayBase(): string {
  return GATEWAY_BASE || pageOrigin() || "";
}

export function controlGatewayOrigin(): string {
  return gatewayOriginOf(GATEWAY_BASE, pageOrigin());
}

// ---- 控制方链路（按会话一条；由全局 Host 按「我正在控制的进行中会话」开关，组件只借用） -------------
export interface ControllerLinkEntry {
  sessionId: string;
  link: ControlLink;
  sender: ControlSender;
}

const links = new Map<string, ControllerLinkEntry>();
const linkListeners = new Set<() => void>();
let linksVersion = 0;

function emitLinks(): void {
  linksVersion += 1;
  for (const listener of Array.from(linkListeners)) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeControllerLinks(listener: () => void): () => void {
  linkListeners.add(listener);
  return () => {
    linkListeners.delete(listener);
  };
}

export function controllerLinksVersion(): number {
  return linksVersion;
}

export function getControllerLink(sessionId: string | null | undefined): ControllerLinkEntry | null {
  return sessionId ? links.get(sessionId) ?? null : null;
}

export function controllerLinkIds(): string[] {
  return Array.from(links.keys());
}

// 控制方链路的 WebSocket 工厂：生产用浏览器 `WebSocket`；测试经 `__setControllerSocketFactory` 注入假的。
type ControllerSocketFactory = (url: string) => ControlWebSocketLike;
const defaultSocketFactory: ControllerSocketFactory = (url) => new WebSocket(url) as unknown as ControlWebSocketLike;
let controllerSocketFactory: ControllerSocketFactory = defaultSocketFactory;

/** 测试接缝：注入假 WebSocket 工厂；传 null 恢复默认。生产代码不要调。 */
export function __setControllerSocketFactory(factory: ControllerSocketFactory | null): void {
  controllerSocketFactory = factory ?? defaultSocketFactory;
}

export function ensureControllerLink(sessionId: string): ControllerLinkEntry {
  const existing = links.get(sessionId);
  if (existing) return existing;
  const link = createControlLink({
    url: () => controlSocketUrl(controlGatewayBase(), sessionId),
    getToken: () => accessToken(),
    createSocket: (url) => controllerSocketFactory(url),
    setTimer,
    clearTimer,
    random: () => Math.random(),
    now,
  });
  const sender = createControlSender({ deliver: (frame) => link.send(frame), now, setTimer, clearTimer });
  const entry: ControllerLinkEntry = { sessionId, link, sender };
  links.set(sessionId, entry);
  link.subscribe(() => {
    const snap = link.snapshot();
    if (snap.state === "ended") {
      sender.reset();
      if (links.get(sessionId) === entry) links.delete(sessionId);
      // 链路自己断了（不是本端停止）：网关未必知道控制方已经没连接，主动停掉并提示。
      if (!stoppedByMe.has(sessionId) && snap.endReason === "connection_lost") {
        stoppedByMe.add(sessionId);
        controlNotices.push("ended_connection", { sessionId });
        void stopOnServer(sessionId);
      }
    }
    emitLinks();
  });
  link.start();
  emitLinks();
  return entry;
}

/** 关掉链路。sendStop：先经发送器抬起全部键并发 stop，再直接补发一帧 stop（不受限速影响），然后关。 */
export function closeControllerLink(sessionId: string, options: { sendStop?: boolean } = {}): void {
  const entry = links.get(sessionId);
  if (!entry) return;
  links.delete(sessionId);
  if (options.sendStop) entry.sender.stop();
  entry.link.close({ sendStop: Boolean(options.sendStop), reason: "local_stop" });
  entry.sender.reset();
  emitLinks();
}

/**
 * 对账控制方中继链路（D9 的修复点）：为「我是控制方、且会话 active」的每个会话开一条链路，
 * 其余（会话结束/拒绝/超时/取消，或我已不是控制方/已离开通话）的链路关掉。幂等，可随意多调。
 * 没有 selfId 时一条都不开（也顺带把残留的全关掉）。
 */
export function syncControllerLinks(): void {
  const me = selfId;
  const wanted = new Set<string>();
  if (me) {
    for (const session of controlStore.snapshot().sessions) {
      if (session.state === "active" && session.controller_id === me) wanted.add(session.session_id);
    }
  }
  for (const sessionId of wanted) ensureControllerLink(sessionId);
  for (const sessionId of controllerLinkIds()) {
    if (!wanted.has(sessionId)) closeControllerLink(sessionId);
  }
}

/** 离开通话（或换到别的通话）时立刻关掉不属于当前在进行通话的控制方链路（不等服务端对账）。
 *  `liveCallId` = 我当前在进行的通话 call_id；不在通话里传 null → 全关。 */
export function closeControllerLinksOutsideCall(liveCallId: string | null): void {
  for (const sessionId of controllerLinkIds()) {
    const view = controlStore.get(sessionId);
    if (!liveCallId || !view || view.call_id !== liveCallId) closeControllerLink(sessionId);
  }
}

// ---- 动作 ---------------------------------------------------------------------------------
async function stopOnServer(sessionId: string, retry = true): Promise<void> {
  try {
    const res = await controlApi.stop(sessionId);
    controlStore.ingest(res?.session);
  } catch {
    if (retry) setTimer(() => void stopOnServer(sessionId, false), 2_000);
  }
}

/** 控制方请求控制。成功返回会话 id；失败返回提示码。 */
export async function requestControl(
  callId: string,
  targetUserId: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; notice: ControlNoticeCode }> {
  try {
    const res = await controlApi.request(callId, targetUserId);
    controlStore.ingest(res?.session);
    return { ok: true, sessionId: res?.session?.session_id ?? "" };
  } catch (error) {
    const e = error as { code?: string; status?: number } | null;
    return { ok: false, notice: requestErrorNotice(e?.code, e?.status) };
  }
}

/** 控制方撤回待批准的请求。 */
export async function cancelControlRequest(sessionId: string): Promise<void> {
  stoppedByMe.add(sessionId);
  try {
    const res = await controlApi.cancel(sessionId);
    controlStore.ingest(res?.session);
  } catch {
    controlStore.markLocal(sessionId, "cancelled", "cancelled");
  }
}

/** 控制方停止（「停止控制」或连按三次 Esc）：链路上先抬起全部键并发 stop，再关链路，再告诉网关。 */
export async function stopAsController(sessionId: string): Promise<void> {
  stoppedByMe.add(sessionId);
  closeControllerLink(sessionId, { sendStop: true });
  try {
    const res = await controlApi.stop(sessionId);
    controlStore.ingest(res?.session);
  } catch {
    controlStore.markLocal(sessionId, "ended", "stopped");
    setTimer(() => void stopOnServer(sessionId, false), 2_000);
  }
}

/** 被控方停止：本机桥先停（不经网络，INV-3），再告诉网关。 */
export async function stopAsTarget(sessionId: string): Promise<void> {
  stoppedByMe.add(sessionId);
  const bridge = currentBridge();
  if (bridge) {
    try {
      await bridge.stop(sessionId);
    } catch {
      /* 本机侧自己还有托盘与快捷键兜底 */
    }
  }
  await stopOnServer(sessionId);
}

/** 被控方拒绝（用户会话可以拒绝，不能批准）。 */
export async function declineAsTarget(sessionId: string, reason: ControlDeclineReason): Promise<void> {
  stoppedByMe.add(sessionId);
  controlStore.removeRequest(sessionId);
  try {
    const res = await controlApi.decline(sessionId, reason);
    controlStore.ingest(res?.session);
  } catch {
    /* 已经被本机拒过/已过期：结果一样 */
  }
}

/** 重连后补数据：与我有关、还活着的会话逐个查一次。 */
export async function refreshMySessions(): Promise<void> {
  const me = selfId;
  if (!me) return;
  const mine = controlStore
    .snapshot()
    .sessions.filter(
      (s) => (s.state === "pending" || s.state === "active") && (s.controller_id === me || s.target_id === me),
    );
  await Promise.all(
    mine.map(async (s) => {
      try {
        const res = await controlApi.get(s.session_id);
        controlStore.ingest(res?.session);
      } catch {
        /* 下次 call 事件对账兜底 */
      }
    }),
  );
}

// ---- 状态变化 → 提示与安全兜底（模块加载时接一次） ------------------------------------------------
controlStore.onTransition((transition) => {
  const sessionId = transition.next.session_id;
  const code = noticeForTransition(transition, selfId, stoppedByMe.has(sessionId));
  if (code) controlNotices.push(code, { sessionId });
  const me = selfId;
  if (!me) return;
  // 被控方：会话一离开 active，就让本机执行端停（本机侧也会因中继断开而停，这里是双保险）。
  if (transition.previous?.state === "active" && transition.next.state !== "active" && transition.next.target_id === me) {
    const bridge = currentBridge();
    if (bridge) void bridge.stop(sessionId).catch(() => {});
  }
  // 控制方：会话变 active 就开中继链路（D9），离开 active 就关——统一交给对账函数。
  syncControllerLinks();
});
