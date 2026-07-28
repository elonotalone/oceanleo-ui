"use client";

import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type WaveSurfer from "wavesurfer.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";

import type { UITranslate } from "../../i18n/ui/useUI";
import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import { loadEditorProject } from "../doc-editors/doc-io";
import type { AudioEditOperation } from "./audio-operations";
import type {
  AudioProjectData,
  AudioSelection,
} from "./audio-workbench-state";
import {
  applyAudioOperation,
  audioBufferBytes,
  AUDIO_PROJECT_SCHEMA,
  encodeWav,
  MAX_AUDIO_FILE_BYTES,
  MAX_COMPRESSED_AUDIO_BYTES,
  MAX_DECODED_AUDIO_BYTES,
  validAudioProject,
} from "./audio-workbench-utils";
import { assertBlobSource } from "./source-integrity.mjs";

interface AudioWaveLoaderOptions {
  item: LibraryItem;
  siteId: string;
  requiresExistingSource: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  waveRef: MutableRefObject<WaveSurfer | null>;
  regionsRef: MutableRefObject<RegionsPlugin | null>;
  bufferRef: MutableRefObject<AudioBuffer | null>;
  sourceUrlRef: MutableRefObject<string>;
  operationsRef: MutableRefObject<AudioEditOperation[]>;
  undoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  redoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  workingHeadUrlRef: MutableRefObject<string>;
  objectUrlRef: MutableRefObject<string>;
  undoRef: MutableRefObject<AudioBuffer[]>;
  redoRef: MutableRefObject<AudioBuffer[]>;
  revisionRef: MutableRefObject<number>;
  zoomRef: MutableRefObject<number>;
  syncSelection: (region: Region) => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setSelection: Dispatch<SetStateAction<AudioSelection | null>>;
  setEffectSpeed: Dispatch<SetStateAction<number>>;
  setLowEq: Dispatch<SetStateAction<number>>;
  setMidEq: Dispatch<SetStateAction<number>>;
  setHighEq: Dispatch<SetStateAction<number>>;
  setCanUndo: Dispatch<SetStateAction<boolean>>;
  setCanRedo: Dispatch<SetStateAction<boolean>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  tt: UITranslate;
}

