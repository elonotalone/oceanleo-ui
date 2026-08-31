// ============================================================================
// @oceanleo/ui — toast 宿主桥
// ----------------------------------------------------------------------------
// 为什么需要一层桥（W05，2026-08-31）
//
// 门户已经有它自己的一套 toaster：`oceanleo/app/layout.tsx` 挂了一个根组件，
// 另有 15 处调用点。那个库在本包里是 **optional peer**——31 个租户站不一定装它，
// 所以共享包里不许 import 它（依赖纪律见 `src/pages/AuthDialog.tsx:29`：
// 「不 import 它（共享包里它是 optional peer，32 个站不一定装）」）。
//
// 于是桥的方向是**反过来的**：不是共享包去找宿主，而是宿主把自己的 toaster
// 注册进来。
//
//   - 注册了 → 共享包的 toast 全部转发给宿主。门户上因此只有一套观感，
//     不会出现「右下角一套、宿主配置的位置另一套」两摞叠着。
//   - 没注册 → `../ui/Toast` 的第一方 viewport 自己渲染。这是 31 个站的默认路径，
//     也是为什么本包不需要任何 toast 依赖。
//
// 这条契约是**厂商中立**的：注册进来的是什么实现，本包不需要知道，
// 因此本包里永远搜不到任何第三方 toast 库的名字。宿主要接只需一次
// `registerToastHost({ show, update, dismiss })`，把三个回调转给它自己那套即可；
// 本包不要求宿主改（不接就走第一方 viewport，行为完整）。
//
// 单例而不是 React context：注册方（宿主的根 layout）与消费方（共享包深处的
// 任意组件）之间没有可靠的公共 provider——31 个站的树形状各不相同。
// ============================================================================

/** `loading` 是长任务的中间态，可以原地转成三个终态之一。 */
export type ToastKind = "success" | "error" | "info" | "loading";

export interface ToastPayload {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  /** 停留时长（ms）。**0 表示不自动消失**，由用户或调用方结束。 */
  dwell: number;
  /** 同 `id` 的重复次数。1 = 只出现过一次；>1 时渲染成计数而不是叠新的一条。 */
  count: number;
}

/**
 * 宿主 toaster 的适配器。三个动作对应第一方 store 的三种状态变化；
 * `update` 会在同 id 合并计数、以及 `loading` 原地转终态时被调用。
 */
export interface ToastHostAdapter {
  show(payload: ToastPayload): void;
  update(payload: ToastPayload): void;
  dismiss(id: string): void;
}

let host: ToastHostAdapter | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * 宿主登记自己的 toaster。返回注销函数（`useEffect` 的清理里调用即可）。
 *
 * 后注册的覆盖先注册的：宿主只该有一套 toaster，重复注册意味着换了一套，
 * 而不是要两套同时收。
 */
export function registerToastHost(adapter: ToastHostAdapter): () => void {
  host = adapter;
  notify();
  return () => {
    // 只有还是自己那份时才摘，否则会把后来者的注册误摘掉。
    if (host !== adapter) return;
    host = null;
    notify();
  };
}

/** 当前宿主适配器；`null` 表示走第一方 viewport。 */
export function currentToastHost(): ToastHostAdapter | null {
  return host;
}

/** 宿主是否已接管。第一方 viewport 用它决定要不要渲染自己那一摞。 */
export function hasToastHost(): boolean {
  return host !== null;
}

/**
 * 订阅「宿主接管 / 交还」这一个事件。
 * 宿主的 layout 可能比共享包组件后挂载，viewport 需要在那一刻重新判断。
 */
export function subscribeToastHost(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 仅供测试：把桥恢复成「无宿主」。产品代码不该调用。 */
export function resetToastHostForTests(): void {
  host = null;
  notify();
}
