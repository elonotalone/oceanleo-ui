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

import { useEffect, useState, type CSSProperties } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { ArtifactRendition, ArtifactType } from "./artifact-contract";
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
  /**
   * 可玩 bundle 是这张表上最重的一件，此前却漏在闸门外。
   *
   * `LibraryItemViewerBody` 的 game 分支把 `gamePlayEmbedHref(item)` 送进
   * `SandboxedWebViewer`，那是一个装载整份自包含 HTML 文档的沙箱 iframe——
   * 它会在容器还没进视口时就开始下载并执行整个游戏。ppt/xlsx/docx/3d/pdf 五类
   * 早就在闸门里（pdf 走 `document` / `file` 两个 kind），只有它没有。
   */
  "game",
];

/**
 * 缺 `width`/`height` 时按 artifactType 定的默认比例。
 *
 * 每一行都要说得出理由：填错的比例不会让布局跳，但会让 `object-contain` 把画面
 * 装进一个形状不对的框里，留下永久黑边。所以宁可按载体的**典型交付形状**填，
 * 也不要一律 1:1 了事。
 */
const DEFAULT_ARTIFACT_ASPECT_RATIO: Readonly<Record<string, number>> = {
  deck: 16 / 9,
  chart: 16 / 9,
  video: 16 / 9,
  workflow: 16 / 9,
  game: 16 / 9,
  website: 16 / 10,
  document: 210 / 297,
  pdf: 210 / 297,
  interactive_doc: 210 / 297,
  grid: 4 / 3,
  // `geo-map.md` §2.2 的成品画布就是 1600×1000（含图例与 28px 归属条）。
  geo_map: 1600 / 1000,
  // 位图什么比例都可能出现，方形是偏心最小的一档。
  single_file_image: 1,
  composite_image: 1,
  vector_image: 1,
  audio: 1,
  model_3d: 1,
};

/** 认不出类型时的兜底。与货架卡片容器的 `aspect-[4/3]` 同一档，不引入第二种形状。 */
const FALLBACK_ASPECT_RATIO = 4 / 3;

/**
 * viewer kind → artifact type。**这是 `library-data.ts` 的
 * `artifactTypeForLibraryKind()` 的第二份副本，逐字一致由
 * `tests/media-aspect-stability.test.mjs` 锁死**（改一边不改另一边当场红）。
 *
 * 为什么必须留副本而不是 import 那个函数：本模块在改动前对 `./library-data`
 * **只有类型依赖**（transpile 时被抹掉，运行期模块图上没有这条边）。加一条值依赖会
 * 让三份既有测试当场加载失败——`material-cover-rendering` 与 `artifact-surface-rendered`
 * 都一边编译 `workspace-library-thumbnail.tsx`、一边把 `"./library-data"` 换成只导出
 * `isDurableLibraryItem` 的桩，新增的这条边会去那个桩里找一个它没有的导出。
 * 那三份测试不在本份活的独占面上，不许为了自己方便去改它们的桩。
 */
const KIND_TO_ARTIFACT_TYPE: Readonly<
  Record<LibraryItem["kind"], ArtifactType>
> = {
  website: "website",
  canvas: "workflow",
  ppt: "deck",
  sheet: "grid",
  document: "document",
  image: "single_file_image",
  video: "video",
  video_canvas: "workflow",
  audio: "audio",
  xhs: "document",
  threed: "model_3d",
  game: "game",
  geo_map: "geo_map",
  interactive_doc: "interactive_doc",
  file: "document",
};

/** 没有 digest 可派生时的中性占位色。 */
const NEUTRAL_LQIP_COLOR = "var(--surface, #f5f5f4)";

export interface MediaFrameGeometry {
  /** `width / height`，恒为有限正数——**这是「不许留 0 高度」的形式保证**。 */
  ratio: number;
  /** 直接写进 CSS `aspect-ratio` 的值。 */
  aspectRatio: string;
  /** rendition 声明的像素宽；用来避免把一张小图拉大。没有就是 0。 */
  intrinsicWidth: number;
  /** 第一级占位色（LQIP）。从 digest 派生，稳定且零成本。 */
  lqipColor: string;
  /** true = 比例是 rendition 量出来的；false = 走了类型默认值。 */
  measured: boolean;
}

/**
 * 从 digest 派生一个稳定的浅色占位。
 *
 * **刻意不发明 blur-hash 字段**：那要改契约与后端。digest 是每份 rendition 都已经
 * 带着的内容摘要（`artifact-contract.ts:798`），同一份素材每次算出来的颜色都一样，
 * 换一份就换一个色——这正是占位色需要的全部性质，成本是零字节网络与零次解码。
 * 明度压在高位、饱和度压在低位，读起来是「还没加载」，不是一块设计元素。
 */
