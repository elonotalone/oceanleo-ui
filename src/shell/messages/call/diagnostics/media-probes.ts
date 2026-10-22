// 「通话检测」面板用的浏览器探针：设备列表、权限状态、麦克风音量条（独立 getUserMedia）、
// 扬声器试音（Web Audio 合成，`setSinkId` 可用时选输出设备）、摄像头预览。
// 每个探针都返回 stop()；面板关闭或切换设备时必须调用，释放设备与 AudioContext。
import type { MediaDeviceLite } from "../engine";
import type { PermissionStateLite } from "./report";

export interface DeviceLists {
  microphones: MediaDeviceLite[];
  cameras: MediaDeviceLite[];
  speakers: MediaDeviceLite[];
}

export type MediaErrorCode = "permission" | "not_found" | "busy" | "unsupported" | "failed";

/** getUserMedia 的异常 → 固定几种原因。 */
export function mediaErrorCode(error: unknown): MediaErrorCode {
  const name = ((error ?? {}) as { name?: unknown }).name;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "not_found";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "TypeError":
    case "NotSupportedError":
      return "unsupported";
    default:
      return "failed";
  }
}

export function mediaErrorText(device: "mic" | "camera", code: MediaErrorCode): string {
  if (device === "mic") {
    switch (code) {
      case "permission":
        return "浏览器没有允许使用麦克风。";
      case "not_found":
        return "没有找到麦克风。";
      case "busy":
        return "麦克风被其他程序占用，或者无法打开。";
      case "unsupported":
        return "这个浏览器不能使用麦克风。";
      default:
        return "打不开麦克风。";
    }
  }
  switch (code) {
    case "permission":
      return "浏览器没有允许使用摄像头。";
    case "not_found":
      return "没有找到摄像头。";
    case "busy":
      return "摄像头被其他程序占用，或者无法打开。";
    case "unsupported":
      return "这个浏览器不能使用摄像头。";
    default:
      return "打不开摄像头。";
  }
}

function mediaDevices(): MediaDevices | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return null;
  return navigator.mediaDevices;
}

