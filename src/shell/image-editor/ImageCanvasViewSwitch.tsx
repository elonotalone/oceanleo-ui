"use client";

/**
 * 图片件自己的面上的结构 / 皮肤开关。不占外壳 L0 槽。
 * 点击只走 `applyCanvasViewClick`，没有第二条实现。
 *
 * 规范 v2 §1（plugin-chrome X3）：画布顶部不许再画通栏。这组分段控件挪到
 * 画布**右下角**，与宿主的缩放控件（`[data-advanced-viewport-controls]`）
 * 同一条基线、同一套胶囊几何（h-14 / rounded-2xl / 同色边框与阴影），
 * 排在缩放控件左侧。缩放控件的宽度由宿主决定，这里量它的实际宽度来定
 * 右侧留白；量不到（测试 / 首帧）时用一个够宽的保底值。
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  applyCanvasViewClick,
  canvasViewChoices,
} from "./design-mode/canvas-view-switch";
import type {
  DesignModeState,
  EditorModeSwitch,
} from "./design-mode/design-mode-state";

/** 宿主缩放控件 `absolute bottom-3 right-3` 的 12px + 两块胶囊之间 8px。 */
const HOST_CONTROLS_INSET_PX = 12;
const GAP_PX = 8;
/** 量不到宿主缩放控件时的保底右留白（缩放条最宽约 360px）。 */
const FALLBACK_RIGHT_PX = 380;

function useHostViewportControlsWidth(anchor: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const row = anchor.current?.closest<HTMLElement>(
      "[data-advanced-viewport-row]",
    );
    const controls = row?.querySelector<HTMLElement>(
      "[data-advanced-viewport-controls]",
    );
    if (!controls) {
      setWidth(null);
      return;
    }
    const read = () => {
      const next = Math.round(controls.getBoundingClientRect().width);
      setWidth((current) => (current === next ? current : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [anchor]);
  return width;
}

export function ImageCanvasViewSwitch<TDocument>({
  state,
  document,
  onRoute,
}: {
  state: DesignModeState;
  document: TDocument;
  onRoute: (route: EditorModeSwitch<TDocument>) => void;
}) {
  const choices = canvasViewChoices(state.mode);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostControlsWidth = useHostViewportControlsWidth(rootRef);
  const right =
    hostControlsWidth === null
      ? FALLBACK_RIGHT_PX
      : HOST_CONTROLS_INSET_PX + hostControlsWidth + GAP_PX;
  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="结构与皮肤"
      data-testid="image-canvas-view-switch"
      data-canvas-view={state.mode}
      data-canvas-view-switch-placement="stage-bottom-right"
      className="pointer-events-auto absolute bottom-3 flex h-14 shrink-0 items-center gap-1 rounded-2xl border border-[var(--awb-border,var(--border,#e7e5e4))] bg-[var(--awb-popover-bg,var(--card,#fff))] px-2 shadow-[var(--awb-shadow-floating,0_8px_28px_rgba(15,23,42,.12))]"
      style={{ right: `${right}px`, zIndex: 2_147_483_010 }}
    >
      {choices.map((choice) => (
        <button
          key={choice.mode}
          type="button"
          aria-pressed={choice.pressed}
          data-canvas-view-target={choice.mode}
          className={
            choice.pressed
              ? "h-11 rounded-xl bg-[var(--fg,#1c1917)] px-3 text-[12px] font-medium text-[var(--card,#fff)]"
              : "h-11 rounded-xl px-3 text-[12px] font-medium text-[var(--awb-muted,var(--fg-2,#57534e))] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
          }
          onClick={() =>
            onRoute(applyCanvasViewClick(state, choice.mode, document))
          }
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
