"use client";

// ============================================================================
// @oceanleo/ui — 单页「操作台」+ 顶部功能按键（OceanLeo 强制版式宗旨，2026-06-18）
// ----------------------------------------------------------------------------
// 这是 OceanLeo 全家桶（除 oceanleo/crm/ui/aitools/chat 5 站）所有产品站「业务
// 功能页」的统一范本。宗旨：每个站只有一个功能性路由；该站全部功能用「操作台
// 顶部一排功能按键」在页面内切换（翻页），不再用多个业务路由页。
// 设计文档：docs/architecture/oceanleo-single-page-operator-console.md（oceandino repo）。
//
//   ┌──────────┬────────────────────────────────┬────────────────────────┐
//   │ 侧边栏    │ [功能A][功能B][功能C]…(整条顶栏，跨中+右两栏)              │
//   │(AppShell) │ ┌──────────────┬───────────────────────────────────────┐│
//   │ 站级导航  │ │ 操作台         │ 结果 / 素材查看区                       ││
//   │           │ │  ① 步骤一 …    │ (ResultCanvas)                        ││
//   │           │ └──────────────┴───────────────────────────────────────┘│
//   └──────────┴────────────────────────────────┴────────────────────────┘
//
// 与 <Studio> 的关系：OperatorConsole = 顶部功能按键条（在「操作台/结果」两栏标题
// 之上，整条横跨）+ 下方 <Studio>（中列操作流 + 右列 canvas）。单功能站也可直接
// 用 <Studio>；多功能站用本组件统一翻页。
// 操作员 2026-06-21：功能按键条从「操作台」栏内部上移到整个 Studio 之上 —— 即在
// 「操作台」标题栏上面，作为整页顶栏，而不是塞在「操作台」栏体里。
//
// 框架无关：不 import next/navigation。深链同步交给消费端——传 `value`/`onChange`
// 即可受控；想同步到 URL `?fn=`，在消费端用自己的 router 监听 onChange。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { Studio } from "./Studio";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { BackButton } from "./Playground";
import { ModelPicker, type ModelCategory } from "./ModelPicker";
import { useShellChrome } from "./ShellChrome";
import { type SplitLibraryConfig } from "./SplitWorkspace";
import { GuideProvider } from "./guide-context";
import { type FunctionGuide } from "./NavigatorGuide";
import { promptCardsForSite } from "./home-cards";
import { useUI } from "../i18n/ui/useUI";

// 顶部功能按键条 + 上方可选 header 占用的竖向高度（px）。Studio 用它从可视
// 高度里扣除，保证三栏整体不溢出一屏。按键条约 56px（pill 高 + 上下 padding），
// 留一点呼吸空间；带 header 时再加一截。
const TABS_BAR_HEIGHT = 60;

export interface ConsoleFunction {
  /** 功能唯一 id（用于受控选中 / 深链 ?fn=<id>）。 */
  id: string;
  /** 功能按键上的文字。 */
  label: string;
  /** 可选：按键左侧的小图标 / emoji。 */
  icon?: ReactNode;
  /** 可选：「热」「新」之类的小角标。 */
  badge?: string;
  /** 可选：目录卡片顶部配图缩略图（宗旨 v15，图示卡片版式）。 */
  thumb?: string;
  /** 目录卡片用的一句话简介。 */
  tagline?: string;
  /** 目录卡片正文（更长的能力说明）。 */
  capabilities?: string;
  /**
   * 宗旨 v14（操作员 2026-07-05）：本成品 app 归属的【场景分类】（各站自定义词，可多选，
   * 如 ["职场精选","机关单位"]）。目录页顶部横排分类器按它聚合成 chips，点某场景过滤出
   * 该场景下的成品卡。一个成品可同时属于多个场景。不给则落到「其它」。
   */
  scenes?: string[];
  /**
   * 宗旨 v21（操作员 2026-07-09）：本成品 app 归属的【能力大板块】（第一层分类，单值）。
   * 与 `scenes`（第二层情境维度）正交。目录页收到 `directoryGroups` 时顶部出第一层大板块
   * tab，选中某板块后第二层场景 chips + 卡片都收窄到该板块。不给则归入「全部」板块。
   */
  group?: string;
  /**
   * doctrine v3：本功能区绑定的 agent id（"<site_id>.<fn_id>"）。给了它，功能按键
   * 上会显示「✦ agent」标记，表示这个功能区有专属 agent 可一边聊一边生成。
   */
  agentId?: string;
  /**
   * 该功能的中列操作流（通常是若干 <StudioSection> + 底部主按钮）。
   * 用函数形式以便消费端按需惰性渲染。
   */
  ops: ReactNode;
  /**
   * 该功能的右列内容（通常是 <ResultCanvas>）。省略则沿用 OperatorConsole 的
   * 顶层 `canvas`（多个功能共用一个右栏时方便）。
   */
  canvas?: ReactNode;
  /**
   * 宗旨 v12.1（2026-07-04）：本功能页的「使用指南（navigator）」。给了它，右栏（库）
   * 标签条最前面自动多一个「使用指南」标签并默认选中——右版面首屏就是导航页（教学
   * 文案 + 示例，点示例把内容灌进左栏输入框）。右栏必须是 <ResultCanvas>（它读取
   * 指南上下文自动加标签）。左栏是 <FunctionAgentChat> 时示例自动填进其输入框；站点
   * 自定义表单可用 useRegisterOpsFiller 注册自己的填充器。
   */
  guide?: FunctionGuide;
}

