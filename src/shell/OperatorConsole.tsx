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

import { useEffect, useId, useState, type ReactNode } from "react";
import { Studio } from "./Studio";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { BackButton } from "./Playground";
import { ModelPicker, type ModelCategory } from "./ModelPicker";
import { useShellChrome } from "./ShellChrome";
import { SiteSkillDirectory } from "./SiteSkillDirectory";

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
  /** 目录卡片用的一句话简介。 */
  tagline?: string;
  /** 目录卡片正文（更长的能力说明）。 */
  capabilities?: string;
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
   * doctrine v7：目录模式。开启后——多功能站先显示一个「功能/app 目录页」（卡片网格），
   * 点一张卡片才进入该功能区，并在右上角显示「← 返回」回到目录。这样侧栏不必再列
   * 功能，符合「侧栏不显示具体 app」+「右上角返回」的统一版式。
   * 默认 false（兼容旧行为）。embed/solo（hideTabs）时强制关闭（主站已是选择器）。
   */
  directory?: boolean;
  /** 目录页标题（directory 模式）。 */
  directoryTitle?: ReactNode;
  /** 目录页副标题。 */
  directorySubtitle?: ReactNode;
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
   * directory 模式：在目录页顶部加一个「app / skill」切换（操作员 2026-06-24）。
   *   - app：本站功能区卡片（默认）。
   *   - skill：与本站相关的 LeoSkill skill（按 relatedSkillCategories(siteId) 过滤），
   *     点开去 LeoSkill 对应 skill 开聊。
   * 默认 true（directory 模式且有 siteId 时生效）。传 false 关闭。
   */
  skillTab?: boolean;
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
  directory = false,
  directoryTitle,
  directorySubtitle,
  siteId = "",
  modelCategories,
  modelSiteId,
  apiHref = "/api",
  skillTab = true,
}: OperatorConsoleProps) {
  const groupId = useId();
  // directory 模式目录页的「app / skill」切换态。
  const [dirTab, setDirTab] = useState<"app" | "skill">("app");
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
  // embed/solo（hideTabs）时不启用。多功能站本就启用；单功能站若开了 app/skill 切换
  // （skillTab）也启用——这样单功能站也有「app / skill」目录页（操作员 2026-06-24）。
  const hasSkillTab = skillTab && Boolean(siteId);
  const directoryMode = directory && !hideTabs && (functions.length > 1 || hasSkillTab);

  // 「目录页 ↔ 已进入功能区」由本组件**自管**（opened），与受控的 `value` 解耦。
  // 关键修复（操作员 2026-06-24，截图 2552c5a6「返回键形同虚设」）：
  //   受控站（bizdev/resume）总是把一个**非空默认功能 id**作为 `value` 传进来（如
  //   "reply"），从不为空。旧逻辑 `isOpened = Boolean(value)` 因此恒为 true：
  //     ① 一进工作台就直接落到某功能区、跳过了目录卡片页；
  //     ② 点「返回」时父站又把 value 归位到默认功能 → 永远回不到目录，返回键摆设。
  //   现改为：目录模式下**一律从目录页起步**（opened=null），点卡片才进功能区、
  //   点返回才回目录。opened 是「在不在目录页」的单一事实源，不被 value 牵着走；
  //   value 只决定「进入后激活哪个功能」。这样无论站点是否受控，返回键都真实可用。
  const [opened, setOpened] = useState<string | null>(null);
  const isOpened = opened !== null;

  const openFn = (id: string) => {
    setOpened(id);
    select(id);
  };
  const backToDirectory = () => {
    setOpened(null);
    onChange?.("");
  };

  // 顶栏右上角模型选择：非 solo/embed 时渲染。模态来源——优先本组件 props
  // （modelCategories），否则 fallback 到外层 AppShell 透传的 modelConfig（这样各站
  // 工作台页不必再手动传一遍）。渲染时通知 AppShell 隐藏它 header 里那条（避免两行顶栏）。
  const { setSuppressHeaderModel, modelConfig } = useShellChrome();
  const effectiveModelCategories =
    (modelCategories as string[] | undefined) ?? modelConfig?.categories;
  const effectiveModelSiteId =
    modelSiteId || siteId || modelConfig?.siteId || "default";
  const effectiveApiHref = apiHref || modelConfig?.apiHref || "/api";
  const showModelPicker = Boolean(effectiveModelCategories?.length) && !hideTabs;
  useEffect(() => {
    if (!showModelPicker) return;
    setSuppressHeaderModel(true);
    return () => setSuppressHeaderModel(false);
  }, [showModelPicker, setSuppressHeaderModel]);

  const modelPicker = showModelPicker ? (
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
      accent,
      site_id: siteId,
      category: "",
    }));
    const showSkillTab = hasSkillTab;
    return (
      <div className={`mx-auto w-full max-w-6xl px-6 py-8 ${className}`}>
        {(directoryTitle || directorySubtitle || modelPicker) && (
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {directoryTitle && (
                <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{directoryTitle}</h1>
              )}
              {directorySubtitle && (
                <p className="mt-1 text-[13px] text-neutral-500">{directorySubtitle}</p>
              )}
            </div>
            {modelPicker && <div className="shrink-0">{modelPicker}</div>}
          </div>
        )}

        {/* app / skill 切换（操作员 2026-06-24）：app = 本站功能区；skill = 相关 LeoSkill。 */}
        {showSkillTab && (
          <div className="mb-6 inline-flex rounded-xl bg-neutral-100 p-1">
            {([
              { id: "app", label: "app" },
              { id: "skill", label: "skill" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDirTab(t.id)}
                className={`rounded-lg px-5 py-1.5 text-[13px] font-medium transition ${
                  dirTab === t.id
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {showSkillTab && dirTab === "skill" ? (
          <SiteSkillDirectory siteId={siteId} accent={accent} />
        ) : (
          <AppDirectory
            items={items}
            accent={accent}
            openLabel="打开"
            onOpen={(it) => openFn(it.id)}
          />
        )}
      </div>
    );
  }

  // doctrine v3（操作员 2026-06-21）：功能按键条不仅在「多功能」时显示——只要存在
  // 任一带 agent 的功能区，即便是单功能站也要把那条按键显示出来，让用户看到该功能
  // 区的「✦ agent」标记（单 agent 站也是一个功能区=一个 agent）。纯单功能且无 agent
  // 的站（无标记价值）才隐藏。solo 模式（hideTabs）始终隐藏。
  const hasAgent = functions.some((f) => f.agentId);
  const showTabs = (functions.length > 1 || hasAgent) && !hideTabs;

  // 顶栏 = 可选 header + 功能按键条。它在「操作台 / 结果」两栏标题之上，整条横跨
  // 中+右两栏（即 Studio 之上），不再塞进「操作台」栏体里。
  // hideTabs（solo 模式）：彻底不渲染功能按键条 + header。
  // directory 模式且已进入：顶栏改为「← 返回」（回目录），不再列全部功能按键。
  // 顶栏右上角放收起态模型选择（modelPicker），与左侧返回/功能名同一行 → 最上方一行。
  const showTopBar =
    (showTabs || header != null || directoryMode || modelPicker != null) && !hideTabs;
  const topBar = showTopBar ? (
    <div className="shrink-0 space-y-3 px-4 pt-4">
      {header}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {directoryMode ? (
            <div className="flex items-center gap-2">
              <BackButton onClick={backToDirectory} />
              <span className="truncate text-[13px] font-medium text-stone-600">
                {active?.icon != null && <span className="mr-1">{active.icon}</span>}
                {active?.label}
                {active?.agentId && (
                  <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
                    ✦ agent
                  </span>
                )}
              </span>
            </div>
          ) : (
            showTabs && (
              <FunctionTabs
                functions={functions}
                activeId={active?.id ?? ""}
                accent={accent}
                groupId={groupId}
                onSelect={select}
              />
            )
          )}
        </div>
        {modelPicker && <div className="shrink-0">{modelPicker}</div>}
      </div>
    </div>
  ) : null;

  // 中列 = 当前功能的操作流（功能按键条已上移到顶栏）。
  // key 用 active.id：切功能时重置该功能操作流内部状态。
  const ops = <div key={active?.id}>{active?.ops}</div>;

  // Studio 自己用 height: calc(100dvh - headerHeight) 定高（视口相对，稳）。顶栏
  // 占了一截竖向空间，所以把它的高度叠加进 Studio 的 headerHeight 里扣除，三栏
  // 整体仍恰好一屏、不溢出。无需依赖 h-full 的高度链路。
  //
  // 关键修正（操作员 2026-06-24，截图 9e80ed94「下方空白太大」）：本组件渲染右上角
  // 模型选择时会 setSuppressHeaderModel(true)，AppShell 那条 56px header **被隐藏**。
  // 此时还按 headerHeight(默认 56) 去扣，Studio 就比视口矮了 56px → 下方一大块空白。
  // 所以 header 被我们顶掉时，AppShell header 高度按 0 算，只扣自己的顶栏条。
  const appShellHeader = showModelPicker ? 0 : headerHeight;
  const studioHeaderHeight = appShellHeader + (showTopBar ? TABS_BAR_HEIGHT : 0);

  return (
    <div className={className}>
      {topBar}
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
      />
    </div>
  );
}

// 顶部功能按键条：横排可换行的 pill 按钮，选中态用 accent 着色。
function FunctionTabs({
  functions,
  activeId,
  accent,
  groupId,
  onSelect,
}: {
  functions: ConsoleFunction[];
  activeId: string;
  accent: string;
  groupId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="功能选择"
      className="flex flex-wrap gap-1.5 rounded-2xl border border-stone-200/80 bg-white/80 p-1.5 shadow-sm"
    >
      {functions.map((f) => {
        const on = f.id === activeId;
        return (
          <button
            key={f.id}
            id={`${groupId}-tab-${f.id}`}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onSelect(f.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              on
                ? "text-white shadow-sm"
                : "text-stone-600 hover:bg-stone-100"
            }`}
            style={on ? { background: accent } : undefined}
          >
            {f.icon != null && <span className="shrink-0">{f.icon}</span>}
            <span>{f.label}</span>
            {f.agentId && (
              <span
                title="此功能区有专属 agent"
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                  on ? "bg-white/25 text-white" : "bg-indigo-100 text-indigo-700"
                }`}
              >
                ✦ agent
              </span>
            )}
            {f.badge && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                  on ? "bg-white/25 text-white" : "bg-rose-500 text-white"
                }`}
              >
                {f.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
