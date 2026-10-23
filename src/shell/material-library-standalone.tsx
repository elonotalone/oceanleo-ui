"use client";

import { useCallback, useState } from "react";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import { TaskFileWorkspace } from "./task-file-workspace";
import { useRightPaneSlot } from "./SplitWorkspace";
import { WorkspaceSessionProvider } from "./WorkspaceSession";
import { adoptSavedEditorItem } from "./advanced-session";
import {
  InlineEditorSwitchContext,
  libraryItemIdentityKey,
} from "./inline-editor-mine-activate";
import { rememberOpenedLibraryItem } from "./library-current-identity";
import type { LibraryItem } from "./library-data";

export function MaterialStandaloneEditor({
  item,
  taskId,
  siteId,
  appId,
  accent,
  className = "",
  onSavedItem,
  onClose,
}: {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  appId: string;
  accent: string;
  className?: string;
  onSavedItem: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  const existingPane = useRightPaneSlot();
  // 「我的库」就地换文件（10-23 W02，D2）：壳先保存，再把同一个承载换成那份文件，
  // 地址栏的 `?item=` 跟着变。宿主自己换了 item（打开另一张卡）时以宿主为准。
  const hostRoot = libraryItemIdentityKey(item);
  const [switched, setSwitched] = useState<{
    hostRoot: string;
    item: LibraryItem;
  } | null>(null);
  const active =
    switched && switched.hostRoot === hostRoot ? switched.item : item;
  const switchItem = useCallback(
    (next: LibraryItem) => {
      rememberOpenedLibraryItem(next);
      setSwitched({ hostRoot, item: next });
    },
    [hostRoot],
  );
  const handleSaved = useCallback(
    (saved: LibraryItem) => {
      setSwitched((current) =>
        current
          ? { ...current, item: adoptSavedEditorItem(current.item, saved) || current.item }
          : current,
      );
      onSavedItem(saved);
    },
    [onSavedItem],
  );
  // A Library file is the canvas, not an implicit request to start a chat.
  // Keep the Task conversation available in the same workspace, but hidden
  // until the edit-bar agent action explicitly focuses it. Task hosts already
  // provide their own SplitWorkspace and take the `existingPane` branch below.
  const editor = (
    <AdvancedContentWorkbench
      key={active.artifactId || active.id}
      item={active}
      taskId={taskId}
      siteId={siteId || active.siteId}
      appId={appId}
      accent={accent}
      embedded
      onSavedItem={handleSaved}
      onClose={onClose}
    />
  );
  const workspace = existingPane ? editor : (
    <TaskFileWorkspace
      item={active}
      siteId={siteId || active.siteId}
      appId={appId}
      accent={accent}
      agentInitiallyVisible={false}
      onSavedItem={handleSaved}
      onClose={onClose}
    />
  );
  return (
    <InlineEditorSwitchContext.Provider value={switchItem}>
      <div
        className={`h-full min-h-0 ${className}`}
        data-library-editor-host={existingPane ? "existing-workspace" : "agent-workspace"}
      >
        {existingPane ? workspace : (
          <WorkspaceSessionProvider
            siteId={siteId || item.siteId || "oceanleo"}
            appId={appId}
            title={item.title}
            resumeLatest={false}
          >
            {workspace}
          </WorkspaceSessionProvider>
        )}
      </div>
    </InlineEditorSwitchContext.Provider>
  );
}
