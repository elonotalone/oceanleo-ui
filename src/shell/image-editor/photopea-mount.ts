/**
 * Photopea iframe 能不能出现在舞台上，以及它拿哪一档沙箱。
 *
 * Photopea 是 `https://www.photopea.com` 的第三方 SaaS，不是我方代码，
 * 也不是 `*.oceanleo.app` 上我方部署的 Hosted 六件。专业模式才允许挂；
 * 普通模式连 iframe 都不该存在。
 *
 * UC-3 例外（2026-10-15 操作员：「嵌 photopea.com 也要做好」）：
 * 去掉 `allow-same-origin` 时 iframe 的 origin 是不透明 `"null"`，
 * IndexedDB / 精确 `postMessage` 目标都失效，专业面黑屏。
 * `allow-same-origin` 只把 origin 恢复成 photopea.com 自己，拿不到
 * `Domain=.oceanleo.com` 的 SSO cookie（不同 eTLD+1）。剥离 sandbox
 * 再重载需要与父页同源，跨源 SaaS 做不到。
 *
 * 这条通道只走 `photopeaFrameSandbox()`，且 `PHOTOPEA_ORIGIN` 必须是
 * 精确全串。`embedEditorFrameSandbox("https://www.photopea.com")` 必须
 * 继续返回不可信档，禁止把 photopea.com 写进 TRUSTED / HOSTED 表。
 */

import {
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  sandboxGrantsScriptedSameOrigin,
} from "../editor-sandbox-origin";
import { PHOTOPEA_ORIGIN } from "./photopea-bridge";

/** 只许 `photopeaFrameSandbox()` 返回。不要复用 HOSTED / TRUSTED 常量名。 */
export const PHOTOPEA_FRAME_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-downloads allow-same-origin allow-modals";

const PHOTOPEA_EXACT_ORIGIN = "https://www.photopea.com";

export function planPhotopeaMount(showPhotopea: boolean): { mount: boolean } {
  return { mount: showPhotopea === true };
}

export function photopeaFrameSandbox(): string {
  if (PHOTOPEA_ORIGIN !== PHOTOPEA_EXACT_ORIGIN) {
    throw new Error(
      "Photopea origin 只能是 https://www.photopea.com，漂移则关闭同源通道",
    );
  }
  const generic = embedEditorFrameSandbox(PHOTOPEA_ORIGIN);
  if (
    generic !== UNTRUSTED_FRAME_SANDBOX ||
    sandboxGrantsScriptedSameOrigin(generic)
  ) {
    throw new Error(
      "Photopea 不得进入 TRUSTED/HOSTED 白名单；同源只许 photopeaFrameSandbox 这一条精确 origin 通道",
    );
  }
  if (!sandboxGrantsScriptedSameOrigin(PHOTOPEA_FRAME_SANDBOX)) {
    throw new Error(
      "Photopea 跨源 SaaS 需要 allow-same-origin 才有真实 origin（IndexedDB / postMessage）",
    );
  }
  return PHOTOPEA_FRAME_SANDBOX;
}
