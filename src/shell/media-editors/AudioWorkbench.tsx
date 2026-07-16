"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";
import { useUI } from "../../i18n/ui/useUI";
import { saveWorks, uploadFile } from "../../lib/database";
import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";

export interface AudioSelection {
  start: number;
  end: number;
}

export interface AudioWorkbenchState {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  loading: boolean;
  saving: boolean;
  playing: boolean;
  error: string;
  savedUrl: string;
  duration: number;
  currentTime: number;
  selection: AudioSelection | null;
  fadeDuration: number;
  setFadeDuration: Dispatch<SetStateAction<number>>;
  gain: number;
  setGain: Dispatch<SetStateAction<number>>;
  speed: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  playPause: () => void;
  stop: () => void;
  setPlaybackSpeed: (value: number) => void;
  setWaveformZoom: (value: number) => void;
  cropSelection: () => void;
  deleteSelection: () => void;
  applyFade: (edge: "in" | "out") => void;
  applyGain: () => void;
  undo: () => void;
  redo: () => void;
  importSource: (file: File) => Promise<void>;
  download: () => void;
  save: () => Promise<string | null>;
}

const MAX_AUDIO_FILE_BYTES = 128 * 1024 * 1024;
const MAX_COMPRESSED_AUDIO_BYTES = 48 * 1024 * 1024;
const MAX_DECODED_AUDIO_BYTES = 384 * 1024 * 1024;
const MAX_UNDO_AUDIO_BYTES = 256 * 1024 * 1024;