export interface OperatorConsoleProps {
  /** 全部功能（= 顶部功能按键，从左到右）。 */
  functions: ConsoleFunction[];
  /** 受控：当前功能 id。不传则组件内部自管（非受控）。 */
  value?: string;
  /** 默认功能 id（非受控时的初始值）。默认第一个。 */
  defaultValue?: string;
  /** 切换功能时回调（受控必接；也可用于同步到 URL `?fn=`）。 */
  onChange?: (id: string) => void;
  /** 所有功能共用的右栏内容（当某功能未自带 canvas 时回退到它）。 */
  canvas?: ReactNode;
  /** 强调色（功能按键选中态 / 序号徽章），默认 #4f46e5（indigo-600）。 */
  accent?: string;
  /** 中列操作区初始宽度（px），默认 380。透传给 <Studio>（折算成初始比例）。 */
  opsWidth?: number;
  /** 左栏初始占比（0–1）。给了它就忽略 opsWidth。透传给 <Studio>。 */
  defaultRatio?: number;
  /** 分栏比例记忆 key（按站区分）。透传给 <Studio>；不传则不持久化。 */
  storageKey?: string;
  /** 左栏（操作台）标题，默认「操作台」。透传给 <Studio>。 */
  opsLabel?: ReactNode;
  /** 右栏（结果）标题，默认「结果」。透传给 <Studio>。 */
  canvasLabel?: ReactNode;
  /** 顶部 header 高度（px），默认 56（= AppShell header）。透传给 <Studio>。 */
  headerHeight?: number;
  /** 功能按键条上方可选标题区（如功能描述 / 提示）。 */
  header?: ReactNode;
  /**
   * 隐藏顶部功能区按键条，只渲染当前选中的那一个功能区（含其操作台/agent + 结果）。
   * 主站工作台 iframe 内嵌子站时用 `?solo=1` 触发——主站那条「我的 Agents」行已经
   * 是功能区选择器，子站不该再带出整站的功能区按键。
   */
  hideTabs?: boolean;
  className?: string;
  /**
   * doctrine v7 + 宗旨 v13（2026-07-02）：目录模式。开启后——先显示一个「功能/app
   * 目录页」（卡片网格），点一张卡片才进入该功能区，并在右上角显示「← 返回」回到目录。
   *
   * **宗旨 v13 起默认改为 true**：全家桶 workspace 首屏观感统一为「卡片目录 → 点入功能
   * 区」（对照操作员截图 image.oceanleo.com/workspace）。旧行为（直接落到唯一功能区，
   * 跳过目录）在 embed/solo（hideTabs）时仍然自动关闭 —— 主站 iframe 内嵌本来就是选择
   * 器，不该再套一层目录。少数确需跳过目录的功能站可显式传 `directory={false}`。
   */
  directory?: boolean;
  /** 目录页标题（directory 模式）。 */
  directoryTitle?: ReactNode;
  /** 目录页副标题。 */
  directorySubtitle?: ReactNode;
  /**
   * 宗旨 v21（操作员 2026-07-09）：目录页两层分类器【第一层：能力大板块】。给了它 →
   * 目录顶部先出一排大板块 tab，第二层再是场景 chips（只统计当前板块的成品）。数据驱动，
   * 顺序即 tab 顺序（「全部」自动置最前）。与 ConsoleFunction.group 搭配使用。 */
  directoryGroups?: { id: string; label: string; icon?: ReactNode }[];
  /** 目录卡片的分类输入（用于二元分类器）：每个功能区的 site_id / category。 */
  siteId?: string;
  /**
   * 顶栏右上角「模型选择」（操作员 2026-06-24）：给了模态，本组件会在自己那条顶栏的
   * **右上角**渲染一个收起态「模型选择」按键（点开才弹出各模态 chip 面板），并通知外层
   * AppShell 隐藏它 header 里的模型选择条——这样子站工作台「最上方只有一行」。
   * solo/embed（hideTabs）时不渲染（主站 iframe 内嵌，模型选择由主站那一行承担）。
   */
  modelCategories?: ModelCategory[];
  /** 模型选择「站点 × 用户」持久化标识（一般 = siteId）。 */
  modelSiteId?: string;
  /** 模型选择下拉底部「管理模型」跳转，默认 /api。 */
  apiHref?: string;
  /**
   * @deprecated 宗旨 v9（2026-06-27）：skill 形态整套删除，目录页不再有「app / skill」
   * 切换。此 prop 保留只为向后兼容（各站传不传都无效），不再渲染任何 skill 入口。
   */
  skillTab?: boolean;
  /**
   * 操作员 2026-07-01：内建「库」开关（全 OceanLeo 系列统一）。默认——只要有 siteId，
   * 就自动在操作台左栏标题右侧挂一枚「库」按钮（默认关，点开右栏显示共享文件库）。
   *   - 传对象 → 用它作为库配置（可指定 siteName / 跨站分区 sites）。
   *   - 传 false → 显式关闭库按钮（极少数不需要库的功能站）。
   *   - 不传 → 有 siteId 时自动启用（siteName 用 siteId）。
   * embed/solo（hideTabs）时不显示库（主站 iframe 内嵌，库入口由主站承担）。 */
  library?: SplitLibraryConfig | false;
  /**
   * 操作员 2026-07-01：单栏（库关闭）时操作台/结果内容最大宽度并居中，防止铺满整页
   * （横向范围与 agent 对话框一致）。透传给 Studio→SplitWorkspace，默认 48rem。 */
  soloMaxWidth?: string | null;
}

