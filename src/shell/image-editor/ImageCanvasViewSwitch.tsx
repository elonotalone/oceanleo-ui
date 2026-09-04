"use client";

/**
 * 图片件自己的面上的结构 / 皮肤开关。不占外壳 L0 槽。
 * 点击只走 `applyCanvasViewClick`，没有第二条实现。
 */
import {
  applyCanvasViewClick,
  canvasViewChoices,
} from "./design-mode/canvas-view-switch";
import type {
  DesignModeState,
  EditorModeSwitch,
} from "./design-mode/design-mode-state";

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
  return (
    <div
      role="group"
      aria-label="结构与皮肤"
      data-testid="image-canvas-view-switch"
      data-canvas-view={state.mode}
      className="flex shrink-0 items-center gap-1 border-b border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-1.5"
    >
      {choices.map((choice) => (
        <button
          key={choice.mode}
          type="button"
          aria-pressed={choice.pressed}
          data-canvas-view-target={choice.mode}
          className={
            choice.pressed
              ? "rounded-full bg-[var(--fg,#1c1917)] px-2.5 py-1 text-[11px] text-[var(--card,#fff)]"
              : "rounded-full px-2.5 py-1 text-[11px] text-[var(--muted,#78716c)]"
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
