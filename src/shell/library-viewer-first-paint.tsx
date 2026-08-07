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
 * 只有真的是图片的地址才配当海报。
 *
 * 为什么要这道过滤：货架上 154/161 件 deck 的 `thumbnail` rendition 就是 pptx 本体
 * （截图那件的 full/preview/source/thumbnail 四个 rendition 指向同一个 sha），
 * 而 `library-data.ts` 挑 `thumbUrl` 时不看媒体类型。把 pptx 地址喂给 `<img>` 只会得到
 * 一个碎图标——比没有海报更糟。这里按扩展名 fail closed：认不出来的一律不当海报。
 *
 * 这只是消费侧的兜底。真正的修法是让 `thumbUrl` 一开始就不指向 office 包，那一行在
 * `library-data.ts`，不在本文件的施工面上。
 */
const POSTER_IMAGE_EXTENSIONS = /\.(avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;

export function libraryPosterImageUrl(item: LibraryItem): string {
  for (const candidate of [item.thumbUrl, item.previewUrl]) {
    const url = (candidate || "").trim();
    if (!url) continue;
    if (url.startsWith("data:image/") || url.startsWith("blob:")) return url;
    if (POSTER_IMAGE_EXTENSIONS.test(url)) return url;
  }
  return "";
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
  const poster = libraryPosterImageUrl(item);
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
 * 解析期间的画面。
 *
 * 之前 office 三类在货架详情里从点开到首帧**全程没有任何画面**：重型闸门放行后
 * 直接进查看器，而查看器在下载 + 解析完成前只画一个 spinner 覆盖层。这里把那段空白
 * 换成海报（有真图就用真图）或骨架，spinner 收到底部条里，不再糊住整块。
 */
export function ViewerParsingPoster({
  item,
  label,
}: {
  item: LibraryItem;
  label: string;
}) {
  const poster = libraryPosterImageUrl(item);
  return (
    <div
      data-library-viewer-parsing={poster ? "poster" : "skeleton"}
      className="absolute inset-0 overflow-hidden bg-white"
    >
      {poster ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={poster}
          alt={item.title}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-contain opacity-70"
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-stone-100 via-white to-stone-100" />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 border-t border-stone-100 bg-white/85 px-3 py-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
        <p className="text-[12px] text-stone-500">{label}</p>
      </div>
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
