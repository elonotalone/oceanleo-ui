// 标签页标题前的未读数：「(3) OceanLeo」（work-chat 契约 §9.8，F03）。
//
// 纯逻辑 + 注入：文档与「标题被页面改了」的观察都经依赖传入，测试用假文档；浏览器默认接
// `document.title` 与 MutationObserver。
//
// 约束：
// - 未读 0：恢复页面自己的标题，且在没出现过未读时一次都不写 `document.title`；
// - 超过 99 显示 `99+`；
// - Next 换页会把 `<title>` 重写成不带前缀的新标题：观察到标题变化后重新加前缀；
// - 自己写的那一次变化不当作「页面改了标题」（否则会死循环、会把前缀叠成「(3) (3) …」）；
// - 卸载时把前缀去掉。

export interface TitleDocLike {
  title: string;
}

export interface TitleBadgeDeps {
  doc: TitleDocLike;
  /** 注册「标题可能变了」的回调，返回取消函数。浏览器里是 `<head>` 上的 MutationObserver。 */
  observe(onMaybeChanged: () => void): () => void;
}

export interface TitleBadge {
  /** 设置未读数（0 = 清除）。 */
  setCount(count: number): void;
  /** 页面自己的标题（不含我们的前缀）。 */
  baseTitle(): string;
  /** 取消观察，并把标题恢复成页面自己的。 */
  detach(): void;
}

/** 未读数的显示文字：0 为空串，超过 99 为 `99+`。 */
export function badgeLabel(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n <= 0) return "";
  return n > 99 ? "99+" : String(n);
}

export function badgePrefix(count: number): string {
  const label = badgeLabel(count);
  return label ? `(${label}) ` : "";
}

export function createTitleBadge(deps: TitleBadgeDeps): TitleBadge {
  const { doc } = deps;
  let count = 0;
  let base = doc.title;
  /** 我们最后一次写进去的完整标题；`null` 表示还没写过。 */
  let written: string | null = null;
  let prefixInUse = "";
  let detached = false;

  function write(next: string): void {
    if (doc.title === next) {
      written = next;
      return;
    }
    written = next;
    doc.title = next;
  }

  function apply(): void {
    const prefix = badgePrefix(count);
    if (!prefix && written === null) return; // 从没出过未读：一次都不碰标题
    prefixInUse = prefix;
    write(`${prefix}${base}`);
  }

  function onMaybeChanged(): void {
    if (detached) return;
    const current = doc.title;
    if (written !== null && current === written) return; // 自己写的那一次
    // 页面（或 Next 路由）改了标题：把我们上一次的前缀剥掉（它多半根本没有），得到新的页面标题。
    base = prefixInUse && current.startsWith(prefixInUse) ? current.slice(prefixInUse.length) : current;
    if (!badgePrefix(count)) {
      written = null;
      prefixInUse = "";
      return;
    }
    apply();
  }

  const unobserve = deps.observe(onMaybeChanged);

  return {
    setCount(next) {
      if (detached) return;
      const normalized = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
      // 先同步一次页面标题：观察回调可能还没来得及跑。
      if (written !== null && doc.title !== written) onMaybeChanged();
      else if (written === null) base = doc.title;
      if (normalized === count) return;
      count = normalized;
      if (count === 0) {
        if (written !== null) {
          prefixInUse = "";
          write(base);
          written = null;
        }
        return;
      }
      apply();
    },
    baseTitle: () => base,
    detach() {
      if (detached) return;
      detached = true;
      unobserve();
      if (written !== null && doc.title === written) doc.title = base;
      written = null;
    },
  };
}

/** 浏览器默认接线：真实 `document`，用 MutationObserver 盯 `<head>`（`<title>` 被替换或改字都会触发）。 */
export function attachBrowserTitleBadge(): TitleBadge | null {
  if (typeof document === "undefined") return null;
  return createTitleBadge({
    doc: {
      get title() {
        return document.title;
      },
      set title(value: string) {
        document.title = value;
      },
    },
    observe(onMaybeChanged) {
      if (typeof MutationObserver === "undefined") return () => {};
      const observer = new MutationObserver(() => onMaybeChanged());
      observer.observe(document.head, { childList: true, characterData: true, subtree: true });
      return () => observer.disconnect();
    },
  });
}
