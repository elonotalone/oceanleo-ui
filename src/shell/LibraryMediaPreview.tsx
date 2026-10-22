"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

interface PlayerState {
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
}

const IDLE_PLAYER: PlayerState = {
  playing: false,
  time: 0,
  duration: 0,
  volume: 1,
  muted: false,
};

/**
 * Keep the library panel mounted while releasing its inactive media stream.
 *
 * The player chrome is OceanLeo's own (play/pause, seek, time, volume, and
 * fullscreen for video). The browser's native controls are never used, so there
 * is no download / picture-in-picture / cast menu.
 */
export function LibraryMediaPreview({
  kind,
  src,
  className,
  onError,
}: {
  kind: "video" | "audio";
  src: string;
  className: string;
  onError: () => void;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const resumeTime = useRef<number | null>(null);
  const setMediaRef = useCallback((node: HTMLMediaElement | null) => {
    mediaRef.current = node;
  }, []);

  useEffect(() => {
    const media = mediaRef.current;
    const view = media?.ownerDocument.defaultView;
    if (!media || !view) return;
    const panel = media.closest("[data-workspace-slot-panel]");
    const release = () => {
      if (!media.hasAttribute("src")) return;
      // A second release during a reload must not replace the saved position
      // with the zero imposed by load().
      if (media.readyState >= 1 && Number.isFinite(media.currentTime)) {
        resumeTime.current = media.currentTime;
      }
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
    const restoreTime = () => {
      const saved = resumeTime.current;
      if (saved == null || !media.hasAttribute("src")) return;
      media.currentTime = Math.min(
        saved,
        Number.isFinite(media.duration) ? media.duration : saved,
      );
      resumeTime.current = null;
    };
    const sync = () => {
      if (panel && panel.getAttribute("data-workspace-slot-active") !== "true") {
        release();
        return;
      }
      if (media.getAttribute("src") !== src) {
        media.src = src;
        media.load();
      }
    };
    media.addEventListener("loadedmetadata", restoreTime);
    const observer = new view.MutationObserver(sync);
    if (panel) {
      observer.observe(panel, {
        attributes: true,
        attributeFilter: ["data-workspace-slot-active"],
      });
    }
    sync();
    return () => {
      observer.disconnect();
      media.removeEventListener("loadedmetadata", restoreTime);
      release();
    };
  }, [kind, src]);

  const handleError = () => {
    const media = mediaRef.current;
    if (media?.hasAttribute("src") && media.error) onError();
  };

  const tt = useUI();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [player, setPlayer] = useState<PlayerState>(IDLE_PLAYER);
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const read = () =>
      setPlayer({
        playing: !media.paused,
        time: Number.isFinite(media.currentTime) ? media.currentTime : 0,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        volume: Number.isFinite(media.volume) ? media.volume : 1,
        muted: Boolean(media.muted),
      });
    const events = [
      "timeupdate",
      "durationchange",
      "loadedmetadata",
      "play",
      "pause",
      "ended",
      "volumechange",
      "emptied",
    ];
    for (const name of events) media.addEventListener(name, read);
    read();
    return () => {
      for (const name of events) media.removeEventListener(name, read);
    };
  }, [kind, src]);

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media || !media.hasAttribute("src")) return;
    if (media.paused) {
      void Promise.resolve(media.play()).catch(() => undefined);
    } else {
      media.pause();
    }
  };
  const seek = (value: number) => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(value)) return;
    media.currentTime = value;
  };
  const setVolume = (value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = Math.min(1, Math.max(0, value));
    media.muted = value <= 0;
  };
  const toggleMute = () => {
    const media = mediaRef.current;
    if (media) media.muted = !media.muted;
  };
  const fullscreen = () => {
    const frame = frameRef.current;
    const doc = frame?.ownerDocument;
    if (!frame || !doc) return;
    if (doc.fullscreenElement) {
      void doc.exitFullscreen?.();
    } else {
      void frame.requestFullscreen?.();
    }
  };

  const mediaProps = {
    ref: setMediaRef,
    onError: handleError,
    preload: "metadata" as const,
    disableRemotePlayback: true,
    controlsList: "nodownload noremoteplayback noplaybackrate",
    onContextMenu: (event: { preventDefault: () => void }) =>
      event.preventDefault(),
  };
  const button =
    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-stone-700 hover:bg-stone-200/70 focus-visible:outline focus-visible:outline-2";
  const bar = (
    <div
      data-library-player-bar=""
      className="flex w-full items-center gap-2 rounded-lg bg-white/95 px-2 py-1 text-[11px] tabular-nums text-stone-600"
    >
      <button
        type="button"
        className={button}
        onClick={togglePlay}
        aria-label={player.playing ? tt("暂停") : tt("播放")}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          {player.playing ? (
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          ) : (
            <path d="M8 5l11 7-11 7z" />
          )}
        </svg>
      </button>
      <span className="w-9 shrink-0 text-right">{formatClock(player.time)}</span>
      <input
        type="range"
        aria-label={tt("播放进度")}
        className="min-w-0 flex-1 accent-stone-700"
        min={0}
        max={player.duration > 0 ? player.duration : 1}
        step="any"
        value={Math.min(player.time, player.duration > 0 ? player.duration : 1)}
        disabled={!(player.duration > 0)}
        onChange={(event) => seek(Number(event.currentTarget.value))}
      />
      <span className="w-9 shrink-0">{formatClock(player.duration)}</span>
      <button
        type="button"
        className={button}
        onClick={toggleMute}
        aria-label={player.muted ? tt("取消静音") : tt("静音")}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 9v6h4l5 4V5L8 9z" />
          {player.muted || player.volume === 0 ? (
            <path d="M17 9l4 6M21 9l-4 6" />
          ) : (
            <path d="M16 9a4 4 0 010 6" />
          )}
        </svg>
      </button>
      <input
        type="range"
        aria-label={tt("音量")}
        className="hidden w-16 shrink-0 accent-stone-700 sm:block"
        min={0}
        max={1}
        step={0.05}
        value={player.muted ? 0 : player.volume}
        onChange={(event) => setVolume(Number(event.currentTarget.value))}
      />
      {kind === "video" ? (
        <button
          type="button"
          className={button}
          onClick={fullscreen}
          aria-label={tt("全屏")}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      ) : null}
    </div>
  );

  return kind === "video" ? (
    <div
      ref={frameRef}
      data-library-player="video"
      className="flex max-w-full flex-col gap-2 bg-black/0"
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        {...mediaProps}
        className={className}
        playsInline
        disablePictureInPicture
        onClick={togglePlay}
      />
      {bar}
    </div>
  ) : (
    <div
      ref={frameRef}
      data-library-player="audio"
      className={`flex flex-col ${className}`}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio {...mediaProps} className="hidden" />
      {bar}
    </div>
  );
}
