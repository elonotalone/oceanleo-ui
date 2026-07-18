"use client";

import {
  useCallback,
  useRef,
  type MutableRefObject,
} from "react";

import type { UITranslate } from "../../i18n/ui/useUI";
import { uploadFile } from "../../lib/database";
import type { LibraryItem } from "../library-data";
import {
  prepareCheckpointedAudioMutation,
  type AudioCheckpoint,
} from "./audio-checkpoint.mjs";
import {
  isAudioEditOperation,
  type AudioEditOperation,
} from "./audio-operations";
import {
  applyAudioOperation,
  appendAudioHistory,
  audioBufferBytes,
  encodeWav,
  MAX_AUDIO_FILE_BYTES,
  MAX_DECODED_AUDIO_BYTES,
} from "./audio-workbench-utils";

interface AudioMutationOptions {
  item: LibraryItem;
  siteId: string;
  bufferRef: MutableRefObject<AudioBuffer | null>;
  sourceUrlRef: MutableRefObject<string>;
  operationsRef: MutableRefObject<AudioEditOperation[]>;
  undoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  redoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  undoRef: MutableRefObject<AudioBuffer[]>;
  redoRef: MutableRefObject<AudioBuffer[]>;
  revisionRef: MutableRefObject<number>;
  reloadWaveform: (next: AudioBuffer) => Promise<void>;
  setLoading: (value: boolean) => void;
  setError: (value: string) => void;
  setSavedUrl: (value: string) => void;
  setDirty: (value: boolean) => void;
  setCanUndo: (value: boolean) => void;
  setCanRedo: (value: boolean) => void;
  tt: UITranslate;
}

async function uploadRenderedCheckpoint({
  source,
  item,
  siteId,
  revision,
}: {
  source: AudioBuffer;
  item: LibraryItem;
  siteId: string;
  revision: number;
}): Promise<AudioCheckpoint<AudioBuffer>> {
  const rendered = encodeWav(source);
  if (rendered.size > MAX_AUDIO_FILE_BYTES) {
    throw new Error("渲染后的 WAV 超过 128MB 上传上限");
  }

  const context = new AudioContext();
  let canonical: AudioBuffer;
  try {
    canonical = await context.decodeAudioData(
      (await rendered.arrayBuffer()).slice(0),
    );
  } finally {
    await context.close().catch(() => undefined);
  }
  if (audioBufferBytes(canonical) > MAX_DECODED_AUDIO_BYTES) {
    throw new Error("checkpoint 解码后超过浏览器内存上限");
  }

  const title = `${item.title || "audio"}-checkpoint-r${revision}`;
  const uploaded = await uploadFile(
    new File([rendered], `${title}.wav`, { type: "audio/wav" }),
    {
      siteId: siteId || "audio",
      title,
      registerAsset: false,
      idempotencyKey: `audio-checkpoint:${item.id}:${revision}:${rendered.size}`,
    },
  );
  const sourceUrl = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !sourceUrl) {
    throw new Error(uploaded.error || "checkpoint 二进制上传失败");
  }
  return { sourceUrl, source: canonical };
}

export function useAudioMutations({
  item,
  siteId,
  bufferRef,
  sourceUrlRef,
  operationsRef,
  undoOperationsRef,
  redoOperationsRef,
  undoRef,
  redoRef,
  revisionRef,
  reloadWaveform,
  setLoading,
  setError,
  setSavedUrl,
  setDirty,
  setCanUndo,
  setCanRedo,
  tt,
}: AudioMutationOptions): (operation: AudioEditOperation) => Promise<boolean> {
  const mutatingRef = useRef(false);

  return useCallback(
    async (operation: AudioEditOperation): Promise<boolean> => {
      const current = bufferRef.current;
      if (!current) return false;
      if (mutatingRef.current) {
        setError(tt("上一项音频编辑仍在安全处理，本次操作未应用，请稍后重试"));
        return false;
      }

      mutatingRef.current = true;
      const startingRevision = revisionRef.current;
      setLoading(true);
      setError("");
      try {
        const previousOperations = [...operationsRef.current];
        const prepared = await prepareCheckpointedAudioMutation({
          source: current,
          sourceUrl: sourceUrlRef.current,
          operations: previousOperations,
          operation,
          isOperation: isAudioEditOperation,
          createCheckpoint: (rendered) =>
            uploadRenderedCheckpoint({
              source: rendered,
              item,
              siteId,
              revision: revisionRef.current,
            }),
          applyOperation: applyAudioOperation,
        });
        if (!prepared.ok) {
          setError(tt(prepared.error));
          return false;
        }
        if (
          bufferRef.current !== current ||
          revisionRef.current !== startingRevision
        ) {
          setError(
            tt("checkpoint 期间音频状态已变化，本次操作未应用；最新状态仍保留"),
          );
          return false;
        }

        if (prepared.checkpointed) {
          undoRef.current = appendAudioHistory([], prepared.baseSource);
          undoOperationsRef.current = undoRef.current.length ? [[]] : [];
        } else {
          undoRef.current = appendAudioHistory(undoRef.current, current);
          undoOperationsRef.current = undoRef.current.length
            ? [...undoOperationsRef.current, previousOperations].slice(
                -undoRef.current.length,
              )
            : [];
        }
        redoRef.current = [];
        redoOperationsRef.current = [];
        sourceUrlRef.current = prepared.sourceUrl;
        operationsRef.current = prepared.operations;
        bufferRef.current = prepared.source;
        revisionRef.current += 1;
        setCanUndo(undoRef.current.length > 0);
        setCanRedo(false);
        setDirty(true);
        setSavedUrl("");
        try {
          await reloadWaveform(prepared.source);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? `${caught.message}；修改已安全保留`
              : tt("波形重建失败；修改已安全保留"),
          );
        }
        return true;
      } finally {
        mutatingRef.current = false;
        setLoading(false);
      }
    },
    [
      bufferRef,
      item,
      operationsRef,
      redoOperationsRef,
      redoRef,
      reloadWaveform,
      revisionRef,
      setCanRedo,
      setCanUndo,
      setDirty,
      setError,
      setLoading,
      setSavedUrl,
      siteId,
      sourceUrlRef,
      tt,
      undoOperationsRef,
      undoRef,
    ],
  );
}
