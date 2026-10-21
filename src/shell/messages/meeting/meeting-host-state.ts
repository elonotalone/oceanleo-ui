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

let request: MeetingHostRequest | null = null;
let callOwner: "meeting" | "leo-realtime" | null = null;
let callClaim = 0;
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

export function claimCall(owner: "meeting" | "leo-realtime"): number | null {
  if (callOwner) return null;
  callOwner = owner;
  callClaim += 1;
  return callClaim;
}

export function releaseCall(owner: "meeting" | "leo-realtime", claim: number | null | undefined): void {
  if (claim !== null && claim !== undefined && callOwner === owner && claim === callClaim) callOwner = null;
}

export function activeCallOwner(): "meeting" | "leo-realtime" | null {
  return callOwner;
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
