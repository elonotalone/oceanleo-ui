import type { Dispatch, SetStateAction } from "react";
import type { CloudBrowserControlLease } from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";

export const MAX_LIVE_RECONNECTS = 3;
export const LIVE_RECONNECT_BASE_MS = 500;
export const LIVE_TICKET_TIMEOUT_MS = 15_000;
/**
 * Executor cold starts (empty warm pool) routinely need more than 5 s to
 * paint the first native Chrome frame, so the paint gate waits 15 s.
 */
export const FIRST_FRAME_TIMEOUT_MS = 15_000;
/**
 * Bounded automatic recovery for client-side validation failures
 * (first_paint / protocol_mismatch / stale_stream, including frame-pairing
 * rejects). Each retry re-issues a one-use ticket and reconnects.
 */
export const LIVE_RECOVERY_DELAYS_MS = [1_000, 3_000] as const;
export const EMPTY_BROWSER_LEASE: CloudBrowserControlLease = {
  leaseId: "",
  epoch: 0,
  holderKind: "free",
};

export type CloudBrowserTransportOptions = {
  selectedId: string;
  liveRequested: boolean;
  setLiveRequested: Dispatch<SetStateAction<boolean>>;
  scopeKey: string;
  tt: UITranslate;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  refreshCheckpoints: () => Promise<void>;
};
