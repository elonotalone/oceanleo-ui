"use client";

import { useEffect, useMemo, useState } from "react";
import type { AcpFrameRow, AvailableCommand, UsageUpdate } from "../../acp/types";
import { acpErrorText, request } from "../../lib/acp-frames-api";

type Controls = {
  capabilities: Record<string, unknown>;
  commands: AvailableCommand[];
  usage: UsageUpdate | null;
  after: number;
  positions?: Partial<Record<"capabilities" | "commands" | "usage", number>>;
};
const EMPTY: Controls = { capabilities: {}, commands: [], usage: null, after: 0 };

export function applyControlRows(initial: Controls, rows: readonly AcpFrameRow[]): Controls {
  let state = initial;
  const requests = new Set<number | string>();
  for (const row of rows) {
    let message;
    try { message = JSON.parse(row.raw); } catch { continue; }
    if (!message || typeof message !== "object") continue;
    if (row.direction === "client" && ["initialize", "session/new"].includes(message.method)) requests.add(message.id);
    if (row.direction !== "agent") continue;
    if (row.id > (initial.positions?.capabilities ?? initial.after) && requests.has(message.id) && message.result) {
      const caps = message.result.agentCapabilities?.sessionCapabilities ?? message.result.sessionCapabilities;
      if (caps && typeof caps === "object" && !Array.isArray(caps)) state = { ...state, capabilities: caps };
    }
    const update = message.method === "session/update" ? message.params?.update : null;
    if (row.id > (initial.positions?.commands ?? initial.after) && update?.sessionUpdate === "available_commands_update" && Array.isArray(update.availableCommands)) {
      state = { ...state, commands: update.availableCommands };
    }
    if (row.id > (initial.positions?.usage ?? initial.after) && update?.sessionUpdate === "usage_update" && typeof update.used === "number" && typeof update.size === "number") {
      state = { ...state, usage: { used: update.used, size: update.size } };
    }
  }
  return state;
}

/** History windows omit early setup/announcements. Read them once, then use live rows. */
export function useAcpSessionControls(taskId: string | null | undefined, link: string | null, rows: readonly AcpFrameRow[]) {
  const [saved, setSaved] = useState<{ taskId: string; state: Controls } | null>(null);
  const [failure, setFailure] = useState<{ taskId: string; text: string } | null>(null);
  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController();
    setSaved(null);
    setFailure(null);
    void request<Partial<Controls>>(`/v1/tasks/${encodeURIComponent(taskId)}/session-controls`, { signal: controller.signal })
      .then((state) => {
        if (!controller.signal.aborted) setSaved({ taskId, state: {
          capabilities: state.capabilities && typeof state.capabilities === "object" ? state.capabilities : {},
          commands: Array.isArray(state.commands) ? state.commands : [],
          usage: state.usage ?? null, positions: state.positions, after: typeof state.after === "number" ? state.after : 0,
        } });
      }).catch((error) => { if (!controller.signal.aborted) setFailure({ taskId, text: acpErrorText(error) }); });
    return () => controller.abort();
  }, [taskId, link]);
  return useMemo(() => ({ ...applyControlRows(saved && saved.taskId === taskId ? saved.state : EMPTY, rows),
    error: failure && failure.taskId === taskId ? failure.text : null }), [saved, taskId, rows, failure]);
}
