"use client";

// ============================================================================
// @oceanleo/ui — 成品 app 目录 · 统一模板组件（单一事实源，宗旨 v14，2026-07-05）
// ----------------------------------------------------------------------------
// 这是【所有 oceanleo 子站 workspace 首页】的统一渲染器。站点只提供两样东西：
//   ① 一批【成品 app 数据】(GoalApp[]，见 app-catalog.ts)；
//   ② 一个【共享操作台渲染器】renderOps(app) —— 该站现成的那套操作台组件（方案 A：
//      全站成品 app 复用同一套操作台 UI + 同一个后端 agent，差异只在预置）。
//
// SiteCatalogConsole 负责把这批数据变成完整 workspace：
//   - 首页：卡片目录（OperatorConsole directory 模式）+ 顶部横排【场景分类器】
//     （各站自定义场景词，数据驱动）。
//   - 点一张成品卡 → 进【共享操作台】，自动灌进该成品的预置 prompt 模板/参数；
//     右栏「导航」首屏 = 该成品的【三个模板板块】，点模板卡再灌进操作台。
//
// 为什么这样能「改一次模板、全站同步」（操作员硬要求）：所有成品 app 的操作台 UI
// 都从【同一个】renderOps 出（站点侧一个组件），目录/卡片/导航/预置接线都在【本
// 组件】里。日后要改模板 UI —— 改本组件 + 站点那一个 renderOps 组件，bump @oceanleo/ui
// 版本，全家桶所有成品 app 一起同步。站点的成品清单是纯数据，不含 UI。
// ============================================================================

import { useEffect, useMemo, type ReactNode } from "react";
import { OperatorConsole, type ConsoleFunction } from "./OperatorConsole";
import { type ModelCategory } from "./ModelPicker";
import { type GoalApp } from "./app-catalog";
import { type FunctionGuide, type GuideExample, type GuideSection } from "./NavigatorGuide";

export interface SiteCatalogConsoleProps {
  /** 本站 site_id（计量 / 历史分区 / 深链）。 */
  siteId: string;
  /** 本站成品 app 清单（≥20 个，面向目的、名词化）。 */
  apps: GoalApp[];
  /**
   * 共享操作台渲染器：给定当前成品 app，返回该站的操作台左栏内容（通常是站点把自己的
   * 操作台组件包进 <FunctionAgentChat>）。所有成品 app 复用它 —— 这就是「同一套模板」。
   * app 入参用于让站点在进入时读取/应用预置（一般站点已用 applyPreset 处理，不必看 app）。
   */
  renderOps: (app: GoalApp) => ReactNode;
  /** 共享右栏（结果 / 素材库）。所有成品 app 复用同一个右栏。 */
  renderCanvas: (app: GoalApp) => ReactNode;
  /**
   * @deprecated 宗旨 v15 决策 D：**进入 app 不再自动灌预置**（操作台进入时必须为空）。
   * 本 prop 不再被自动调用。成品的预置改为「快速起手」板块首卡（用户点才灌，见 §2）。
   * 保留 prop 仅为向后兼容（站点可继续传，无副作用）。真正的「进入即应用」（如选引擎/
   * 模式）请用 `onEnterApp`。 */
  applyPreset?: (app: GoalApp) => void;
  /**
   * 进入某成品 app 时的**非文本**初始化（宗旨 v15 决策 D）：只用于「选定该成品要用
   * 哪个引擎 / 模式」这类不往输入框灌文字的开关（如 image 的 cutout 模式、selfie 的
   * presetId）。**不要**在这里往操作台主输入字段灌 prompt——那违反「进入即空」。
   * 不传则进入时对操作台不做任何事（保持为空）。按 app.id 触发一次。 */
  onEnterApp?: (app: GoalApp) => void;
  /**
   * 是否把每个成品的 `preset`（标准起手 prompt + 参数）注入其「快速起手」板块首卡
   * （宗旨 v15 §2）。默认 true。站点若已在 guideSections 里自带该卡可传 false。 */
  injectPresetCard?: boolean;
  /** 强调色。 */
  accent?: string;
  /** 目录页标题（如「LeoImage 工作台」）。 */
  directoryTitle?: ReactNode;
  /** 目录页副标题。 */
  directorySubtitle?: ReactNode;
  /** 顶栏模型选择模态（如 ["image"]）。 */
  modelCategories?: ModelCategory[];
  /** 受控当前 app id（内嵌 / 深链用）；不传则组件自管目录↔功能区。 */
  value?: string;
  /** 切换/返回回调（同步 URL ?fn=）。 */
  onChange?: (id: string) => void;
  /** 内嵌（主站 iframe）：隐藏目录 + 顶栏，只渲染受控的单一成品 app。 */
  embed?: boolean;
  /** solo：主站 iframe 内嵌单功能。 */
  solo?: boolean;
  /** 导航区通用教学文案（成品未自带 guideIntro 时用）。 */
  guideIntro?: ReactNode;
}

