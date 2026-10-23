// 「去建资料」「去核验」：先记下要进编辑（以及进去后落在哪一块），再打开「我的主页」。
// 模块级开关，不进地址栏：公开链接仍是看主页，不是编辑态。
//
//   requestMinePageEdit();            // 旧调用：进编辑。已公开主页的人（I-8 的「去核验」入口）落在核验块，
//                                     // 还没公开的人（「去建资料」）从顶上开始建。
//   requestMinePageEdit("vetting");   // 明确要去核验块：一定滚到那里。
//
// 请求一次性：主页挂载时取走；主页已经挂着时（订阅）立刻生效。60 秒没人取就作废，
// 不会让很久以前的一次点击在之后某次普通打开时把人推进编辑态。
// 整页跳转（没有站内导航器时 openBay 退回 location.assign）会丢掉模块变量，所以同时记在 sessionStorage。

export type MinePageFocus = "vetting";

export interface MinePageEditRequest {
  /** 进编辑后要落在哪一块；null = 没指定（旧调用）。 */
  focus: MinePageFocus | null;
}

/** 请求的有效期。要盖过「懒加载页面 + 取主页数据」的时间，又不能长到变成陈旧状态。 */
export const MINE_PAGE_EDIT_TTL_MS = 60_000;

const STORAGE_KEY = "oceanleo.bay.mine-page-edit";

interface Stored {
  at: number;
  focus: MinePageFocus | null;
}

let pending: Stored | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function remember(entry: Stored | null): void {
  const store = storage();
  if (!store) return;
  try {
    if (entry) store.setItem(STORAGE_KEY, JSON.stringify(entry));
    else store.removeItem(STORAGE_KEY);
  } catch {
    /* 隐私模式 / 配额：只靠模块变量 */
  }
}

function recall(): Stored | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    if (!parsed || typeof parsed.at !== "number") return null;
    return { at: parsed.at, focus: parsed.focus === "vetting" ? "vetting" : null };
  } catch {
    return null;
  }
}

function fresh(entry: Stored | null, now: number): entry is Stored {
  return entry !== null && now - entry.at <= MINE_PAGE_EDIT_TTL_MS;
}

export function requestMinePageEdit(focus?: MinePageFocus): void {
  pending = { at: Date.now(), focus: focus === "vetting" ? "vetting" : null };
  remember(pending);
  for (const listener of Array.from(listeners)) listener();
}

/** 取走请求（一次性）。没有请求、或已过期，返回 null。 */
export function takeMinePageEditRequest(now: number = Date.now()): MinePageEditRequest | null {
  const entry = pending ?? recall();
  pending = null;
  remember(null);
  return fresh(entry, now) ? { focus: entry.focus } : null;
}

/** 旧接口：只问「要不要进编辑」，同样取走请求。 */
export function takeMinePageEdit(): boolean {
  return takeMinePageEditRequest() !== null;
}

/** 主页已经挂着时有人再次请求：让它立刻进编辑，别把请求留到下一次打开。 */
export function subscribeMinePageEdit(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 进编辑后要不要滚到核验块：明确要求的一定滚；旧的无参调用按主页是否已公开判断——
 * 已公开的是去核验（I-8），没公开的是去建资料，从顶上开始。
 */
export function wantsMinePageVetting(request: MinePageEditRequest | null, published: boolean): boolean {
  if (!request) return false;
  return request.focus === "vetting" || (request.focus === null && published);
}
