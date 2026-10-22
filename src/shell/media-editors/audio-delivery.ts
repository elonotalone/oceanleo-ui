import {
  fetchAudioProjectSourceBlob,
} from "./audio-project-source";
import {
  encodeWav,
  MAX_COMPRESSED_AUDIO_BYTES,
} from "./audio-workbench-utils";
import { assertBlobSource } from "./source-integrity.mjs";

export interface AudioDelivery {
  file: File;
  /** 写进 revision `source.format` 的格式（mp3 / wav / …）。 */
  sourceFormat: string;
  sourceMediaType: string;
  /** `original`：未编辑，原样带上原始字节；`render`：当前混音渲出的 WAV。 */
  origin: "original" | "render";
}

const MEDIA_TYPE_BY_FORMAT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  mp4: "audio/mp4",
  aac: "audio/aac",
};

function fileStem(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "audio";
}

/**
 * 每一个保存下来的音频 revision 都要带一个能播、能下载的 `full` 交付物，否则
 * 它只剩「工程 JSON + 一张波形图」，查看器没有任何音频可放（6cf6ec0a rev 2）。
 *
 * - 没有任何编辑：把原始音频字节原样带上（不重新编码、不放大体积）；
 * - 有编辑：把当前混音渲成 16-bit PCM WAV。
 *
 * 返回 `null` 表示这次渲出来太大、不适合内联上传——调用方退回只存工程
 * （查看器会按工程引用的基础音频还原播放），而不是让保存失败。
 */
export async function buildAudioDelivery({
  title,
  buffer,
  operationCount,
  sourceUrl,
  signal,
}: {
  title: string;
  buffer: AudioBuffer;
  operationCount: number;
  sourceUrl: string;
  signal?: AbortSignal;
}): Promise<AudioDelivery | null> {
  const stem = fileStem(title);
  if (operationCount === 0 && sourceUrl) {
    try {
      const blob = await fetchAudioProjectSourceBlob(sourceUrl, signal);
      const format = await assertBlobSource(blob, "audio");
      const mediaType = MEDIA_TYPE_BY_FORMAT[format] || "";
      if (mediaType && blob.size <= MAX_COMPRESSED_AUDIO_BYTES) {
        const extension = format === "mp4" ? "m4a" : format;
        return {
          file: new File([blob], `${stem}.${extension}`, { type: mediaType }),
          sourceFormat: format === "mp4" ? "m4a" : format,
          sourceMediaType: mediaType,
          origin: "original",
        };
      }
    } catch {
      // The original is not reachable right now; the decoded buffer in hand
      // is the same audio, so render it instead of failing the save.
    }
  }
  const wav = encodeWav(buffer);
  if (wav.size > MAX_COMPRESSED_AUDIO_BYTES) return null;
  return {
    file: new File([wav], `${stem}.wav`, { type: "audio/wav" }),
    sourceFormat: "wav",
    sourceMediaType: "audio/wav",
    origin: "render",
  };
}
