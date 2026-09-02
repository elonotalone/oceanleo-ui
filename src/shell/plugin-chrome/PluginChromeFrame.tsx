"use client";

// 统一外壳的版式实现。插件只填槽，不再各自搭 header / toolbar / 左栏。
// 行序契约见 ./types.ts，任何插件都不许调换或省略。

import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AdvancedEditorIcon, type WorkbenchIconName } from "../AdvancedEditorIcon";
import { AdvancedLayoutContext } from "../advanced-layout-context";
import {
  PluginThemeToggle,
  usePluginTheme,
  type PluginThemeId,
} from "../plugin-theme";
import { PluginChromeEditBarGestureLayer } from "../PluginChromeEditBarGestureLayer";
import { PLUGIN_AGENT_DRAWER_ID } from "./agent-drawer";
import { createPluginAgentDrawer } from "./agent-drawer-panel";
import {
  usePluginChromeEditBarGestures,
  usePluginChromeLayout,
} from "./use-plugin-chrome-layout";
import { PluginChromeNotices } from "./PluginChromeNotices";
import { PluginChromeStatus } from "./PluginChromeStatus";
import {
  PLUGIN_CHROME_EDITBAR_MIN_H,
  PLUGIN_CHROME_HEADER_H,
  PLUGIN_CHROME_PANEL_DEFAULT_W,
  pluginChromeStyle,
} from "./tokens";
import type {
  PluginChromeAction,
  PluginChromeNotice,
  PluginChromePanel,
  PluginChromeSaveState,
  PluginChromeView,
  PluginChromeWindowActions,
} from "./types";
import {
  usePluginChromePanels,
  type PluginChromePanelController,
} from "./use-plugin-chrome-panels";

const PanelContext = createContext<PluginChromePanelController | null>(null);

/** edit bar 里的按钮用它展开左侧面板，不必层层传 props。 */
export function usePluginChromePanelHost(): PluginChromePanelController {
  const controller = useContext(PanelContext);
  if (!controller) {
    throw new Error("usePluginChromePanelHost 必须在 PluginChromeFrame 内调用");
  }
  return controller;
}

const ACTION_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--pchrome-line)] bg-[var(--pchrome-surface)] px-3 text-[11px] font-semibold text-[var(--pchrome-ink-mid)] shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--pchrome-muted)] hover:text-[var(--pchrome-ink)] disabled:pointer-events-none disabled:opacity-40";

const ICON_ACTION_CLASS =
  "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-transparent text-[var(--pchrome-ink-mid)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--pchrome-line)] hover:bg-[var(--pchrome-muted)] hover:text-[var(--pchrome-ink)] disabled:pointer-events-none disabled:opacity-40";

export interface PluginChromeFrameProps {
  /** 决定主题档与 accent 身份色。13 件插件都必须有值。 */
  pluginId: PluginThemeId;
  title: string;
  subtitle?: string;
  /** 顶栏左上角的身份角标，例如网站工作台的 “W”。 */
  badge?: string;

  /**
   * agent 会话的站点分区。缺省时按插件独立分区，不与别的站串台。
   * 只喂内建的 AI 抽屉，插件不必也不该自己接 agent 面板。
   */
  siteId?: string;
  /** 内建 AI 抽屉的会话 id，需要跨挂载续上同一轮对话时传。 */
  agentTaskId?: string | null;
  onAgentTaskIdChange?: (taskId: string | null) => void;

  views?: readonly PluginChromeView[];
  activeViewId?: string;
  onViewChange?: (viewId: string) => void;

  actions?: readonly PluginChromeAction[];

  /** edit bar 行的内容。恒有一行，除非显式 editBarHidden。 */
  editBar?: ReactNode;
  /**
   * 网站编辑只有 Preview 视图才该有 edit bar，其余视图整行收起。
   * 其它插件不要用这个开关——空 bar 也要占位，否则跨插件切换会跳行。
   */
  editBarHidden?: boolean;
  editBarEmptyHint?: string;

  panels?: readonly PluginChromePanel[];
  saveState?: PluginChromeSaveState;
  notices?: readonly PluginChromeNotice[];
  window?: PluginChromeWindowActions;

  /** 舞台。 */
  children: ReactNode;
}