/**
 * 把一批成品 app 渲染成完整 workspace（目录 + 场景分类器 + 共享操作台 + 三板块导航）。
 */
export function SiteCatalogConsole({
  siteId,
  apps,
  renderOps,
  renderCanvas,
  applyPreset,
  onEnterApp,
  injectPresetCard = true,
  accent = "#4f46e5",
  directoryTitle,
  directorySubtitle,
  modelCategories,
  value,
  onChange,
  embed = false,
  solo = false,
  guideIntro,
}: SiteCatalogConsoleProps) {
  // 每个成品 app → 一个 ConsoleFunction（全部复用 renderOps/renderCanvas；带场景 + 三板块导航）。
  const functions: ConsoleFunction[] = useMemo(
    () =>
      apps.map((app) => {
        // 宗旨 v15 修正（操作员 2026-07-05 晚）：点导航卡片 = 把【整套参数】灌进操作台，
        // 不只是主输入框。为此把「该成品的默认参数」(app.preset.set) 合并进**每一张**
        // 导航示例：示例自己写了的参数覆盖默认、没写的用成品默认补上。这样点任意卡片
        // 操作台的文体/字数/比例/画质…全都会对应变化（修「点卡片文体/字数不变」的 bug）。
        const withDefaults = withGuideDefaults(app.guideSections, app);
        const sections = injectPresetCard
          ? withPresetCard(withDefaults, app)
          : withDefaults;
        // 宗旨 v17（操作员 2026-07-07）：导航区不再显示「在左侧操作台精调…」教学文案
        // （NavigatorGuide 已不渲染 intro）。这里不再灌 GUIDE_INTRO_FALLBACK；仅当站点/成品
        // 显式给了 guideIntro 才透传（NavigatorGuide 当前忽略它，留作向后兼容）。
        const guide: FunctionGuide | undefined =
          sections && sections.length
            ? {
                title: `${app.name} · 模板`,
                intro: app.guideIntro ?? guideIntro,
                sections,
              }
            : undefined;
        return {
          id: app.id,
          label: app.name,
          icon: app.icon,
          thumb: app.thumb,
          badge: app.badge,
          tagline: app.tagline,
          capabilities: app.capabilities,
          scenes: app.scenes,
          agentId: `${siteId}.${app.id}`,
          ops: <CatalogOps app={app} renderOps={renderOps} onEnterApp={onEnterApp} />,
          canvas: renderCanvas(app),
          guide,
        };
      }),
    [apps, siteId, renderOps, renderCanvas, onEnterApp, injectPresetCard, guideIntro],
  );
  void applyPreset; // 宗旨 v15 决策 D：不再进入即调用（保留 prop 供兼容）。

  return (
    <OperatorConsole
      functions={functions}
      value={embed ? value : undefined}
      onChange={onChange}
      accent={accent}
      hideTabs={solo || embed}
      directory={!embed}
      directoryTitle={directoryTitle}
      directorySubtitle={directorySubtitle}
      siteId={siteId}
      modelCategories={modelCategories}
      modelSiteId={siteId}
      // 宗旨 v15 决策 H：进 app 后左「操作台」:右「库/结果」默认 3:4（操作台占 3/7）。
      // 宗旨 v20（操作员 2026-07-07「为什么 3:4 各站不一样」）：storageKey **全站共用一个**
      // `oceanleo_console_split`——各站进 app 都从同一个 3/7 起步、拖一次全家桶统一，杜绝
      // 「word 与 image 比例不同」的观感。旧的按站 key（`${siteId}_catalog_split`）弃用，
      // 老 localStorage 值自然被忽略 = 干净地回到一致的 3:4。
      defaultRatio={3 / 7}
      storageKey="oceanleo_console_split"
    />
  );
}

