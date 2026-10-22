// 同一浏览器开着好几个 OceanLeo 标签页时，来电只响一次（任务书 P3）。纯 TS + 依赖注入。
//
// 现有 `realtime/broadcast.ts` 只做同页 CustomEvent、明言不跨窗口，用不上；这里用 Web Locks（`navigator.locks`，
// 同源跨标签原子）：拿到 `oceanleo:call-ring:<callId>` 这把锁的标签页响铃，锁一直握到铃声停；标签页关掉锁自动释放。
// 可见的标签页立即去拿，后台标签页晚 120 毫秒——用户正看着的那页优先响。
// 没有 Web Locks 的环境（很老的浏览器）照响：宁可多响一次，也不能一声不响。
// 不用 BroadcastChannel / postMessage：消息目录不收发 postMessage（tests/im-acceptance-static.test.mjs 第 12 条）。
// 锁名里只有 callId，不带任何凭据或个人信息。

export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
}

export interface RingLeaderDeps {
  locks: LockManagerLike | null;
  isVisible(): boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RingClaim {
  /** true = 本标签页负责响铃。 */
  won: Promise<boolean>;
  /** 铃声停了（接听 / 拒接 / 到期 / 卡片收起）：放掉锁。可重复调用。 */
  release(): void;
}

export const RING_LOCK_PREFIX = "oceanleo:call-ring:";
export const HIDDEN_DELAY_MS = 120;

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

export function claimRing(deps: RingLeaderDeps, callId: string): RingClaim {
  if (deps.locks) return claimWithLocks(deps, deps.locks, callId);
  return { won: Promise.resolve(true), release() {} };
}

/** 浏览器里的默认依赖。 */
export function browserRingLeaderDeps(): RingLeaderDeps {
  const locks =
    typeof navigator === "undefined" ? undefined : (navigator as unknown as { locks?: LockManagerLike }).locks;
  return {
    locks: locks && typeof locks.request === "function" ? locks : null,
    isVisible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}
