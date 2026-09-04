/**
 * waveform-playlist 命令表。只发它认识的 ee 事件，不新写波形/多轨引擎。
 *
 * 库有：trim（保留选区）、fadein/fadeout、mute、volumechange、newtrack、
 * play/pause/stop、zoomin/zoomout、startaudiorendering。
 * 库没有 cut/split：删除选区由调用方用既有 `audio-operations` 的 delete
 * 处理完再 `load()`，本模块只算出起止秒。
 */
export const AUDIO_PLAYLIST_L1_IDS = [
  "crop",
  "delete",
  "fade-in",
  "fade-out",
  "apply-gain",
  "mute",
  "split",
  "add-track",
] as const;

export type AudioPlaylistL1Id = (typeof AUDIO_PLAYLIST_L1_IDS)[number];

export interface AudioPlaylistSelection {
  start: number;
  end: number;
}

export interface AudioPlaylistPort {
  emit(event: string, ...args: unknown[]): void;
  getDuration(): number;
  getCurrentTime(): number;
  getTimeSelection(): AudioPlaylistSelection;
  trackCount(): number;
}

export type AudioPlaylistCommandResult =
  | { ok: true; event: string; args: unknown[] }
  | { ok: true; action: "delete-range"; start: number; end: number }
  | { ok: false; reason: string };

export function playlistHasSelection(
  selection: AudioPlaylistSelection,
): boolean {
  return (
    Number.isFinite(selection.start) &&
    Number.isFinite(selection.end) &&
    selection.end > selection.start
  );
}

/**
 * 删掉 [start, end) 之后要保留的窗口。给调用方去拼 buffer，本函数不算采样。
 */
export function keepWindowsAfterCut(
  duration: number,
  start: number,
  end: number,
): AudioPlaylistSelection[] {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return [];
  }
  const from = Math.max(0, Math.min(start, duration));
  const to = Math.max(0, Math.min(end, duration));
  const keep: AudioPlaylistSelection[] = [];
  if (from > 0) keep.push({ start: 0, end: from });
  if (to < duration) keep.push({ start: to, end: duration });
  return keep;
}

export function runAudioPlaylistCommand(
  port: AudioPlaylistPort,
  id: string,
  params: Record<string, unknown> = {},
): AudioPlaylistCommandResult {
  const duration = port.getDuration();
  const selection = port.getTimeSelection();
  switch (id) {
    case "play":
      port.emit("play");
      return { ok: true, event: "play", args: [] };
    case "pause":
      port.emit("pause");
      return { ok: true, event: "pause", args: [] };
    case "stop":
      port.emit("stop");
      return { ok: true, event: "stop", args: [] };
    case "split":
      port.emit("statechange", "select");
      return { ok: true, event: "statechange", args: ["select"] };
    case "crop": {
      if (!playlistHasSelection(selection)) {
        return { ok: false, reason: "先在波形上选出要保留的一段。" };
      }
      port.emit("trim");
      return { ok: true, event: "trim", args: [] };
    }
    case "delete": {
      const start =
        typeof params.startSeconds === "number"
          ? params.startSeconds
          : selection.start;
      const end =
        typeof params.endSeconds === "number"
          ? params.endSeconds
          : selection.end;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return { ok: false, reason: "先选出要删的一段，或给出起止秒数。" };
      }
      if (duration > 0 && (start < 0 || end > duration + 0.05)) {
        return {
          ok: false,
          reason: `这一段超出了当前音频（${Math.round(duration * 100) / 100} 秒）。`,
        };
      }
      return { ok: true, action: "delete-range", start, end };
    }
    case "fade-in": {
      const fade =
        typeof params.duration === "number" ? params.duration : 1;
      port.emit("fadein", fade);
      return { ok: true, event: "fadein", args: [fade] };
    }
    case "fade-out": {
      const fade =
        typeof params.duration === "number" ? params.duration : 1;
      port.emit("fadeout", fade);
      return { ok: true, event: "fadeout", args: [fade] };
    }
    case "apply-gain":
    case "gain": {
      const percent =
        typeof params.percent === "number" ? params.percent : 100;
      port.emit("volumechange", percent);
      return { ok: true, event: "volumechange", args: [percent] };
    }
    case "mute":
      port.emit("mute");
      return { ok: true, event: "mute", args: [] };
    case "add-track": {
      const file = params.file;
      if (!file) return { ok: false, reason: "没有要加进时间线的音频文件。" };
      port.emit("newtrack", file);
      return { ok: true, event: "newtrack", args: [file] };
    }
    case "zoomin":
      port.emit("zoomin");
      return { ok: true, event: "zoomin", args: [] };
    case "zoomout":
      port.emit("zoomout");
      return { ok: true, event: "zoomout", args: [] };
    case "render-wav":
      port.emit("startaudiorendering", "wav");
      return { ok: true, event: "startaudiorendering", args: ["wav"] };
    default:
      return { ok: false, reason: `音频内核没有这条命令：${id}` };
  }
}
