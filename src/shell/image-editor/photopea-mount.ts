/**
 * Photopea iframe 能不能出现在舞台上，以及它拿哪一档沙箱。
 *
 * Photopea 是 `https://www.photopea.com` 的第三方 SaaS，不是我方代码。
 * 专业模式才允许挂；普通模式连 iframe 都不该存在。沙箱必须是不可信档，
 * 绝不能因为有人以后把 photopea.com 写进 TRUSTED 表就拿到同源。
 */

import {
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  sandboxGrantsScriptedSameOrigin,
} from "../editor-sandbox-origin";
import { PHOTOPEA_ORIGIN } from "./photopea-bridge";

export function planPhotopeaMount(showPhotopea: boolean): { mount: boolean } {
  return { mount: showPhotopea === true };
}

export function photopeaFrameSandbox(): string {
  const sandbox = embedEditorFrameSandbox(PHOTOPEA_ORIGIN);
  if (
    sandbox !== UNTRUSTED_FRAME_SANDBOX ||
    sandboxGrantsScriptedSameOrigin(sandbox)
  ) {
    throw new Error(
      "Photopea 是第三方 SaaS，必须走不可信沙箱，不得 allow-same-origin",
    );
  }
  return sandbox;
}
