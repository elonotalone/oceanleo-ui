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
  text?: string;
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

function textOf(element: HTMLElement): string {
  return (element.innerText || "").trim().slice(0, 80);
}

function textAnchorCandidate(scroller: HTMLElement, viewport: DOMRect, visibleOnly = true): { element: HTMLElement; rect: DOMRect; text: string } | null {
  const all = Array.from(scroller.querySelectorAll<HTMLElement>("*"));
  const texts = all.map(textOf);
  const candidates = all
    .map((element, index) => ({ element, rect: element.getBoundingClientRect(), text: texts[index] }))
    .filter(({ rect, text }) => (
      (!visibleOnly || (rect.top >= viewport.top && rect.top < viewport.bottom - 20)) &&
      rect.height >= 16 &&
      rect.height <= 300 &&
      text.length >= 6 &&
      text.length <= 300 &&
      texts.filter((value) => value === text).length === 1
    ));
  return candidates.sort((a, b) => a.rect.height - b.rect.height || a.rect.top - b.rect.top)[0] ?? null;
}

/** Capture the first visible rendered message leaf before an older page loads. */
export function captureTimelineVisualAnchor(scroller: HTMLElement): TimelineVisualAnchor | null {
  const viewport = scroller.getBoundingClientRect();
  const textCandidate = textAnchorCandidate(scroller, viewport);
  if (textCandidate) {
    return { element: textCandidate.element, top: textCandidate.rect.top - viewport.top, text: textCandidate.text };
  }
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
  if (visualAnchor?.element || visualAnchor?.text) {
    const viewport = (element as HTMLElement).getBoundingClientRect();
    const current = visualAnchor.text
      ? textAnchorCandidate(element as HTMLElement, viewport, false)
      : null;
    const anchorElement = current?.element ?? visualAnchor.element;
    const currentRect = current?.rect ?? (
      anchorElement?.isConnected !== false ? anchorElement?.getBoundingClientRect() : null
    );
    const currentTop = currentRect ? currentRect.top - viewport.top : Number.NaN;
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
