"use client";

import { useSyncExternalStore } from "react";
import type { ImMember, ImProfile } from "../../../lib/im/types";

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

export function claimCall(owner: "meeting" | "leo-realtime"): boolean {
  if (callOwner && callOwner !== owner) return false;
  callOwner = owner;
  return true;
}

export function releaseCall(owner: "meeting" | "leo-realtime"): void {
  if (callOwner === owner) callOwner = null;
}

export function activeCallOwner(): "meeting" | "leo-realtime" | null {
  return callOwner;
}

export function useMeetingHostRequest(): MeetingHostRequest | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, meetingHostRequestSnapshot, () => null);
}