/** 枚举设备并按类分好；同一 deviceId 只留一个，空 deviceId（未授权时 Safari/Firefox 会给）丢掉。 */
export function splitDevices(list: ReadonlyArray<Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">>): DeviceLists {
  const out: DeviceLists = { microphones: [], cameras: [], speakers: [] };
  const seen = new Set<string>();
  for (const device of list) {
    if (!device.deviceId) continue;
    const key = `${device.kind}:${device.deviceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lite = { deviceId: device.deviceId, label: device.label || "" };
    if (device.kind === "audioinput") out.microphones.push(lite);
    else if (device.kind === "videoinput") out.cameras.push(lite);
    else if (device.kind === "audiooutput") out.speakers.push(lite);
  }
  return out;
}

export async function listMediaDevices(): Promise<DeviceLists> {
  const md = mediaDevices();
  if (!md?.enumerateDevices) return { microphones: [], cameras: [], speakers: [] };
  try {
    return splitDevices(await md.enumerateDevices());
  } catch {
    return { microphones: [], cameras: [], speakers: [] };
  }
}

export async function queryPermission(name: "microphone" | "camera"): Promise<PermissionStateLite> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
    const value = status.state;
    return value === "granted" || value === "denied" || value === "prompt" ? value : "unknown";
  } catch {
    return "unknown";
  }
}

/** 均方根 → 0–1 音量（-60 dB 以下算 0，0 dB 算 1）。 */
export function levelFromRms(rms: number): number {
  if (!(rms > 0) || !Number.isFinite(rms)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export function rmsOf(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export interface MicMeter {
  /** 实际打开的设备（getSettings().deviceId）。 */
  deviceId: string | null;
  label: string;
  stop(): void;
}

/** 麦克风音量条：独立 getUserMedia（指定设备），约每 50 ms 回调一次 0–1 音量。 */
export async function startMicMeter(deviceId: string | null, onLevel: (level: number) => void): Promise<MicMeter> {
  const md = mediaDevices();
  const Ctor = audioContextCtor();
  if (!md?.getUserMedia || !Ctor) throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
  const stream = await md.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false });
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
  try {
    ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      onLevel(levelFromRms(rmsOf(buffer)));
    }, 50);
  } catch (error) {
    stopTracks();
    void ctx?.close().catch(() => undefined);
    throw error;
  }
  const track = stream.getAudioTracks()[0];
  let stopped = false;
  return {
    deviceId: track?.getSettings?.().deviceId ?? deviceId,
    label: track?.label ?? "",
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearInterval(timer);
      stopTracks();
      void ctx?.close().catch(() => undefined);
      onLevel(0);
    },
  };
}

/** 能否选扬声器（媒体元素的 `setSinkId`）。 */
export function supportsSinkSelection(): boolean {
  return typeof HTMLMediaElement !== "undefined" && typeof HTMLMediaElement.prototype.setSinkId === "function";
}

export interface ChimeNote {
  frequency: number;
  /** 相对开始的秒数。 */
  start: number;
  duration: number;
}

/** 试音：上行三音（C5、E5、G5）再落回 C6，约 1.6 秒；纯函数，便于单测。 */
export function chimeNotes(): ChimeNote[] {
  return [
    { frequency: 523.25, start: 0, duration: 0.45 },
    { frequency: 659.25, start: 0.28, duration: 0.45 },
    { frequency: 783.99, start: 0.56, duration: 0.5 },
    { frequency: 1046.5, start: 0.9, duration: 0.7 },
  ];
}

export function chimeDurationSec(notes: ChimeNote[] = chimeNotes()): number {
  return notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
}

export interface SoundPlayback {
  /** 播放结束（或被停止）时 resolve。 */
  done: Promise<void>;
  stop(): void;
}

/**
 * 用 Web Audio 合成一段提示音并播放；给了 sinkId 且浏览器支持时，经 MediaStream → <audio>.setSinkId 输出到选中的扬声器。
 */
export async function playTestSound(sinkId: string | null): Promise<SoundPlayback> {
  const Ctor = audioContextCtor();
  if (!Ctor) throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
  const ctx = new Ctor();
  let audioEl: HTMLAudioElement | null = null;
  let output: AudioNode = ctx.destination;
  try {
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    if (sinkId && supportsSinkSelection()) {
      const dest = ctx.createMediaStreamDestination();
      audioEl = new Audio();
      audioEl.srcObject = dest.stream;
      await audioEl.setSinkId(sinkId);
      await audioEl.play();
      output = dest;
    }
    const master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(output);
    const t0 = ctx.currentTime + 0.05;
    for (const note of chimeNotes()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, t0 + note.start);
      gain.gain.exponentialRampToValueAtTime(1, t0 + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.start + note.duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0 + note.start);
      osc.stop(t0 + note.start + note.duration + 0.05);
    }
  } catch (error) {
    audioEl?.pause();
    if (audioEl) audioEl.srcObject = null;
    void ctx.close().catch(() => undefined);
    throw error;
  }
  let stopped = false;
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    audioEl?.pause();
    if (audioEl) audioEl.srcObject = null;
    void ctx.close().catch(() => undefined);
    finish();
  };
  const timer = setTimeout(cleanup, Math.ceil((chimeDurationSec() + 0.3) * 1000));
  return { done, stop: cleanup };
}

export interface CameraPreview {
  deviceId: string | null;
  label: string;
  stop(): void;
}

/** 摄像头本地预览（独立 getUserMedia，指定设备）。 */
export async function startCameraPreview(deviceId: string | null, video: HTMLVideoElement): Promise<CameraPreview> {
  const md = mediaDevices();
  if (!md?.getUserMedia) throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
  const size = { width: { ideal: 640 }, height: { ideal: 360 } };
  const stream = await md.getUserMedia({
    audio: false,
    video: deviceId ? { ...size, deviceId: { exact: deviceId } } : size,
  });
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  const track = stream.getVideoTracks()[0];
  let stopped = false;
  return {
    deviceId: track?.getSettings?.().deviceId ?? deviceId,
    label: track?.label ?? "",
    stop() {
      if (stopped) return;
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      if (video.srcObject === stream) video.srcObject = null;
    },
  };
}
