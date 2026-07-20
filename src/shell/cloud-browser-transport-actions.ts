import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
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
type ControlSender = (
  type: "control.acquire" | "control.release",
  requireOwned: boolean,
) => boolean;

type ActionOptions = {
  transportStateRef: Ref<CloudBrowserTransportState>;
  leaseOwnedRef: Ref<boolean>;
  controlIntentRef: Ref<"acquire" | "release" | "">;
  capabilitiesRef: Ref<CloudBrowserCapabilitiesV3>;
  setControlPending: Dispatch<SetStateAction<boolean>>;
  sendMutation: MutationSender;
  sendControlMutation: ControlSender;
};

export function createCloudBrowserTransportActions({
  transportStateRef,
  leaseOwnedRef,
  controlIntentRef,
  capabilitiesRef,
  setControlPending,
  sendMutation,
  sendControlMutation,
}: ActionOptions) {
  function toggleControl() {
    if (transportStateRef.current !== "streaming") return;
    setControlPending(true);
    const owned = leaseOwnedRef.current;
    controlIntentRef.current = owned ? "release" : "acquire";
    const sent = sendControlMutation(
      owned ? "control.release" : "control.acquire",
      owned,
    );
    if (!sent) {
      controlIntentRef.current = "";
      setControlPending(false);
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
