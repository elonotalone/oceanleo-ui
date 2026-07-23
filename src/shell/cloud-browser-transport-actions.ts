import type {
  MutableRefObject,
} from "react";
import type {
  CloudBrowserCapabilitiesV3,
  CloudBrowserTransportState,
} from "../lib/browser";

type Ref<T> = MutableRefObject<T>;
type MutationSender = (
  type: string,
  payload?: Record<string, unknown>,
) => boolean;
type ActionOptions = {
  transportStateRef: Ref<CloudBrowserTransportState>;
  leaseOwnedRef: Ref<boolean>;
  controlPendingRef: Ref<boolean>;
  capabilitiesRef: Ref<CloudBrowserCapabilitiesV3>;
  sendMutation: MutationSender;
  requestControlIntent: (intent: "acquire" | "release") => void;
};

export const CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS = 12_000;

export function createCloudBrowserTransportActions({
  transportStateRef,
  leaseOwnedRef,
  controlPendingRef,
  capabilitiesRef,
  sendMutation,
  requestControlIntent,
}: ActionOptions) {
  function cancelTakeover() {
    if (
      !controlPendingRef.current ||
      leaseOwnedRef.current
    ) {
      return false;
    }
    // A release intent either releases a just-granted lease with its exact
    // fence or forces the transport onto a fresh connection. In both cases a
    // late acquire response cannot leave this client as an invisible writer.
    requestControlIntent("release");
    return true;
  }

  function toggleControl() {
    if (controlPendingRef.current) {
      cancelTakeover();
      return;
    }
    const state = transportStateRef.current;
    const owned = leaseOwnedRef.current;
    if (owned) {
      if (state === "streaming") requestControlIntent("release");
      return;
    }
    if (
      state === "streaming" ||
      state === "reconnecting" ||
      state === "authenticated" ||
      state === "awaiting_first_frame"
    ) {
      requestControlIntent("acquire");
    }
  }

  function bookmarkCurrentPage() {
    if (!capabilitiesRef.current.page_bookmark) return false;
    return sendMutation("page.bookmark");
  }

  function createCheckpoint() {
    if (!capabilitiesRef.current.session_checkpoint) return false;
    return sendMutation("checkpoint.create");
  }

  return {
    toggleControl,
    cancelTakeover,
    bookmarkCurrentPage,
    createCheckpoint,
  };
}
