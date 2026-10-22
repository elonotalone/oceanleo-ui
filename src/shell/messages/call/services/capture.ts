// 浏览器麦克风采集（字幕上行用，合同 §3.6）。
// 轨道来源，按顺序：
//   1. 引擎正在发布的本地麦克风轨道（仲裁 A-9：engine `getLocalMicTrack()`）→ clone 后用，只 stop 自己的 clone；
//      不新开采集、不弹第二次权限、和通话用的是同一个麦克风（含回声消除）。
//   2. 引擎没给（旧版本/还没发布）：对同一个设备（`useCall().me.micDeviceId`）另开一次 getUserMedia，
//      开回声消除——不然扬声器里别人的声音会被当成你的话再转写一遍。
//      iOS WebKit 上第二次采集会把通话本身的麦克风轨道静音，所以 iOS 不另开（抛 capture_unsupported）。
// PCM：AudioWorklet 把输入（多声道平均成单声道）按约 50 ms 一块送回主线程——处理器与它的端口接线在
// `src/lib/call-pcm-worklet.ts`（仲裁 A-26：消息目录里不收发 postMessage）；不支持 AudioWorklet
// （或模块加载被内容安全策略拦下）时回落 ScriptProcessorNode。重采样与分帧在主线程（pcm.ts）。
import { connectCallPcmWorklet, type CallPcmWorklet } from "../../../../lib/call-pcm-worklet";
import * as engine from "../engine";
import { downmixToMono } from "./pcm";
import type { CaptureHandle, CaptureRequest } from "./controller";

interface NavigatorLike {
  userAgent?: string;
  maxTouchPoints?: number;
}

/** iPhone / iPad（含桌面版 UA 的 iPadOS）上的 WebKit：一次只能有一个采集会话。 */
export function isIosWebKit(nav: NavigatorLike | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return /Macintosh/.test(ua) && Number(nav.maxTouchPoints ?? 0) > 1;
}

/** 引擎（A-9）给的本地麦克风轨道的 clone；引擎没有这个出口、没入会或轨道已结束 → null。 */
async function engineMicTrackClone(): Promise<MediaStreamTrack | null> {
  // 用计算属性名探测：W05 追加导出之前打包器也不会报「导出不存在」，之后自动生效。
  const name = "getLocalMicTrack";
  const getter = (engine as unknown as Record<string, unknown>)[name];
  if (typeof getter !== "function") return null;
  try {
    const track = (await (getter as () => Promise<MediaStreamTrack | null>)()) ?? null;
    if (!track || track.readyState !== "live") return null;
    return track.clone();
  } catch {
    return null;
  }
}

function deviceMissing(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  return name === "OverconstrainedError" || name === "NotFoundError";
}

/** 对同一个设备另开一次采集（开回声消除/降噪/自动增益）。指定设备不在了就用默认设备。 */
async function openOwnMicTrack(deviceId: string | null): Promise<MediaStreamTrack> {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media?.getUserMedia) throw new Error("capture_unsupported");
  const base: MediaTrackConstraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  let stream: MediaStream | null = null;
  if (deviceId && deviceId !== "default") {
    try {
      stream = await media.getUserMedia({ audio: { ...base, deviceId: { exact: deviceId } } });
    } catch (error) {
      if (!deviceMissing(error)) throw error;
    }
  }
  if (!stream) stream = await media.getUserMedia({ audio: base });
  const [track, ...rest] = stream.getAudioTracks();
  for (const extra of rest) extra.stop();
  for (const video of stream.getVideoTracks()) video.stop();
  if (!track) throw new Error("capture_unsupported");
  return track;
}

async function acquireTrack(deviceId: string | null): Promise<MediaStreamTrack> {
  const clone = await engineMicTrackClone();
  if (clone) return clone;
  if (isIosWebKit()) throw new Error("capture_unsupported");
  return openOwnMicTrack(deviceId);
}

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** 起一路采集；失败时把已拿到的轨道与音频上下文都收干净再抛。 */
export async function startBrowserMicCapture(request: CaptureRequest): Promise<CaptureHandle> {
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error("capture_unsupported");
  const track = await acquireTrack(request.deviceId);
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let worklet: CallPcmWorklet | null = null;
  let processor: ScriptProcessorNode | null = null;
  let stopped = false;
  const gestureEvents = ["pointerdown", "keydown"] as const;
  let resumeOnGesture: (() => void) | null = null;

  const onTrackEnded = () => {
    if (!stopped) request.onEnded();
  };

  function detachGesture(): void {
    if (!resumeOnGesture || typeof window === "undefined") return;
    for (const name of gestureEvents) window.removeEventListener(name, resumeOnGesture, true);
    resumeOnGesture = null;
  }

  function teardown(): void {
    stopped = true;
    detachGesture();
    track.removeEventListener("ended", onTrackEnded);
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    worklet?.dispose();
    if (processor) {
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    track.stop(); // 自己的 clone 或自己开的采集；引擎的原轨道从不在这里 stop
  }

  try {
    context = new Ctor();
    // 不等 resume()：没有用户手势时它会一直挂着。没跑起来就等下一次点击/按键再恢复。
    if (context.state !== "running") void context.resume().catch(() => undefined);
    const ctx = context;
    if (ctx.state !== "running" && typeof window !== "undefined") {
      resumeOnGesture = () => {
        void ctx.resume().then(
          () => {
            if (ctx.state === "running") detachGesture();
          },
          () => undefined,
        );
      };
      for (const name of gestureEvents) window.addEventListener(name, resumeOnGesture, true);
    }
    source = ctx.createMediaStreamSource(new MediaStream([track]));
    worklet = await connectCallPcmWorklet(ctx, source, (samples) => {
      if (!stopped) request.onSamples(samples);
    });
    if (!worklet) {
      // 回落：ScriptProcessorNode（已废弃但普遍可用）。
      if (typeof ctx.createScriptProcessor !== "function") throw new Error("capture_unsupported");
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer;
        const channels: Float32Array[] = [];
        for (let c = 0; c < input.numberOfChannels; c += 1) channels.push(input.getChannelData(c));
        const output = event.outputBuffer;
        for (let c = 0; c < output.numberOfChannels; c += 1) output.getChannelData(c).fill(0);
        if (stopped || channels.length === 0) return;
        request.onSamples(new Float32Array(downmixToMono(channels))); // 拷一份：输入缓冲会被复用
      };
      source.connect(node);
      node.connect(ctx.destination);
      processor = node;
    }
    track.addEventListener("ended", onTrackEnded);
    return {
      sampleRate: ctx.sampleRate,
      stop() {
        if (!stopped) teardown();
      },
    };
  } catch (error) {
    teardown();
    throw error;
  }
}
