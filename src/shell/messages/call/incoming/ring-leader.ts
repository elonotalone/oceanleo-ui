// 同一浏览器开着好几个 OceanLeo 标签页时，来电只响一次（任务书 P3）。纯 TS + 依赖注入。
//
// 现有 `realtime/broadcast.ts` 只做同页 CustomEvent、明言不跨窗口，用不上；这里自建：
//   1. 首选 Web Locks（`navigator.locks`，同源跨标签原子）：拿到 `oceanleo:call-ring:<callId>` 这把锁的标签页响铃，
//      锁一直握到铃声停；标签页关掉锁自动释放。可见的标签页立即去拿，后台标签页晚 120 毫秒——用户正看着的那页优先响。
//   2. 没有 Web Locks 时用 BroadcastChannel 互报「我要响」，在 150 毫秒窗口里按（可见优先、标签 id 小者）选一个；
//      已经在响的标签页对后来者回一声「我在响」。
//   3. 两样都没有：照响（宁可多响一次，也不能一声不响）。
// 只传 callId 与随机标签 id，不带任何凭据或个人信息。

export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

export interface ChannelLike {
  postMessage(data: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export interface RingLeaderDeps {
  locks: LockManagerLike | null;
  openChannel(name: string): ChannelLike | null;
  tabId: string;
  isVisible(): boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RingClaim {
  /** true = 本标签页负责响铃。 */
  won: Promise<boolean>;
  /** 铃声停了（接听 / 拒绝 / 到期 / 卡片收起）：放掉锁、关掉频道。可重复调用。 */
  release(): void;
}

export const RING_LOCK_PREFIX = "oceanleo:call-ring:";
export const RING_CHANNEL = "oceanleo:call-ring";
export const HIDDEN_DELAY_MS = 120;
export const SETTLE_MS = 150;

interface ClaimMessage {
  t: "claim" | "ringing";
  callId: string;
  tabId: string;
  visible: boolean;
}

function isClaimMessage(value: unknown): value is ClaimMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.t === "claim" || v.t === "ringing") &&
    typeof v.callId === "string" &&
    typeof v.tabId === "string" &&
    typeof v.visible === "boolean"
  );
}

/** 选谁响：可见的优先，其次标签 id 字典序小的。 */
export function pickRinger(claims: Array<{ tabId: string; visible: boolean }>): string | null {
  let best: { tabId: string; visible: boolean } | null = null;
  for (const claim of claims) {
    if (!best) {
      best = claim;
      continue;
    }
    if (claim.visible !== best.visible) {
      if (claim.visible) best = claim;
      continue;
    }
    if (claim.tabId < best.tabId) best = claim;
  }
  return best ? best.tabId : null;
}

function claimWithLocks(deps: RingLeaderDeps, locks: LockManagerLike, callId: string): RingClaim {
  let released = false;
  let unlock: () => void = () => {};
  let timer: unknown = null;
  const won = new Promise<boolean>((resolve) => {
    const go = () => {
      timer = null;
      if (released) {
        resolve(false);
        return;
      }
      locks
        .request(`${RING_LOCK_PREFIX}${callId}`, { ifAvailable: true }, (lock) => {
          if (!lock || released) {
            resolve(false);
            return;
          }
          resolve(true);
          return new Promise<void>((done) => {
            unlock = done;
          });
        })
        .catch(() => resolve(true));
    };
    if (deps.isVisible()) go();
    else timer = deps.setTimeout(go, HIDDEN_DELAY_MS);
  });
  return {
    won,
    release() {
      if (released) return;
      released = true;
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      unlock();
    },
  };
}

function claimWithChannel(deps: RingLeaderDeps, channel: ChannelLike, callId: string): RingClaim {
  const claims = new Map<string, boolean>();
  let decided = false;
  let winner = false;
  let someoneRinging = false;
  let released = false;
  let settleTimer: unknown = null;
  let claimTimer: unknown = null;
  const visible = deps.isVisible();
  claims.set(deps.tabId, visible);

  const post = (t: ClaimMessage["t"]) => {
    const message: ClaimMessage = { t, callId, tabId: deps.tabId, visible };
    try {
      channel.postMessage(message);
    } catch {
      /* 频道已关 */
    }
  };

  const onMessage = (event: { data: unknown }) => {
    const data = event?.data;
    if (!isClaimMessage(data) || data.callId !== callId || data.tabId === deps.tabId) return;
    if (data.t === "ringing") {
      someoneRinging = true;
      return;
    }
    claims.set(data.tabId, data.visible);
    if (decided && winner) post("ringing");
  };
  channel.addEventListener("message", onMessage);

  const won = new Promise<boolean>((resolve) => {
    const settle = () => {
      settleTimer = null;
      if (released) {
        resolve(false);
        return;
      }
      decided = true;
      const pick = pickRinger(Array.from(claims, ([tabId, isVisible]) => ({ tabId, visible: isVisible })));
      winner = !someoneRinging && pick === deps.tabId;
      if (winner) post("ringing");
      resolve(winner);
    };
    const start = () => {
      claimTimer = null;
      if (released) {
        resolve(false);
        return;
      }
      post("claim");
      settleTimer = deps.setTimeout(settle, SETTLE_MS);
    };
    if (visible) start();
    else claimTimer = deps.setTimeout(start, HIDDEN_DELAY_MS);
  });

  return {
    won,
    release() {
      if (released) return;
      released = true;
      if (settleTimer !== null) deps.clearTimeout(settleTimer);
      if (claimTimer !== null) deps.clearTimeout(claimTimer);
      channel.removeEventListener("message", onMessage);
      try {
        channel.close();
      } catch {
        /* ignore */
      }
    },
  };
}

export function claimRing(deps: RingLeaderDeps, callId: string): RingClaim {
  if (deps.locks) return claimWithLocks(deps, deps.locks, callId);
  let channel: ChannelLike | null = null;
  try {
    channel = deps.openChannel(RING_CHANNEL);
  } catch {
    channel = null;
  }
  if (channel) return claimWithChannel(deps, channel, callId);
  return { won: Promise.resolve(true), release() {} };
}

function randomTabId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* 退回下面 */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let browserTabId: string | null = null;

/** 浏览器里的默认依赖。 */
export function browserRingLeaderDeps(): RingLeaderDeps {
  if (!browserTabId) browserTabId = randomTabId();
  const locks =
    typeof navigator === "undefined" ? undefined : (navigator as unknown as { locks?: LockManagerLike }).locks;
  return {
    locks: locks && typeof locks.request === "function" ? locks : null,
    openChannel(name) {
      if (typeof BroadcastChannel === "undefined") return null;
      return new BroadcastChannel(name) as unknown as ChannelLike;
    },
    tabId: browserTabId,
    isVisible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}
