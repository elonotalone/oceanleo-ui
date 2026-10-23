// 平台通知的状态仓（纯 TS：网络、计时器、可见性都经依赖注入，tests/lbp-w08-notices.test.mjs 用假依赖跑真实现）。
//
// 为什么是轮询：后端把通知写进 `user_notifications`，读口是 `GET /v1/notifications`；IM 实时通道里没有任何通知事件
// （`ImEvent` 里查不到），所以新通知到达只能靠取。节奏沿用铃铛原来的 60 秒，另加「标签页切回可见立即取一次」。
// 每次取的是同一个接口的最近 N 条（它同时返回全局未读数），所以未读数和「最新一条标题」永远来自同一次响应，不会互相打架。
//
// 使用方引用计数：第一个使用方（`acquire()`）开始轮询，最后一个释放就停；状态留着（再回来先画旧的、同时刷新）。
// 登出（`reset()`）清空，下一位账号看不到上一位的通知。
import type { NotificationItem } from "../../../api/notifications";

export const NOTICE_POLL_MS = 60_000;
/** 第一屏条数；「加载更多」每次加这么多。接口没有游标，只有 limit。 */
export const NOTICE_PAGE = 30;
/** 接口允许的上限（`limit` ≤ 200）。 */
export const NOTICE_MAX_LIMIT = 200;

export interface NoticeState {
  /** 最新在前（服务端排好的次序）。 */
  items: NotificationItem[];
  /** 服务端的全局未读数（可能比 items 里未读的条数多：更早的没取下来）。 */
  unread: number;
  /** 至少成功取到过一次。 */
  loaded: boolean;
  loading: boolean;
  /** 最近一次取失败了（旧数据仍留着）。 */
  error: boolean;
  /** 还有更早的没取下来。 */
  hasMore: boolean;
}

export function emptyNoticeState(): NoticeState {
  return { items: [], unread: 0, loaded: false, loading: false, error: false, hasMore: false };
}

export interface NoticeApiResult<T> {
  ok: boolean;
  data?: T;
}

export interface NoticeStoreDeps {
  list(limit: number): Promise<NoticeApiResult<{ items: NotificationItem[]; unread_count: number }>>;
  markRead(ids?: string[]): Promise<NoticeApiResult<{ updated: number; unread_count: number }>>;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** 标签页在后台时不轮询。 */
  isHidden(): boolean;
  /** 标签页又可见了；返回取消函数。 */
  onVisible(handler: () => void): () => void;
  pollMs?: number;
}

export interface NoticeStore {
  getState(): NoticeState;
  subscribe(listener: () => void): () => void;
  /** 登记一个使用方；返回释放函数（重复调用只算一次）。第一个使用方开始轮询，最后一个释放就停。 */
  acquire(): () => void;
  /** 立即取一次（合并并发）。 */
  refresh(): Promise<void>;
  /** 再多取一屏更早的。 */
  loadMore(): Promise<void>;
  /** 把这几条标为已读（乐观更新，失败则以服务端为准重取）。已读的忽略。 */
  markRead(ids: string[]): Promise<void>;
  /** 全部标为已读。 */
  markAllRead(): Promise<void>;
  /** 登出：清空一切，不再接受进行中的响应。 */
  reset(): void;
}

function isEmptyState(value: NoticeState): boolean {
  return (
    value.items.length === 0 && value.unread === 0 && !value.loaded && !value.loading && !value.error && !value.hasMore
  );
}

function cleanUnread(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isItem(value: unknown): value is NotificationItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<NotificationItem>;
  return typeof item.id === "string" && item.id !== "" && typeof item.title === "string";
}