export function OperatorConsole({
  functions,
  value,
  defaultValue,
  onChange,
  canvas,
  accent = "#4f46e5",
  opsWidth = 380,
  defaultRatio,
  storageKey,
  opsLabel,
  canvasLabel,
  headerHeight = 56,
  header,
  hideTabs = false,
  className = "",
  directory = true,
  directoryTitle,
  directorySubtitle,
  directoryGroups,
  siteId = "",
  modelCategories,
  modelSiteId,
  apiHref = "/api",
  skillTab: _skillTab,
  library,
  soloMaxWidth = "48rem",
}: OperatorConsoleProps) {
  const tt = useUI();
  void _skillTab; // 宗旨 v9：skill 删除，目录页只剩 app。保留 prop 仅为向后兼容。
  // 「库」= 右版面显隐开关（右版面内容 = 各功能的 canvas，即该站自己的结果/库）。
  // 宗旨 v12.2（操作员 2026-07-05）：**内嵌（solo/embed）也要显示「库 + 导航」**——
  // playground/主站工作台内嵌的 app 之前被 hideTabs 砍掉库和导航，看起来比真实站落后
  // （截图 66716c5f「库对应位置完全没有库」）。现解耦：库只受 `library===false` 显式
  // 关闭控制，与 hideTabs 无关。显式 false 关闭；否则默认启用（子站用 accent 胶囊按钮）。
  const libraryConfig: SplitLibraryConfig | undefined =
    library === false
      ? undefined
      : library
        ? library
        : { label: tt("库") };
  const first = functions[0]?.id ?? "";
  const [internal, setInternal] = useState(defaultValue ?? first);
  const activeId = value ?? internal;
  const active =
    functions.find((f) => f.id === activeId) ?? functions[0];

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  // doctrine v7 目录模式：先列功能目录，点开才进入功能区（带返回）。
  // embed/solo（hideTabs）时不启用。**宗旨 v13（操作员 2026-07-02）**：一进 workspace
  // 【必须】先显示卡片目录 —— 哪怕全站只有 1 个功能区，也要显示一张卡片让用户点进去，
  // 目的是让全家桶所有站的 workspace 首屏观感一致（对照 image.oceanleo.com/workspace）。
  // 因此 `functions.length > 1` 的旧门槛（宗旨 v9 遗物）改为 `>= 1`：只要接线站传了
  // directory 且非 embed/solo，就进目录模式。深链直达（`?fn=xxx`）与「返回」行为保持不变
  // ——它们仍由 opened 状态承载，与 directoryMode 是否开启解耦。
  const directoryMode = directory && !hideTabs && functions.length >= 1;

  // 「目录页 ↔ 已进入功能区」由本组件**自管**（opened），与受控的 `value` 解耦。
  // 关键修复（操作员 2026-06-24，截图 2552c5a6「返回键形同虚设」）：
  //   受控站（bizdev/resume）旧逻辑 `isOpened = Boolean(value)` 恒为 true：
  //     ① 一进工作台就直接落到某功能区、跳过了目录卡片页；
  //     ② 点「返回」时父站又把 value 归位到默认功能 → 永远回不到目录，返回键摆设。
  //   宗旨 v10.1（2026-06-28）：单一事实源回到 URL `?fn=`，各站把功能选择收口成——
  //   有 `?fn=` → 传非空 value（深链直达该功能区）；无 `?fn=`（含点「返回」清掉
  //   fn）→ 传 undefined/空（显示目录）。所以 opened **以受控 value 初始化**：进站
  //   带 ?fn= 直接进功能区；返回时父站把 value 清空、本组件回目录。value 为空时
  //   opened 也为空（目录）。这样深链能直达、返回键也真实可用。
  const [opened, setOpened] = useState<string | null>(value || null);
  // value 受控变化（父站改 ?fn=）时同步 opened：清空→回目录；置值→进该功能区。
  useEffect(() => {
    if (value === undefined) return; // 非受控站不跟随
    setOpened(value || null);
  }, [value]);
  const isOpened = opened !== null;

  const openFn = (id: string) => {
    setOpened(id);
    select(id);
  };
  const backToDirectory = () => {
    setOpened(null);
    onChange?.("");
  };

  // 顶栏右上角「模型选择」（操作员 2026-07-07 二次校正，撤销 v18 误删）：v18 曾把顶栏的
  // 「模型选择」整个删掉——但操作员本意是删【左侧操控台表单内】的模型选择项，**不是**右上角
  // 顶栏那枚。右上角顶栏「模型选择 ▾」在各 app 里必须【恢复】。做法同 v10：本组件在自己那条
  // 顶栏右上角渲染收起态 ModelPicker（点开才弹面板），并通知 AppShell 隐藏它 header 里那条
  // 模型选择，避免顶栏出现两行。模态来源——优先本组件 props（modelCategories），否则回退到外层
  // AppShell 透传的 modelConfig（各站工作台页不必再手动传一遍）。
  const { setSuppressHeaderModel, modelConfig } = useShellChrome();
  const effectiveModelCategories =
    (modelCategories as string[] | undefined) ?? modelConfig?.categories;
  const effectiveModelSiteId =
    modelSiteId || siteId || modelConfig?.siteId || "default";
  const effectiveApiHref = apiHref || modelConfig?.apiHref || "/api";
  const showModelPicker = Boolean(effectiveModelCategories?.length) && !hideTabs;
  useEffect(() => {
    if (hideTabs) return; // solo/embed 由主站承载顶栏，不干预
    // 恒隐藏 AppShell header 里的模型选择：有顶栏模型选择时避免两处重复；没有时该 header
    // 也无内容（工作台页不传 headerRight），整体不渲染 → 高度按 0 计（见 studioHeaderHeight）。
    setSuppressHeaderModel(true);
    return () => setSuppressHeaderModel(false);
  }, [hideTabs, setSuppressHeaderModel]);

  const modelPicker: ReactNode = showModelPicker ? (
    <ModelPicker
      categories={effectiveModelCategories as ModelCategory[]}
      siteId={effectiveModelSiteId}
      apiHref={effectiveApiHref}
      variant="popover"
      align="right"
    />
  ) : null;

  if (directoryMode && !isOpened) {
    const items: DirectoryItem[] = functions.map((f) => ({
      id: f.id,
      name: f.label,
      tagline: f.tagline,
      capabilities: f.capabilities,
      icon: f.icon,
      thumb: f.thumb,
      badge: f.badge,
      accent,
      site_id: siteId,
      category: "",
      scenes: f.scenes,
      group: f.group,
    }));
    // 宗旨 v14：任一功能带了自定义场景词 → 目录顶部横排分类器切到「场景模式」
    // （各站自定义场景 chips），而非全局「按行业/按内容」。
    const sceneMode = functions.some((f) => (f.scenes?.length ?? 0) > 0);
    return (
      <div className={`mx-auto w-full max-w-6xl px-6 py-8 ${className}`}>
        {(directoryTitle || directorySubtitle || modelPicker) && (
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {directoryTitle && (
                <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
                  {typeof directoryTitle === "string" ? tt(directoryTitle) : directoryTitle}
                </h1>
              )}
              {directorySubtitle && (
                <p className="mt-1 text-[13px] text-neutral-500">
                  {typeof directorySubtitle === "string" ? tt(directorySubtitle) : directorySubtitle}
                </p>
              )}
            </div>
            {modelPicker && <div className="shrink-0">{modelPicker}</div>}
          </div>
        )}

        <AppDirectory
          items={items}
          accent={accent}
          openLabel={tt("打开")}
          onOpen={(it) => openFn(it.id)}
          sceneMode={sceneMode}
          groups={directoryGroups}
        />
      </div>
    );
  }

  // 宗旨 v10（操作员 2026-06-28）：一个 app 功能页 = 一个功能 = 一个操作台，进入
  // 功能区后**绝不显示顶部功能切换条**（参考图 law 案例检索页：顶栏只有 ← 返回 /
  // 功能名 / 模型选择）。换功能靠「返回目录 → 选另一张卡片」，不在页内横切。多功能
  // 站走 directory 目录模式选功能；非目录的多功能站（理论上少见）默认进入第一个功能
  // 区，仍不显示切换条。

  // 顶栏 = 可选 header + 「← 返回 / 当前功能名 / 模型选择」（宗旨 v10：无功能切换条）。
  // 它在「操作台 / 结果」两栏标题之上，整条横跨中+右两栏（即 Studio 之上）。
  // hideTabs（solo 模式）：彻底不渲染顶栏（主站 iframe 内嵌，模型选择由主站那行承担）。
  // directory 模式且已进入：顶栏左侧是「← 返回」（回目录）+ 当前功能名。
  // 非目录站：顶栏只承载可选 header + 右上角模型选择（无功能切换）。
  // 顶栏右上角放收起态模型选择（modelPicker），与左侧返回/功能名同一行 → 最上方一行。
  const showTopBar =
    (header != null || directoryMode || modelPicker != null) && !hideTabs;
  const topBar = showTopBar ? (
    <div className="shrink-0 space-y-3 px-4 pt-4">
      {header}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {directoryMode && (
            <div className="flex items-center gap-2">
              <BackButton onClick={backToDirectory} />
              <span className="truncate text-[13px] font-medium text-stone-600">
                {active?.icon != null && <span className="mr-1">{active.icon}</span>}
                {active?.label ? tt(active.label) : null}
                {active?.agentId && (
                  <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
                    ✦ agent
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
        {modelPicker && <div className="shrink-0">{modelPicker}</div>}
      </div>
    </div>
  ) : null;

  // 中列 = 当前功能的操作流（功能按键条已上移到顶栏）。
  // key 用 active.id：切功能时重置该功能操作流内部状态。
  // h-full：让 agent/chat 形态（FunctionAgentChat 的 `flex h-full flex-col`）能撑满
  // 左栏整高、把输入框压到最底（操作员 2026-06-24：输入框原来浮在半空）。
  const ops = <div key={active?.id} className="h-full">{active?.ops}</div>;

  // 宗旨 v11（2026-06-28）：进入某功能区时整块「从上到下」阶梯淡入（与 AppShell 切页
  // 同款 .v-page 动画）。目录→功能区是同路由状态切换，AppShell 的 key={pathname} 不会
  // 重新触发，所以这里用 key={active.id} 的 .v-page 包裹自行触发。
  const pageKey = active?.id ?? "ops";

  // Studio 自己用 height: calc(100dvh - headerHeight) 定高（视口相对，稳）。顶栏
  // 占了一截竖向空间，所以把它的高度叠加进 Studio 的 headerHeight 里扣除，三栏
  // 整体仍恰好一屏、不溢出。无需依赖 h-full 的高度链路。
  //
  // 关键修正（操作员 2026-06-24，截图 9e80ed94「下方空白太大」）：本组件渲染右上角
  // 模型选择时会 setSuppressHeaderModel(true)，AppShell 那条 56px header **被隐藏**。
  // 此时还按 headerHeight(默认 56) 去扣，Studio 就比视口矮了 56px → 下方一大块空白。
  //
  // 宗旨 v18（操作员 2026-07-07）：本组件（非 solo/embed）恒 setSuppressHeaderModel(true)
  // → AppShell header 里唯一的内容「模型选择」被隐藏。工作台页也不给 AppShell 传
  // headerRight，故 AppShell 的 header 整体不渲染（showHeader=false）→ header 占高 = 0。
  // 因此不再需要按 modelConfig 判断（旧逻辑靠它决定是否扣 headerHeight，现统一按 0）。
  const appShellHeader = 0;
  const studioHeaderHeight = appShellHeader + (showTopBar ? TABS_BAR_HEIGHT : 0);

  // 宗旨 v12.1/v12.2：每个功能页右栏首屏都要有「导航」——功能自带 guide 优先；没给的
  // 功能，按 siteId 从内置 prompt 库**自动兜底**一份（教学一句话 + 前几张卡片当示例，
  // 点示例灌进左栏操作台）。这样全家桶所有站零改动即获统一 navigator。
  // v12.2：**内嵌（solo/embed）也注入导航**——与库一致，让内嵌 app 与真实站对齐
  // （之前 hideTabs 砍掉导航，playground 里 app 落后）。
  const effectiveGuide: FunctionGuide | null =
    active?.guide
      ? active.guide
      : autoGuideForSite(siteId, active?.label ? tt(active.label) : "");

  return (
    <div className={className}>
      {topBar}
      {/* 进功能区「从上到下」阶梯淡入（宗旨 v11）。key 变化重挂 → 重新触发 .v-page。 */}
      <div key={pageKey} className="v-page contents">
        {/* 宗旨 v12.1：GuideProvider 把当前功能的 guide + fill-bus 供给整棵子树
            （左栏填充器注册 / 右栏 ResultCanvas 读取加「使用指南」标签）。 */}
        <GuideProvider guide={effectiveGuide} siteId={siteId} activeKey={active?.id ?? ""}>
          <Studio
            ops={ops}
            canvas={active?.canvas ?? canvas ?? null}
            opsWidth={opsWidth}
            defaultRatio={defaultRatio}
            storageKey={storageKey}
            opsLabel={opsLabel}
            canvasLabel={canvasLabel}
            accent={accent}
            headerHeight={studioHeaderHeight}
            library={libraryConfig}
            soloMaxWidth={soloMaxWidth}
          />
        </GuideProvider>
      </div>
    </div>
  );
}

// 从站点内置 prompt 库自动兜底一份「使用指南」（宗旨 v12.1）。没有 siteId 或库为空
// 就返回 null（不加指南标签）。示例取前 6 张卡片，点击时把卡片 prompt 灌进左栏。
function autoGuideForSite(siteId: string, fnLabel: string): FunctionGuide | null {
  const id = (siteId || "").trim();
  if (!id) return null;
  const cards = promptCardsForSite(id);
  if (!cards.length) return null;
  // 卡片正文只显示一句话（desc）；点击后填进左栏的是完整 prompt（操作员 2026-07-05）。
  const examples = cards.slice(0, 6).map((c) => ({
    label: c.title,
    hint: c.desc,
    prompt: c.prompt,
    icon: c.icon,
  }));
  // 宗旨 v17（操作员 2026-07-07）：导航区不再显示教学文案（NavigatorGuide 已不渲染 intro）。
  return {
    title: fnLabel ? `${fnLabel} · 导航` : "导航",
    examples,
    examplesLabel: "试试这些示例",
  };
}
