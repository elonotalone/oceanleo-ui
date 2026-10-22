// 字幕上行的编排：上行状态机（uplink.ts）+ 麦克风采集（capture.ts）+ 重采样分帧（pcm.ts）。
// 纯 TS：采集与流水线都经依赖注入，单测用假采集器断言「何时开采集、何时停、换设备重开、帧送到上行」。
//
// 采集只在 uplink.capturing() 为真时跑（要转写、在通话里、开着麦、服务端没说转写已关）：
// 静音即停采集（不在用户静音时占着麦克风），开麦重开；换麦克风设备重开；
// 采集失败（权限、设备忙、这台设备不支持另开采集）不原地死循环：等下一次开麦或换设备再试；
// 采集轨道自己结束（引擎换轨道、拔设备）先立刻再开一次，再结束才判失败。
import { createCaptionsPcmPipeline, type CaptionsPcmPipeline } from "./pcm";
import type { CaptionsCaptureState } from "./types";
import type { CaptionsUplink, UplinkStatus, UplinkTarget } from "./uplink";

export interface CaptureHandle {
  /** 采集端（AudioContext）的采样率。 */
  readonly sampleRate: number;
  stop(): void;
}

export interface CaptureRequest {
  deviceId: string | null;
  onSamples(samples: Float32Array): void;
  /** 采集轨道自己结束了（拔设备、系统收回权限）。 */
  onEnded(): void;
}

export type CaptureStarter = (request: CaptureRequest) => Promise<CaptureHandle>;

export interface CaptionsTarget extends UplinkTarget {
  /** 引擎当前用的麦克风设备（`useCall().me.micDeviceId`）。 */
  micDeviceId: string | null;
}

export interface CaptionsControllerDeps {
  uplink: CaptionsUplink;
  startCapture: CaptureStarter;
  onUplink?(status: UplinkStatus): void;
  onCapture?(state: CaptionsCaptureState): void;
  createPipeline?(inputRate: number, outputRate: number): CaptionsPcmPipeline;
}

export interface CaptionsController {
  update(target: CaptionsTarget): void;
  captureState(): CaptionsCaptureState;
  dispose(): void;
}

const IDLE: CaptionsTarget = {
  callId: null,
  participantId: null,
  inCall: false,
  transcription: false,
  mic: false,
  micDeviceId: null,
};

/** 采集失败的原因 → 状态：这台设备不另开采集 = unsupported，其余 = failed。 */
export function captureFailureState(error: unknown): CaptionsCaptureState {
  const code = error instanceof Error ? error.message : String(error ?? "");
  return code === "capture_unsupported" ? "unsupported" : "failed";
}

export function createCaptionsController(deps: CaptionsControllerDeps): CaptionsController {
  const makePipeline = deps.createPipeline ?? ((inputRate: number, outputRate: number) => createCaptionsPcmPipeline(inputRate, outputRate));
  let target: CaptionsTarget = IDLE;
  let capture: CaptureHandle | null = null;
  let captureKey: string | null = null;
  let captureGeneration = 0;
  let starting = false;
  let failedKey: string | null = null;
  /** 这个 key 的采集自己结束过一次（允许立刻再开一次）。 */
  let endedKey: string | null = null;
  let pipeline: CaptionsPcmPipeline | null = null;
  let captureState: CaptionsCaptureState = "off";
  let disposed = false;

  function setCaptureState(next: CaptionsCaptureState): void {
    if (captureState === next) return;
    captureState = next;
    deps.onCapture?.(next);
  }

  function keyFor(t: CaptionsTarget): string {
    return `${t.callId ?? ""}\u0000${t.participantId ?? ""}\u0000${t.micDeviceId ?? ""}`;
  }

  function ensurePipeline(): void {
    if (!capture) return;
    const outputRate = deps.uplink.status().sampleRate;
    if (!pipeline || pipeline.inputRate !== capture.sampleRate || pipeline.outputRate !== outputRate) {
      try {
        pipeline = makePipeline(capture.sampleRate, outputRate);
      } catch {
        pipeline = null; // 采样率不合理（理论上不会）：这一路不送帧
      }
    }
  }

  function stopCapture(): void {
    captureGeneration += 1;
    starting = false;
    captureKey = null;
    const handle = capture;
    capture = null;
    pipeline = null;
    if (handle) {
      try {
        handle.stop();
      } catch {
        /* ignore */
      }
    }
  }

  function onSamples(generation: number, samples: Float32Array): void {
    if (generation !== captureGeneration || !pipeline) return;
    for (const frame of pipeline.push(samples)) deps.uplink.sendFrame(frame);
  }

  function onEnded(generation: number): void {
    if (generation !== captureGeneration) return;
    const key = captureKey;
    stopCapture();
    // 轨道自己结束了：引擎可能刚换了轨道（clone 的源没了）→ 同一个 key 立刻再开一次（拿引擎的新轨道）；
    // 再结束就判失败，不原地死循环（拔设备时引擎会换设备 → micDeviceId 变 → 新 key 会重开）。
    if (key && endedKey !== key) {
      endedKey = key;
      setCaptureState("off");
      syncCapture();
      return;
    }
    failedKey = key;
    setCaptureState("failed");
  }

  async function startCaptureFor(key: string): Promise<void> {
    const generation = ++captureGeneration;
    starting = true;
    captureKey = key;
    setCaptureState("starting");
    try {
      const handle = await deps.startCapture({
        deviceId: target.micDeviceId,
        onSamples: (samples) => onSamples(generation, samples),
        onEnded: () => onEnded(generation),
      });
      if (generation !== captureGeneration || disposed) {
        try {
          handle.stop();
        } catch {
          /* ignore */
        }
        return;
      }
      starting = false;
      capture = handle;
      failedKey = null;
      ensurePipeline();
      setCaptureState("running");
    } catch (error) {
      if (generation !== captureGeneration) return;
      starting = false;
      captureKey = null;
      failedKey = key;
      setCaptureState(captureFailureState(error));
    }
  }

  function syncCapture(): void {
    if (disposed) return;
    if (!deps.uplink.capturing()) {
      stopCapture();
      failedKey = null; // 停过一次（静音/关转写）之后，下次开麦可以重试
      endedKey = null;
      setCaptureState("off");
      return;
    }
    const key = keyFor(target);
    if (capture && captureKey === key) {
      ensurePipeline();
      return;
    }
    if (starting && captureKey === key) return;
    if (failedKey === key) return;
    stopCapture();
    void startCaptureFor(key);
  }

  const unsubscribe = deps.uplink.subscribe((status) => {
    deps.onUplink?.(status);
    syncCapture();
  });

  return {
    update(next) {
      if (disposed) return;
      target = { ...next };
      deps.uplink.update(target);
      syncCapture();
    },
    captureState: () => captureState,
    dispose() {
      if (disposed) return;
      deps.uplink.stop();
      disposed = true;
      unsubscribe();
      stopCapture();
      setCaptureState("off");
    },
  };
}
