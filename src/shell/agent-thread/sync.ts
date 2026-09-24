import type { AgentMessage } from "../../lib/agent";
import { applyAgentDelta, mergeAgentMessages, readNextAfterId } from "./merge";

export interface AgentThreadPullOptions {
  afterId: number;
}

export interface AgentThreadPull {
  taskId: string;
  seq: number;
  generation: number;
  options?: AgentThreadPullOptions;
}

export interface AgentThreadPayload {
  messages?: AgentMessage[];
  next_after_id?: unknown;
}

export function createAgentThreadSync() {
  let taskId = "";
  let generation = 0;
  let seq = 0;
  let settledSeq = 0;
  let afterId: number | null = null;

  return {
    begin(nextTaskId: string): AgentThreadPull {
      if (nextTaskId !== taskId) {
        taskId = nextTaskId;
        afterId = null;
      }
      seq += 1;
      return {
        taskId: nextTaskId,
        seq,
        generation,
        ...(afterId !== null ? { options: { afterId } } : {}),
      };
    },
    invalidate() {
      generation += 1;
      afterId = null;
    },
    settle(
      pull: AgentThreadPull,
      current: AgentMessage[],
      payload: AgentThreadPayload | null | undefined,
    ): AgentMessage[] | null {
      if (pull.generation !== generation) return null;
      if (pull.taskId !== taskId) return null;
      if (pull.seq <= settledSeq) return null;
      if (!payload || !Array.isArray(payload.messages)) return null;
      settledSeq = pull.seq;
      const cursor = readNextAfterId(payload);
      const incoming = payload.messages;
      const usedAfter = pull.options?.afterId;
      const rows =
        cursor !== null && usedAfter !== undefined
          ? applyAgentDelta(current, incoming, usedAfter)
          : mergeAgentMessages(current, incoming);
      afterId = cursor;
      return rows;
    },
  };
}
