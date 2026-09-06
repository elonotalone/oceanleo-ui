export function cssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function elementInlineSize(element: HTMLElement | null): number {
  if (!element) return 0;
  const measured = element.getBoundingClientRect().width;
  return measured > 0 ? measured : element.offsetWidth;
}

export function elementOuterInlineSize(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = window.getComputedStyle(element);
  return (
    elementInlineSize(element) +
    cssPixelValue(style.marginInlineStart) +
    cssPixelValue(style.marginInlineEnd)
  );
}

export function normalizedMeasuredWidth(width: number): number {
  return Math.ceil(width * 2) / 2;
}

export function normalizedAvailableWidth(width: number): number {
  return Math.max(0, Math.floor(width * 2) / 2);
}

export function equalMeasuredWidths(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [id, width] of left) {
    if (right.get(id) !== width) return false;
  }
  return true;
}

export function toolbarFloatingHost(
  toolbar: HTMLDivElement,
): HTMLElement | null {
  return toolbar.closest<HTMLElement>("[data-workspace-floating-toolbar]");
}

/**
 * The translate3d shell. Distinct from `[data-workspace-floating-toolbar]`,
 * which is the stage-sized inset-0 layer and must not be used as the origin.
 */
export function toolbarFloatingTranslatedShell(
  toolbar: HTMLDivElement,
): HTMLElement | null {
  return toolbar.closest<HTMLElement>("[data-workspace-edit-bar-toolbar]");
}

export function toolbarDockedHost(toolbar: HTMLDivElement): HTMLElement | null {
  return toolbar.closest<HTMLElement>("[data-workspace-docked-toolbar]");
}

/** 浮动编辑栏在容器两侧各留 .5rem（FloatingContextToolbar 的 `max-w-[calc(100%-1rem)]`）。 */
export const FLOATING_EDGE_RESERVE_PX = 16;
/** SelectionToolbar 自己在视口两侧各留 1rem 可达空间。 */
export const VIEWPORT_REACHABLE_RESERVE_PX = 32;

/** 边界与视口相交的可见宽度；边界不可量时返回 0。 */
export function visibleBoundaryWidth(boundary: HTMLElement | null): number {
  if (!boundary || typeof window === "undefined") return 0;
  const rect = boundary.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
  const width = Math.max(
    0,
    Math.min(rect.right, viewportRight) - Math.max(rect.left, viewportLeft),
  );
  return width > 0 ? width : Math.max(0, rect.width);
}

/**
 * 单行编辑栏 `[data-workspace-edit-bar]` 的内容盒容量（px）。只认外部边界
 * （`[data-workspace-floating-toolbar-overlay]`，其次行的父盒——行还留在停靠带里时），
 * 再扣掉两侧保留与行自身的 padding/border。**不**读行自己的宽度——行的宽度
 * 由内容决定，读它就是把输出接回输入。
 */
export function editBarRowCapacity(row: HTMLElement): number {
  if (typeof window === "undefined") return 0;
  const boundary =
    row.closest<HTMLElement>("[data-workspace-floating-toolbar-overlay]") ||
    row.parentElement;
  let capacity = visibleBoundaryWidth(boundary) - FLOATING_EDGE_RESERVE_PX;
  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width || window.innerWidth;
  if (viewportWidth > 0) {
    capacity = Math.min(capacity, viewportWidth - VIEWPORT_REACHABLE_RESERVE_PX);
  }
  const style = window.getComputedStyle(row);
  capacity -=
    cssPixelValue(style.paddingInlineStart) +
    cssPixelValue(style.paddingInlineEnd) +
    cssPixelValue(style.borderInlineStartWidth) +
    cssPixelValue(style.borderInlineEndWidth);
  return Math.max(0, capacity);
}

