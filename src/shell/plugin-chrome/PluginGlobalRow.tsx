"use client";

import type { AdvancedEditorAdapter } from "../advanced-editor-adapter";
import { AdvancedWorkspaceActionBar } from "../AdvancedWorkspaceActionBar";
import type { LibraryItem } from "../library-data";
import type { PluginThemeId } from "../plugin-theme";
import type { WorkspaceLibraryPanelId } from "../SplitWorkspace";
import type { AdvancedAutoSaveState } from "../use-advanced-autosave";
import type { PluginPage } from "./plugin-pages";

export interface PluginGlobalRowProps {
  adapter: AdvancedEditorAdapter;
  item?: LibraryItem | null;
  autoSaveState: AdvancedAutoSaveState;
  autoSaveError?: string;
  pluginThemeId: PluginThemeId | null;
  /** 模式页签（D1：页签进第一行）。少于两页时第一行不画页签。 */
  pages?: readonly PluginPage[];
  activePageId?: string;
  showBack?: boolean;
  showLibrary?: boolean;
  showClose?: boolean;
  activeLibraryPanelId?: WorkspaceLibraryPanelId | null;
  onBack(): void;
  onOpenLibrary(id: WorkspaceLibraryPanelId): void;
  onSelectPage?(id: string): void;
  onRetrySave(): void;
  onClose?(): void;
  onUploadFiles?(files: File[]): void;
}

/**
 * 编辑器唯一的一行顶栏（D1）。第二行页签行已删除，页签住进这一行。
 * 第一行只承载 save 菜单与 `···`（下载子菜单）里的动作；edit 组永远不到这里。
 */
export function PluginGlobalRow(props: PluginGlobalRowProps) {
  const triggerMenuAction = (
    action: NonNullable<AdvancedEditorAdapter["actions"]>[number],
  ) => action.onTrigger?.();
  return (
    <div data-plugin-global-row className="w-full min-w-0">
      <AdvancedWorkspaceActionBar
        adapter={props.adapter}
        item={props.item}
        autoSaveState={props.autoSaveState}
        autoSaveError={props.autoSaveError}
        activeLibraryPanelId={props.activeLibraryPanelId ?? null}
        pluginThemeId={props.pluginThemeId}
        pages={props.pages}
        activePageId={props.activePageId}
        showLibrary={props.showLibrary}
        showBack={props.showBack}
        showClose={props.showClose}
        onBack={props.onBack}
        onOpenLibrary={props.onOpenLibrary}
        onSelectPage={props.onSelectPage}
        onRetrySave={props.onRetrySave}
        onClose={props.onClose}
        onTriggerAction={triggerMenuAction}
        onUploadFiles={props.onUploadFiles}
      />
    </div>
  );
}
