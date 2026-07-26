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
import type { ArtifactType } from "./artifact-contract";
import type { OpsPatch } from "../lib/fn-agent";

// ============================================================================
// 三层概念模型（操作员 2026-07-26 拍板，全局唯一口径）
// ----------------------------------------------------------------------------
//   一个首页卡片 = 一个 app = 一个功能；一个 app 挂一段代表 prompt；
//   一个 app 下挂 1–2 份模板素材。
//
// 两层图像职责【严格分开，不得混用】——上一轮把它们混成一个 `thumb` 才做错：
//
//   `GoalApp.capabilityImage`   功能图。表达「这个 app 干什么」的示意图，60px 见方
//                               一眼可辨认动作。出现在首页卡片缩略图，**不随模板切换
//                               而变**。一个 app 只有一张。
//   `TemplateMaterial.previewUrl` 模板素材预览。真实成品实例的预览，证明「做出来长
//                               这样」。**只在大卡片（TemplateShowcase）里出现**，
//                               随当前选中模板切换。一个 app 有 1–2 张。
//
// 判据：任何时候都不许把 `previewUrl` 拿去当首页缩略图，也不许把 `capabilityImage`
// 拿去当大卡片主预览。
// ============================================================================

/**
 * 一份【模板素材】= 该 app 下的一个真实成品实例，可预览、可下载、可载入编辑器。
 *
 * 硬约束（派活合同 §0.5）：
 *   - 必须是平台的**正式产物对象（typed artifact）**，不是散落的静态文件——否则
 *     「编辑模板」无法把它载进编辑器。
 *   - 必须能被「下载」按钮真正下载到真实文件（website 站下载的是源码包）。
 *   - **严禁使用任何真实用户产出**（law / med / resume / finance 尤其敏感）。
 *     只能是官方专门制作的样例。这是隐私红线。
 */
export interface TemplateMaterial {
  /**
   * 该模板素材的稳定 id，在**同一个 app 内唯一**（不要求全站唯一）。
   * 深链取值：`workspaceTemplateEditHref(appId, templateId)`（W4）与
   * `templateDownloadHref(templateId)`（W4 前端 / W7 端点）都拿它当键。
   * 命名建议 `<appId>-<n>`，与素材预览 key 的 `-<n>` 后缀对齐。
   */
  id: string;
  /** 素材标题（大卡片右侧主标题）。人可读、面向成品，如「科技发布会主视觉海报」。 */
  title: string;
  /**
   * 一段说明（大卡片右侧正文）。讲这份成品是什么、适合什么场合。
   * 不给时由 W2 回退展示该 app 的代表 prompt 全文。
   */
  summary?: string;
  /** 标签（大卡片右侧 chips），如 ["海报","科技","16:9"]。不给按空数组处理。 */
  tags?: string[];
  /**
   * 素材预览图：**裸 OSS key**（`tpl-material/<siteKey>-<appId>-<n>`）或完整 URL。
   * 与 `capabilityImage` 同一套取值约定：`assets/image/` 前缀与 `.webp` 扩展名由拼链层
   * 加，写进取值里就会拼成 `assets/image/assets/image/….webp.thumb.webp`（合同 §9.35）。
   * 这是**真实成品的预览**，不是功能示意图；大卡片的主预览与下方切换条都用它。
   */
  previewUrl: string;
  /**
   * 该素材背后的 typed artifact id。「编辑模板」靠它把**这一份具体素材**载入编辑器，
   * 而不是打开该 app 默认产物类型的空编辑器（派活合同 §0.3）。
   */
  artifactId: string;
  /**
   * 该 artifact 的类型，取值必须来自 `./artifact-contract` 的 `ARTIFACT_TYPES`。
   * 编辑器适配器的分发就是按它走的，所以这里刻意不放宽成 `string`——写错了
   * 「编辑模板」会打不开。website 站的源码包用 `"website"`。
   */
  artifactType: ArtifactType;
  /**
   * 直接可用的下载地址（完整 URL）。**通常不填**：不填时由
   * `templateDownloadHref(id)`（W4）按 `id` 生成走后端端点的链接，这样权限校验与
   * 配额都由 W7 的端点统一兜住。只有在素材本身已有稳定公开直链时才填这里。
   */
  downloadUrl?: string;
}

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
   * @deprecated 2026-07-26 起被 `capabilityImage` 取代，**新代码不要再写 `thumb`**。
   *
   * 目录卡片配图缩略图 URL（宗旨 v15）：图示卡片版式的顶部大图（AI 风格素材，来自
   * asset.oceanleo.com）。不给则回退 emoji tint 图示。用 assetThumbUrl(key) 拼直链。
   *
   * 为什么**保留字段而不是直接删**：30 个站的 catalog 目前都在写 `thumb: cover(id)`，
   * 而 W8a–W8f 六个批次是**分别独立落地**的。若现在删字段，任何一个还没轮到的站都会
   * 立刻 typecheck 变红，等于逼所有站锁步发布。所以留一个滚动期兜底窗口：
   *   - W8*：在挂 `capabilityImage` 的**同时删掉该 app 的 `thumb: cover(id)` 那一行**
   *     （上一轮那批「渐变底 + 白色线框图标」封面功能图/模板图两层都不满足，本轮全部
   *     替换，不是并存）。
   *   - 共享层：一律走 `capabilityImageOf(app)`，`capabilityImage` 优先、`thumb` 回退，
   *     只为「批次 A 已铺、批次 B 未铺」的中间态兜底，让未铺站的卡片不至于空白。
   *   - 全部 30 站清干净后，由后续一轮删掉本字段与各站的 `cover()` 辅助函数。
   */
  thumb?: string;
  /**
   * 【功能图】表达「这个 app 干什么」的示意图（派活合同 §0.4 四类画法）。取值为
   * **裸 OSS key**（`capabilityImageKey(siteKey, appId)` 的结果，即
   * `cap-app/<siteKey>-<appId>`，不带 `assets/image/` 前缀、不带 `.webp` 扩展名）或完整 URL。
   *
   * 出现在**首页卡片缩略图**，**不随模板切换而变**；60px 见方要一眼可辨认动作，
   * 画面内不得出现任何文字（17 语无法本地化）。
   *
   * 不要拿 `templates[].previewUrl` 顶替它：那是模板成品预览，属于另一层职责。
   */
  capabilityImage?: string;
  /**
   * 【模板素材】该 app 下挂的 1–2 份真实成品（操作员定：先 1 到 2 份）。
   *
   * **只在大卡片（TemplateShowcase）里出现**，首页卡片缩略图不用它。长度为 1 时
   * 大卡片不显示下方的模板切换条；为空/不给时该 app 只有代表 prompt，没有素材区。
   */
  templates?: TemplateMaterial[];
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

