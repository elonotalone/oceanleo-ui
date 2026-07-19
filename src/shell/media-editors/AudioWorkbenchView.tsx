"use client";

import { useEffect, useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type {
  AudioWorkbenchProps,
  AudioWorkbenchState,
} from "./audio-workbench-state";
import { formatAudioTime } from "./audio-workbench-utils";
import { useAudioWorkbench } from "./AudioWorkbench";

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
        <span className="tabular-nums text-[var(--muted,#78716c)]">
          {value}
          {suffix}
        </span>
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

type AudioToolIconName = "import" | "play" | "pause" | "stop";

function AudioToolIcon({ name }: { name: AudioToolIconName }) {
  if (name === "import") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
        <path
          d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "stop") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M6.5 6.5h11v11h-11z" />
      </svg>
    );
  }
  if (name === "pause") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M6.5 5.5h4v13h-4zm7 0h4v13h-4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 5.2v13.6L19 12z" />
    </svg>
  );
}

function AudioIconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: AudioToolIconName;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] disabled:opacity-40"
    >
      <AudioToolIcon name={icon} />
    </button>
  );
}

export function AudioControls({
  editor,
}: {
  editor: AudioWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  return (
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
      <section>
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("音频源")}
        </p>
        <label
          title={tt("导入或替换音频")}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
        >
          <AudioToolIcon name="import" />
          <span className="sr-only">{tt("导入或替换音频")}</span>
          <input
            type="file"
            aria-label={tt("导入或替换音频")}
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
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("播放")}
        </p>
        <div className="flex items-center gap-1.5">
          <AudioIconButton
            label={editor.playing ? tt("暂停") : tt("播放")}
            icon={editor.playing ? "pause" : "play"}
            disabled={editor.loading || Boolean(editor.error)}
            onClick={editor.playPause}
          />
          <AudioIconButton
            label={tt("停止")}
            icon="stop"
            disabled={editor.loading || Boolean(editor.error)}
            onClick={editor.stop}
          />
        </div>
        <div className="mt-3">
          <AudioSlider
            label={tt("试听速度")}
            value={editor.speed}
            min={0.5}
            max={2}
            step={0.1}
            suffix="×"
            onChange={editor.setPlaybackSpeed}
          />
        </div>
      </section>
      <section className="space-y-2.5 border-t border-[var(--border,#e7e5e4)] pt-3">
        <AudioSlider
          label={tt("波形缩放")}
          value={editor.zoom}
          min={10}
          max={200}
          suffix="px/s"
          onChange={editor.setWaveformZoom}
        />
      </section>
    </div>
  );
}

export function AudioStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: AudioWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto bg-[var(--surface,#f5f5f4)] p-6">
        <div className="mb-3 flex items-center justify-between text-[11px] text-[var(--muted,#78716c)]">
          <span className="tabular-nums">
            {formatAudioTime(editor.currentTime)} /{" "}
            {formatAudioTime(editor.duration)}
          </span>
          <span>
            {editor.selection
              ? tt("选区：{start} – {end}", {
                  start: formatAudioTime(editor.selection.start),
                  end: formatAudioTime(editor.selection.end),
                })
              : tt("未选择区间")}
          </span>
        </div>
        <div className="relative rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-6 shadow-sm">
          {editor.loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--card,#fff)]/80 text-[12px] text-[var(--muted,#78716c)]">
              {tt("正在处理音频…")}
            </div>
          )}
          <div ref={editor.containerRef} className="min-h-44 w-full" />
          <button
            type="button"
            aria-label={editor.playing ? tt("暂停") : tt("播放")}
            title={editor.playing ? tt("暂停") : tt("播放")}
            disabled={editor.loading || Boolean(editor.error)}
            onClick={editor.playPause}
            className="absolute left-1/2 top-1/2 z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: accent }}
          >
            {editor.playing ? (
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6.5 5.5h4v13h-4zm7 0h4v13h-4z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="ml-0.5 h-7 w-7"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5.2v13.6L19 12z" />
              </svg>
            )}
          </button>
        </div>
        {editor.error && (
          <p className="mt-3 text-center text-[12px] text-red-600">
            {editor.error}
          </p>
        )}
      </div>
    </div>
  );
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
