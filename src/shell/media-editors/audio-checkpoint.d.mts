import type { AudioEditOperation } from "./audio-operations";

export const MAX_AUDIO_PROJECT_OPERATIONS: 500;

export interface AudioCheckpoint<TSource> {
  sourceUrl: string;
  source: TSource;
}

export type AudioMutationResult<TSource> =
  | {
      ok: true;
      source: TSource;
      baseSource: TSource;
      sourceUrl: string;
      operations: AudioEditOperation[];
      checkpointed: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export function validAudioOperationProject(
  value: unknown,
  isOperation: (value: unknown) => boolean,
): value is { sourceUrl: string; operations: unknown[] };

export function prepareCheckpointedAudioMutation<TSource>(options: {
  source: TSource;
  sourceUrl: string;
  operations: readonly AudioEditOperation[];
  operation: AudioEditOperation;
  isOperation: (value: unknown) => boolean;
  createCheckpoint: (
    source: TSource,
  ) => Promise<AudioCheckpoint<TSource>>;
  applyOperation: (
    source: TSource,
    operation: AudioEditOperation,
  ) => TSource;
}): Promise<AudioMutationResult<TSource>>;
