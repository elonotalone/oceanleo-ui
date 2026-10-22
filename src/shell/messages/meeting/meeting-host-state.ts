"use client";

import { useSyncExternalStore } from "react";
import type { ImMeetingInvitation, ImMember, ImProfile } from "../../../lib/im/types";

export interface MeetingHostRequest {
  conversationId: string;
  conversationTitle: string;
  myUserId: string | null;
  myRole: "owner" | "admin" | "member" | null;
  profiles: Record<string, ImProfile | undefined>;
  members: ImMember[];
}

// 与 Leo 实时通话的互斥已迁到通话引擎（calls-v2 合同 §3.9）；这里只再导出，状态只有一份。
export { activeCallOwner, claimCall, releaseCall } from "../call/engine/mutex";

let request: MeetingHostRequest | null = null;
const listeners = new Set<() => void>();
function emit() { for (const listener of [...listeners]) listener(); }

export function openMeeting(requested: MeetingHostRequest): void {
  // A minimized/active call keeps its original host and conversation context.
  if (request) return;
  request = requested;
  emit();
}

export function closeMeeting(): void {
  request = null;
  emit();
}

export function meetingHostRequestSnapshot(): MeetingHostRequest | null {
  return request;
}

export function createMeetingInvitationHandler(
  currentUserId: () => Promise<string | null>,
  show: (request: MeetingHostRequest) => void = openMeeting,
) {
  let generation = 0;
  return {
    async handle(conversationId: string, invitation: ImMeetingInvitation): Promise<boolean> {
      if (invitation.status !== "pending") return false;
      const attempt = ++generation;
      try {
        const userId = await currentUserId();
        if (attempt !== generation || !userId || invitation.invitee_id !== userId) return false;
        show({
          conversationId,
          conversationTitle: "会议邀请",
          myUserId: userId,
          myRole: null,
          profiles: {},
          members: [],
        });
        return true;
      } catch {
        return false;
      }
    },
    cancel() { generation += 1; },
  };
}

export function useMeetingHostRequest(): MeetingHostRequest | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, meetingHostRequestSnapshot, () => null);
}
