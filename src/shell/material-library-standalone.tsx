"use client";

import { useState } from "react";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import { AgentChat } from "./AgentChat";
import { useRightPaneSlot } from "./SplitWorkspace";
import {
  WorkspaceSessionProvider,
  useOptionalWorkspaceSession,
} from "./WorkspaceSession";
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
  const inheritedWorkspace = useOptionalWorkspaceSession();
  // Library editing is a Task-shaped workspace: keep the existing conversation
  // visible beside the editor from the first frame. Task hosts already provide
  // this SplitWorkspace and take the `existingPane` branch below.
  const [agentVisible, setAgentVisible] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
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
    <AgentChat
      siteId={siteId || item.siteId}
      taskId={taskId}
      accent={accent}
      workspaceContent={editor}
      workspaceOpen={workspaceOpen}
      onWorkspaceOpenChange={(open) => {
        setWorkspaceOpen(open);
        if (!open) setAgentVisible(true);
      }}
      workspaceAgentVisible={agentVisible}
      onWorkspaceAgentFocus={() => setAgentVisible(true)}
    />
  );
  return (
    <div
      className={`h-full min-h-0 ${className}`}
      data-library-editor-host={existingPane ? "existing-workspace" : "agent-workspace"}
    >
      {inheritedWorkspace ? workspace : (
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
