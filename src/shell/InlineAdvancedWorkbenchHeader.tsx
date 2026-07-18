"use client";

import { useMemo, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AdvancedWorkspaceActionBar } from "./AdvancedWorkspaceActionBar";
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
  const toolsPanel = useMemo(
    () => (
      <div className="h-full overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className="mb-3 text-[12px] font-semibold text-[var(--fg,#292524)]">
          {tt("编辑工具")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {drawers.map((drawer) => (
            <button
              key={drawer.id}
              type="button"
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
    [accent, drawers, onOpenDrawer, tt],
  );
  const openTools = () => {
    if (activeDrawerId === "workspace-tools") {
      onCloseDrawer();
      return;
    }
    onOpenTransientPanel("workspace-tools", tt("编辑工具"), toolsPanel);
  };
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
      activeDrawerId={activeDrawerId}
      activeLibraryPanelId={activeLibraryPanelId}
      onBack={onBack}
      onOpenTools={openTools}
      onOpenLibrary={onOpenLibrary}
      onRetrySave={onRetrySave}
      onTriggerAction={triggerAction}
      onUploadFiles={onUploadFiles}
    />
  );
}
