"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";
import { useUI } from "../../i18n/ui/useUI";
import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import { uploadFile } from "../../lib/database";
import type { LibraryItem } from "../library-data";
import { loadEditorProject } from "../doc-editors/doc-io";
import type { AudioEditOperation } from "./audio-operations";
import type {
  AudioProjectData,
  AudioSelection,
  AudioWorkbenchState,
} from "./audio-workbench-state";
import {
  applyAudioOperation,
  appendAudioHistory,
  audioBufferBytes,
  AUDIO_PROJECT_SCHEMA,
  encodeWav,
  MAX_AUDIO_FILE_BYTES,
  MAX_COMPRESSED_AUDIO_BYTES,
  MAX_DECODED_AUDIO_BYTES,
  validAudioProject,
} from "./audio-workbench-utils";
import { useAudioMutations } from "./use-audio-mutations";
import { useAudioPersistence } from "./use-audio-persistence";

export type { AudioEditOperation } from "./audio-operations";
export type { AudioProjectData, AudioSelection, AudioWorkbenchProps, AudioWorkbenchState } from "./audio-workbench-state";
export { AudioControls, AudioStage, AudioWorkbench } from "./AudioWorkbenchView";

export function useAudioWorkbench(
  item: LibraryItem,
  siteId = "",
): AudioWorkbenchState {
  const tt = useUI();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceUrlRef = useRef("");
  const operationsRef = useRef<AudioEditOperation[]>([]);
  const undoOperationsRef = useRef<AudioEditOperation[][]>([]);
  const redoOperationsRef = useRef<AudioEditOperation[][]>([]);
  const workingHeadUrlRef = useRef(item.url || item.previewUrl || "");
  const objectUrlRef = useRef("");
  const undoRef = useRef<AudioBuffer[]>([]);
  const redoRef = useRef<AudioBuffer[]>([]);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const speedRef = useRef(1);
  const zoomRef = useRef(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [fadeDuration, setFadeDuration] = useState(1);
  const [gain, setGain] = useState(100);
  const [effectSpeed, setEffectSpeed] = useState(1);
  const [lowEq, setLowEq] = useState(0);
  const [midEq, setMidEq] = useState(0);
  const [highEq, setHighEq] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(30);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [dirty, setDirty] = useState(false);

  const syncSelection = useCallback((region: Region) => {
    setSelection({ start: region.start, end: region.end });
  }, []);

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
    workingHeadUrlRef.current = String(
      item.meta.editor_working_head_url || item.url || item.previewUrl || "",
    );
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
        const sourceHint = `${blob.type} ${durableUrl || "blank.wav"}`.toLowerCase();
        const isHighlyCompressed = /\.(mp3|m4a|aac|ogg|oga|opus|wma)(?:$|[?#])/.test(
          sourceHint,
        ) || /audio\/(mpeg|mp4|aac|ogg|opus)/.test(sourceHint);
        if (isHighlyCompressed && blob.size > MAX_COMPRESSED_AUDIO_BYTES) {
          throw new Error(
            tt("压缩音频解码后可能超过浏览器内存，请改用视频时间线处理长音频"),
          );
        }
        const context = new AudioContext();
        let decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
        await context.close();
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
      } catch (caught) {
        if (!disposed) {
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
    item.meta.editor_project_schema,
    item.meta.editor_project_url,
    item.previewUrl,
    item.title,
    item.url,
    siteId,
    syncSelection,
    tt,
  ]);

  const reloadWaveform = useCallback(async (next: AudioBuffer) => {
    const wave = waveRef.current;
    if (!wave) return;
    const nextUrl = URL.createObjectURL(encodeWav(next));
    const previousUrl = objectUrlRef.current;
    try {
      await wave.load(nextUrl);
      objectUrlRef.current = nextUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      wave.setPlaybackRate(speedRef.current);
      wave.zoom(zoomRef.current);
      regionsRef.current?.clearRegions();
      setSelection(null);
      setDuration(next.duration);
      setCurrentTime(0);
    } catch (caught) {
      URL.revokeObjectURL(nextUrl);
      throw caught;
    }
  }, []);

  const commit = useAudioMutations({
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
  });

  const importSource = useCallback(
    async (file: File) => {
      if (file.size > MAX_AUDIO_FILE_BYTES) {
        setError(tt("音频文件超过 128MB 安全上限"));
        return;
      }
      if (
        file.size > MAX_COMPRESSED_AUDIO_BYTES &&
        (/\.(mp3|m4a|aac|ogg|oga|opus|wma)$/i.test(file.name) ||
          /audio\/(mpeg|mp4|aac|ogg|opus)/i.test(file.type))
      ) {
        setError(tt("压缩音频解码后可能超过浏览器内存，请改用视频时间线处理长音频"));
        return;
      }
      setLoading(true);
      setError("");
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(
          (await file.arrayBuffer()).slice(0),
        );
        if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) {
          throw new Error(tt("音频解码后过大，请改用视频时间线处理长音频"));
        }
        const uploaded = await uploadFile(file, {
          siteId: siteId || "audio",
          title: file.name,
          registerAsset: false,
          idempotencyKey: `audio-source:${item.id}:${file.name}:${file.size}:${file.lastModified}`,
        });
        const sourceUrl = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !sourceUrl) {
          throw new Error(uploaded.error || tt("音频源上传失败"));
        }
        bufferRef.current = decoded;
        sourceUrlRef.current = sourceUrl;
        operationsRef.current = [];
        undoOperationsRef.current = [];
        redoOperationsRef.current = [];
        undoRef.current = [];
        redoRef.current = [];
        revisionRef.current += 1;
        setCanUndo(false);
        setCanRedo(false);
        setDirty(true);
        setSavedUrl("");
        await reloadWaveform(decoded);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : tt("音频导入失败"));
      } finally {
        await context.close().catch(() => undefined);
        setLoading(false);
      }
    },
    [item.id, reloadWaveform, siteId, tt],
  );

  const editSelection = useCallback(
    (mode: "crop" | "delete") => {
      if (!bufferRef.current || !selection) {
        setError(tt("请先在波形上拖选一个区间"));
        return;
      }
      void commit({
        type: mode,
        start: selection.start,
        end: selection.end,
      });
    },
    [commit, selection, tt],
  );

  const applyFade = useCallback(
    (edge: "in" | "out") => {
      const source = bufferRef.current;
      if (!source) return;
      const operation: AudioEditOperation = {
        type: "fade",
        edge,
        duration: fadeDuration,
        ...(selection
          ? { start: selection.start, end: selection.end }
          : {}),
      };
      void commit(operation);
    },
    [commit, fadeDuration, selection],
  );

  const applyGain = useCallback(() => {
    const source = bufferRef.current;
    if (!source) return;
    const operation: AudioEditOperation = {
      type: "gain",
      multiplier: gain / 100,
      ...(selection ? { start: selection.start, end: selection.end } : {}),
    };
    void commit(operation);
  }, [commit, gain, selection]);

  const applyEffectChain = useCallback(() => {
    const source = bufferRef.current;
    if (!source || !selection) {
      setError(tt("请先在波形上拖选要处理的区间"));
      return;
    }
    const operation: AudioEditOperation = {
      type: "effects",
      start: selection.start,
      end: selection.end,
      speed: effectSpeed,
      lowGainDb: lowEq,
      midGainDb: midEq,
      highGainDb: highEq,
    };
    void commit(operation);
  }, [commit, effectSpeed, highEq, lowEq, midEq, selection, tt]);

  const undo = useCallback(() => {
    const current = bufferRef.current;
    const previous = undoRef.current.pop();
    if (!previous || !current) return;
    redoRef.current = appendAudioHistory(
      redoRef.current,
      current,
      undoRef.current,
    );
    redoOperationsRef.current = redoRef.current.length
      ? [...redoOperationsRef.current, [...operationsRef.current]].slice(
          -redoRef.current.length,
        )
      : [];
    operationsRef.current = undoOperationsRef.current.pop() || [];
    revisionRef.current += 1;
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
    setDirty(true);
    setSavedUrl("");
    bufferRef.current = previous;
    setLoading(true);
    void reloadWaveform(previous)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : tt("撤销失败")),
      )
      .finally(() => setLoading(false));
  }, [reloadWaveform, tt]);

  const redo = useCallback(() => {
    const current = bufferRef.current;
    const next = redoRef.current.pop();
    if (!next || !current) return;
    undoRef.current = appendAudioHistory(
      undoRef.current,
      current,
      redoRef.current,
    );
    undoOperationsRef.current = undoRef.current.length
      ? [...undoOperationsRef.current, [...operationsRef.current]].slice(
          -undoRef.current.length,
        )
      : [];
    operationsRef.current = redoOperationsRef.current.pop() || [];
    revisionRef.current += 1;
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
    setDirty(true);
    setSavedUrl("");
    bufferRef.current = next;
    setLoading(true);
    void reloadWaveform(next)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : tt("重做失败")),
      )
      .finally(() => setLoading(false));
  }, [reloadWaveform, tt]);

  const download = useCallback(() => {
    const source = bufferRef.current;
    if (!source) return;
    const url = URL.createObjectURL(encodeWav(source));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.title || "oceanleo-audio"}-edited.wav`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [item.title]);

  const { save, captureRecovery, restoreRecovery } = useAudioPersistence({
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
  });

  return {
    containerRef,
    loading,
    saving,
    playing,
    error,
    savedUrl,
    duration,
    currentTime,
    selection,
    fadeDuration,
    setFadeDuration,
    gain,
    setGain,
    effectSpeed,
    setEffectSpeed,
    lowEq,
    setLowEq,
    midEq,
    setMidEq,
    highEq,
    setHighEq,
    speed,
    zoom,
    canUndo,
    canRedo,
    dirty,
    editRevision: revisionRef.current,
    playPause: () => {
      void waveRef.current?.playPause().catch(() => setError(tt("播放失败")));
    },
    stop: () => {
      waveRef.current?.pause();
      waveRef.current?.setTime(0);
    },
    setPlaybackSpeed: (value) => {
      speedRef.current = value;
      setSpeed(value);
      waveRef.current?.setPlaybackRate(value);
    },
    setWaveformZoom: (value) => {
      zoomRef.current = value;
      setZoom(value);
      waveRef.current?.zoom(value);
    },
    cropSelection: () => editSelection("crop"),
    deleteSelection: () => editSelection("delete"),
    applyFade,
    applyGain,
    applyEffectChain,
    undo,
    redo,
    importSource,
    download,
    save,
    captureRecovery,
    restoreRecovery,
  };
}