// 宗旨 v15 修正：把成品默认参数(app.preset.set)合并进每一张导航示例的 set——示例已写
// 的 key 保留（覆盖），未写的用成品默认补齐。→ 点任意导航卡片都会把【整套参数】灌进
// 操作台（文体/字数/比例/画质…），而不只是主输入框（修「点卡片参数不变」）。
function withGuideDefaults(
  sections: GuideSection[] | undefined,
  app: GoalApp,
): GuideSection[] | undefined {
  const base = app.preset?.set;
  if (!sections || sections.length === 0) return sections;
  // 无成品默认参数时也照常返回（示例自带的 set 仍生效）。
  if (!base || Object.keys(base).length === 0) return sections;
  return sections.map((s) => ({
    ...s,
    examples: s.examples.map((ex) => {
      const merged = { ...base, ...(ex.set || {}) };
      return { ...ex, set: merged };
    }),
  }));
}

// 宗旨 v15 §2：把成品的 preset（标准起手 prompt + 参数）注入其「快速起手」板块的第一
// 张卡——进入 app 后操作台是空的（决策 D），用户一眼看到「快速起手」，点这张 = 老的
// 「进入即灌」效果（含参数），但由用户主动触发。约定「快速起手」= 最后一个板块。
function withPresetCard(
  sections: GuideSection[] | undefined,
  app: GoalApp,
): GuideSection[] | undefined {
  const preset = app.preset;
  // 无 preset.prompt（如纯抠图成品，靠 onEnterApp 选模式）→ 不注入，原样返回。
  if (!preset || preset.prompt == null) return sections;
  const presetCard: GuideExample = {
    label: "标准模板（含参数）",
    hint: "一键套用本成品的标准起手式（含推荐参数）",
    prompt: preset.prompt,
    set: preset.set,
    icon: "⭐",
    badge: "起手",
  };
  if (!sections || sections.length === 0) {
    return [{ title: "快速起手", examples: [presetCard] }];
  }
  // 注入到最后一个板块（约定 = 快速起手）的最前面，避免与其已有「一句话XXX」卡重复
  // 语义时，标准卡在最上，用户优先看到。
  const out = sections.map((s) => ({ ...s, examples: [...s.examples] }));
  const last = out[out.length - 1];
  last.examples = [presetCard, ...last.examples];
  return out;
}

// 进入某成品 app 时只做**非文本**初始化（选引擎/模式，宗旨 v15 决策 D），再渲染站点
// 共享操作台。OperatorConsole 用 key={active.id} 包裹当前功能的 ops，切成品时本组件重挂
// → useEffect 再次触发。**不再**往操作台灌 prompt（进入即空；预置改由「快速起手」首卡
// 按需灌）。
function CatalogOps({
  app,
  renderOps,
  onEnterApp,
}: {
  app: GoalApp;
  renderOps: (app: GoalApp) => ReactNode;
  onEnterApp?: (app: GoalApp) => void;
}) {
  useEffect(() => {
    onEnterApp?.(app);
    // 仅按 app.id 触发一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);
  return <div className="h-full">{renderOps(app)}</div>;
}
