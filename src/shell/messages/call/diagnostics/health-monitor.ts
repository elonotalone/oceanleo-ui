// 共享采样器：全页面只有一个 2 秒定时器（无论多少组件在用 `useNetworkHealth()`），
// 第一个订阅者到来时启动、最后一个离开时停止。依赖全部注入，单测用假时钟与假统计。
import type { CallSnapshot, CallStats, NetLevel } from "../engine";
import {
  HEALTH_POLL_MS,
  healthView,
  initialHealthState,
  reduceHealth,
  type HealthContext,
  type HealthState,
  type NetworkHealth,
} from "./health";

export interface HealthMonitorContext {
  /** 通话已连上或正在重连：只有这时才取统计。 */
  active: boolean;
  /** 引擎的 `me.network`（SDK 网络质量推出），0 未知。 */
  sdkLevel: NetLevel;
  audioOnly: boolean;
  ctx: HealthContext;
}

export interface HealthMonitorDeps {
  getStats(): Promise<CallStats>;
  getContext(): HealthMonitorContext;
  /** 通话状态变化通知（用来在挂断后立刻清零、仅语音切换后立刻更新建议）。 */
  subscribeCall?(listener: () => void): () => void;
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface HealthMonitor {
  subscribe(listener: () => void): () => void;
  getSnapshot(): NetworkHealth;
  getServerSnapshot(): NetworkHealth;
  /** 立即采样一次（定时器也走这里）；不在通话中时清零。 */
  poll(): Promise<void>;
}

/** 从引擎快照推出采样上下文（纯函数，单测直接用）。 */
export function monitorContextFromSnapshot(snapshot: CallSnapshot): HealthMonitorContext {
  const me = snapshot.me;
  const active = snapshot.phase === "connected" || snapshot.phase === "reconnecting";
  const receivingVideo =
    !me.audioOnly && snapshot.participants.some((p) => !p.isMe && (p.camera || p.screen));
  return {
    active,
    sdkLevel: me.network,
    audioOnly: me.audioOnly,
    ctx: { sendingCamera: Boolean(me.camera), receivingVideo },
  };
}

const SERVER_VIEW: NetworkHealth = healthView(initialHealthState(), false);

export function createHealthMonitor(deps: HealthMonitorDeps): HealthMonitor {
  const listeners = new Set<() => void>();
  let state: HealthState = initialHealthState();
  let timer: unknown = null;
  let unsubscribeCall: (() => void) | null = null;
  let inflight = false;
  let cachedFor: { state: HealthState; audioOnly: boolean } | null = null;
  let cachedView: NetworkHealth = SERVER_VIEW;

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  const reset = () => {
    if (state.updatedAt === null && !state.sustainedPoor && state.level === 0) return;
    state = initialHealthState();
    emit();
  };

  const poll = async () => {
    const context = deps.getContext();
    if (!context.active) {
      reset();
      return;
    }
    if (inflight) return;
    inflight = true;
    let stats: CallStats | null = null;
    try {
      stats = await deps.getStats();
    } catch {
      stats = null;
    } finally {
      inflight = false;
    }
    const latest = deps.getContext();
    if (!latest.active) {
      reset();
      return;
    }
    state = reduceHealth(state, { stats, sdkLevel: latest.sdkLevel, ctx: latest.ctx }, deps.now());
    emit();
  };

  const start = () => {
    if (timer !== null) return;
    timer = deps.setInterval(() => {
      void poll();
    }, HEALTH_POLL_MS);
    // 通话快照变化很频繁（说话音量每秒好几次）：只在挂断（清零）或仅语音开关变化（建议要跟着变）时通知。
    let lastAudioOnly = deps.getContext().audioOnly;
    unsubscribeCall = deps.subscribeCall?.(() => {
      const context = deps.getContext();
      if (!context.active) {
        reset();
        return;
      }
      if (context.audioOnly !== lastAudioOnly) {
        lastAudioOnly = context.audioOnly;
        emit();
      }
    }) ?? null;
    void poll();
  };

  const stop = () => {
    if (timer !== null) deps.clearInterval(timer);
    timer = null;
    unsubscribeCall?.();
    unsubscribeCall = null;
    state = initialHealthState();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot() {
      const audioOnly = deps.getContext().audioOnly;
      if (!cachedFor || cachedFor.state !== state || cachedFor.audioOnly !== audioOnly) {
        cachedFor = { state, audioOnly };
        cachedView = healthView(state, audioOnly);
      }
      return cachedView;
    },
    getServerSnapshot() {
      return SERVER_VIEW;
    },
    poll,
  };
}