export function PluginChromeFrame({
  pluginId,
  title,
  subtitle,
  badge,
  siteId,
  agentTaskId,
  onAgentTaskIdChange,
  views,
  activeViewId,
  onViewChange,
  actions,
  editBar,
  editBarHidden = false,
  editBarEmptyHint,
  panels,
  saveState,
  notices,
  window: windowActions,
  children,
}: PluginChromeFrameProps) {
  const tt = useUI();
  const { theme, accent } = usePluginTheme(pluginId);

  // ── AI 抽屉：外壳内建，全仓唯一注册点 ──────────────────────────────
  // 插件不注册、也不能覆盖。改造前视频画布就是自己包了一层 CanvasAgentPanel
  // 挂成普通面板，绕开 PLUGIN_AGENT_DRAWER_ID，于是同一个抽屉在两套外壳里
  // 成了两个标识（位置、快捷键、aria-pressed、互斥关系各管各的）。
  // 再来第三件就会有第三种写法，所以这里直接把这个 id 收归外壳。
  const agentDrawer = useMemo(
    () =>
      createPluginAgentDrawer({
        editorId: pluginId,
        siteId,
        accent: accent || undefined,
        taskId: agentTaskId,
        onTaskIdChange: onAgentTaskIdChange,
        translate: tt,
      }),
    [accent, agentTaskId, onAgentTaskIdChange, pluginId, siteId, tt],
  );
  const panelList = useMemo(
    () => [
      ...(panels || []).filter((panel) => panel.id !== PLUGIN_AGENT_DRAWER_ID),
      agentDrawer,
    ],
    [agentDrawer, panels],
  );
  const controller = usePluginChromePanels(panelList);
  const { activePanel, isOpen } = controller;
  const { layout, transientPanel, hostController } =
    usePluginChromeLayout(controller);
  // 编辑栏手势（W31）：三根 ref 分别落在 frame 根 / edit bar 行 / 舞台上，
  // 控制器与 10 件共享插件用的是同一份。为什么走这条路而不是把
  // `contextBarLeading/Trailing` 填上，见 use-plugin-chrome-layout.tsx 那段注释。
  const editBarGestures = usePluginChromeEditBarGestures(pluginId);

  const runAction = useCallback(
    (action: PluginChromeAction) => {
      if (action.panelId) hostController.togglePanel(action.panelId);
      void action.onTrigger?.();
    },
    [hostController],
  );

  const style = pluginChromeStyle(theme || "light", accent || "#4f46e5");

  // transient 面板（`layout.openTransientPanel`）顶掉常规面板占住左栏，
  // 与基准一致（use-inline-advanced-panels.tsx:156-162）。
  const sidePanel: {
    id: string;
    label: ReactNode;
    icon?: WorkbenchIconName;
    content: ReactNode;
    pinned: boolean;
    width?: number;
  } | null = transientPanel
    ? {
        id: transientPanel.id,
        label: transientPanel.label,
        content: transientPanel.content,
        pinned: false,
      }
    : activePanel
      ? {
          id: activePanel.id,
          label: tt(activePanel.label),
          icon: activePanel.icon,
          content: activePanel.content,
          pinned: Boolean(activePanel.pinned),
          width: activePanel.width,
        }
      : null;
  const panelWidth = sidePanel?.width || PLUGIN_CHROME_PANEL_DEFAULT_W;

  // AI 键：语义逐字对齐 SelectionToolbar.tsx:248-270 那块样板——同一个
  // data 属性、同一个 aria-pressed 取值、同一条「开着再点就关」的分支。
  // 差别只在挂载点：那里由选区工具条长出来，这里由外壳恒定出一个，
  // 所以没有选中对象时 AI 键也在。
  const agentActive = layout.activeDrawerId === PLUGIN_AGENT_DRAWER_ID;

  return (
    <AdvancedLayoutContext.Provider value={layout}>
    <PanelContext.Provider value={hostController}>
      <div
        ref={editBarGestures.layerRef}
        data-plugin-chrome={pluginId}
        data-plugin-theme={theme || undefined}
        style={style}
        // `relative`：编辑栏浮层是 `absolute inset-0` 的一层，需要这里当定位原点。
        className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--pchrome-canvas)] text-[var(--pchrome-ink)]"
      >
        {/* ---------------------------------------------- 行 1：顶栏 */}
        <header
          data-plugin-chrome-header
          className={`relative z-30 flex ${PLUGIN_CHROME_HEADER_H} shrink-0 items-center gap-3 border-b border-[var(--pchrome-line)] bg-[var(--pchrome-surface)] px-3`}
        >
          <div className="flex min-w-0 items-center gap-2 pr-1">
            {badge && (
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--pchrome-accent)] text-[11px] font-black text-[var(--pchrome-on-accent)] shadow-sm">
                {badge}
              </div>
            )}
            <div className="hidden min-w-0 sm:block">
              <p className="max-w-40 truncate text-[12px] font-semibold leading-4">
                {title}
              </p>
              {subtitle && (
                <p className="max-w-40 truncate text-[10px] leading-3 text-[var(--pchrome-ink-mid)]">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* 视图切换：标签文字恒显示。改造前只有选中项显示文字、其余塌成
              36px 纯图标，用户根本看不出还有哪些视图。 */}
          {views && views.length > 0 && (
            <nav
              data-plugin-chrome-views
              aria-label={tt("视图切换")}
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            >
              {views.map((view) => {
                const selected = view.id === activeViewId;
                const unavailable = view.available === false;
                return (
                  <button
                    key={view.id}
                    type="button"
                    aria-current={selected ? "page" : undefined}
                    data-plugin-chrome-view={view.id}
                    data-unavailable={unavailable || undefined}
                    disabled={unavailable}
                    title={
                      unavailable
                        ? `${tt(view.label)}：${view.unavailableReason || tt("该模块未注册")}`
                        : view.shortcut
                          ? `${tt(view.label)} · ${view.shortcut}`
                          : tt(view.label)
                    }
                    onClick={() => onViewChange?.(view.id)}
                    className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[12px] font-semibold transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 selected
 ? "border-[var(--pchrome-accent)] bg-[var(--pchrome-accent-soft)] text-[var(--pchrome-accent)] shadow-sm"
 : `border-transparent hover:border-[var(--pchrome-line)] hover:bg-[var(--pchrome-muted)] hover:text-[var(--pchrome-ink)] ${
 unavailable
 ? "cursor-not-allowed text-[var(--pchrome-ink-mid)] opacity-50"
 : "text-[var(--pchrome-ink-mid)]"
 }`
 }`}
                  >
                    <AdvancedEditorIcon name={view.icon} className="h-4 w-4" />
                    <span>{tt(view.label)}</span>
                  </button>
                );
              })}
            </nav>
          )}
          {(!views || views.length === 0) && <div className="flex-1" />}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {actions?.map((action) => {
              const iconOnly = action.variant === "icon";
              const active = action.panelId
                ? !transientPanel && isOpen(action.panelId)
                : false;
              return (
                <button
                  key={action.id}
                  type="button"
                  data-plugin-chrome-action={action.id}
                  aria-pressed={action.panelId ? active : undefined}
                  aria-label={tt(action.label)}
                  title={tt(action.label)}
                  disabled={action.disabled || action.busy}
                  onClick={() => runAction(action)}
                  className={`${iconOnly ? ICON_ACTION_CLASS : ACTION_CLASS} ${
                    active
                      ? "border-[var(--pchrome-accent)] bg-[var(--pchrome-accent-soft)] text-[var(--pchrome-accent)]"
                      : ""
                  }`}
                >
                  {action.icon && (
                    <AdvancedEditorIcon
                      name={action.icon}
                      className="h-4 w-4"
                    />
                  )}
                  {!iconOnly && (
                    <span>
                      {action.busy && action.busyLabel
                        ? tt(action.busyLabel)
                        : tt(action.label)}
                    </span>
                  )}
                </button>
              );
            })}

            {saveState && <PluginChromeStatus state={saveState} />}
            <PluginThemeToggle pluginId={pluginId} />

            {windowActions?.onToggleFullscreen && (
              <button
                type="button"
                onClick={windowActions.onToggleFullscreen}
                className={ICON_ACTION_CLASS}
                // 全屏是个开关而不是一次性动作，读屏要能报出「已按下」。
                aria-pressed={windowActions.fullscreen === true}
                aria-label={tt(windowActions.fullscreen ? "退出全屏" : "全屏")}
                title={tt(windowActions.fullscreen ? "退出全屏" : "全屏")}
              >
                <AdvancedEditorIcon
                  name={
                    windowActions.fullscreen ? "fullscreen-exit" : "fullscreen"
                  }
                  className="h-4 w-4"
                />
              </button>
            )}
            {windowActions?.onClose && (
              <button
                type="button"
                onClick={windowActions.onClose}
                className={ICON_ACTION_CLASS}
                aria-label={tt("关闭")}
                title={tt("关闭")}
              >
                <AdvancedEditorIcon name="close" className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* ---------------------------------------------- 行 2：edit bar */}
        {/*
          这一行**恒存在**，editBarHidden 只收起插件填的那段内容。
          改造前 editBarHidden 会把整行删掉，于是网站编辑切到 Code/Dashboard
          视图时 AI 键跟着消失——那正是本轮要修的缺陷本身，不能按视图复发。
        */}
        <div
          ref={editBarGestures.dockRef}
          data-plugin-chrome-edit-bar
          data-empty={editBarHidden || !editBar || undefined}
          data-edit-bar-content-hidden={editBarHidden || undefined}
          role="toolbar"
          aria-label={tt("编辑栏")}
          className={`flex ${PLUGIN_CHROME_EDITBAR_MIN_H} shrink-0 items-center gap-1.5 border-b border-[var(--pchrome-line)] bg-[var(--pchrome-surface)] px-2 py-1`}
        >
          {/*
            手势层（W31 / W4）。有可挂的宿主时这一行的内容整体交给共享浮层，
            行本身降级成停靠带（与 10 件共享插件那侧 EditBarDockHost 的分工相同），
            于是「双击任意位置拖拽 / 收起为圆 / 拖圆」三条在这三件插件上也成立。
            还没有宿主时内容原样留在行里——AI 键不许因为动效起不来而消失。
            宿主晚一拍挂上必须补装，不能把控制器 portalRoot 的空快照当成没有宿主。
          */}
          <PluginChromeEditBarGestureLayer
            bridge={editBarGestures}
            accent={accent || "#4f46e5"}
            theme={theme}
          >
          {/*
            槽内显式**不**提供 AdvancedLayout。设计画布与视频画布都把
            SelectionToolbar 渲染在这个槽里；一旦它拿到 layout，会同时发生三件事：
            (1) SelectionToolbar.tsx:249 再长出第二个 AI 键；
            (2) :242 effectiveVariant 被强制翻成 floating，在本就有边框底色的
                这一行里再套一层胶囊；
            (3) :165-179 选区检查器改走左抽屉。
            三件都落在包外仓上、本仓测不到。AI 键由外壳统一出一个，
            槽内维持今天的行为。迁移路径见 signals/W22-chrome-contract.md。
          */}
          <AdvancedLayoutContext.Provider value={null}>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {editBarHidden
                ? null
                : editBar || (
                    <span className="px-1.5 text-[11px] text-[var(--pchrome-ink-mid)]">
                      {editBarEmptyHint || tt("选中对象后在此编辑")}
                    </span>
                  )}
            </div>
          </AdvancedLayoutContext.Provider>

          <span
            aria-hidden="true"
            className="mx-0.5 h-5 w-px shrink-0 bg-[var(--pchrome-line)]"
          />
          <button
            type="button"
            data-edit-bar-agent
            data-edit-bar-interactive
            data-plugin-chrome-agent={pluginId}
            aria-pressed={agentActive}
            aria-label={tt("AI 助手")}
            title={tt("AI 助手：在左侧和 agent 对话，同时继续改右边")}
            onClick={() =>
              agentActive
                ? layout.closeDrawer()
                : layout.openDrawer(PLUGIN_AGENT_DRAWER_ID)
            }
            className={`${ICON_ACTION_CLASS} ${
              agentActive
                ? "border-[var(--pchrome-accent)] bg-[var(--pchrome-accent)] text-[var(--pchrome-on-accent)] hover:bg-[var(--pchrome-accent)] hover:text-[var(--pchrome-on-accent)]"
                : ""
            }`}
          >
            <AdvancedEditorIcon name="agent" className="h-[18px] w-[18px]" />
          </button>
          {/* 固定 / 收起为圆。停靠带在位时 trailing 里才有固定键。 */}
          {editBarGestures.controller.trailing}
          </PluginChromeEditBarGestureLayer>
        </div>

        <PluginChromeNotices notices={notices || []} />

        {/* ---------------------------------------------- 行 3：左栏 + 舞台 */}
        <div className="flex min-h-0 flex-1">
          {sidePanel && (
            <aside
              data-plugin-chrome-panel={sidePanel.id}
              style={{ width: panelWidth }}
              className="flex min-h-0 shrink-0 flex-col border-r border-[var(--pchrome-line)] bg-[var(--pchrome-surface)]"
            >
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--pchrome-line)] px-3">
                {sidePanel.icon && (
                  <AdvancedEditorIcon
                    name={sidePanel.icon}
                    className="h-4 w-4 text-[var(--pchrome-ink-mid)]"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
                  {sidePanel.label}
                </span>
                {/* pinned 面板是主入口，不给关闭按钮，避免用户误关后找不回来。 */}
                {!sidePanel.pinned && (
                  <button
                    type="button"
                    onClick={layout.closeDrawer}
                    aria-label={tt("收起面板")}
                    title={tt("收起面板")}
                    className="grid h-6 w-6 place-items-center rounded-md text-[var(--pchrome-ink-mid)] hover:bg-[var(--pchrome-muted)] hover:text-[var(--pchrome-ink)]"
                  >
                    <AdvancedEditorIcon name="close" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {sidePanel.content}
              </div>
            </aside>
          )}

          {/*
            舞台与左栏是 flex 兄弟：没有遮罩、不设 inert、不关 pointer-events。
            这就是「一边和 agent 对话、一边改右边」那条承诺的实现——
            抽屉开着、agent 正在生成，右侧照样收键鼠。
            tests/plugin-chrome-agent-drawer.test.mjs 钉住了这一条，
            往这里加任何遮挡都会当场红。
          */}
          <main
            ref={editBarGestures.stageRef}
            data-plugin-chrome-stage
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--pchrome-stage)]"
          >
            {children}
          </main>
        </div>
      </div>
    </PanelContext.Provider>
    </AdvancedLayoutContext.Provider>
  );
}
