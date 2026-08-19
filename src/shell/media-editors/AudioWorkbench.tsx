"use client";

import { useCallback, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";
import { useUI } from "../../i18n/ui/useUI";
import { uploadFile } from "../../lib/database";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";
import type { AudioEditOperation } from "./audio-operations";
import type {
  AudioSelection,
  AudioWorkbenchState,
} from "./audio-workbench-state";
import {
  appendAudioHistory,
  audioBufferBytes,
  AUDIO_PROJECT_SCHEMA,
  encodeWav,
  MAX_AUDIO_FILE_BYTES,
  MAX_COMPRESSED_AUDIO_BYTES,
  MAX_DECODED_AUDIO_BYTES,
} from "./audio-workbench-utils";
import { assertBlobSource } from "./source-integrity.mjs";
import { useAudioMutations } from "./use-audio-mutations";
import { useAudioPersistence } from "./use-audio-persistence";
import { useAudioWaveLoader } from "./use-audio-wave-loader";

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
  const workingHeadUrlRef = useRef(
    String(item.meta.editor_working_head_url || ""),
  );
  const objectUrlRef = useRef("");
  const undoRef = useRef<AudioBuffer[]>([]);
  const redoRef = useRef<AudioBuffer[]>([]);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const speedRef = useRef(1);
  const zoomRef = useRef(30);
  const volumeRef = useRef(100);
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
  const [volume, setVolumeState] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const requiresExistingSource =
    item.source === "artifact" ||
    isDurableLibraryItem(item) ||
    item.meta.editor_project_schema === AUDIO_PROJECT_SCHEMA;

  const syncSelection = useCallback((region: Region) => {
    setSelection({ start: region.start, end: region.end });
  }, []);

  useAudioWaveLoader({
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
  });

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
      setLoading(true);
      setError("");
      let context: AudioContext | null = null;
      try {
        context = new AudioContext();
        const sourceFormat = await assertBlobSource(file, "audio");
        if (
          file.size > MAX_COMPRESSED_AUDIO_BYTES &&
          ["mp3", "mp4", "aac", "ogg"].includes(sourceFormat)
        ) {
          throw new Error(
            tt("压缩音频解码后可能超过浏览器内存，请改用视频时间线处理长音频"),
          );
        }
        let decoded: AudioBuffer;
        try {
          decoded = await context.decodeAudioData(
            (await file.arrayBuffer()).slice(0),
          );
        } catch {
          throw new Error(
            tt("音频源虽有正确容器签名，但没有浏览器可解码的音轨"),
          );
        }
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
        await reloadWaveform(decoded);
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
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : tt("音频导入失败"));
      } finally {
        await context?.close().catch(() => undefined);
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

  /**
   * 按明确时间段裁剪或删除。
   *
   * `cropSelection`/`deleteSelection` 只认波形上拖出来的选区，agent 拿不到鼠标；
   * 这条允许直接给起止秒数，越界的自动夹到音频长度内，太短的直接拒绝。
   */
  const editRange = useCallback(
    async (
      mode: "crop" | "delete",
      start: number,
      end: number,
    ): Promise<boolean> => {
      const source = bufferRef.current;
      if (!source) {
        setError(tt("音频还没载入，没法裁剪"));
        return false;
      }
      const total = source.duration;
      const from = Math.max(0, Math.min(total, Math.min(start, end)));
      const to = Math.max(0, Math.min(total, Math.max(start, end)));
      if (to - from < 0.01) {
        setError(tt("这个时间段太短了，至少要 0.01 秒"));
        return false;
      }
      if (mode === "crop" && to - from >= total) {
        setError(tt("这个时间段就是整段音频，裁了等于没裁"));
        return false;
      }
      return commit({ type: mode, start: from, end: to });
    },
    [commit, tt],
  );

  /** 按倍数调音量；不给区间就是整段。 */
  const applyGainRange = useCallback(
    async (
      percent: number,
      range?: { start: number; end: number } | null,
    ): Promise<boolean> => {
      const source = bufferRef.current;
      if (!source) {
        setError(tt("音频还没载入，没法调音量"));
        return false;
      }
      const total = source.duration;
      return commit({
        type: "gain",
        multiplier: percent / 100,
        ...(range
          ? {
              start: Math.max(0, Math.min(total, Math.min(range.start, range.end))),
              end: Math.max(0, Math.min(total, Math.max(range.start, range.end))),
            }
          : {}),
      });
    },
    [commit, tt],
  );

  /** 当前编辑结果的 WAV 字节；要转 mp3/m4a 的调用方从这里拿源。 */
  const wavBlob = useCallback(
    () => (bufferRef.current ? encodeWav(bufferRef.current) : null),
    [],
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
    requiresExistingSource,
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
    volume,
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
    // §2.3：跳转与音量都要能不靠指针完成，这两个入口由带 range 控件的
    // 键盘可达 UI 驱动（AudioWorkbenchView 的「播放位置」「音量」两条）。
    seekTo: (seconds) => {
      const wave = waveRef.current;
      if (!wave) return;
      const total = wave.getDuration() || 0;
      const target = Math.max(0, Math.min(total, seconds));
      wave.setTime(target);
      setCurrentTime(target);
    },
    setVolume: (value) => {
      const clamped = Math.max(0, Math.min(100, value));
      volumeRef.current = clamped;
      setVolumeState(clamped);
      waveRef.current?.setVolume(clamped / 100);
    },
    cropSelection: () => editSelection("crop"),
    deleteSelection: () => editSelection("delete"),
    editRange,
    applyGainRange,
    wavBlob,
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
