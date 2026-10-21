"use client";

import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import { TaskFileWorkspace } from "./task-file-workspace";
import { useRightPaneSlot } from "./SplitWorkspace";
import { WorkspaceSessionProvider } from "./WorkspaceSession";
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
  // A Library file is the canvas, not an implicit request to start a chat.
  // Keep the Task conversation available in the same workspace, but hidden
  // until the edit-bar agent action explicitly focuses it. Task hosts already
  // provide their own SplitWorkspace and take the `existingPane` branch below.
  const editor = (
    <AdvancedContentWorkbench
      key={item.artifactId || item.id}
      item={item}
      taskId={taskId}
      siteId={siteId || item.siteId}
      appId={appId}
      accent={accent}
      embedded
      onSavedItem={onSavedItem}
      onClose={onClose}
    />
  );
  const workspace = existingPane ? editor : (
    <TaskFileWorkspace
      item={item}
      siteId={siteId || item.siteId}
      appId={appId}
      accent={accent}
      agentInitiallyVisible={false}
      onSavedItem={onSavedItem}
      onClose={onClose}
    />
  );
  return (
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
  );
}
