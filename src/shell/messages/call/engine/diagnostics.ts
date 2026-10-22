// 「通话检测」的连接测试用的独立 SDK 实例（仲裁 A-5，形状见 signals/W14-to-W05.md）。
// 用 `AliRtcEngine.createInstance()`（7.3.8 声明里有多实例方法），不碰正在进行的通话实例；
// 只发布音频（可指定麦克风），不订阅任何远端，不发摄像头。统计与 `callActions.getStats()` 同口径。
import type { RtcCredentials } from "../../../../lib/im/call-types";
import { createStatsTracker, type StatsTracker } from "./network";
import { loadArtcSdk, prepareEngine, type ArtcEngine, type ArtcSdk } from "./sdk";
import type { CallStats } from "./types";

export interface DiagnosticsEngine {
  /** 用 `callsApi.testToken()` 拿到的 `diag-` 频道凭证入会：只发布音频（可指定麦克风），不订阅任何远端，不发摄像头。 */
  join(rtc: RtcCredentials, opts?: { displayName?: string; micDeviceId?: string | null }): Promise<void>;
  /** 与通话中 `callActions.getStats()` 同口径；取不到的字段给 null，不编造。 */
  getStats(): Promise<CallStats>;
  /** 离开频道并 destroy 这个实例（幂等；不影响正在进行的通话实例）。 */
  leave(): Promise<void>;
}

export function diagnosticsEngineFrom(sdk: ArtcSdk, tracker: StatsTracker = createStatsTracker()): DiagnosticsEngine {
  const engine: ArtcEngine = sdk.createEngine();
  let joined = false;
  let closed = false;
  let closing: Promise<void> | null = null;

  engine.on("rtcStats", (pair: unknown) => tracker.onTransport(pair));
  engine.on("rtcLocalAudioStats", (list: unknown) => tracker.onLocalOutbound("audio", list));
  engine.on("networkQuality", (event: unknown) => tracker.onNetworkQuality(event));

  return {
    async join(rtc, opts = {}) {
      if (closed) throw new Error("diagnostics_closed");
      if (joined) throw new Error("diagnostics_already_joined");
      if (!rtc?.token) throw new Error("rtc_credentials_incomplete");
      // 仲裁 A-11：与通话同一组设置（互动模式 + 主播角色），单参数令牌入会。
      await prepareEngine(engine, { autoSubscribeAudio: false });
      await engine.publishLocalVideoStream(false);
      await engine.publishLocalAudioStream(true);
      const micDeviceId = opts.micDeviceId ?? null;
      if (micDeviceId && engine.startAudioCapture) {
        await engine.startAudioCapture({ deviceId: { exact: micDeviceId } });
      }
      joined = true;
      try {
        await engine.joinChannel(rtc.token, opts.displayName || undefined);
      } catch (error) {
        joined = false;
        throw error;
      }
    },
    async getStats() {
      return tracker.stats();
    },
    leave() {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        try {
          if (joined) await engine.leaveChannel();
        } catch {
          /* 已经不在频道里 */
        } finally {
          joined = false;
          try {
            await engine.destroy();
          } catch {
            /* 已销毁 */
          }
        }
      })();
      return closing;
    },
  };
}

/** 新建一个只用于连接测试的独立实例（装载 SDK 失败或没有多实例方法时拒绝，错误信息即原因）。 */
export async function createDiagnosticsEngine(): Promise<DiagnosticsEngine> {
  const sdk = await loadArtcSdk();
  return diagnosticsEngineFrom(sdk);
}
