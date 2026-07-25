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

// 全部为 `import type`（不是 `import { type X }`）：这样整条 import 语句在类型擦除后
// 被完全删除，本文件在运行时零依赖，focused test 可以直接 `import` 本 .ts 而不必拖进
// NavigatorGuide/MaterialLibrary 这两个含 JSX 的 .tsx（Node 的类型擦除不支持 JSX）。
import type { ReactNode } from "react";
import type { GuideSection } from "./NavigatorGuide";
import type { MaterialItem } from "./MaterialLibrary";
import type { OpsPatch } from "../lib/fn-agent";

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
   * 宗旨 v21（操作员 2026-07-09）：归属的【能力大板块】（第一层分类，单值，可选）。
   * 与 `scenes`（第二层情境维度、多值）正交——`group` 是能力/领域维度：如 image 站的
   * 「图像生成 / 图像处理 / AI 写真 / 矢量图形」。站点在 app-catalog 里声明 `GROUPS`
   * 数组并给每个成品打 `group`；`SiteCatalogConsole` 收到 `groups` 时顶部出第一层
   * 大板块 tab。不给 `group` → 归入「全部」板块（选具体板块时不显示）。
   */
  group?: string;
  /** Keep a runtime available for embeds/deep links without showing a catalog card. */
  hiddenFromDirectory?: boolean;
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

// ============================================================================
// 「一张首页卡片 = 一个 app = 一个代表 prompt」的取值契约（操作员 2026-07-25 拍板）
// ----------------------------------------------------------------------------
// 首页卡片不再来自 home-cards 的 PROMPT_LIBRARY，而是直接渲染本站 app-catalog 的
// GoalApp。每张卡要展示/灌进输入框的那一条 prompt 由下面两个函数唯一决定，所有消费者
// （首页卡片、lightbox、`?fill=preset` 深链）都必须走它们，不许各自现场 `app.preset?.
// prompt || ...`——否则同一个 app 在首页、预览大图、操作台里会灌出三份不同的文案。
//
// 取值顺序：`preset.prompt`（该 app 的「标准起手式」）→ 回退第一个导航板块的第一张
// 示例卡。为什么不能反过来、也不能直接取「灵感区第一张卡」：共享层的
// `withPresetCard()` 会把 preset 卡插到【最后一个板块的开头】，所以界面上「灵感区第一
// 张卡」并不是 preset，取值必须回到数据本身。
//
// 全家桶约 636 个 app 里 preset / guideSections 都不是必填（music 站 22 个 app 两者
// 皆无、law 24 个里只有 19 个有 preset），所以两者皆空是【正常数据形态】，返回 null，
// 由调用方隐藏「prompt」「生成类似」按钮——绝不允许灌一个空串进输入框。
// ============================================================================

/** 空白（或缺失）→ undefined；否则返回 trim 后的非空字符串。 */
function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** 该 app 第一个导航板块的第一张示例卡（可能整条链路都不存在）。 */
function firstGuideExample(app: GoalApp) {
  return app.guideSections?.[0]?.examples?.[0];
}

/**
 * 一个 GoalApp 的【代表 prompt】：`preset.prompt` 优先，回退第一个导航板块的第一张
 * 示例卡的 prompt；两者都缺或都只有空白字符 → `null`（调用方据此隐藏 prompt 相关按钮）。
 */
export function representativePrompt(app: GoalApp): string | null {
  return (
    nonBlank(app.preset?.prompt) ??
    nonBlank(firstGuideExample(app)?.prompt) ??
    null
  );
}

/** 代表 prompt + 要一并灌进操作台的整套参数（`?fill=preset` 深链用）。 */
export interface RepresentativeFill {
  prompt: string;
  set: Record<string, unknown>;
}

/**
 * 「生成类似」/「高级编辑」深链要预填的整套内容：代表 prompt + 参数。
 *
 * 参数合并规则：`preset.set` 作为底，**只有当代表 prompt 来自导航示例卡时**再叠加该示例
 * 自己的 `set`（示例覆盖 preset 的同名字段）——因为此时进操作台要复现的是那张示例卡，
 * 而 preset.set 里的通用参数（比例、模式…）仍然是合理的底座。代表 prompt 为 null 时
 * 返回 null，保证「没有 prompt 的 app」不会被深链灌进半套参数。
 */
export function representativeFill(app: GoalApp): RepresentativeFill | null {
  const presetPrompt = nonBlank(app.preset?.prompt);
  const base: Record<string, unknown> = { ...(app.preset?.set || {}) };
  if (presetPrompt) return { prompt: presetPrompt, set: base };

  const example = firstGuideExample(app);
  const examplePrompt = nonBlank(example?.prompt);
  if (!examplePrompt) return null;
  return { prompt: examplePrompt, set: { ...base, ...(example?.set || {}) } };
}
