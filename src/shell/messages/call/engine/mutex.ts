// 人际通话与 Leo 实时通话互斥（迁自 meeting/meeting-host-state.ts，行为不变）：
// 同一时刻只有一方能占用麦克风通话；`releaseCall` 只认当初 `claimCall` 拿到的那张号。
import type { CallOwner } from "./types";

let callOwner: CallOwner | null = null;
let callClaim = 0;

export function claimCall(owner: CallOwner): number | null {
  if (callOwner) return null;
  callOwner = owner;
  callClaim += 1;
  return callClaim;
}

export function releaseCall(owner: CallOwner, claim: number | null | undefined): void {
  if (claim !== null && claim !== undefined && callOwner === owner && claim === callClaim) callOwner = null;
}

export function activeCallOwner(): CallOwner | null {
  return callOwner;
}
