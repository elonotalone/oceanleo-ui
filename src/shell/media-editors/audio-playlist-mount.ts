/// <reference path="./waveform-playlist.d.ts" />
/**
 * 浏览器里真正拉起 waveform-playlist。测试不 import 本文件。
 *
 * 上面的三斜线引用不是装饰：`waveform-playlist` 没有类型，声明在旁边的
 * ambient `.d.ts` 里。本仓 tsconfig `include: src/**` 能自己带上它，但消费站在
 * LeoDev 预览里是把本仓**软链**进 node_modules 的，realpath 落在 node_modules 之外，
 * TS 把这里当项目源码来查，而消费站的 include 不含本仓的 .d.ts —— 于是
 * `next build` 在 travel 上报 TS7016（2026-09-04 实测）。显式引用让任何把本文件
 * 拉进程序的 tsconfig 都能看到那份声明。
 */
import { AUDIO_WAVE_PALETTE } from "./audio-project-carrier";
import type { AudioPlaylistPort } from "./audio-playlist-engine";

export interface PlaylistTrackSpec {
  src: Blob | File | string;
  name: string;
  start?: number;
}

type PlaylistHandle = {
  ee: { emit: (event: string, ...args: unknown[]) => void };
  load: (tracks: PlaylistTrackSpec[]) => Promise<unknown>;
  getDuration: () => number;
  getCurrentTime: () => number;
  getTimeSelection: () => { start: number; end: number };
  getActiveTrack?: () => unknown;
  tracks?: unknown[];
  duration?: number;
};

function resolveInit(mod: Record<string, unknown>): ((opts: object) => PlaylistHandle) | null {
  const named = mod.init;
  if (typeof named === "function") {
    return named as (opts: object) => PlaylistHandle;
  }
  const def = mod.default as Record<string, unknown> | ((opts: object) => PlaylistHandle);
  if (typeof def === "function") return def;
  if (def && typeof def.init === "function") {
    return def.init as (opts: object) => PlaylistHandle;
  }
  return null;
}

export async function mountWaveformPlaylist(
  container: HTMLElement,
  tracks: PlaylistTrackSpec[],
): Promise<AudioPlaylistPort & { raw: PlaylistHandle }> {
  const mod = (await import("waveform-playlist")) as Record<string, unknown>;
  const init = resolveInit(mod);
  if (!init) {
    throw new Error("waveform-playlist 没有 init。");
  }
  const playlist = init({
    container,
    samplesPerPixel: 1024,
    zoomLevels: [512, 1024, 2048, 4096],
    timescale: true,
    waveHeight: 72,
    controls: { show: false, width: 0 },
    colors: {
      waveOutlineColor: AUDIO_WAVE_PALETTE["wave.body"].value,
      timeColor: AUDIO_WAVE_PALETTE["wave.grid"].value,
      fadeColor: AUDIO_WAVE_PALETTE["wave.selection"].value,
    },
    state: "select",
    isAutomaticScroll: true,
    mono: true,
  });
  if (tracks.length > 0) {
    await playlist.load(tracks);
  }
  const activeTrack = () => {
    if (typeof playlist.getActiveTrack === "function") {
      return playlist.getActiveTrack();
    }
    return Array.isArray(playlist.tracks) ? playlist.tracks[0] : undefined;
  };
  const port: AudioPlaylistPort & { raw: PlaylistHandle } = {
    raw: playlist,
    emit(event: string, ...args: unknown[]) {
      const track = activeTrack();
      if (
        (event === "mute" ||
          event === "fadein" ||
          event === "fadeout" ||
          event === "volumechange") &&
        track !== undefined
      ) {
        if (event === "volumechange") {
          playlist.ee.emit(event, args[0], track);
          return;
        }
        if (event === "mute") {
          playlist.ee.emit(event, track);
          return;
        }
        playlist.ee.emit(event, args[0], track);
        return;
      }
      playlist.ee.emit(event, ...args);
    },
    getDuration() {
      if (typeof playlist.getDuration === "function") {
        return Number(playlist.getDuration()) || 0;
      }
      return Number(playlist.duration) || 0;
    },
    getCurrentTime() {
      if (typeof playlist.getCurrentTime === "function") {
        return Number(playlist.getCurrentTime()) || 0;
      }
      return 0;
    },
    getTimeSelection() {
      if (typeof playlist.getTimeSelection === "function") {
        const sel = playlist.getTimeSelection();
        return { start: Number(sel.start) || 0, end: Number(sel.end) || 0 };
      }
      return { start: 0, end: 0 };
    },
    trackCount() {
      return Array.isArray(playlist.tracks) ? playlist.tracks.length : 0;
    },
  };
  return port;
}
