"use client";

import type { CloudComputerClient, Computer } from "../../lib/cloud-computer-api";
import type { ComputerTaskSession } from "../../lib/computer-task-api";
import type { ExecutionTarget } from "../../lib/execution-target";
import type { ConversationTarget } from "../native-thread/types";
import { useUI } from "../../i18n/ui/useUI";
import { ComputerDock } from "./ComputerDock";

/**
 * Settings gear beside the Device control, shown for native / terminal
 * conversations only. Same round icon-button look as the composer's other
 * bottom-bar icons; the host opens its right-pane settings.
 */
export function ConversationSettingsButton({ onOpenSettings, settingsOpen = false }: { onOpenSettings: () => void; settingsOpen?: boolean }) {
  const tt = useUI();
  return <button type="button" onClick={onOpenSettings} aria-pressed={settingsOpen} aria-label={tt("设置")} title={tt("设置")} data-conversation-settings
    className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] active:scale-95 ${
      settingsOpen ? "border-neutral-300 bg-neutral-100 text-neutral-800" : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700"}`}>
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </button>;
}

export type ConversationBarProps = {
  conversation: ConversationTarget;
  onConversationChange: (conversation: ConversationTarget) => void;
  taskSessions?: ComputerTaskSession[];
  /** The task's OceanLeo target (null while loading); undefined only for a draft. */
  boundTarget?: ExecutionTarget | null;
  onOpenSettings?: () => void;
  settingsOpen?: boolean;
  client?: CloudComputerClient;
  computers?: Computer[];
};

/**
 * The composer bottom-bar row on its own, used under the terminal / 命令行
 * surface so switching back is one click: the same Device control + gear.
 */
export function ConversationBar({ conversation, onConversationChange, taskSessions, boundTarget, onOpenSettings, settingsOpen, client, computers }: ConversationBarProps) {
  return <div className="flex items-center justify-between px-4 pb-3.5 pt-3" data-composer-bottom-toolbar data-conversation-bar>
    <div className="flex flex-wrap items-center gap-2">
      <ComputerDock conversation={conversation} onConversationChange={onConversationChange} taskSessions={taskSessions} boundTarget={boundTarget}
        {...(client ? { client } : {})} {...(computers ? { computers } : {})} />
      {onOpenSettings && conversation.kind !== "oceanleo" && <ConversationSettingsButton onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} />}
    </div>
  </div>;
}
