"use client";

// ============================================================================
// @oceanleo/ui — 库预览的首屏策略（合同 §0.1.11「素材预览要尽量快」/ W4 Done-when 6）
// ----------------------------------------------------------------------------
// 「预览&编辑」把用户从探索页直接丢进库预览页，所以首屏不能一上来就拉 glb / 沙箱
// iframe / office 包。这里只管两件事，渲染本身仍在 `library-viewers.tsx`：
//   ① 重型 viewer 等容器**真的可见**之后再挂载，之前只画一张 `.thumb.webp` 海报；
//   ② 图片先用缩略图出画面，全尺寸在后台预载完成后再原地换上。
// 轻量类型（图片 / 视频 / 音频）不进闸门，避免为省一次请求多赔一帧。
//
// 单独成文件而不是继续顶高 `library-viewers.tsx`：那个文件基线已 1471 行，远超共享
// 包 ≤800 的硬顶，首屏策略与类型分发也本来就是两件事。
// ============================================================================

import { useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";

const HEAVY_LIBRARY_VIEWER_KINDS: readonly LibraryItem["kind"][] = [
  "website",
  "canvas",
  "ppt",
  "sheet",
  "document",
  "file",
  "video_canvas",
  "threed",
];

/** 会拉大 payload（模型 / 沙箱页面 / office 包）的类型。 */
export function libraryViewerIsHeavy(item: LibraryItem): boolean {
  return HEAVY_LIBRARY_VIEWER_KINDS.includes(item.kind);
}

/**
 * 「容器可见了吗」闸门。
 *
 * `IntersectionObserver` 缺席（SSR / 测试环境 / 老浏览器）时不许把预览卡死：
 * 下一帧直接放行。
 */
export function useVisibleViewerGate(ready: boolean): {
  ready: boolean;
  ref: (node: HTMLDivElement | null) => void;
} {
  const [visible, setVisible] = useState(false);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ready || visible || !node) return;
    if (typeof IntersectionObserver !== "function") {
      const timer = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "128px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, ready, visible]);
  return { ready: ready || visible, ref: setNode };
}

/** 重型 viewer 挂载前的首屏海报：一张已经生成好的缩略图，一个请求。 */
export function ViewerThumbPoster({
  item,
  containerRef,
}: {
  item: LibraryItem;
  containerRef: (node: HTMLDivElement | null) => void;
}) {
  const tt = useUI();
  const poster = item.thumbUrl || "";
  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-[420px] items-center justify-center bg-stone-50 p-4"
      data-library-viewer-deferred={item.kind}
    >
      {poster ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={poster}
          alt={item.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="max-h-[70vh] max-w-full rounded-lg object-contain opacity-80"
        />
      ) : (
        <p className="text-[13px] text-stone-400">{tt("正在准备预览…")}</p>
      )}
    </div>
  );
}

/**
 * 缩略图先出画面，全尺寸预载完成后原地替换。
 *
 * 预载走一个游离的 `Image`，所以替换是一次已完成解码的换 src，不会闪白。
 */
export function ProgressiveArtifactImage({
  thumbUrl,
  fullUrl,
  alt,
  onError,
}: {
  thumbUrl: string;
  fullUrl: string;
  alt: string;
  onError?: () => void;
}) {
  const progressive = Boolean(thumbUrl && fullUrl && thumbUrl !== fullUrl);
  const [src, setSrc] = useState(progressive ? thumbUrl : fullUrl || thumbUrl);
  useEffect(() => {
    if (!progressive || typeof window === "undefined") {
      setSrc(fullUrl || thumbUrl);
      return;
    }
    setSrc(thumbUrl);
    let alive = true;
    const preload = new window.Image();
    preload.decoding = "async";
    preload.onload = () => {
      if (alive) setSrc(fullUrl);
    };
    preload.src = fullUrl;
    return () => {
      alive = false;
      preload.onload = null;
    };
  }, [fullUrl, progressive, thumbUrl]);
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      onError={onError}
      decoding="async"
      referrerPolicy="no-referrer"
      className="max-h-[70vh] max-w-full rounded-lg object-contain"
    />
  );
}
