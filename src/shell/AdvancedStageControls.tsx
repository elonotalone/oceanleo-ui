"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AdvancedViewportActions } from "./advanced-workbench-chrome";

export function AdvancedStageControls({
  fullscreenRef,
  viewport,
  accent,
}: {
  fullscreenRef: RefObject<HTMLDivElement | null>;
  viewport?: AdvancedViewportActions;
  accent: string;
}) {
  const tt = useUI();
  const zoomId = useId();
  const [fullscreen, setFullscreen] = useState(false);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () =>
      setFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [fullscreenRef]);

  useEffect(
    () => () => {
      if (zoomFrameRef.current !== null) {
        window.cancelAnimationFrame(zoomFrameRef.current);
      }
      pendingZoomRef.current = null;
    },
    [],
  );

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen();
      } else {
        await fullscreenRef.current?.requestFullscreen();
      }
    } catch {
      // The editor remains fully usable if the browser denies fullscreen.
    }
  };

  const min = viewport?.min ?? 25;
  const max = viewport?.max ?? 200;
  const step =
    viewport?.step && viewport.step > 0 ? viewport.step : 1;
  const value = Math.min(
    max,
    Math.max(min, Math.round(viewport?.value ?? 100)),
  );
  const setZoom = (target: number) => {
    if (!viewport) return;
    viewport.setValue(Math.max(min, Math.min(max, target)));
  };
  const scheduleZoom = (target: number) => {
    pendingZoomRef.current = target;
    if (zoomFrameRef.current !== null) return;
    zoomFrameRef.current = window.requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      const pending = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (pending !== null) setZoom(pending);
    });
  };
  const flushZoom = () => {
    if (zoomFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
    }
    const pending = pendingZoomRef.current;
    pendingZoomRef.current = null;
    if (pending !== null) setZoom(pending);
  };

  return (
    <div
      data-advanced-viewport-controls
      role="group"
      aria-label={tt("画布视图")}
      className="pointer-events-auto flex h-10 items-center gap-1 rounded-xl border border-[var(--awb-border,var(--border,#e7e5e4))] bg-[var(--awb-popover-bg,var(--card,#fff))] px-1.5 text-[var(--awb-muted,var(--fg-2,#57534e))] shadow-[var(--awb-shadow-floating,0_8px_28px_rgba(15,23,42,.12))]"
    >
      {viewport && (
        <>
          <button
            type="button"
            onClick={() => setZoom(value - Math.max(step, 5))}
            disabled={value <= min}
            className="grid h-7 w-7 place-items-center rounded-lg text-sm outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35 disabled:opacity-35"
            aria-label={tt("缩小")}
            title={tt("缩小")}
          >
            −
          </button>
          <div className="flex items-center gap-2" title={tt("缩放")}>
            <label htmlFor={zoomId} className="sr-only">
              {tt("缩放")}
            </label>
            <input
              id={zoomId}
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(event) => scheduleZoom(Number(event.target.value))}
              onPointerUp={flushZoom}
              onBlur={flushZoom}
              aria-label={tt("缩放")}
              className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-[var(--divider,#e7e5e4)] sm:w-32"
              style={{ accentColor: accent }}
            />
            {viewport.fit ? (
              <button
                type="button"
                onClick={viewport.fit}
                aria-label={tt("适合画布")}
                className="min-w-11 rounded-md px-1 py-1 text-[11px] font-semibold tabular-nums outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35"
                title={tt("适合画布")}
              >
                {value}%
              </button>
            ) : (
              <output
                htmlFor={zoomId}
                aria-label={tt("当前缩放")}
                className="min-w-11 px-1 py-1 text-center text-[11px] font-semibold tabular-nums"
              >
                {value}%
              </output>
            )}
          </div>
          <button
            type="button"
            onClick={() => setZoom(value + Math.max(step, 5))}
            disabled={value >= max}
            className="grid h-7 w-7 place-items-center rounded-lg text-sm outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35 disabled:opacity-35"
            aria-label={tt("放大")}
            title={tt("放大")}
          >
            +
          </button>
          <span className="mx-0.5 h-5 w-px bg-[var(--divider,#e7e5e4)]" />
        </>
      )}
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="grid h-8 w-8 place-items-center rounded-lg outline-none transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] hover:text-[var(--fg,#292524)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35"
        aria-label={fullscreen ? tt("退出全屏") : tt("编辑区域全屏")}
        title={fullscreen ? tt("退出全屏") : tt("编辑区域全屏")}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {fullscreen ? (
            <>
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            </>
          ) : (
            <>
              <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
