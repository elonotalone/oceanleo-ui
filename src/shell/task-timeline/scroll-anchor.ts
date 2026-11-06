/**
 * Snapshot and restore a transcript position while an older page is prepended.
 * Browsers otherwise apply their own overflow anchoring, which races the page's
 * render and can move the reader twice.
 */
export type OlderScrollAnchorSnapshot = {
  scrollTop: number;
  scrollHeight: number;
};

export type TimelineVisualAnchor = {
  element: HTMLElement;
  top: number;
};

function candidateRect(item: HTMLElement, viewport?: DOMRect): { element: HTMLElement; rect: DOMRect } | null {
  const candidates = [item, ...Array.from(item.querySelectorAll<HTMLElement>("*"))]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height >= 16 && rect.height <= 300);
  const visible = viewport
    ? candidates.filter(({ rect }) => rect.top >= viewport.top && rect.top < viewport.bottom - 20)
    : candidates;
  return visible.sort((a, b) => a.rect.height - b.rect.height || a.rect.top - b.rect.top)[0] ?? null;
}

/** Capture the first visible rendered message leaf before an older page loads. */
export function captureTimelineVisualAnchor(scroller: HTMLElement): TimelineVisualAnchor | null {
  const viewport = scroller.getBoundingClientRect();
  for (const item of scroller.querySelectorAll<HTMLElement>("[data-task-timeline-item]")) {
    const candidate = candidateRect(item, viewport);
    if (candidate) return { element: candidate.element, top: candidate.rect.top - viewport.top };
  }
  return null;
}

export function restoreOlderScrollAnchor(
  element: Pick<HTMLElement, "scrollTop" | "scrollHeight">,
  anchor: OlderScrollAnchorSnapshot,
  visualAnchor?: TimelineVisualAnchor | null,
): number {
  if (visualAnchor?.element && visualAnchor.element.isConnected !== false) {
    const viewport = (element as HTMLElement).getBoundingClientRect();
    const currentTop = visualAnchor.element.getBoundingClientRect().top - viewport.top;
    if (Number.isFinite(currentTop) && Number.isFinite(visualAnchor.top)) {
      const delta = currentTop - visualAnchor.top;
      element.scrollTop += delta;
      return delta;
    }
  }
  const delta = element.scrollHeight - anchor.scrollHeight;
  element.scrollTop = anchor.scrollTop + delta;
  return delta;
}
