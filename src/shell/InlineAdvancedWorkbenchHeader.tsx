"use client";

import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import {
  ADVANCED_TOOLS_PANEL_ID,
  focusAdvancedToolsTrigger,
  useAdvancedToolsLauncherRegistration,
} from "./advanced-layout-context";
import type { WorkspaceLibraryPanelId } from "./SplitWorkspace";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import { PluginModeAdapterBridge } from "./plugin-chrome/plugin-mode";
import { PluginGlobalRow } from "./plugin-chrome/PluginGlobalRow";
import { PluginPageRow } from "./plugin-chrome/PluginPageRow";
import { buildPluginPages } from "./plugin-chrome/plugin-pages";
import { usePluginPage } from "./plugin-chrome/plugin-page-store";
import type { PluginThemeId } from "./plugin-theme";

export function InlineAdvancedWorkbenchHeader({
  adapter,
  autoSaveState,
  autoSaveError,
  activeDrawerId,
  activeLibraryPanelId,
  drawers,
  accent,
  pluginThemeId = null,
  showLibrary = true,
  showBack = true,
  showClose = true,
  onBack,
  onOpenDrawer,
  onCloseDrawer,
  onOpenTransientPanel,
  onOpenLibrary,
  onRetrySave,
  onUploadFiles,
  onClose,
}: {
  adapter: AdvancedEditorAdapter;
  autoSaveState: AdvancedAutoSaveState;
  autoSaveError?: string;
  activeDrawerId: string;
  activeLibraryPanelId: WorkspaceLibraryPanelId | null;
  drawers: readonly AdvancedWorkbenchDrawer[];
  accent: string;
  pluginThemeId?: PluginThemeId | null;
  showLibrary?: boolean;
  showBack?: boolean;
  showClose?: boolean;
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
  onClose?: () => void;
}) {
  const tt = useUI();
  const pagePluginId = (pluginThemeId ??
    adapter.id.split("@")[0]) as PluginThemeId;
  const { pageId, setPage } = usePluginPage(pagePluginId);
  const pages = useMemo(
    () =>
      buildPluginPages({
        proLabel: adapter.pages?.proLabel,
        proUnavailableReason:
          adapter.pages?.proUnavailableReason ??
          adapter.mode?.unavailableReason,
        aux: adapter.pages?.aux,
      }),
    [
      adapter.mode?.unavailableReason,
      adapter.pages?.aux,
      adapter.pages?.proLabel,
      adapter.pages?.proUnavailableReason,
    ],
  );
  useEffect(() => {
    const reported = adapter.pages?.activePageId;
    if (!reported || reported === pageId) return;
    setPage(reported);
  }, [adapter.pages?.activePageId, pageId, setPage]);
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
  const modeAdapter = adapter.mode;

  return (
    <div
      data-advanced-workbench-header
      className="relative z-[2147483647] flex w-full min-w-0 flex-col overflow-hidden"
    >
      <PluginGlobalRow
        adapter={adapter}
        autoSaveState={autoSaveState}
        autoSaveError={autoSaveError}
        pluginThemeId={pluginThemeId}
        showLibrary={showLibrary}
        showBack={showBack}
        showClose={showClose}
        activeLibraryPanelId={activeLibraryPanelId}
        onBack={onBack}
        onOpenLibrary={onOpenLibrary}
        onRetrySave={onRetrySave}
        onClose={onClose}
        onUploadFiles={onUploadFiles}
      />
      <PluginPageRow
        pages={pages}
        activePageId={pageId}
        onSelectPage={(id) => {
          const page = pages.find((entry) => entry.id === id);
          if (page?.unavailableReason) return;
          setPage(id);
          if (page?.kind === "aux") adapter.pages?.onSelectPage?.(id);
        }}
      />
      <PluginModeAdapterBridge pluginId={pagePluginId} mode={modeAdapter} />
    </div>
  );
}
