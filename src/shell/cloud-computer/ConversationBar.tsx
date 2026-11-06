"use client";

import type { CloudComputerClient, Computer } from "../../lib/cloud-computer-api";
import type { ComputerTaskSession } from "../../lib/computer-task-api";
import type { ExecutionTarget } from "../../lib/execution-target";
import type { ConversationTarget } from "../native-thread/types";
import { ComputerDock } from "./ComputerDock";
import { ComputerConversationSettings } from "./native-surface/computer-settings-rows";

export type ConversationBarProps = {
  conversation: ConversationTarget;
  onConversationChange: (conversation: ConversationTarget) => void;
  taskSessions?: ComputerTaskSession[];
  /** The task's OceanLeo target (null while loading); undefined only for a draft. */
  boundTarget?: ExecutionTarget | null;
  /** The conversation's computer (online state for the settings pill); null while unknown. */
  computer?: Computer | null;
  /** Passed through to the Device menu (see ComputerDock). */
  oceanleoDisabledReason?: string | null;
  /** Data seams for tests and hosts that already hold the lists; default = the dock's own requests. */
  client?: CloudComputerClient;
  computers?: Computer[];
};

/**
 * The composer bottom-bar row on its own, used under the terminal / 命令行
 * surface so switching back is one click: the same Device control, and on the
 * right the same settings pill as a native chat's composer (2026-10-31: the gear
 * and its right-pane panel are gone).
 */
export function ConversationBar({ conversation, onConversationChange, taskSessions, boundTarget, computer = null, oceanleoDisabledReason, client, computers }: ConversationBarProps) {
  return <div className="flex items-center justify-between px-4 pb-3.5 pt-3" data-composer-bottom-toolbar data-conversation-bar>
    <div className="flex flex-wrap items-center gap-2">
      <ComputerDock conversation={conversation} onConversationChange={onConversationChange} taskSessions={taskSessions} boundTarget={boundTarget} oceanleoDisabledReason={oceanleoDisabledReason}
        {...(client ? { client } : {})} {...(computers ? { computers } : {})} />
    </div>
    {(conversation.kind === "terminal" || (conversation.kind === "native" && conversation.view === "cli")) && (
      <ComputerConversationSettings computer={computer} conversation={conversation} {...(client ? { client } : {})} />
    )}
  </div>;
}