export function useAudioWaveLoader({
  item,
  siteId,
  requiresExistingSource,
  containerRef,
  waveRef,
  regionsRef,
  bufferRef,
  sourceUrlRef,
  operationsRef,
  undoOperationsRef,
  redoOperationsRef,
  workingHeadUrlRef,
  objectUrlRef,
  undoRef,
  redoRef,
  revisionRef,
  zoomRef,
  syncSelection,
  setLoading,
  setError,
  setPlaying,
  setSavedUrl,
  setDuration,
  setCurrentTime,
  setSelection,
  setEffectSpeed,
  setLowEq,
  setMidEq,
  setHighEq,
  setCanUndo,
  setCanRedo,
  setDirty,
  tt,
}: AudioWaveLoaderOptions): void {
  useEffect(() => {
    const container = containerRef.current;
    const sourceUrl = item.url || item.previewUrl || "";
    const projectUrl =
      item.meta.editor_project_schema === AUDIO_PROJECT_SCHEMA
        ? String(item.meta.editor_project_url || item.url || "").trim()
        : "";
    if (!container) return;
    let disposed = false;
    const controller = new AbortController();
    let disableDrag: (() => void) | undefined;
    setLoading(true);
    setError("");
    workingHeadUrlRef.current = String(item.meta.editor_working_head_url || "");
    void (async () => {
      try {
        const project = projectUrl
          ? await loadEditorProject<AudioProjectData>(
              projectUrl,
              AUDIO_PROJECT_SCHEMA,
              controller.signal,
            )
          : null;
        if (project && !validAudioProject(project)) {
          throw new Error(tt("音频工程格式无效"));
        }
        const requestedSource = project ? project.sourceUrl : sourceUrl;
        if (!requestedSource && requiresExistingSource) {
          throw new Error(
            tt("当前音频 revision 缺少可验证的源文件；已阻止用静音占位替代"),
          );
        }
        const durableUrl = requestedSource
          ? isFirstPartyMediaUrl(requestedSource)
            ? requestedSource
            : await importMediaUrl(requestedSource, {
                kind: "audio",
                siteId: siteId || "audio",
                title: item.title,
                registerAsset: true,
              })
          : "";
        const [{ default: WaveSurferClass }, { default: RegionsPluginClass }] =
          await Promise.all([
            import("wavesurfer.js"),
            import("wavesurfer.js/dist/plugins/regions.js"),
          ]);
        const blob = durableUrl
          ? await fetchMediaBlob(durableUrl, {
              maxBytes: MAX_AUDIO_FILE_BYTES,
              signal: controller.signal,
            })
          : encodeWav(
              new AudioBuffer({
                length: 44_100,
                numberOfChannels: 1,
                sampleRate: 44_100,
              }),
            );
        if (disposed) return;
        const sourceFormat = await assertBlobSource(blob, "audio");
        const isHighlyCompressed = ["mp3", "mp4", "aac", "ogg"].includes(
          sourceFormat,
        );
        if (isHighlyCompressed && blob.size > MAX_COMPRESSED_AUDIO_BYTES) {
          throw new Error(
            tt("压缩音频解码后可能超过浏览器内存，请改用视频时间线处理长音频"),
          );
        }
        const context = new AudioContext();
        let decoded: AudioBuffer;
        try {
          decoded = await context.decodeAudioData(
            (await blob.arrayBuffer()).slice(0),
          );
        } catch {
          throw new Error(
            tt("音频源虽有正确容器签名，但没有浏览器可解码的音轨"),
          );
        } finally {
          await context.close().catch(() => undefined);
        }
        if (disposed) return;
        for (const operation of project?.operations || []) {
          decoded = applyAudioOperation(decoded, operation);
        }
        if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) {
          throw new Error(
            tt("音频解码后过大，请改用视频时间线处理长音频"),
          );
        }
        bufferRef.current = decoded;
        sourceUrlRef.current = durableUrl;
        operationsRef.current = [...(project?.operations || [])];
        undoOperationsRef.current = [];
        redoOperationsRef.current = [];
        undoRef.current = [];
        redoRef.current = [];
        revisionRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
        setDirty(false);
        setSavedUrl("");
        setEffectSpeed(1);
        setLowEq(0);
        setMidEq(0);
        setHighEq(0);
        setDuration(decoded.duration);
        const objectUrl = URL.createObjectURL(
          project?.operations.length ? encodeWav(decoded) : blob,
        );
        objectUrlRef.current = objectUrl;
        const regions = RegionsPluginClass.create();
        const wave = WaveSurferClass.create({
          container,
          url: objectUrl,
          plugins: [regions],
          height: 180,
          waveColor: "#a8a29e",
          progressColor: "#6d5dfc",
          cursorColor: "#292524",
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          normalize: true,
          minPxPerSec: zoomRef.current,
        });
        waveRef.current = wave;
        regionsRef.current = regions;
        disableDrag = regions.enableDragSelection({
          color: "rgba(79,70,229,.20)",
          drag: true,
          resize: true,
        });
        regions.on("region-created", (region) => {
          for (const existing of regions.getRegions()) {
            if (existing !== region) existing.remove();
          }
          syncSelection(region);
        });
        regions.on("region-updated", syncSelection);
        regions.on("region-removed", () => setSelection(null));
        wave.on("ready", () => setLoading(false));
        wave.on("timeupdate", setCurrentTime);
        wave.on("play", () => setPlaying(true));
        wave.on("pause", () => setPlaying(false));
        wave.on("finish", () => setPlaying(false));
        wave.on("error", (caught) => {
          if (disposed) return;
          setLoading(false);
          setError(
            caught instanceof Error ? caught.message : tt("音频波形加载失败"),
          );
        });
      } catch (caught) {
        if (!disposed) {
          disableDrag?.();
          disableDrag = undefined;
          try {
            waveRef.current?.destroy();
          } catch {
            // WaveSurfer may be only partially constructed.
          }
          waveRef.current = null;
          regionsRef.current = null;
          bufferRef.current = null;
          sourceUrlRef.current = "";
          operationsRef.current = [];
          undoOperationsRef.current = [];
          redoOperationsRef.current = [];
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = "";
          }
          setLoading(false);
          setError(caught instanceof Error ? caught.message : tt("音频加载失败"));
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      disableDrag?.();
      waveRef.current?.destroy();
      waveRef.current = null;
      regionsRef.current = null;
      bufferRef.current = null;
      sourceUrlRef.current = "";
      operationsRef.current = [];
      undoOperationsRef.current = [];
      redoOperationsRef.current = [];
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    };
  }, [
    containerRef,
    item.meta.editor_project_schema,
    item.meta.editor_project_url,
    item.meta.editor_working_head_url,
    item.previewUrl,
    item.title,
    item.url,
    objectUrlRef,
    operationsRef,
    redoOperationsRef,
    redoRef,
    regionsRef,
    requiresExistingSource,
    revisionRef,
    bufferRef,
    setCanRedo,
    setCanUndo,
    setCurrentTime,
    setDirty,
    setDuration,
    setEffectSpeed,
    setError,
    setHighEq,
    setLoading,
    setLowEq,
    setMidEq,
    setPlaying,
    setSavedUrl,
    setSelection,
    siteId,
    sourceUrlRef,
    syncSelection,
    tt,
    undoOperationsRef,
    undoRef,
    waveRef,
    workingHeadUrlRef,
    zoomRef,
  ]);
}
