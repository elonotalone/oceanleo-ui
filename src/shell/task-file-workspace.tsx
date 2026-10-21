"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentChat } from "./AgentChat";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import type { LibraryItem } from "./library-data";

/** One Task/editor composition for a new Library thread AND its history replay. */
export function TaskFileWorkspace({
  item, taskId, siteId, appId, accent, onSavedItem, onClose,
  agentInitiallyVisible = true,
}: {
  item: LibraryItem | null;
  taskId?: string | null;
  siteId: string;
  appId: string;
  accent: string;
  /** Standalone Library editors keep the Task conversation hidden until requested. */
  agentInitiallyVisible?: boolean;
  onSavedItem: (item: LibraryItem) => void;
  onClose?: () => void;
}) {
  const [boundTaskId, setBoundTaskId] = useState(taskId);
  const [agentVisible, setAgentVisible] = useState(agentInitiallyVisible);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  useEffect(() => { setBoundTaskId(taskId); }, [taskId]);
  const handleTaskCreated = useCallback((id: string) => setBoundTaskId(id), []);
  const closeEditor = useCallback(() => {
    setWorkspaceOpen(false);
    onClose?.();
  }, [onClose]);
  return (
    <AgentChat
      siteId={siteId}
      taskId={boundTaskId || undefined}
      accent={accent}
      navigateToSessionOnCreate={false}
      onTaskCreated={handleTaskCreated}
      workspaceContent={item ? (
        <AdvancedContentWorkbench
          key={item.artifactId || item.id}
          item={item}
          taskId={boundTaskId}
          siteId={siteId}
          appId={appId}
          accent={accent}
          embedded
          onSavedItem={onSavedItem}
          onClose={closeEditor}
        />
      ) : (
        <div role="alert" className="p-6 text-sm text-stone-500">
          这条任务保存的文件暂时无法恢复；对话仍保留，不会用其他文件替代。
        </div>
      )}
      workspaceOpen={workspaceOpen}
      onWorkspaceOpenChange={(open) => {
        setWorkspaceOpen(open);
        if (!open) setAgentVisible(true);
      }}
      workspaceAgentVisible={agentVisible}
      onWorkspaceAgentFocus={() => setAgentVisible(true)}
    />
  );
}
