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

export function createCloudBrowserTransportActions({
  transportStateRef,
  leaseOwnedRef,
  controlPendingRef,
  capabilitiesRef,
  sendMutation,
  requestControlIntent,
}: ActionOptions) {
  function toggleControl() {
    if (controlPendingRef.current) return;
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
    bookmarkCurrentPage,
    createCheckpoint,
  };
}
