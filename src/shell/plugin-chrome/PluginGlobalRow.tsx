"use client";

import type { AdvancedEditorAdapter } from "../advanced-editor-adapter";
import { AdvancedWorkspaceActionBar } from "../AdvancedWorkspaceActionBar";
import type { PluginThemeId } from "../plugin-theme";
import type { WorkspaceLibraryPanelId } from "../SplitWorkspace";
import type { AdvancedAutoSaveState } from "../use-advanced-autosave";

export interface PluginGlobalRowProps {
  adapter: AdvancedEditorAdapter;
  autoSaveState: AdvancedAutoSaveState;
  autoSaveError?: string;
  pluginThemeId: PluginThemeId | null;
  showBack?: boolean;
  showLibrary?: boolean;
  showClose?: boolean;
  activeLibraryPanelId?: WorkspaceLibraryPanelId | null;
  onBack(): void;
  onOpenLibrary(id: WorkspaceLibraryPanelId): void;
  onRetrySave(): void;
  onClose?(): void;
  onUploadFiles?(files: File[]): void;
}

export function PluginGlobalRow(props: PluginGlobalRowProps) {
  const triggerDownload = (
    action: NonNullable<AdvancedEditorAdapter["actions"]>[number],
  ) => action.onTrigger?.();
  return (
    <div data-plugin-global-row className="w-full min-w-0">
      <AdvancedWorkspaceActionBar
        adapter={props.adapter}
        autoSaveState={props.autoSaveState}
        autoSaveError={props.autoSaveError}
        activeLibraryPanelId={props.activeLibraryPanelId ?? null}
        pluginThemeId={props.pluginThemeId}
        showLibrary={props.showLibrary}
        showBack={props.showBack}
        showClose={props.showClose}
        onBack={props.onBack}
        onOpenLibrary={props.onOpenLibrary}
        onRetrySave={props.onRetrySave}
        onClose={props.onClose}
        onTriggerAction={triggerDownload}
        onUploadFiles={props.onUploadFiles}
      />
    </div>
  );
}
