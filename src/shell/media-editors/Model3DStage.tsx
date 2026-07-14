"use client";

import { createElement } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

export function Model3DStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: Model3DWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const progress = Math.round(editor.progress * 100);
  const status = editor.error
    ? editor.error
    : editor.notice
      ? editor.notice
      : editor.loading
        ? tt("正在加载 3D 模型…")
        : tt("拖动环绕 · 滚轮缩放 · 双指平移");

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-100">
      <div
        className="relative min-h-0 flex-1 overflow-hidden transition-colors"
        style={{ background: editor.background }}
      >
        {editor.viewerReady && editor.sourceUrl
          ? createElement("model-viewer", {
              ref: editor.viewerRef,
              src: editor.sourceUrl,
              poster: editor.posterUrl || undefined,
              alt: editor.title || tt("3D 模型"),
              "camera-controls": true,
              "camera-orbit":
                `${editor.azimuth}deg ${editor.elevation}deg ${editor.zoom}%`,
              "min-camera-orbit": "auto auto 50%",
              "max-camera-orbit": "auto auto 300%",
              "interaction-prompt": "auto",
              "touch-action": "pan-y",
              "auto-rotate": editor.autoRotate || undefined,
              exposure: String(editor.exposure),
              "shadow-intensity": String(editor.shadowIntensity),
              "shadow-softness": String(editor.shadowSoftness),
              "animation-name": editor.animationName || undefined,
              style: {
                display: "block",
                width: "100%",
                height: "100%",
                minHeight: 280,
                backgroundColor: "transparent",
                ["--poster-color" as string]: "transparent",
                ["--progress-bar-color" as string]: accent,
              },
            })
          : null}

        {editor.loading && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/75 px-6 text-center backdrop-blur-sm"
          >
            <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  background: accent,
                  width: `${progress > 0 ? progress : 8}%`,
                }}
              />
            </div>
            <p className="text-[12px] text-stone-500">
              {tt("正在加载 3D 模型…")}
              {progress > 0 ? ` ${progress}%` : ""}
            </p>
          </div>
        )}

        {!editor.loading && editor.error && !editor.modelLoaded && (
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center p-6"
          >
            <div className="max-w-md rounded-xl border border-red-200 bg-white/95 p-5 text-center shadow-sm">
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
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/55 px-2.5 py-1.5 text-[10px] text-white backdrop-blur-sm">
            {editor.animationPlaying
              ? tt("动画播放中")
              : editor.autoRotate
                ? tt("自动旋转中")
                : tt("交互查看")}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-stone-200 bg-white px-3 py-2.5">
        <button
          type="button"
          disabled={!editor.modelLoaded}
          onClick={editor.resetCamera}
          className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
        >
          {tt("重置视角")}
        </button>
        <button
          type="button"
          disabled={!editor.modelLoaded}
          onClick={() => editor.setAutoRotate(!editor.autoRotate)}
          className="rounded-lg border px-2.5 py-1.5 text-[11px] disabled:opacity-40"
          style={
            editor.autoRotate
              ? { borderColor: accent, color: accent, background: `${accent}12` }
              : { borderColor: "#e7e5e4", color: "#57534e" }
          }
        >
          {editor.autoRotate ? tt("停止旋转") : tt("自动旋转")}
        </button>
        {editor.animations.length > 0 && (
          <button
            type="button"
            disabled={!editor.animationName}
            onClick={editor.toggleAnimation}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
          >
            {editor.animationPlaying ? tt("暂停动画") : tt("播放动画")}
          </button>
        )}
        <p
          aria-live="polite"
          className={`min-w-0 flex-1 truncate text-right text-[11px] ${
            editor.error
              ? "text-red-600"
              : editor.notice
                ? "text-emerald-600"
                : "text-stone-400"
          }`}
        >
          {status}
        </p>
      </div>
    </div>
  );
}
