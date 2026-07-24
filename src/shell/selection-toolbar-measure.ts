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

export function toolbarDockedHost(toolbar: HTMLDivElement): HTMLElement | null {
  return toolbar.closest<HTMLElement>("[data-workspace-docked-toolbar]");
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
    const viewportWidth =
      window.visualViewport?.width || window.innerWidth;
    // SelectionToolbar itself keeps one rem of reachable space per side.
    width = Math.min(width, Math.max(0, viewportWidth - 32));
  }
  return width;
}
