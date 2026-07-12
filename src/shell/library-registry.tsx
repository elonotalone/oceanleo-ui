"use client";

// ============================================================================
// @oceanleo/ui — 跨站【只读】库注册表 library-registry（单一事实源，宗旨 v22，2026-07-12）
// ----------------------------------------------------------------------------
// 操作员 2026-07-12 铁律：库只读，生成只在页面左栏操作台。
//
// 本注册表把「全量可在右栏展示的只读库」枚举成一张表，每条 = 一个 CanvasTab 工厂
// （id / label / makeContent）。右栏 TabBar 的独立圆形「+」展开的，就是这些【查看类】库：
//   · 图片库 / 幻灯库(PPT) / 文档库(Word) / 表格库(Excel) / 视频库 / 音频库 / 3D 库 /
//     文件库(全部) / 收藏  —— 复用 ArtifactLibrary（数据 = agent_artifacts，跨站登录 +
//     RLS owner-only，天然「一个站看全系列产物」）；
//   · 素材库 —— 复用 MaterialLibrary（各站右栏是素材总栏目的子页面）。
//
// 用法（宿主）：
//   const more = crossSiteLibraryTabs({ accent, exclude: ["files"] });
//   <ResultCanvas tabs={...} moreTabs={more} .../>
// 或用 AgentChat.libraryTabs.moreLibraries（见 AgentChat）自动拼。
// ============================================================================

import type { ReactNode } from "react";
import { ArtifactLibrary, type ArtifactFilter } from "./ArtifactLibrary";
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
  /** 该库主体内容工厂（复用 ArtifactLibrary / MaterialLibrary）。 */
  makeContent: (ctx: LibraryTabCtx) => ReactNode;
}

// 复用 ArtifactLibrary 的一个「锁定到某分区、隐藏 chips」的只读库工厂。
function artifactLib(id: string, label: string, filter: ArtifactFilter): ReadonlyLibraryDef {
  return {
    id,
    label,
    makeContent: (ctx) => (
      <ArtifactLibrary accent={ctx.accent} fill filter={filter} hideChips />
    ),
  };
}

/**
 * 全量跨站只读库定义（顺序 = 展开后从左到右）。id 用 `lib_` 前缀，绝不撞主标签
 * （result/material/files/browser/org…）。素材库单列（复用 MaterialLibrary）。
 */
export const CROSS_SITE_LIBRARIES: ReadonlyLibraryDef[] = [
  artifactLib("lib_images", "图片库", "images"),
  artifactLib("lib_slides", "PPT库", "slides"),
  artifactLib("lib_documents", "文档库", "documents"),
  artifactLib("lib_videos", "视频库", "videos"),
  artifactLib("lib_audio", "音频库", "audio"),
  artifactLib("lib_threed", "3D库", "threed"),
  artifactLib("lib_all", "全部文件", "all"),
  artifactLib("lib_favorites", "收藏", "favorites"),
  {
    id: "lib_material",
    label: "素材库",
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
   * 的 `lib_*` id，也可传对应的语义键（images/slides/documents/videos/audio/threed/all/
   * favorites/material），两种都能匹配。 */
  exclude?: string[];
  /**
   * 只包含这些库 id（给了它就忽略全量顺序、只按此列表出）。同样支持 `lib_*` 或语义键。 */
  only?: string[];
}

function normId(id: string): string {
  return id.startsWith("lib_") ? id : `lib_${id}`;
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
