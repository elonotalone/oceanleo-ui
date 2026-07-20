import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type {
  CloudBrowserControlLease,
  CloudBrowserTransportState,
} from "../lib/browser";
import { DEFAULT_BROWSER_URL } from "./cloud-browser-live";

type Ref<T> = MutableRefObject<T>;
type RawSender = (message: Record<string, unknown>) => boolean;
type Envelope = (
  type: string,
  payload?: Record<string, unknown>,
) => Record<string, unknown>;
type MutationSender = (
  type: string,
  payload?: Record<string, unknown>,
  legacy?: Record<string, unknown>,
) => boolean;
type EventIdFactory = () => string;

type ActionOptions = {
  transportStateRef: Ref<CloudBrowserTransportState>;
  protocolRef: Ref<1 | 2 | null>;
  leaseOwnedRef: Ref<boolean>;
  leaseRef: Ref<CloudBrowserControlLease>;
  legacyDrivingRef: Ref<boolean>;
  controlIntentRef: Ref<"acquire" | "release" | "">;
  activeTabIdRef: Ref<string>;
  setControlPending: Dispatch<SetStateAction<boolean>>;
  sendRaw: RawSender;
  v2Envelope: Envelope;
  sendMutation: MutationSender;
  nextClientEventId: EventIdFactory;
};

export function createCloudBrowserTransportActions({
  transportStateRef,
  protocolRef,
  leaseOwnedRef,
  leaseRef,
  legacyDrivingRef,
  controlIntentRef,
  activeTabIdRef,
  setControlPending,
  sendRaw,
  v2Envelope,
  sendMutation,
  nextClientEventId,
}: ActionOptions) {
  function toggleControl() {
    if (transportStateRef.current !== "streaming") return;
    setControlPending(true);
    if (protocolRef.current === 2) {
      let sent = false;
      if (leaseOwnedRef.current) {
        controlIntentRef.current = "release";
        sent = sendRaw(v2Envelope("control.release", {
          lease_id: leaseRef.current.leaseId,
          lease_epoch: leaseRef.current.epoch,
        }));
      } else {
        controlIntentRef.current = "acquire";
        sent = sendRaw(
          v2Envelope("control.acquire", { holder_kind: "human" }),
        );
      }
      if (!sent) {
        controlIntentRef.current = "";
        setControlPending(false);
      }
      return;
    }
    if (!sendRaw({
      t: legacyDrivingRef.current ? "release" : "takeover",
    })) {
      setControlPending(false);
    }
  }

  function navigate(action: "back" | "forward" | "reload") {
    const key = {
      back: "Alt+ArrowLeft",
      forward: "Alt+ArrowRight",
      reload: "Control+R",
    }[action];
    sendMutation(`nav.${action}`, {}, {
      t: "key",
      event: "press",
      key,
    });
  }

  function createTab() {
    sendMutation("tab.create", { url: DEFAULT_BROWSER_URL }, {
      t: "tab.create",
      url: DEFAULT_BROWSER_URL,
    });
  }

  function activateTab(tabId: string) {
    if (tabId === activeTabIdRef.current) return;
    sendMutation("tab.activate", { tab_id: tabId }, {
      t: "tab.activate",
      tab_id: tabId,
    });
  }

  function closeTab(tabId: string) {
    sendMutation("tab.close", { tab_id: tabId }, {
      t: "tab.close",
      tab_id: tabId,
    });
  }

  function captureHistory() {
    if (
      protocolRef.current !== 2 ||
      transportStateRef.current !== "streaming" ||
      leaseRef.current.holderKind === "human"
    ) {
      return false;
    }
    return sendRaw(v2Envelope("history.capture", {
      tab_id: activeTabIdRef.current,
      client_event_id: nextClientEventId(),
    }));
  }

  return {
    toggleControl,
    navigate,
    createTab,
    activateTab,
    closeTab,
    captureHistory,
  };
}
