"use client";

// ============================================================================
// @oceanleo/ui — 成品 app 目录数据模型（单一事实源，宗旨 v14，操作员 2026-07-05）
// ----------------------------------------------------------------------------
// 宗旨 v14：每个 oceanleo 子站的 workspace 首页 = 一批【面向目的的成品 app】卡片
// （名词化：海报生成 / 证件照生成 / 竞选稿 / 合同起草 / 简历生成 …，每站 ≥20 个），
// 顶部横排分类器按【各站自定义的场景词】聚合（学术教育 / 职场精选 / 机关单位 …，
// 一个成品可属多个场景）。
//
// 关键设计（满足操作员两条硬要求）：
//   1. **同一套操作台 UI 模板**：一个站里所有成品 app 复用【同一个】共享操作台组件
//      （方案 A）+ 同一个后端 agent，差异只在进入时灌进操作台的【预置 prompt 模板 +
//      参数】。→ 所以「成品 app = 一条数据」，不是一段代码。日后要改模板 UI，只改
//      `SiteCatalogConsole` + 站点那一个共享 ops 组件，全站成品 app 一起同步。
//   2. **库→导航固定三个板块**：每个成品 app 的右栏「导航」区放三个板块的模板卡
//      （FunctionGuide.sections），点一张即把该模板灌进操作台。
//
// 一个 GoalApp = 目录卡片(名/图标/简介/场景) + 进操作台的预置(preset) + 三个模板板块
// (guideSections)。渲染与接线全部交给 `SiteCatalogConsole`（下面的组件），站点只提供
// 「这一批数据 + 一个共享 ops 渲染器」。
// ============================================================================

import { type ReactNode } from "react";
import { type GuideSection } from "./NavigatorGuide";
import { type MaterialItem } from "./MaterialLibrary";
import { type OpsPatch } from "../lib/fn-agent";

/**
 * 一个「成品 app」= 用户一句话能说清、要交付的东西（面向目的，名词化）。
 * 例：{ id:"poster", name:"海报生成", scenes:["营销物料","电商"], … }
 */
export interface GoalApp {
  /** 唯一 id（深链 ?fn=<id>；也用于场景过滤后的稳定 key）。 */
  id: string;
  /** 成品名（名词化，面向目的）：海报生成 / 证件照生成 / 竞选稿 …。 */
  name: string;
  /** 目录卡片图标（emoji / 单字）。 */
  icon?: ReactNode;
  /**
   * 目录卡片配图缩略图 URL（宗旨 v15）：图示卡片版式的顶部大图（AI 风格素材，来自
   * asset.oceanleo.com）。不给则回退 emoji tint 图示。用 assetThumbUrl(key) 拼直链。
   */
  thumb?: string;
  /** 卡片右上角小角标（如「热」「新」）。 */
  badge?: string;
  /** 卡片图标颜色（hex，可选）；不给按 id 稳定取色。 */
  logoColor?: string;
  /** 一句话简介（卡片副标题）。 */
  tagline?: string;
  /** 更长的能力说明（卡片正文，可选）。 */
  capabilities?: string;
  /**
   * 归属的【场景分类】（各站自定义词，可多选）。目录顶部横排分类器按它出 chips。
   * 一个成品可同时属于多个场景（如 PPT 同时在「职场精选」「机关单位」）。
   */
  scenes: string[];
  /**
   * 该成品的「标准起手」预置：主 prompt 模板（可带 `[占位]`）+ 可选参数补丁。
   *
   * ⚠️ 宗旨 v15 决策 D 变更：**进入 app 时不再自动灌这份预置**（操作员：一进 app
   * 左侧操作台必须是空的）。改为：`SiteCatalogConsole` 把它作为「快速起手」板块的
   * 【第一张卡】注入导航区——用户点它才灌（含参数）。走方案 A 的核心仍是这份预置区分
   * 不同成品，只是【由用户主动点击触发】而非进入即灌。
   */
  preset?: GoalAppPreset;
  /**
   * 该成品 app 的库→导航区【三个板块】的模板卡（强制约定：len === 3）。
   * 点一张模板卡 → 把该模板（prompt + 可选参数）灌进操作台。
   */
  guideSections?: GuideSection[];
  /** 导航区顶部教学一句话（不给则用站点通用文案）。 */
  guideIntro?: ReactNode;
  /**
   * 宗旨 v17（操作员 2026-07-07）：该成品 app 右栏「素材库」展示的【启发/参考素材】——
   * 面向目的的成品示例图（如海报生成 app 放一批海报、网站相关 app 放一批网站板块）。
   * 与「导航」（点了填操作台的模板）、「文件库」（用户自己产出的文件）都不同：素材只
   * 供启发，点击是【放大铺满库查看】，不写回操作台。渲染交给共享 <MaterialLibrary>。
   * 不给则该成品素材库为空态。
   */
  materials?: MaterialItem[];
}

/** 进入成品 app 时灌进操作台的预置（主 prompt 模板 + 参数补丁）。 */
export interface GoalAppPreset {
  /** 主 prompt 模板（灌进操作台主输入字段）。 */
  prompt?: string;
  /** 额外要 set 进操作台的字段（透传给站点 applyPreset，形如 OpsPatch.set）。 */
  set?: Record<string, unknown>;
}

/** 把一个 GoalApp 的 preset 折成站点操作台可消费的 OpsPatch（主字段 + 附加字段）。 */
export function presetToOpsPatch(app: GoalApp, primaryField: string): OpsPatch {
  const set: Record<string, unknown> = { ...(app.preset?.set || {}) };
  if (app.preset?.prompt != null) set[primaryField] = app.preset.prompt;
  return { set };
}
