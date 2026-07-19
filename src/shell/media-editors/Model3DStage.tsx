"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

function StageButton({
  children,
  active = false,
  disabled = false,
  accent,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  accent: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border px-2.5 py-1.5 text-[11px] disabled:opacity-40"
      style={
        active
          ? { borderColor: accent, color: accent, background: `${accent}12` }
          : {
              borderColor: "var(--border,#e7e5e4)",
              color: "var(--fg-2,#57534e)",
            }
      }
    >
      {children}
    </button>
  );
}

export function Model3DStage({
  editor,
  accent = "#4f46e5",
  showNativeControls = true,
}: {
  editor: Model3DWorkbenchState;
  accent?: string;
  showNativeControls?: boolean;
}) {
  const tt = useUI();
  const screens = useMemo(
    () => new Map(editor.annotationScreens.map((entry) => [entry.id, entry])),
    [editor.annotationScreens],
  );
  const progress = Math.round(editor.progress * 100);
  const status = editor.error
    ? editor.error
    : editor.notice
      ? editor.notice
      : editor.annotationPlacementArmed
        ? tt("点击模型表面放置标注")
        : editor.loading
          ? tt("正在加载 3D 模型…")
          : !editor.sourceUrl
            ? tt("空白 3D 场景 · 从左侧导入模型")
            : editor.selectedNode
              ? `${tt("已选择")} · ${editor.selectedNode.name}`
              : tt("点击模型或场景树选择对象 · 拖动空白处环绕");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface,#f5f5f4)]">
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ background: editor.background }}
      >
        <canvas
          ref={editor.canvasRef}
          data-testid="model3d-canvas"
          data-selection-mode="single"
          aria-label={tt("Three.js 3D 编辑画布")}
          aria-describedby="model3d-stage-status"
          className="block h-full min-h-[280px] w-full touch-none outline-none"
        />

        {editor.annotations.map((annotation) => {
          const screen = screens.get(annotation.id);
          if (!screen?.visible) return null;
          return (
            <button
              key={annotation.id}
              type="button"
              onClick={() => editor.selectAnnotation(annotation.id)}
              className="absolute z-10 max-w-40 -translate-x-1/2 -translate-y-full rounded-full border border-white/80 bg-black/75 px-2.5 py-1 text-[10px] font-medium text-white shadow-lg backdrop-blur-sm"
              style={{ left: screen.x, top: screen.y - 8 }}
              aria-label={annotation.label}
            >
              {annotation.label}
            </button>
          );
        })}

        {!editor.loading && !editor.sourceUrl && !editor.error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="rounded-2xl border border-[var(--divider,#d6d3d1)] bg-[var(--card,#fff)]/90 px-8 py-7 text-center shadow-sm backdrop-blur-sm">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[var(--divider,#d6d3d1)] text-2xl text-[var(--muted,#78716c)]">
                3D
              </div>
              <p className="mt-4 text-[13px] font-semibold text-[var(--fg,#292524)]">
                {tt("空白 3D 场景")}
              </p>
              <p className="mt-1 text-[11px] text-[var(--muted,#78716c)]">
                {tt("导入 GLB 后可选择并真实编辑场景子对象")}
              </p>
            </div>
          </div>
        )}

        {editor.loading && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--card,#fff)]/75 px-6 text-center backdrop-blur-sm"
          >
            <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-[var(--surface-hover,rgba(0,0,0,.08))]">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  background: accent,
                  width: `${progress > 0 ? progress : 8}%`,
                }}
              />
            </div>
            <p className="text-[12px] text-[var(--muted,#78716c)]">
              {tt("正在加载 3D 模型…")}
              {progress > 0 ? ` ${progress}%` : ""}
            </p>
          </div>
        )}

        {!editor.loading && editor.error && !editor.modelLoaded && (
          <div
            role="alert"
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
          >
            <div className="max-w-md rounded-xl border border-red-200 bg-[var(--card,#fff)]/95 p-5 text-center shadow-sm">
              <p className="text-[13px] font-semibold text-red-700">
                {tt("无法显示 3D 模型")}
              </p>
              <p className="mt-2 break-words text-[11px] leading-relaxed text-red-600">
                {editor.error}
              </p>
            </div>
          </div>
        )}

        {editor.modelLoaded && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/60 px-2.5 py-1.5 text-[10px] text-white backdrop-blur-sm">
            {editor.animationPlaying
              ? `${tt("动画")} ${editor.animationTime.toFixed(2)}s`
              : editor.annotationPlacementArmed
                ? tt("标注放置模式")
                : editor.selectedNode
                  ? `${tt("单选")} · ${editor.selectedNode.type}`
                  : tt("Three.js 场景")}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2">
        {showNativeControls && (
          <>
            <StageButton
              accent={accent}
              disabled={!editor.canUndo}
              onClick={editor.undo}
              testId="model3d-undo"
            >
              {tt("撤销")}
            </StageButton>
            <StageButton
              accent={accent}
              disabled={!editor.canRedo}
              onClick={editor.redo}
              testId="model3d-redo"
            >
              {tt("重做")}
            </StageButton>
            {(["translate", "rotate", "scale"] as const).map((mode) => (
              <StageButton
                key={mode}
                accent={accent}
                active={editor.transformMode === mode}
                disabled={!editor.selectedNode}
                onClick={() => editor.setTransformMode(mode)}
                testId={`model3d-mode-${mode}`}
              >
                {mode === "translate"
                  ? tt("移动")
                  : mode === "rotate"
                    ? tt("旋转")
                    : tt("缩放")}
              </StageButton>
            ))}
            <StageButton
              accent={accent}
              disabled={!editor.modelLoaded}
              onClick={editor.resetCamera}
            >
              {tt("重置视角")}
            </StageButton>
            {editor.animations.length > 0 && (
              <StageButton
                accent={accent}
                active={editor.animationPlaying}
                disabled={!editor.animationName}
                onClick={() =>
                  editor.setAnimationPlaying(!editor.animationPlaying)
                }
              >
                {editor.animationPlaying ? tt("暂停动画") : tt("播放动画")}
              </StageButton>
            )}
          </>
        )}
        <span className="shrink-0 text-[10px] text-[var(--muted,#78716c)]">
          {editor.selectedNode ? tt("单选模式") : tt("未选择对象")}
        </span>
        <p
          id="model3d-stage-status"
          role={editor.error ? "alert" : "status"}
          aria-live="polite"
          className={`min-w-0 flex-1 truncate text-right text-[11px] ${
            editor.error
              ? "text-red-600"
              : editor.notice
                ? "text-emerald-600"
                : "text-[var(--muted,#78716c)]"
          }`}
        >
          {status}
        </p>
      </div>
    </div>
  );
}
