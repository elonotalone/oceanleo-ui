"use client";

import { useEffect, useState, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";

/** 相对「铺满预览栏宽度」的倍数。1 = 按栏宽完整显示，长图在栏内上下滚。 */
export const PREVIEW_ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;

/**
 * 素材详情的看图器。图按栏宽铺开，高度随比例走，栏内滚动；
 * 放大/缩小改宽度倍数；点图进全屏再看。
 * 禁止给 <img> 加 max-height + object-contain：长图会被压成一条细线。
 */
export function BayZoomablePreview({
  thumb,
  full,
  alt,
}: {
  thumb?: string;
  full?: string;
  alt: string;
}) {
  const tt = useUI();
  const src = (full || thumb || "").trim();
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const zoom = PREVIEW_ZOOM_STEPS[step];

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setLightbox(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightbox]);

  if (!src) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-stone-400">
        {tt("无预览")}
      </div>
    );
  }

  function zoomIn() {
    setStep((s) => Math.min(PREVIEW_ZOOM_STEPS.length - 1, s + 1));
  }

  function zoomOut() {
    setStep((s) => Math.max(0, s - 1));
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }

  const image = (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onLoad={() => setLoaded(true)}
      onClick={() => {
        if (!lightbox) setLightbox(true);
      }}
      style={{ width: `${zoom * 100}%`, height: "auto", maxWidth: "none" }}
      className={`block cursor-zoom-in select-none ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );

  function renderControls() {
    return (
      <>
        <button
          type="button"
          onClick={zoomOut}
          disabled={step === 0}
          className="rounded border border-stone-300 px-2 py-1 font-medium hover:bg-stone-50 disabled:opacity-40"
        >
          {tt("缩小")}
        </button>
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={step === PREVIEW_ZOOM_STEPS.length - 1}
          className="rounded border border-stone-300 px-2 py-1 font-medium hover:bg-stone-50 disabled:opacity-40"
        >
          {tt("放大")}
        </button>
        <button
          type="button"
          onClick={() => setStep(0)}
          disabled={step === 0}
          className="rounded border border-stone-300 px-2 py-1 hover:bg-stone-50 disabled:opacity-40"
        >
          {tt("适应宽度")}
        </button>
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="rounded border border-sky-300 bg-sky-50 px-2 py-1 font-medium text-sky-800 hover:bg-sky-100"
        >
          {tt("全屏查看")}
        </button>
        <span className="text-stone-400">{tt("滚动看整张 · 点图全屏 · Ctrl+滚轮缩放")}</span>
      </>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="relative max-h-[72vh] w-full overflow-auto bg-stone-100"
        onWheel={onWheel}
      >
        {thumb && !loaded ? (
          <img
            src={thumb}
            alt=""
            aria-hidden
            style={{ width: `${zoom * 100}%`, height: "auto", maxWidth: "none" }}
            className="block blur-sm"
          />
        ) : null}
        {image}
        {thumb && !loaded ? (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">
            {tt("高清加载中…")}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
        {renderControls()}
      </div>
      {lightbox
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex flex-col bg-black/80"
              onClick={() => setLightbox(false)}
              role="dialog"
              aria-modal="true"
              aria-label={alt}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-white">
                <span className="truncate">{alt}</span>
                <button
                  type="button"
                  onClick={() => setLightbox(false)}
                  className="rounded bg-white/15 px-3 py-1 hover:bg-white/25"
                >
                  {tt("关闭")}
                </button>
              </div>
              <div
                className="min-h-0 flex-1 overflow-auto"
                onClick={(e) => e.stopPropagation()}
                onWheel={onWheel}
              >
                <img
                  src={src}
                  alt={alt}
                  draggable={false}
                  style={{ width: `${zoom * 100}%`, height: "auto", maxWidth: "none" }}
                  className="mx-auto block select-none"
                />
              </div>
              <div
                className="flex flex-wrap items-center gap-2 border-t border-white/15 bg-black px-3 py-2 text-xs text-stone-200"
                onClick={(e) => e.stopPropagation()}
              >
                {renderControls()}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
