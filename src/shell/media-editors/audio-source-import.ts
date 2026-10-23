import { uploadPrivateEditorSource } from "../advanced-private-source";
import type { UITranslate } from "../../i18n/ui/useUI";
import { assertBlobSource } from "./source-integrity.mjs";
import { audioBufferBytes, MAX_AUDIO_FILE_BYTES, MAX_COMPRESSED_AUDIO_BYTES, MAX_DECODED_AUDIO_BYTES } from "./audio-workbench-utils";

/** Decode before changing the track, then persist its immutable private source. */
export async function importAudioSource(file: File, itemId: string, siteId: string, tt: UITranslate) {
  if (file.size > MAX_AUDIO_FILE_BYTES) throw new Error(tt("音频文件超过 128MB 安全上限"));
  const format = await assertBlobSource(file, "audio");
  if (file.size > MAX_COMPRESSED_AUDIO_BYTES && ["mp3", "mp4", "aac", "ogg"].includes(format)) {
    throw new Error(tt("压缩音频解码后可能超过浏览器内存，请改用视频时间线处理长音频"));
  }
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
  } catch {
    throw new Error(tt("音频源虽有正确容器签名，但没有浏览器可解码的音轨"));
  } finally {
    await context.close().catch(() => undefined);
  }
  if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) {
    throw new Error(tt("音频解码后过大，请改用视频时间线处理长音频"));
  }
  const uploaded = await uploadPrivateEditorSource(file, {
    siteId: siteId || "audio", title: file.name,
    idempotencyKey: `audio-source:${itemId}:${file.name}:${file.size}:${file.lastModified}`,
  });
  const sourceUrl = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !sourceUrl) throw new Error(uploaded.error || tt("音频源上传失败"));
  return { decoded, sourceUrl };
}