export function createNoticeStore(deps: NoticeStoreDeps): NoticeStore {
  const pollMs = deps.pollMs ?? NOTICE_POLL_MS;
  const listeners = new Set<() => void>();
  let state = emptyNoticeState();
  let limit = NOTICE_PAGE;
  let users = 0;
  let timer: unknown = null;
  let offVisible: (() => void) | null = null;
  /** start / stop / reset 各换一个号：换号之前发出的响应一律丢弃。 */
  let generation = 0;
  /** 每次本地改动（标已读）换号：改动期间发出的取数结果可能是旧的，丢掉重取。 */
  let epoch = 0;
  let inflight: Promise<void> | null = null;

  function set(patch: Partial<NoticeState>): void {
    const next = { ...state, ...patch };
    const changed = (Object.keys(next) as (keyof NoticeState)[]).some((key) => next[key] !== state[key]);
    if (!changed) return;
    state = next;
    for (const listener of Array.from(listeners)) listener();
  }

  /** `loading` 只给「还没有数据」和用户主动要的（加载更多）亮：后台轮询不闪。 */
  function fetchNow(showLoading = false): Promise<void> {
    if (inflight) return inflight;
    const startedGeneration = generation;
    const startedEpoch = epoch;
    const wanted = limit;
    if (showLoading || !state.loaded) set({ loading: true });
    let mine: Promise<void> | null = null;
    const run = (async () => {
      let result: Awaited<ReturnType<NoticeStoreDeps["list"]>>;
      try {
        result = await deps.list(wanted);
      } catch {
        result = { ok: false };
      }
      // 只清自己：停掉再起之后，新一轮的 inflight 不能被旧响应抹掉。
      if (inflight === mine) inflight = null;
      if (startedGeneration !== generation) {
        // 停掉 / 重置 / 重新开始之后才回来的旧响应：不进状态；没有别的取数在跑就别让「正在加载」一直亮着。
        if (!inflight && state.loading) set({ loading: false });
        return;
      }
      if (!result.ok || !result.data || !Array.isArray(result.data.items)) {
        set({ loading: false, error: true });
        return;
      }
      if (startedEpoch !== epoch) {
        // 取数期间用户标了已读：这份结果可能还是旧的，丢掉再取一次（不闪回未读）。
        set({ loading: false });
        void fetchNow();
        return;
      }
      const items = result.data.items.filter(isItem);
      set({
        items,
        unread: cleanUnread(result.data.unread_count),
        loaded: true,
        loading: false,
        error: false,
        hasMore: result.data.items.length >= wanted && wanted < NOTICE_MAX_LIMIT,
      });
    })();
    mine = run;
    inflight = run;
    return run;
  }

  function tick(): void {
    if (users <= 0) return;
    if (!deps.isHidden()) void fetchNow();
    schedule();
  }

  function schedule(): void {
    if (timer != null) deps.clearTimer(timer);
    timer = deps.setTimer(tick, pollMs);
  }

  function stopTimers(): void {
    if (timer != null) deps.clearTimer(timer);
    timer = null;
    offVisible?.();
    offVisible = null;
  }

  async function applyRead(ids: string[] | null): Promise<void> {
    const targets = state.items.filter((item) => !item.read_at && (ids === null || ids.includes(item.id)));
    if (ids !== null && targets.length === 0) return;
    // 全部已读：本地没有未读条目、服务端计数也是 0 才算没事做；计数不是 0 说明更早没取下来的里还有未读，照样发。
    if (ids === null && targets.length === 0 && state.unread === 0) return;
    epoch += 1;
    const stamp = new Date(deps.now()).toISOString();
    const hit = new Set(targets.map((item) => item.id));
    set({
      items: state.items.map((item) => (hit.has(item.id) ? { ...item, read_at: stamp } : item)),
      unread: ids === null ? 0 : Math.max(0, state.unread - targets.length),
    });
    const startedGeneration = generation;
    let result: Awaited<ReturnType<NoticeStoreDeps["markRead"]>>;
    try {
      result = await deps.markRead(ids === null ? undefined : targets.map((item) => item.id));
    } catch {
      result = { ok: false };
    }
    if (startedGeneration !== generation) return;
    if (result.ok && result.data) {
      set({ unread: cleanUnread(result.data.unread_count) });
      return;
    }
    // 没成功：乐观的已读不能留着骗人，以服务端为准重取。
    epoch += 1;
    await fetchNow();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    acquire() {
      users += 1;
      if (users === 1) {
        generation += 1;
        // 先于 acquire 发出的取数（refresh 单独调过）属于上一代，它的响应会被丢掉：这里重新发一次，别白等一个轮询周期。
        inflight = null;
        void fetchNow();
        schedule();
        offVisible = deps.onVisible(() => {
          if (users > 0 && !deps.isHidden()) void fetchNow();
        });
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        users = Math.max(0, users - 1);
        if (users > 0) return;
        generation += 1;
        inflight = null;
        stopTimers();
        // 状态留着：下一个使用方回来先画旧的，同时 acquire() 会刷新。清空只在登出（reset）。
        if (state.loading) set({ loading: false });
      };
    },
    refresh: () => fetchNow(),
    async loadMore() {
      if (!state.hasMore || state.loading) return;
      limit = Math.min(NOTICE_MAX_LIMIT, limit + NOTICE_PAGE);
      await fetchNow(true);
    },
    markRead: (ids) => applyRead(Array.isArray(ids) ? ids : []),
    markAllRead: () => applyRead(null),
    reset() {
      generation += 1;
      epoch += 1;
      inflight = null;
      limit = NOTICE_PAGE;
      if (users === 0) stopTimers();
      if (isEmptyState(state)) return;
      state = emptyNoticeState();
      for (const listener of Array.from(listeners)) listener();
    },
  };
}
