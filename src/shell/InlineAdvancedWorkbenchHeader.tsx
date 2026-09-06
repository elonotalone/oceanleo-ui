"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AdvancedWorkspaceActionBar } from "./AdvancedWorkspaceActionBar";
import {
  ADVANCED_TOOLS_PANEL_ID,
  focusAdvancedToolsTrigger,
  useAdvancedToolsLauncherRegistration,
} from "./advanced-layout-context";
import type { WorkspaceLibraryPanelId } from "./SplitWorkspace";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import {
  PluginModeAdapterBridge,
  PluginModeToggle,
} from "./plugin-chrome/plugin-mode";
import type { PluginThemeId } from "./plugin-theme";

export function InlineAdvancedWorkbenchHeader({
  adapter,
  autoSaveState,
  activeDrawerId,
  activeLibraryPanelId,
  drawers,
  accent,
  pluginThemeId = null,
  showLibrary = true,
  showBack = true,
  onBack,
  onOpenDrawer,
  onCloseDrawer,
  onOpenTransientPanel,
  onOpenLibrary,
  onRetrySave,
  onUploadFiles,
}: {
  adapter: AdvancedEditorAdapter;
  autoSaveState: AdvancedAutoSaveState;
  activeDrawerId: string;
  activeLibraryPanelId: WorkspaceLibraryPanelId | null;
  drawers: readonly AdvancedWorkbenchDrawer[];
  accent: string;
  /** 插件内主题 id；null = 非 10 件插件，不渲染切换器。 */
  pluginThemeId?: PluginThemeId | null;
  showLibrary?: boolean;
  showBack?: boolean;
  onBack: () => void;
  onOpenDrawer: (drawerId: string) => void;
  onCloseDrawer: () => void;
  onOpenTransientPanel: (
    panelId: string,
    label: ReactNode,
    content: ReactNode,
  ) => void;
  onOpenLibrary: (id: WorkspaceLibraryPanelId) => void;
  onRetrySave: () => void;
  onUploadFiles: (files: File[]) => void;
}) {
  const tt = useUI();
  const closeToolsAndRestoreFocus = useCallback(() => {
    onCloseDrawer();
    window.requestAnimationFrame(() => focusAdvancedToolsTrigger(adapter.id));
  }, [adapter.id, onCloseDrawer]);
  const toolsPanel = useMemo(
    () => (
      <div
        id={ADVANCED_TOOLS_PANEL_ID}
        role="dialog"
        aria-label={tt("编辑工具")}
        aria-modal="false"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          closeToolsAndRestoreFocus();
        }}
        className="h-full overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <p className="mb-3 text-[12px] font-semibold text-[var(--fg,#292524)]">
          {tt("编辑工具")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {drawers.map((drawer, index) => (
            <button
              key={drawer.id}
              type="button"
              autoFocus={index === 0}
              onClick={() => onOpenDrawer(drawer.id)}
              className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--fg-2,#57534e)] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--awb-accent)]/35 hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={{ color: accent, background: `${accent}12` }}
              >
                <AdvancedEditorIcon name={drawer.icon} className="h-4 w-4" />
              </span>
              {tt(drawer.label)}
            </button>
          ))}
        </div>
      </div>
    ),
    [accent, closeToolsAndRestoreFocus, drawers, onOpenDrawer, tt],
  );
  const openTools = useCallback(() => {
    if (activeDrawerId === "workspace-tools") {
      closeToolsAndRestoreFocus();
      return;
    }
    onOpenTransientPanel("workspace-tools", tt("编辑工具"), toolsPanel);
  }, [
    activeDrawerId,
    closeToolsAndRestoreFocus,
    onOpenTransientPanel,
    toolsPanel,
    tt,
  ]);
  const toolsLauncher = useMemo(
    () => ({
      id: adapter.id,
      label: tt("打开{label}工具", { label: tt(adapter.label) }),
      controlsId: ADVANCED_TOOLS_PANEL_ID,
      available: drawers.length > 0,
      expanded: activeDrawerId === "workspace-tools",
      ...(drawers.length
        ? {}
        : { unavailableReason: tt("当前编辑器没有可用工具") }),
      toggle: openTools,
    }),
    [activeDrawerId, adapter.id, adapter.label, drawers.length, openTools, tt],
  );
  useAdvancedToolsLauncherRegistration(toolsLauncher);
  const triggerAction = (action: NonNullable<AdvancedEditorAdapter["actions"]>[number]) => {
    if (action.panelId) {
      onOpenDrawer(action.panelId);
      return;
    }
    return action.onTrigger?.();
  };
  const modeAdapter = adapter.mode;
  // 13 件高级编辑器的专业模式开关必须能点。原因只作说明，不再置灰。
  const modeUnavailableReason = modeAdapter?.unavailableReason;

  // 顶栏本体（返回 / 素材库 / 保存 / 导出 / 主题）仍然整块交给
  // `AdvancedWorkspaceActionBar`，一个字没动——它是十件共用的那条栏。
  // L0 专业模式开关挂在它右边：这是十件唯一的入模式入口（`_COMMON` §10 第 5 条），
  // 而在此之前它只画在 `PluginChromeFrame` 里，那条壳十件一个都不走。
  return (
    <div
      data-advanced-workbench-header
      className="flex h-11 w-full min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden"
    >
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <AdvancedWorkspaceActionBar
          adapter={adapter}
          autoSaveState={autoSaveState}
          activeLibraryPanelId={activeLibraryPanelId}
          pluginThemeId={pluginThemeId}
          showLibrary={showLibrary}
          showBack={showBack}
          onBack={onBack}
          onOpenLibrary={onOpenLibrary}
          onRetrySave={onRetrySave}
          onTriggerAction={triggerAction}
          onUploadFiles={onUploadFiles}
        />
      </div>
      {pluginThemeId ? (
        // `shrink-0`：顶栏本体拿 `flex-1`，窄屏时该被挤的是它里面那排可横滚的键，
        // 不是这个开关。开关被挤成 0 宽和「开关根本不在」对用户是同一件事，
        // 而后者正是本次要修的那条红。
        <div className="flex shrink-0 items-center gap-0.5">
          <PluginModeToggle
            pluginId={pluginThemeId}
            unavailableReason={modeUnavailableReason}
          />
          {/*
            开关本体只管改 L0 的档位；「把档位交到内核手里」这件事整条交给这座桥，
            打开编辑器时推一次、之后每变一次推一次，都走它。
            ⚠️ 这里**刻意不再给开关传 `onModeChange`**，虽然那样也能跑。
            两条路说同一句话的后果是判据分不清哪条还活着：实测撤掉 `onModeChange`
            之后这条闸 13/13 仍然全绿（桥替它把话说了），于是那条线等于没有守卫。
            留一条路，闸才锁得住它。`PluginChromeFrame` 那边没有桥，仍然走
            `onModeChange`，所以那个 prop 不删。
          */}
          <PluginModeAdapterBridge
            pluginId={pluginThemeId}
            mode={modeAdapter}
          />
        </div>
      ) : null}
    </div>
  );
}