export function lqipColorFromDigest(digest: string | null | undefined): string {
  const normalized = String(digest || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!/^[0-9a-f]{8,}$/.test(normalized)) return NEUTRAL_LQIP_COLOR;
  const hue = Number.parseInt(normalized.slice(0, 4), 16) % 360;
  const saturation = 10 + (Number.parseInt(normalized.slice(4, 6), 16) % 14);
  const lightness = 85 + (Number.parseInt(normalized.slice(6, 8), 16) % 8);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function positiveRatio(width: unknown, height: unknown): number {
  const w = typeof width === "number" && Number.isFinite(width) ? width : 0;
  const h = typeof height === "number" && Number.isFinite(height) ? height : 0;
  return w > 0 && h > 0 ? w / h : 0;
}

/**
 * 一件素材在**图片开始加载之前**就该占住的那块地。
 *
 * 取值顺序：rendition 自报的 `width`/`height` → artifactType 默认比例 → 4:3 兜底。
 * 三条路都返回有限正数，所以调用方拿到的 `aspect-ratio` 永远画得出非 0 高度。
 */
export function artifactMediaGeometry(input: {
  rendition?: ArtifactRendition | null;
  artifactType?: ArtifactType | null;
  kind?: LibraryItem["kind"] | null;
}): MediaFrameGeometry {
  const measuredRatio = positiveRatio(
    input.rendition?.width,
    input.rendition?.height,
  );
  const artifactType =
    input.artifactType || (input.kind ? KIND_TO_ARTIFACT_TYPE[input.kind] : "");
  const ratio =
    measuredRatio ||
    DEFAULT_ARTIFACT_ASPECT_RATIO[String(artifactType || "")] ||
    FALLBACK_ASPECT_RATIO;
  return {
    ratio,
    aspectRatio: `${ratio}`,
    intrinsicWidth: measuredRatio ? input.rendition?.width || 0 : 0,
    lqipColor: lqipColorFromDigest(input.rendition?.digest),
    measured: measuredRatio > 0,
  };
}

/**
 * 查看器媒体框的内联样式。
 *
 * 为什么是内联样式而不是 Tailwind 工具类：`src/theme/ui.css` 是编译产物，新形状要等
 * 父任务重跑 `build:css` 才会有对应的类；靠 class 会在 36 个消费站上渲染成一个没有
 * 尺寸的空元素（`workspace-library-thumbnail.tsx` 的角标已经踩过同一个坑）。
 *
 * 宽度写成 `min(100%, ratio × maxViewportHeight vh)`：高度因此恒 ≤ `maxViewportHeight`
 * 视口高，宽度恒 ≤ 容器宽，**而且两者都不依赖图片是否已经解码**。
 * `maxWidth` 再按自报像素宽收一次，免得把一张 200px 的小图拉满整屏。
 */
export function mediaFrameStyle(
  geometry: MediaFrameGeometry,
  maxViewportHeight = 70,
): CSSProperties {
  return {
    position: "relative",
    aspectRatio: geometry.aspectRatio,
    width: `min(100%, ${(geometry.ratio * maxViewportHeight).toFixed(2)}vh)`,
    maxWidth: geometry.intrinsicWidth
      ? `min(100%, ${geometry.intrinsicWidth}px)`
      : "100%",
    backgroundColor: geometry.lqipColor,
    overflow: "hidden",
  };
}

/** 框内媒体的定位：铺满那块已经占好的地，绝不反过来决定它的大小。 */
export const FRAMED_MEDIA_STYLE: CSSProperties = Object.freeze({
  position: "absolute",
  inset: 0,
  height: "100%",
  width: "100%",
  objectFit: "contain",
});

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

/** 这个地址背后的那份 rendition；认不出来就退到 thumbnail / preview 的元数据。 */
function renditionBehind(
  item: LibraryItem,
  url: string,
): ArtifactRendition | null {
  const renditions = item.artifact?.renditions;
  if (!renditions) return null;
  if (url) {
    for (const rendition of Object.values(renditions)) {
      if (rendition?.url && rendition.url === url) return rendition;
    }
  }
  return renditions.thumbnail || renditions.preview || null;
}

/** 一件素材在查看器里该占住的那块地。海报与三级渐进图共用同一份判定。 */
export function libraryMediaGeometry(
  item: LibraryItem,
  url = "",
): MediaFrameGeometry {
  return artifactMediaGeometry({
    rendition: renditionBehind(item, url),
    artifactType: item.artifactType,
    kind: item.kind,
  });
}

/**
 * 「容器可见了吗」闸门。
 *
 * 观察器必须绑在这个节点自己的 `window` 上：全局 `IntersectionObserver` 会被
 * 另一份文档（或同一进程里另一份测试）换掉，预览就会永远停在海报上。
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
    const view = node.ownerDocument.defaultView;
    const Observer = view?.IntersectionObserver;
    if (typeof Observer !== "function") {
      const schedule = view?.setTimeout.bind(view) ?? setTimeout;
      const cancel = view?.clearTimeout.bind(view) ?? clearTimeout;
      const timer = schedule(() => setVisible(true), 0);
      return () => cancel(timer);
    }
    const observer = new Observer(
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
  const geometry = libraryMediaGeometry(item, poster);
  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-[420px] items-center justify-center bg-stone-50 p-4"
      data-library-viewer-deferred={item.kind}
    >
      {poster ? (
        <div
          data-media-frame="poster"
          data-media-frame-measured={String(geometry.measured)}
          className="rounded-lg"
          style={mediaFrameStyle(geometry)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={poster}
            alt={item.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="rounded-lg"
            style={{ ...FRAMED_MEDIA_STYLE, opacity: 0.8 }}
          />
        </div>
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

/** 三级渐进加载走到了哪一级。测试与调试都读这个值，不猜 DOM。 */
export type ProgressiveImageStage = "lqip" | "thumbnail" | "full";

/**
 * 三级渐进加载：LQIP → thumbnail → preview/full。
 *
 * 第一级是 digest 派生的纯色块，**零请求零解码**，它随第一帧一起出现，所以从打开
 * 到看见东西之间不再有空白；第二级是已有的 `thumbnail` rendition，按 CSS 侧模糊
 * 放大铺满整框（一张 128px 的缩略图直接拉大是马赛克，模糊过之后是「还没清晰」）；
 * 第三级由一个游离的 `Image` 在后台预载，**解码完成之后**才换 src，所以不闪白。
 *
 * 刻意不新增 blur-hash 字段：那要改契约与后端，不在本波范围（W07 P2）。
 * 三级之间也刻意没有 CSS 过渡——本波的动效 token 还没落地，写裸时长是红线。
 *
 * 整个组件挂在一个**加载前就定好尺寸**的框里（`mediaFrameStyle`），所以三级之间
 * 换来换去，外面那块地一寸都不动。
 */
export function ProgressiveArtifactImage({
  thumbUrl,
  fullUrl,
  alt,
  onError,
  geometry,
}: {
  thumbUrl: string;
  fullUrl: string;
  alt: string;
  onError?: () => void;
  geometry: MediaFrameGeometry;
}) {
  const progressive = Boolean(thumbUrl && fullUrl && thumbUrl !== fullUrl);
  const [src, setSrc] = useState(progressive ? thumbUrl : fullUrl || thumbUrl);
  /** 有没有任何一级真的出过画面。出过就绝不退回纯色块——那是一次可见的闪烁。 */
  const [painted, setPainted] = useState(false);
  /** 全尺寸预载失败：停在缩略图上，并且**摘掉模糊**，不要假装还有下一级要来。 */
  const [upgradeFailed, setUpgradeFailed] = useState(false);
  useEffect(() => {
    setPainted(false);
    setUpgradeFailed(false);
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
    preload.onerror = () => {
      if (alive) setUpgradeFailed(true);
    };
    preload.src = fullUrl;
    return () => {
      alive = false;
      preload.onload = null;
      preload.onerror = null;
    };
  }, [fullUrl, progressive, thumbUrl]);
  const upgrading = progressive && src !== fullUrl && !upgradeFailed;
  const stage: ProgressiveImageStage = !painted
    ? "lqip"
    : upgrading
      ? "thumbnail"
      : "full";
  return (
    <div
      data-media-frame="progressive"
      data-progressive-stage={stage}
      data-media-frame-measured={String(geometry.measured)}
      className="rounded-lg"
      style={mediaFrameStyle(geometry)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setPainted(true)}
        onError={onError}
        decoding="async"
        referrerPolicy="no-referrer"
        className="rounded-lg"
        style={{
          ...FRAMED_MEDIA_STYLE,
          opacity: painted ? 1 : 0,
          // 缩略图那一级放大铺满，所以要模糊；模糊会把边缘吃掉一圈，稍微放大补回来。
          ...(stage === "thumbnail"
            ? { filter: "blur(8px)", transform: "scale(1.05)" }
            : {}),
        }}
      />
    </div>
  );
}
