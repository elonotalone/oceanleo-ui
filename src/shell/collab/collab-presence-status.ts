import type { CollabStatus } from "./index";

/**
 * A room socket may reconnect in the background while nobody else is in the
 * room. That is not a user-visible collaboration outage. Once another user
 * has been observed, an offline socket is meaningful even if awareness has
 * just been cleared by the disconnect handler.
 */
export function shouldShowOfflinePresence(input: {
  status: CollabStatus;
  peerCount: number;
  hadPeer: boolean;
}): boolean {
  return input.status === "offline" && (input.hadPeer || input.peerCount > 0);
}
