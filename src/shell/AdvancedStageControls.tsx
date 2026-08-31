"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useUI } from "../i18n/ui/useUI";
import { Button, IconButton } from "../ui/Button";
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

  // 条高 40 → 56：内含控件从 28/32 提到 44（W04）。56 = 44 + 2×6，与
  // `edit-bar-surface.ts` 的胶囊几何（EDIT_BAR_CONTROL_SIZE_PX + 2×PADDING）
  // 同一套算术，两条浮动条因此看起来是一家的。挤不下不要把尺寸调回去。
  return (
    <div
      data-advanced-viewport-controls
      role="group"
      aria-label={tt("画布视图")}
      className="pointer-events-auto flex h-14 items-center gap-1 rounded-2xl border border-[var(--awb-border,var(--border,#e7e5e4))] bg-[var(--awb-popover-bg,var(--card,#fff))] px-2 text-[var(--awb-muted,var(--fg-2,#57534e))] shadow-[var(--awb-shadow-floating,0_8px_28px_rgba(15,23,42,.12))]"
    >
      {viewport && (
        <>
          <IconButton
            onClick={() => setZoom(value - Math.max(step, 5))}
            disabled={value <= min}
            label={tt("缩小")}
            icon={<span className="text-base leading-none">−</span>}
          />
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
              // 命中区 6 → 44（W04）：轨道**看起来**还是 6px，但可抓的是整条 44px。
              // `py-[19px]` 把 44 的盒子留出 44−2×19=6 的内容区，`bg-clip-content`
              // 让轨道底色只画在这 6px 里。滑块自己不必变粗，手指却不用再去瞄那一条线。
              className="h-11 w-24 cursor-pointer appearance-none rounded-full bg-[var(--divider,#e7e5e4)] bg-clip-content py-[19px] sm:w-32"
              style={{ accentColor: accent }}
            />
            {viewport.fit ? (
              <Button
                variant="ghost"
                onClick={viewport.fit}
                aria-label={tt("适合画布")}
                title={tt("适合画布")}
                className="font-semibold tabular-nums"
              >
                {value}%
              </Button>
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
          <IconButton
            onClick={() => setZoom(value + Math.max(step, 5))}
            disabled={value >= max}
            label={tt("放大")}
            icon={<span className="text-base leading-none">+</span>}
          />
          <span className="mx-0.5 h-6 w-px bg-[var(--divider,#e7e5e4)]" />
        </>
      )}
      <IconButton
        onClick={() => void toggleFullscreen()}
        label={fullscreen ? tt("退出全屏") : tt("编辑区域全屏")}
        icon={
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
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            ) : (
              <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
            )}
          </svg>
        }
      />
    </div>
  );
}