function audioBufferBytes(source: AudioBuffer): number {
  return source.length * source.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
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

function appendAudioHistory(
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

function copyAudioRange(source: AudioBuffer, start: number, end: number): AudioBuffer {
  const first = Math.max(0, Math.min(source.length, Math.floor(start * source.sampleRate)));
  const last = Math.max(first + 1, Math.min(source.length, Math.ceil(end * source.sampleRate)));
  const result = new AudioBuffer({
    length: last - first,
    numberOfChannels: source.numberOfChannels,
    sampleRate: source.sampleRate,
  });
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    result.copyToChannel(source.getChannelData(channel).subarray(first, last), channel);
  }
  return result;
}

function deleteAudioRange(source: AudioBuffer, start: number, end: number): AudioBuffer {
  const first = Math.max(0, Math.min(source.length, Math.floor(start * source.sampleRate)));
  const last = Math.max(first, Math.min(source.length, Math.ceil(end * source.sampleRate)));
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

function encodeWav(source: AudioBuffer): Blob {
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
      const sample = Math.max(-1, Math.min(1, source.getChannelData(channel)[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([storage], { type: "audio/wav" });
}

function formatTime(value: number): string {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function useAudioWorkbench(
  item: LibraryItem,
  siteId = "",
): AudioWorkbenchState {
  const tt = useUI();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
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
    if (!container) return;
    let disposed = false;
    const controller = new AbortController();
    let disableDrag: (() => void) | undefined;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const durableUrl = sourceUrl
          ? isFirstPartyMediaUrl(sourceUrl)
            ? sourceUrl
            : await importMediaUrl(sourceUrl, {
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
        const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
        await context.close();
        if (disposed) return;
        if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) {
          throw new Error(
            tt("音频解码后过大，请改用视频时间线处理长音频"),
          );
        }
        bufferRef.current = decoded;
        undoRef.current = [];
        redoRef.current = [];
        revisionRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
        setDirty(false);
        setSavedUrl("");
        setDuration(decoded.duration);
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        const regions = RegionsPluginClass.create();
        const wave = WaveSurferClass.create({
          container,
          url: objectUrl,
          plugins: [regions],
          height: 180,
          waveColor: "#a8a29e",
          progressColor: "#4f46e5",
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
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    };
  }, [item.previewUrl, item.title, item.url, siteId, syncSelection, tt]);

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

  const commit = useCallback(
    async (next: AudioBuffer, pushUndo = true) => {
      const current = bufferRef.current;
      if (!current) return;
      if (pushUndo) {
        undoRef.current = appendAudioHistory(undoRef.current, current);
        redoRef.current = [];
      }
      bufferRef.current = next;
      revisionRef.current += 1;
      setCanUndo(undoRef.current.length > 0);
      setCanRedo(false);
      setDirty(true);
      setSavedUrl("");
      setLoading(true);
      setError("");
      try {
        await reloadWaveform(next);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : tt("波形重建失败"));
      } finally {
        setLoading(false);
      }
    },
    [reloadWaveform, tt],
  );

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
        await commit(decoded);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : tt("音频导入失败"));
      } finally {
        await context.close().catch(() => undefined);
        setLoading(false);
      }
    },
    [commit, tt],
  );

  const editSelection = useCallback(
    (mode: "crop" | "delete") => {
      const source = bufferRef.current;
      if (!source || !selection) {
        setError(tt("请先在波形上拖选一个区间"));
        return;
      }
      const next =
        mode === "crop"
          ? copyAudioRange(source, selection.start, selection.end)
          : deleteAudioRange(source, selection.start, selection.end);
      void commit(next);
    },
    [commit, selection, tt],
  );

  const applyFade = useCallback(
    (edge: "in" | "out") => {
      const source = bufferRef.current;
      if (!source) return;
      const next = cloneAudioBuffer(source);
      const frames = Math.max(
        1,
        Math.min(next.length, Math.round(fadeDuration * next.sampleRate)),
      );
      for (let channel = 0; channel < next.numberOfChannels; channel += 1) {
        const samples = next.getChannelData(channel);
        for (let index = 0; index < frames; index += 1) {
          const envelope = frames === 1 ? 1 : index / (frames - 1);
          const target = edge === "in" ? index : next.length - 1 - index;
          samples[target] *= envelope;
        }
      }
      void commit(next);
    },
    [commit, fadeDuration],
  );

  const applyGain = useCallback(() => {
    const source = bufferRef.current;
    if (!source) return;
    const next = cloneAudioBuffer(source);
    const multiplier = gain / 100;
    for (let channel = 0; channel < next.numberOfChannels; channel += 1) {
      const samples = next.getChannelData(channel);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] *= multiplier;
      }
    }
    void commit(next);
  }, [commit, gain]);

  const undo = useCallback(() => {
    const current = bufferRef.current;
    const previous = undoRef.current.pop();
    if (!previous || !current) return;
    redoRef.current = appendAudioHistory(
      redoRef.current,
      current,
      undoRef.current,
    );
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

  const save = useCallback(async (): Promise<string | null> => {
    const source = bufferRef.current;
    if (!source || savingRef.current) return null;
    const savingRevision = revisionRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${item.title || tt("音频")}-${tt("编辑版")}`;
      const file = new File([encodeWav(source)], `${title}.wav`, {
        type: "audio/wav",
      });
      const uploaded = await uploadFile(file, { siteId: siteId || "audio", title });
      const url = uploaded.data?.file?.url || "";
      if (!uploaded.ok || !url) throw new Error(uploaded.error || tt("上传音频失败"));
      const saved = await saveWorks(siteId || "audio", [
        {
          url,
          media_type: "audio",
          title,
          kind: "audio",
          meta: { parent_asset_id: item.id, editor: "audio-v2" },
        },
      ]);
      if (!saved.ok || Number(saved.data?.saved || 0) !== 1) {
        throw new Error(saved.error || tt("登记到我的库失败"));
      }
      setSavedUrl(url);
      if (revisionRef.current === savingRevision) setDirty(false);
      return url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("保存到我的库失败"));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [item.id, item.title, siteId, tt]);

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
    speed,
    zoom,
    canUndo,
    canRedo,
    dirty,
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
    undo,
    redo,
    importSource,
    download,
    save,
  };
}

function AudioSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[11px] text-[var(--fg-2,#57534e)]">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--muted,#78716c)]">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent,#7c3aed)]"
      />
    </label>
  );
}

export function AudioControls({
  editor,
}: {
  editor: AudioWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const button = "rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] disabled:opacity-40";
  return (
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
      <section>
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("音频源")}
        </p>
        <label className={`${button} flex w-full cursor-pointer items-center justify-center`}>
          {tt("导入或替换音频")}
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.opus,.aac"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void editor.importSource(file);
              event.target.value = "";
            }}
          />
        </label>
      </section>
      <section>
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">{tt("播放")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className={button} onClick={editor.playPause}>
            {editor.playing ? tt("暂停") : tt("播放")}
          </button>
          <button type="button" className={button} onClick={editor.stop}>{tt("停止")}</button>
        </div>
        <div className="mt-3">
          <AudioSlider label={tt("试听速度")} value={editor.speed} min={0.5} max={2} step={0.1} suffix="×" onChange={editor.setPlaybackSpeed} />
        </div>
      </section>
      <section className="space-y-2.5 border-t border-[var(--border,#e7e5e4)] pt-3">
        <AudioSlider label={tt("波形缩放")} value={editor.zoom} min={10} max={200} suffix="px/s" onChange={editor.setWaveformZoom} />
      </section>
    </div>
  );
}

export function AudioStage({
  editor,
}: {
  editor: AudioWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto bg-[var(--surface,#f5f5f4)] p-6">
        <div className="mb-3 flex items-center justify-between text-[11px] text-[var(--muted,#78716c)]">
          <span className="tabular-nums">{formatTime(editor.currentTime)} / {formatTime(editor.duration)}</span>
          <span>
            {editor.selection
              ? tt("选区：{start} – {end}", {
                  start: formatTime(editor.selection.start),
                  end: formatTime(editor.selection.end),
                })
              : tt("未选择区间")}
          </span>
        </div>
        <div className="relative rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-6 shadow-sm">
          {editor.loading && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--card,#fff)]/80 text-[12px] text-[var(--muted,#78716c)]">{tt("正在处理音频…")}</div>}
          <div ref={editor.containerRef} className="min-h-44 w-full" />
        </div>
      </div>
    </div>
  );
}

export interface AudioWorkbenchProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
  onSaved?: (url: string) => void;
}

export function AudioWorkbench({
  item,
  siteId = "",
  accent = "#4f46e5",
  onSaved,
}: AudioWorkbenchProps) {
  const editor = useAudioWorkbench(item, siteId);
  const notifiedRef = useRef("");
  useEffect(() => {
    if (editor.savedUrl && editor.savedUrl !== notifiedRef.current) {
      notifiedRef.current = editor.savedUrl;
      onSaved?.(editor.savedUrl);
    }
  }, [editor.savedUrl, onSaved]);
  return (
    <div className="flex h-full min-h-0 bg-[var(--card,#fff)]">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--border,#e7e5e4)]">
        <AudioControls editor={editor} accent={accent} />
      </div>
      <div className="min-w-0 flex-1">
        <AudioStage editor={editor} accent={accent} />
      </div>
    </div>
  );
}
