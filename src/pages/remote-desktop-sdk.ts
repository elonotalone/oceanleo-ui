import { pickEngineClass, wrapEngineClass, type ArtcSdk } from "../shell/messages/call/engine/sdk";

/** The receive-only remote SDK plus its data-channel message class (index.d.ts:139 `AliRtcDataChannelMsg`). */
export interface RemoteArtcSdk extends ArtcSdk {
  /** `new AliRtcDataChannelMsg(data, AliEngineDataMsgCustom)`; absent = no data-channel input. */
  dataChannelMessage?(data: ArrayBuffer): unknown;
}

type DataMessageClass = new (data: ArrayBuffer, type?: number) => unknown;
/** AliRtcDataMsgType.AliEngineDataMsgCustom (index.d.ts:150). */
const CUSTOM_DATA_MESSAGE = 2;

let pending: Promise<RemoteArtcSdk> | null = null;

/** Remote credentials must never reach the unpatched vendor diagnostic logger. */
export function loadRemoteArtcSdk(): Promise<RemoteArtcSdk> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.reject(new Error("browser_required"));
  if (!pending) pending = import("../../vendor/remote-artc/aliyun-rtc-sdk.private.mjs").then((module) => {
    if (module.OCEANLEO_REMOTE_PRIVACY !== "oceanleo-remote-artc-7.3.8-private-v2") throw new Error("media_sdk_privacy_required");
    const cls = pickEngineClass(module);
    if (!cls || cls.getSdkVersion?.() !== "7.3.8") throw new Error("media_sdk_privacy_required");
    const sdk: RemoteArtcSdk = wrapEngineClass(cls, "npm");
    const Message = (module as unknown as { AliRtcDataChannelMsg?: DataMessageClass }).AliRtcDataChannelMsg;
    if (typeof Message === "function") sdk.dataChannelMessage = (data) => new Message(data, CUSTOM_DATA_MESSAGE);
    return sdk;
  }).catch((error) => { pending = null; throw error; });
  return pending;
}
