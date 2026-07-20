import type { Dispatch, SetStateAction } from "react";
import type { CloudBrowserControlLease } from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";

export const MAX_LIVE_RECONNECTS = 3;
export const LIVE_RECONNECT_BASE_MS = 500;
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
