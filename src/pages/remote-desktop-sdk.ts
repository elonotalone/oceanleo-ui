import { pickEngineClass, wrapEngineClass, type ArtcSdk } from "../shell/messages/call/engine/sdk";

let pending: Promise<ArtcSdk> | null = null;

/** Remote credentials must never reach the unpatched vendor diagnostic logger. */
export function loadRemoteArtcSdk(): Promise<ArtcSdk> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.reject(new Error("browser_required"));
  if (!pending) pending = import("../../vendor/remote-artc/aliyun-rtc-sdk.private.mjs").then((module) => {
    if (module.OCEANLEO_REMOTE_PRIVACY !== "oceanleo-remote-artc-7.3.8-private-v1") throw new Error("media_sdk_privacy_required");
    const cls = pickEngineClass(module);
    if (!cls || cls.getSdkVersion?.() !== "7.3.8") throw new Error("media_sdk_privacy_required");
    return wrapEngineClass(cls, "npm");
  }).catch((error) => { pending = null; throw error; });
  return pending;
}
