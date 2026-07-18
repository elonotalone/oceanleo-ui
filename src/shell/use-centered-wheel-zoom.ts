"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";

export function useCenteredWheelZoom({
  value,
  min,
  max,
  contentWidth,
  contentHeight,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  contentWidth: number;
  contentHeight: number;
  onChange?: (value: number) => void;
}): RefObject<HTMLElement | null> {
  const viewportRef = useRef<HTMLElement | null>(null);
  const valueRef = useRef(value);
  const wheelDeltaRef = useRef(0);
  const wheelFrameRef = useRef<number | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !onChange) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const normalizedDelta =
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? viewport.clientHeight
            : 1);
      wheelDeltaRef.current += normalizedDelta;
      if (wheelFrameRef.current !== null) return;
      wheelFrameRef.current = window.requestAnimationFrame(() => {
        wheelFrameRef.current = null;
        const delta = wheelDeltaRef.current;
        wheelDeltaRef.current = 0;
        const next = Math.max(
          min,
          Math.min(max, valueRef.current * Math.exp(-delta * 0.0025)),
        );
        valueRef.current = next;
        onChange(next);
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
      wheelDeltaRef.current = 0;
    };
  }, [max, min, onChange]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(
      0,
      (viewport.scrollWidth - viewport.clientWidth) / 2,
    );
    viewport.scrollTop = Math.max(
      0,
      (viewport.scrollHeight - viewport.clientHeight) / 2,
    );
  }, [contentHeight, contentWidth]);

  return viewportRef;
}
