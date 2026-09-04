/**
 * 音频新核的 L0 模式。Native 面（waveform-playlist）走 adapter.setMode；
 * 专业模式才把 AudioMass iframe 露出来，并向它发契约 v2 的 `set-mode`。
 *
 * `buildSetModeMessage` 校验闭集。默认 ordinary = `"normal"`。
 */
import {
  DEFAULT_EDITOR_MODE,
  buildSetModeMessage,
  type EditorMode,
} from "../hosted-editor/index";

export const AUDIO_NEXT_INSTANCE_ID = "oceanleo-audio-next";
export const AUDIO_NEXT_DEFAULT_MODE: EditorMode = DEFAULT_EDITOR_MODE;
export const AUDIO_NEXT_STAGE_ATTR = "data-audio-next-stage";
export const AUDIO_NEXT_MODE_ATTR = "data-audio-next-mode";

export interface AudioNextModeApplication {
  instanceId: string;
  message: ReturnType<typeof buildSetModeMessage>;
  mode: EditorMode;
  /** 专业模式才挂 AudioMass iframe。普通模式不露内核 UI。 */
  showHostedEditor: boolean;
}

export function applyAudioNextMode(
  instanceId: string,
  mode: EditorMode,
): AudioNextModeApplication {
  const message = buildSetModeMessage(instanceId, mode);
  const next = message.type === "set-mode" ? message.mode : mode;
  return {
    instanceId,
    message,
    mode: next,
    showHostedEditor: next === "pro",
  };
}

export function isAudioNextPro(mode: EditorMode): boolean {
  return applyAudioNextMode(AUDIO_NEXT_INSTANCE_ID, mode).showHostedEditor;
}
