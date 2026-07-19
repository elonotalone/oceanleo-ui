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

export function InlineAdvancedWorkbenchHeader({
  adapter,
  autoSaveState,
  activeDrawerId,
  activeLibraryPanelId,
  drawers,
  accent,
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
              className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-left text-[11px] font-semibold text-[var(--fg-2,#57534e)] outline-none transition hover:border-[var(--awb-accent)]/35 hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35"
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

  return (
    <AdvancedWorkspaceActionBar
      adapter={adapter}
      autoSaveState={autoSaveState}
      activeLibraryPanelId={activeLibraryPanelId}
      onBack={onBack}
      onOpenLibrary={onOpenLibrary}
      onRetrySave={onRetrySave}
      onTriggerAction={triggerAction}
      onUploadFiles={onUploadFiles}
    />
  );
}
