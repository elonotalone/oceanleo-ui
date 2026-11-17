"use client";
import { AGENT_CONVERSATION_COLUMN_CLASS } from "../agent-conversation-layout";
import { EditorLibraryEditEntry } from "../plugin-command/LibraryEditEntry";
export interface PluginAgentPanelProps {
  editorId: string;
  siteId?: string;
  accent?: string;
  label?: string;
  taskId?: string | null;
  onTaskIdChange?: (taskId: string | null) => void;
}
/** Editor AI is an entry to the ordinary background Library task mechanism. */
export function PluginAgentPanel({ editorId, onTaskIdChange }: PluginAgentPanelProps) {
  return <div data-plugin-agent-panel={editorId} className={AGENT_CONVERSATION_COLUMN_CLASS}><EditorLibraryEditEntry editorId={editorId} onTask={onTaskIdChange} /></div>;
}
