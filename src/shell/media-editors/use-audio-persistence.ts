import { useCallback, type MutableRefObject } from "react";

import { uploadFile } from "../../lib/database";
import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { UITranslate } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import {
  saveProjectWorkingHead,
  type PersistedEditorVersion,
} from "../doc-editors/doc-io";
import type { AudioEditOperation } from "./audio-operations";
import type { AudioProjectData } from "./audio-workbench-state";
import {
  applyAudioOperation,
  audioBufferBytes,
  AUDIO_PROJECT_SCHEMA,
  encodeWav,
  MAX_AUDIO_FILE_BYTES,
  MAX_DECODED_AUDIO_BYTES,
  validAudioProject,
} from "./audio-workbench-utils";

interface AudioPersistenceOptions {
  item: LibraryItem;
  siteId: string;
  bufferRef: MutableRefObject<AudioBuffer | null>;
  sourceUrlRef: MutableRefObject<string>;
  operationsRef: MutableRefObject<AudioEditOperation[]>;
  undoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  redoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  workingHeadUrlRef: MutableRefObject<string>;
  undoRef: MutableRefObject<AudioBuffer[]>;
  redoRef: MutableRefObject<AudioBuffer[]>;
  revisionRef: MutableRefObject<number>;
  savingRef: MutableRefObject<boolean>;
  reloadWaveform: (next: AudioBuffer) => Promise<void>;
  setSaving: (value: boolean) => void;
  setError: (value: string) => void;
  setSavedUrl: (value: string) => void;
  setDirty: (value: boolean) => void;
  setCanUndo: (value: boolean) => void;
  setCanRedo: (value: boolean) => void;
  tt: UITranslate;
}

export function useAudioPersistence({
  item,
  siteId,
  bufferRef,
  sourceUrlRef,
  operationsRef,
  undoOperationsRef,
  redoOperationsRef,
  workingHeadUrlRef,
  undoRef,
  redoRef,
  revisionRef,
  savingRef,
  reloadWaveform,
  setSaving,
  setError,
  setSavedUrl,
  setDirty,
  setCanUndo,
  setCanRedo,
  tt,
}: AudioPersistenceOptions) {
  const save = useCallback(async (): Promise<PersistedEditorVersion | null> => {
    const source = bufferRef.current;
    if (!source || savingRef.current) return null;
    const savingRevision = revisionRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${item.title || tt("音频")}-${tt("编辑版")}`;
      const project: AudioProjectData = {
        sourceUrl: sourceUrlRef.current,
        operations: structuredClone(operationsRef.current),
      };
      if (!validAudioProject(project)) {
        throw new Error(
          tt("音频工程操作日志无效或超过安全上限，保存已阻止；当前状态仍保留"),
        );
      }
      const saved = await saveProjectWorkingHead({
        item,
        siteId,
        fallbackSite: "audio",
        title,
        mediaType: "audio",
        kind: "audio",
        idempotencyKey: `audio:${item.id}:${savingRevision}`,
        workingHeadUrl: workingHeadUrlRef.current,
        meta: {
          editor: "audio-v3",
          audio_source_url: project.sourceUrl,
          audio_operation_count: project.operations.length,
        },
        project: {
          schema: AUDIO_PROJECT_SCHEMA,
          data: project,
        },
      });
      if (!saved.ok) {
        throw new Error(saved.error || tt("登记到我的库失败"));
      }
      workingHeadUrlRef.current = saved.url;
      setSavedUrl(saved.url);
      if (revisionRef.current === savingRevision) setDirty(false);
      return {
        url: saved.url,
        versionId: saved.versionId,
        projectUrl: saved.projectUrl,
        projectSchema: saved.projectSchema,
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("保存到我的库失败"));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    bufferRef,
    item,
    operationsRef,
    revisionRef,
    savingRef,
    setDirty,
    setError,
    setSavedUrl,
    setSaving,
    siteId,
    sourceUrlRef,
    tt,
    workingHeadUrlRef,
  ]);

  const captureRecovery = useCallback(
    (): AudioProjectData | null =>
      bufferRef.current
        ? {
            sourceUrl: sourceUrlRef.current,
            operations: structuredClone(operationsRef.current),
          }
        : null,
    [bufferRef, operationsRef, sourceUrlRef],
  );

  const restoreRecovery = useCallback(
    async (payload: unknown): Promise<boolean> => {
      let project: AudioProjectData;
      if (validAudioProject(payload)) {
        project = payload;
      } else if (
        payload instanceof Blob &&
        payload.size <= MAX_AUDIO_FILE_BYTES
      ) {
        const uploaded = await uploadFile(
          new File([payload], `${item.title || "audio"}-recovery.wav`, {
            type: payload.type || "audio/wav",
          }),
          {
            siteId: siteId || "audio",
            title: `${item.title || "audio"}-recovery`,
            registerAsset: false,
            idempotencyKey: `audio-recovery:${item.id}:${payload.size}`,
          },
        );
        const url = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !url) return false;
        project = { sourceUrl: url, operations: [] };
      } else {
        return false;
      }
      const context = new AudioContext();
      try {
        const durableUrl = project.sourceUrl
          ? isFirstPartyMediaUrl(project.sourceUrl)
            ? project.sourceUrl
            : await importMediaUrl(project.sourceUrl, {
                kind: "audio",
                siteId: siteId || "audio",
                title: item.title,
                registerAsset: false,
              })
          : "";
        const blob = durableUrl
          ? await fetchMediaBlob(durableUrl, {
              maxBytes: MAX_AUDIO_FILE_BYTES,
            })
          : encodeWav(
              new AudioBuffer({
                length: 44_100,
                numberOfChannels: 1,
                sampleRate: 44_100,
              }),
            );
        let decoded = await context.decodeAudioData(
          (await blob.arrayBuffer()).slice(0),
        );
        for (const operation of project.operations) {
          decoded = applyAudioOperation(decoded, operation);
        }
        if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) return false;
        bufferRef.current = decoded;
        sourceUrlRef.current = durableUrl;
        operationsRef.current = [...project.operations];
        undoRef.current = [];
        redoRef.current = [];
        undoOperationsRef.current = [];
        redoOperationsRef.current = [];
        revisionRef.current += 1;
        setCanUndo(false);
        setCanRedo(false);
        setDirty(true);
        setSavedUrl("");
        await reloadWaveform(decoded);
        return true;
      } finally {
        await context.close();
      }
    },
    [
      bufferRef,
      item.id,
      item.title,
      operationsRef,
      redoOperationsRef,
      redoRef,
      reloadWaveform,
      revisionRef,
      setCanRedo,
      setCanUndo,
      setDirty,
      setSavedUrl,
      siteId,
      sourceUrlRef,
      undoOperationsRef,
      undoRef,
    ],
  );

  return { save, captureRecovery, restoreRecovery };
}
