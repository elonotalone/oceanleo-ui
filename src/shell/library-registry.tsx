"use client";

// ============================================================================
// @oceanleo/ui — 跨站【只读】库注册表 library-registry（单一事实源，宗旨 v22，2026-07-12）
// ----------------------------------------------------------------------------
// 操作员 2026-07-12 铁律：库只读，生成只在页面左栏操作台。
//
// 本注册表把「全量可在右栏展示的只读库」枚举成一张表，每条 = 一个 CanvasTab 工厂
// （id / label / makeContent）。右栏 TabBar 的独立圆形「+」展开的，是【真正的内容查看模块】：
// 网站 / 画布 / PPT / Excel / 文档 / 图片 / 视频 / 视频画布 / 音频 / 小红书 / 3D /
// 全部作品 / 收藏。它们复用 CrossSiteLibrary 的统一作品索引（user_creations +
// agent_artifacts 去重），但由各自的 viewer 查看内容，绝不是换标签名的文件列表。
// 素材库另用 MaterialLibrary；素材是参考内容，不与用户作品混表。
//
// 用法（宿主）：
//   const more = crossSiteLibraryTabs({ accent, exclude: ["files"] });
//   <ResultCanvas tabs={...} moreTabs={more} .../>
// 或用 AgentChat.libraryTabs.moreLibraries（见 AgentChat）自动拼。
// ============================================================================

import type { ReactNode } from "react";
import { CrossSiteLibrary } from "./CrossSiteLibrary";
import type { LibraryKind } from "./library-data";
import { MaterialLibrary, type MaterialItem } from "./MaterialLibrary";

export interface LibraryTabCtx {
  accent?: string;
  /** 素材库（material）用：素材总栏目的素材（子页面切片）。不给则素材库走空态。 */
  materials?: MaterialItem[];
  /** 素材库「看全部」跳完整素材总栏目（父页面）。 */
  onSeeAllMaterials?: () => void;
}

export interface ReadonlyLibraryDef {
  /** 稳定 id（也是 ResultCanvas tab id，避免和主标签撞——统一用 lib_ 前缀）。 */
  id: string;
  /** 标签名。 */
  label: string;
  /** 该库主体内容工厂（复用 CrossSiteLibrary / MaterialLibrary）。 */
  makeContent: (ctx: LibraryTabCtx) => ReactNode;
}

// 一种内容形态一个只读 viewer；数据源统一，但展示不是通用文件网格。
function contentLibrary(
  id: string,
  label: string,
  kinds: LibraryKind[],
  opts: { favoritesOnly?: boolean; emptyTitle?: string } = {},
): ReadonlyLibraryDef {
  return {
    id,
    label,
    makeContent: (ctx) => (
      <CrossSiteLibrary
        accent={ctx.accent}
        kinds={kinds}
        favoritesOnly={opts.favoritesOnly}
        emptyTitle={opts.emptyTitle}
      />
    ),
  };
}

/**
 * 全量跨站只读库定义（顺序 = 展开后从左到右）。id 用 `lib_` 前缀，绝不撞主标签
 * （result/material/files/browser/org…）。素材库单列（复用 MaterialLibrary）。
 */
export const CROSS_SITE_LIBRARIES: ReadonlyLibraryDef[] = [
  contentLibrary("lib_websites", "网站", ["website"]),
  contentLibrary("lib_canvas", "画布", ["canvas"]),
  contentLibrary("lib_slides", "PPT", ["ppt"]),
  contentLibrary("lib_sheets", "Excel", ["sheet"]),
  contentLibrary("lib_documents", "Word", ["document"]),
  contentLibrary("lib_images", "图片", ["image"]),
  contentLibrary("lib_videos", "视频", ["video"]),
  contentLibrary("lib_video_canvas", "视频画布", ["video_canvas"]),
  contentLibrary("lib_audio", "音频", ["audio"]),
  contentLibrary("lib_xhs", "小红书", ["xhs"]),
  contentLibrary("lib_threed", "3D", ["threed"]),
  contentLibrary("lib_all", "全部作品", []),
  contentLibrary("lib_favorites", "收藏", [], { favoritesOnly: true }),
  {
    id: "lib_material",
    label: "素材",
    makeContent: (ctx) => (
      <MaterialLibrary
        materials={ctx.materials ?? []}
        accent={ctx.accent}
        onSeeAll={ctx.onSeeAllMaterials}
      />
    ),
  },
];

/** 按 id 查一个只读库定义。 */
export function libraryDefById(id: string): ReadonlyLibraryDef | undefined {
  return CROSS_SITE_LIBRARIES.find((d) => d.id === id);
}

export interface CrossSiteLibraryTabsOptions extends LibraryTabCtx {
  /**
   * 要**排除**的库 id（本站默认已亮的那几个不要在「+」里重复出现）。既可传 CROSS_SITE
   * 的 `lib_*` id，也可传对应的语义键（website/canvas/ppt/excel/documents/images/
   * videos/video_canvas/audio/xhs/threed/all/favorites/material），两种都能匹配。 */
  exclude?: string[];
  /**
   * 只包含这些库 id（给了它就忽略全量顺序、只按此列表出）。同样支持 `lib_*` 或语义键。 */
  only?: string[];
}

const SEMANTIC_IDS: Record<string, string> = {
  website: "lib_websites",
  websites: "lib_websites",
  web: "lib_websites",
  canvas: "lib_canvas",
  ppt: "lib_slides",
  slide: "lib_slides",
  slides: "lib_slides",
  presentation: "lib_slides",
  excel: "lib_sheets",
  sheet: "lib_sheets",
  sheets: "lib_sheets",
  word: "lib_documents",
  doc: "lib_documents",
  document: "lib_documents",
  documents: "lib_documents",
  image: "lib_images",
  images: "lib_images",
  video: "lib_videos",
  videos: "lib_videos",
  video_canvas: "lib_video_canvas",
  videocanvas: "lib_video_canvas",
  audio: "lib_audio",
  xhs: "lib_xhs",
  xiaohongshu: "lib_xhs",
  threed: "lib_threed",
  "3d": "lib_threed",
  all: "lib_all",
  files: "lib_all",
  favorites: "lib_favorites",
  favorite: "lib_favorites",
  material: "lib_material",
  materials: "lib_material",
};

function normId(id: string): string {
  const value = id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SEMANTIC_IDS[value] || (value.startsWith("lib_") ? value : `lib_${value}`);
}

/**
 * 把注册表拼成一组 `CanvasTab`（供 ResultCanvas.moreTabs）。默认全量、去掉 `exclude`；
 * 传 `only` 则只出指定的几个。全是只读库，无输入、不生成。
 */
export function crossSiteLibraryTabs(
  opts: CrossSiteLibraryTabsOptions = {},
): { id: string; label: string; content: ReactNode }[] {
  const { exclude = [], only, ...ctx } = opts;
  const excludeSet = new Set(exclude.map(normId));
  const defs = only
    ? only.map(normId).map(libraryDefById).filter(Boolean as unknown as (d: ReadonlyLibraryDef | undefined) => d is ReadonlyLibraryDef)
    : CROSS_SITE_LIBRARIES.filter((d) => !excludeSet.has(d.id));
  return defs.map((d) => ({ id: d.id, label: d.label, content: d.makeContent(ctx) }));
}
