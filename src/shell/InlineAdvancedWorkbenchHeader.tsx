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
import type { EditorMode } from "./hosted-editor";
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
  const applyMode = useCallback(
    (next: EditorMode) => {
      // Native 件走这条：adapter 的 setMode 是编辑器自己露出/收起内核 UI 的入口。
      // Hosted 件的 route 把这同一个 setMode 实现成发契约 `set-mode`
      // （`RichDocHostedRoute` 就是这么接的），所以顶栏这边只有一条路。
      adapter.mode?.setMode?.(next);
    },
    [adapter.mode],
  );
  // 不声明 `mode` 就是不支持：开关置灰但不消失（`AdvancedEditorModeAdapter` 的约定）。
  // 原因写裸中文而不过 `tt()`，与 `PdfRoute` 已有的那条 reason 同一惯例；
  // 这一条的 16 语欠账记在 `signals/W01-request.md`。
  const modeUnavailableReason =
    modeAdapter?.unavailableReason ??
    (modeAdapter?.setMode
      ? undefined
      : "这件编辑器还没有专业模式；接上新内核之后这个开关就能用。");

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
        <>
          <PluginModeToggle
            pluginId={pluginThemeId}
            unavailableReason={modeUnavailableReason}
            onModeChange={applyMode}
          />
          {/*
            打开编辑器时把上次记住的档位交给内核；渲染 null，只接线。
            开关和它的接线放在同一处，是为了让同一条真渲染闸把两件事一起锁住。
          */}
          <PluginModeAdapterBridge
            pluginId={pluginThemeId}
            mode={modeAdapter}
          />
        </>
      ) : null}
    </div>
  );
}