export function toolbarSizingBoundary(toolbar: HTMLDivElement): HTMLElement | null {
  const floatingHost = toolbarFloatingHost(toolbar);
  if (floatingHost) return floatingHost.parentElement;
  // Docked edit bars fill the action-row dock slot; measure that host's real
  // width so live capabilities (including grid) overflow into More.
  const dockedHost = toolbarDockedHost(toolbar);
  if (dockedHost) return dockedHost;
  return toolbar.parentElement;
}

/**
 * Live geometry for a transformed floating SelectionToolbar.
 *
 * Origin is the translated edit-bar shell (or the toolbar itself) — never the
 * inset-0 floating layer. Hard CSS maxInlineSize is viewportRight - originLeft
 * so the border box cannot grow past the viewport even when More partitioning
 * lags a frame behind a recenter after 860→1200 resize.
 */
export function toolbarFloatingViewportMetrics(toolbar: HTMLDivElement): {
  originLeft: number;
  viewportLeft: number;
  viewportRight: number;
  viewportWidth: number;
  /** Hard border-box ceiling from the live left edge (0.5rem viewport inset). */
  maxInlineSize: number;
  /** Inner capacity used by adaptive More (1rem reachable reserve). */
  reachableWidth: number;
} {
  const viewport =
    typeof window !== "undefined" ? window.visualViewport : null;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportWidth =
    viewport?.width ||
    (typeof window !== "undefined" ? window.innerWidth : 0);
  const viewportRight = viewportLeft + viewportWidth;
  const translated = toolbarFloatingTranslatedShell(toolbar);
  const translatedRect = translated?.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const originLeft =
    translatedRect && Number.isFinite(translatedRect.left)
      ? translatedRect.left
      : Number.isFinite(toolbarRect.left)
        ? toolbarRect.left
        : viewportLeft;
  return {
    originLeft,
    viewportLeft,
    viewportRight,
    viewportWidth,
    maxInlineSize: Math.max(0, viewportRight - originLeft - 8),
    reachableWidth: Math.max(0, viewportRight - originLeft - 16),
  };
}

export function toolbarContainerInlineSize(
  toolbar: HTMLDivElement,
  variant: "bar" | "floating",
): number {
  const floatingHost = toolbarFloatingHost(toolbar);
  const dockedHost = toolbarDockedHost(toolbar);
  const boundary = toolbarSizingBoundary(toolbar);
  const boundaryRect = boundary?.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  let width =
    variant === "bar" && !dockedHost && toolbarRect.width > 0
      ? toolbarRect.width
      : boundaryRect?.width || 0;
  if (dockedHost) {
    const dockedWidth = elementInlineSize(dockedHost);
    if (dockedWidth > 0) {
      width = dockedWidth;
    }
  }
  if (boundaryRect && typeof window !== "undefined") {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportRight =
      viewportLeft + (viewport?.width || window.innerWidth);
    const visibleBoundaryWidth = Math.max(
      0,
      Math.min(boundaryRect.right, viewportRight) -
        Math.max(boundaryRect.left, viewportLeft),
    );
    if (visibleBoundaryWidth > 0) {
      width =
        width > 0
          ? Math.min(width, visibleBoundaryWidth)
          : visibleBoundaryWidth;
    }
  }
  if (floatingHost && width > 0) {
    // FloatingContextToolbar reserves .5rem at both container edges.
    width = Math.max(0, width - 16);
  }
  if (
    (variant === "floating" || dockedHost) &&
    typeof window !== "undefined"
  ) {
    const metrics = toolbarFloatingViewportMetrics(toolbar);
    // SelectionToolbar itself keeps one rem of reachable space per side.
    width = Math.min(width, Math.max(0, metrics.viewportWidth - 32));
    if (variant === "floating") {
      // Always apply the remaining strip — including zero — so a host that
      // sits on/past the right edge cannot keep a full-stage capacity and grow
      // through maxInlineSize: 100dvw past innerWidth.
      width = Math.min(width, metrics.reachableWidth);
    }
  }
  return width;
}
