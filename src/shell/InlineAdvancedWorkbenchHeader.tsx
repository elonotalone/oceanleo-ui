"use client";

// 编辑器顶栏装配（编辑器整改波 2026-10-23，操作员裁定 D1：顶栏只剩一行）。
//
// 原来这里装两行：第一行 PluginGlobalRow，第二行 PluginPageRow（页签）。第二行整行删除，
// 页签与切页逻辑（usePluginPage、aux 回调、PluginModeAdapterBridge）挪进第一行。
// 「编辑工具」面板的注册（toolsPanel / openTools / useAdvancedToolsLauncherRegistration）
// 也一并删除：W03 删了触发它的图标，留着就是死代码。抽屉改由 W02 做成编辑栏空态里的按钮。
//
// 有 SplitWorkspace 右栏时，整个 header 被 portal 进右栏的标题槽（W02 的壳负责）。
// `data-plugin-chrome-rows`：编辑栏停靠控制器量「chrome 底边」用它（原来量的是页签行），
// 浮动编辑栏因此仍停在顶栏下方 8px。

import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import type {
  AdvancedEditorAdapter,
  AdvancedWorkbenchDrawer,
} from "./advanced-editor-adapter";
import type { LibraryItem } from "./library-data";
import type { WorkspaceLibraryPanelId } from "./SplitWorkspace";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import { PluginModeAdapterBridge } from "./plugin-chrome/plugin-mode";
import { PluginGlobalRow } from "./plugin-chrome/PluginGlobalRow";
import { buildPluginPages } from "./plugin-chrome/plugin-pages";
import { usePluginPage } from "./plugin-chrome/plugin-page-store";
import type { PluginThemeId } from "./plugin-theme";

export function InlineAdvancedWorkbenchHeader({
  adapter,
  item = null,
  autoSaveState,
  autoSaveError,
  activeLibraryPanelId,
  pluginThemeId = null,
  showLibrary = true,
  showBack = true,
  showClose = true,
  onBack,
  onOpenLibrary,
  onRetrySave,
  onUploadFiles,
  onClose,
}: {
  adapter: AdvancedEditorAdapter;
  item?: LibraryItem | null;
  autoSaveState: AdvancedAutoSaveState;
  autoSaveError?: string;
  activeLibraryPanelId: WorkspaceLibraryPanelId | null;
  pluginThemeId?: PluginThemeId | null;
  showLibrary?: boolean;
  showBack?: boolean;
  showClose?: boolean;
  onBack: () => void;
  onOpenLibrary: (id: WorkspaceLibraryPanelId) => void;
  onRetrySave: () => void;
  onUploadFiles: (files: File[]) => void;
  onClose?: () => void;
  /** @deprecated D3：「编辑工具」面板已删除；抽屉进编辑栏空态（W02）。传了也不用。 */
  activeDrawerId?: string;
  /** @deprecated 同上。 */
  drawers?: readonly AdvancedWorkbenchDrawer[];
  /** @deprecated 同上。 */
  accent?: string;
  /** @deprecated 同上。 */
  onOpenDrawer?: (drawerId: string) => void;
  /** @deprecated 同上。 */
  onCloseDrawer?: () => void;
  /** @deprecated 同上。 */
  onOpenTransientPanel?: (
    panelId: string,
    label: ReactNode,
    content: ReactNode,
  ) => void;
}) {
  const pagePluginId = (pluginThemeId ??
    adapter.id.split("@")[0]) as PluginThemeId;
  const { pageId, setPage } = usePluginPage(pagePluginId);
  const pages = useMemo(
    () =>
      buildPluginPages({
        pluginId: pagePluginId,
        proLabel: adapter.pages?.proLabel,
        proUnavailableReason:
          adapter.pages?.proUnavailableReason ??
          adapter.mode?.unavailableReason,
        aux: adapter.pages?.aux,
      }),
    [
      pagePluginId,
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
  const onSelectPageHook = adapter.pages?.onSelectPage;
  const selectPage = useCallback(
    (id: string) => {
      const page = pages.find((entry) => entry.id === id);
      if (!page || page.disabled || page.unavailableReason) return;
      setPage(id);
      if (page.kind === "aux") onSelectPageHook?.(id);
    },
    [onSelectPageHook, pages, setPage],
  );

  return (
    <div
      data-advanced-workbench-header
      data-plugin-chrome-rows
      className="relative z-40 flex w-full min-w-0 flex-col overflow-hidden"
    >
      <PluginGlobalRow
        adapter={adapter}
        item={item}
        autoSaveState={autoSaveState}
        autoSaveError={autoSaveError}
        pluginThemeId={pluginThemeId}
        pages={pages}
        activePageId={pageId}
        showLibrary={showLibrary}
        showBack={showBack}
        showClose={showClose}
        activeLibraryPanelId={activeLibraryPanelId}
        onBack={onBack}
        onOpenLibrary={onOpenLibrary}
        onSelectPage={selectPage}
        onRetrySave={onRetrySave}
        onClose={onClose}
        onUploadFiles={onUploadFiles}
      />
      <PluginModeAdapterBridge pluginId={pagePluginId} mode={adapter.mode} />
    </div>
  );
}
