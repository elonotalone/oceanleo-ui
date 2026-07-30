import {
  applyAudioSampleOperation,
  isAudioEditOperation,
  type AudioEditOperation,
} from "./audio-operations";
import { validAudioOperationProject } from "./audio-checkpoint.mjs";
import {
  AUDIO_PROJECT_SCHEMA_ID,
  AUDIO_PROJECT_SCHEMA_LEGACY_ID,
  isAudioProjectSchemaId,
} from "./audio-project-carrier";
import type { AudioProjectData } from "./audio-workbench-state";

export const MAX_AUDIO_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_COMPRESSED_AUDIO_BYTES = 48 * 1024 * 1024;
export const MAX_DECODED_AUDIO_BYTES = 384 * 1024 * 1024;
const MAX_UNDO_AUDIO_BYTES = 256 * 1024 * 1024;

/**
 * audio-project.md §1.1 把 `project_schema` 锁死在 `oceanleo.audio-project.v1`，
 * 注册面（`workbench-capability-registry.ts:100`、`artifact-contract.ts:326`）与
 * 后端 `_source_format_matches[AUDIO]` 也都用这个值；编辑器此前写的却是
 * `oceanleo.audio.v1`，落库工程的 schema 与声明对不上。新写一律用规格值，
 * 读旧草稿仍认别名，否则存量工程打不开。
 */
export const AUDIO_PROJECT_SCHEMA = AUDIO_PROJECT_SCHEMA_ID;
export const AUDIO_PROJECT_SCHEMA_LEGACY = AUDIO_PROJECT_SCHEMA_LEGACY_ID;
export { isAudioProjectSchemaId };

export function audioBufferBytes(source: AudioBuffer): number {
  return (
    source.length *
    source.numberOfChannels *
    Float32Array.BYTES_PER_ELEMENT
  );
}

function cloneAudioBuffer(source: AudioBuffer): AudioBuffer {
  const copy = new AudioBuffer({
    length: source.length,
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  });
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    copy.copyToChannel(source.getChannelData(channel), channel);
  }
  return copy;
}

export function appendAudioHistory(
  stack: AudioBuffer[],
  source: AudioBuffer,
  other: AudioBuffer[] = [],
): AudioBuffer[] {
  if (audioBufferBytes(source) > MAX_UNDO_AUDIO_BYTES) return [];
  const next = [...stack, cloneAudioBuffer(source)].slice(-10);
  while (
    next.length > 0 &&
    [...next, ...other].reduce(
      (sum, value) => sum + audioBufferBytes(value),
      0,
    ) > MAX_UNDO_AUDIO_BYTES
  ) {
    next.shift();
  }
  return next;
}

export function copyAudioRange(
  source: AudioBuffer,
  start: number,
  end: number,
): AudioBuffer {
  const first = Math.max(
    0,
    Math.min(source.length, Math.floor(start * source.sampleRate)),
  );
  const last = Math.max(
    first + 1,
    Math.min(source.length, Math.ceil(end * source.sampleRate)),
  );
  const result = new AudioBuffer({
    length: last - first,
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  });
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    result.copyToChannel(
      source.getChannelData(channel).subarray(first, last),
      channel,
    );
  }
  return result;
}

export function deleteAudioRange(
  source: AudioBuffer,
  start: number,
  end: number,
): AudioBuffer {
  const first = Math.max(
    0,
    Math.min(source.length, Math.floor(start * source.sampleRate)),
  );
  const last = Math.max(
    first,
    Math.min(source.length, Math.ceil(end * source.sampleRate)),
  );
  const result = new AudioBuffer({
    length: Math.max(1, source.length - (last - first)),
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  });
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = result.getChannelData(channel);
    output.set(input.subarray(0, first), 0);
    output.set(input.subarray(last), first);
  }
  return result;
}

export function validAudioProject(
  value: unknown,
): value is AudioProjectData {
  return validAudioOperationProject(value, isAudioEditOperation);
}

export function applyAudioOperation(
  source: AudioBuffer,
  operation: AudioEditOperation,
): AudioBuffer {
  const processed = applyAudioSampleOperation(
    {
      sampleRate: source.sampleRate,
      channels: Array.from({ length: source.numberOfChannels }, (_, channel) =>
        Float32Array.from(source.getChannelData(channel)),
      ),
    },
    operation,
  );
  const next = new AudioBuffer({
    length: processed.channels[0]?.length || 1,
    numberOfChannels: processed.channels.length || 1,
    sampleRate: processed.sampleRate,
  });
  processed.channels.forEach((samples, channel) =>
    next.getChannelData(channel).set(samples),
  );
  return next;
}

export function encodeWav(source: AudioBuffer): Blob {
  const channels = source.numberOfChannels;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = source.length * blockAlign;
  const storage = new ArrayBuffer(44 + dataSize);
  const view = new DataView(storage);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, source.sampleRate, true);
  view.setUint32(28, source.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let frame = 0; frame < source.length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(
        -1,
        Math.min(1, source.getChannelData(channel)[frame] ?? 0),
      );
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += bytesPerSample;
    }
  }
  return new Blob([storage], { type: "audio/wav" });
}

export function formatAudioTime(value: number): string {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
