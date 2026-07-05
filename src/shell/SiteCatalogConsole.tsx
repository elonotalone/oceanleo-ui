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
import { type FunctionGuide } from "./NavigatorGuide";

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
   * 打开某成品 app 时，把它的预置（prompt 模板 + 参数）应用进共享操作台。站点实现
   * （它知道自己的 setter）。SiteCatalogConsole 在 app 打开 / 切换时调用。
   */
  applyPreset?: (app: GoalApp) => void;
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

// 每个成品 app 的库→导航「三个板块」的默认板块标题（成品自带 guideSections 时用其自身）。
const GUIDE_INTRO_FALLBACK =
  "在左侧「操作台」精调后点生成，或切到「agent」直接说需求。下面是几组现成模板，点一张即可把它填进左侧操作台，改几个字就能用。";

/**
 * 把一批成品 app 渲染成完整 workspace（目录 + 场景分类器 + 共享操作台 + 三板块导航）。
 */
export function SiteCatalogConsole({
  siteId,
  apps,
  renderOps,
  renderCanvas,
  applyPreset,
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
        const guide: FunctionGuide | undefined =
          app.guideSections && app.guideSections.length
            ? {
                title: `${app.name} · 模板`,
                intro: app.guideIntro ?? guideIntro ?? GUIDE_INTRO_FALLBACK,
                sections: app.guideSections,
              }
            : undefined;
        return {
          id: app.id,
          label: app.name,
          icon: app.icon,
          tagline: app.tagline,
          capabilities: app.capabilities,
          scenes: app.scenes,
          agentId: `${siteId}.${app.id}`,
          ops: <CatalogOps app={app} renderOps={renderOps} applyPreset={applyPreset} />,
          canvas: renderCanvas(app),
          guide,
        };
      }),
    [apps, siteId, renderOps, renderCanvas, applyPreset, guideIntro],
  );

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
    />
  );
}

// 进入某成品 app 时应用其预置，再渲染站点共享操作台。OperatorConsole 用 key={active.id}
// 包裹当前功能的 ops，切成品时本组件重挂 → useEffect 再次触发，把新成品的 prompt 模板/
// 参数灌进同一套操作台（方案 A：同一操作台 UI，靠预置区分成品）。
function CatalogOps({
  app,
  renderOps,
  applyPreset,
}: {
  app: GoalApp;
  renderOps: (app: GoalApp) => ReactNode;
  applyPreset?: (app: GoalApp) => void;
}) {
  useEffect(() => {
    applyPreset?.(app);
    // 仅按 app.id 触发一次（applyPreset 引用变化不重灌，避免覆盖用户已改的输入）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);
  return <div className="h-full">{renderOps(app)}</div>;
}