// ============================================================================
// 功能图与模板素材的取值契约（操作员 2026-07-26）
// ----------------------------------------------------------------------------
// 和代表 prompt 同样的道理：所有消费者（首页卡片缩略图、大卡片、深链）都必须走下面
// 两个函数，不许各自现场 `app.capabilityImage || app.thumb`——否则同一个 app 在首页
// 和大卡片里会取到两张不同的图，而这正是上一轮把两层图像混成一个字段留下的坑。
// ============================================================================

/**
 * 裁决该 app 的【功能图】取哪个字段：`capabilityImage` 优先，回退 `@deprecated` 的
 * `thumb`；两者都没有 → `undefined`（调用方回退 emoji tint 图示，绝不留空白块）。
 *
 * ⚠️ **返回的是 catalog 里存的原始取值，不是能直接渲染的 URL。** 30 个站按合同 §3 一律
 * 存 **OSS key**（形如 `cap-app/<siteKey>-<appId>`）。把它直接塞进 `<img src>`，浏览器
 * 会拿它当相对路径请求，30 站首页卡片图会全部 404——2026-07-26 真发生过（合同 §9.22，
 * 由 W1 的 `7f51b33` 修掉）。
 *
 * 要渲染就在外面套一层拼链函数（`../lib/app-capability-image`，W5）：
 *   缩略图：`capabilityImageThumbSrc(capabilityImageOf(app))`
 *   大图：  `capabilityImagePreviewSrc(appPreviewImageKey(app))`
 * 两个函数对已经是完整 http(s) URL 的取值都原样透传，所以未迁移站同样安全。
 *
 * 本函数**只做数据源裁决**，刻意不碰 OSS 桶名、`.thumb.webp` / `.webp` 后缀，以及
 * `.preview.webp` 在 OSS 上不存在那个坑——那些全归拼链层。需要**原始 key** 的消费者
 * （W5 的 verify 流水线、catalog 审计、深链解析）正是靠这条边界才拿得到 key；
 * 若把拼链合并进来，它们就再也取不回 key 了。
 *
 * `thumb` 回退**只服务 W8a–W8f 分批铺开的中间态**，全部 30 站铺完后连同字段一起删。
 * `app` 允许是 `null`/`undefined`（同样返回 `undefined`），理由见 `appTemplates`。
 */
export function capabilityImageOf(
  app: GoalApp | null | undefined,
): string | undefined {
  if (app == null) return undefined;
  return nonBlank(app.capabilityImage) ?? nonBlank(app.thumb);
}

/**
 * 该 app 可展示的【模板素材】列表，已剔除缺少必填字段的脏条目（id / title /
 * previewUrl / artifactId 任缺一个都无法在大卡片里正确渲染或派发编辑）。
 *
 * **对任何输入都返回数组**（可能为空），包括 `null`/`undefined` 的 app：大卡片与深链
 * 解析都在「app 还没解析出来」的状态下被调用（浮层未选中、深链 appId 不存在），让取值
 * 函数在那一刻抛 `TypeError` 只会逼每个调用点各写一遍 `app ? … : []`。调用方据数组长度
 * 决定：0 份 → 大卡片不出素材区；1 份 → 不显示下方切换条；2 份 → 显示切换条。
 *
 * 返回的是新数组，调用方 mutate 不会污染 catalog。
 */
export function appTemplates(
  app: GoalApp | null | undefined,
): TemplateMaterial[] {
  return (app?.templates || []).filter(
    (t) =>
      t != null &&
      nonBlank(t.id) != null &&
      nonBlank(t.title) != null &&
      nonBlank(t.previewUrl) != null &&
      nonBlank(t.artifactId) != null,
  );
}
