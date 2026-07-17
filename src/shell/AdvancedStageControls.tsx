"use client";

import { useEffect, useState, type RefObject } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AdvancedViewportActions } from "./advanced-workbench-chrome";

export function AdvancedStageControls({
  stageRef,
  viewport,
  accent,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  viewport?: AdvancedViewportActions;
  accent: string;
}) {
  const tt = useUI();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [stageRef]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === stageRef.current) {
        await document.exitFullscreen();
      } else {
        await stageRef.current?.requestFullscreen();
      }
    } catch {
      // The editor remains fully usable if the browser denies fullscreen.
    }
  };

  const min = viewport?.min ?? 25;
  const max = viewport?.max ?? 200;
  const step = viewport?.step ?? 1;
  const value = Math.min(
    max,
    Math.max(min, Math.round(viewport?.value ?? 100)),
  );

  return (
    <div
      data-advanced-viewport-controls
      className="pointer-events-auto flex h-10 items-center gap-1 rounded-xl border border-[var(--awb-border,var(--border,#e7e5e4))] bg-[var(--awb-popover-bg,var(--card,#fff))] px-1.5 text-[var(--awb-muted,var(--fg-2,#57534e))] shadow-[var(--awb-shadow-floating,0_8px_28px_rgba(15,23,42,.12))]"
    >
      {viewport && (
        <>
          <button
            type="button"
            onClick={() => viewport.setValue(Math.max(min, value - Math.max(step, 5)))}
            className="grid h-7 w-7 place-items-center rounded-lg text-sm transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))]"
            aria-label={tt("缩小")}
            title={tt("缩小")}
          >
            −
          </button>
          <label className="flex items-center gap-2" title={tt("缩放")}>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(event) => viewport.setValue(Number(event.target.value))}
              aria-label={tt("缩放")}
              className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-[var(--divider,#e7e5e4)] sm:w-32"
              style={{ accentColor: accent }}
            />
            <button
              type="button"
              onClick={viewport.fit}
              disabled={!viewport.fit}
              className="min-w-11 rounded-md px-1 py-1 text-[11px] font-semibold tabular-nums transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] disabled:cursor-default disabled:hover:bg-transparent"
              title={viewport.fit ? tt("适合画布") : tt("当前缩放")}
            >
              {value}%
            </button>
          </label>
          <button
            type="button"
            onClick={() => viewport.setValue(Math.min(max, value + Math.max(step, 5)))}
            className="grid h-7 w-7 place-items-center rounded-lg text-sm transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))]"
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
        className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] hover:text-[var(--fg,#292524)]"
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
