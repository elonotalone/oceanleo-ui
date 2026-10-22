// 网络统计与信号格（纯函数 + 小状态机，不碰 SDK 对象）。
// 数据来源（SDK 每 2 秒一次的事件，见 sdk.ts）：
//   - `rtcStats`：成功的 candidate-pair（currentRoundTripTime 秒、bytesSent、bytesReceived、timestamp 毫秒）
//   - `rtcLocalAudioStats` / `rtcLocalVideoStats`：[{track, stats: outbound-rtp}]（bytesSent）
//   - `rtcRemoteAudioStats` / `rtcRemoteVideoStats`：[{uid, track, stats: inbound-rtp}]（packetsLost、packetsReceived、bytesReceived）
//   - `networkQuality`：{subscribe:{rtt 毫秒, loss 百分比, quality 0 极好 … 5 断开、6 未知}}（只有下行；没有远端时为未知）
// 取不到的字段一律给 null，不编造：Web SDK 不给上行丢包（publisher 只给 outbound-rtp，没有 remote-inbound-rtp），所以 upLossPct 恒为 null。
import { NETWORK_QUALITY } from "./sdk";
import type { CallStats, NetLevel } from "./types";

export const EMPTY_STATS: CallStats = { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null };

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** SDK 的 AliRtcNetworkQuality → 信号格（0 未知，1 很差 … 5 很好）。 */
export function netLevelFromQuality(quality: unknown): NetLevel {
  switch (quality) {
    case NETWORK_QUALITY.excellent:
      return 5;
    case NETWORK_QUALITY.good:
      return 4;
    case NETWORK_QUALITY.poor:
      return 3;
    case NETWORK_QUALITY.bad:
      return 2;
    case NETWORK_QUALITY.veryBad:
    case NETWORK_QUALITY.disconnected:
      return 1;
    default:
      return 0;
  }
}

/** 与 SDK 内部判级同口径（丢包百分比、往返毫秒；未知的一项不参与）。两项都未知 → 0。 */
export function netLevelFromMetrics(lossPct: number | null, rttMs: number | null): NetLevel {
  if (lossPct === null && rttMs === null) return 0;
  const loss = lossPct ?? 0;
  const rtt = rttMs ?? 0;
  if (loss > 50 || rtt > 500) return 1;
  if (loss > 30 || rtt > 350) return 2;
  if (loss > 20 || rtt > 200) return 3;
  if (loss > 10 || rtt > 100) return 4;
  return 5;
}

interface ByteSample {
  at: number;
  sent: number | null;
  received: number | null;
}

interface LossSample {
  lost: number;
  received: number;
}

export interface StatsTracker {
  /** `rtcStats` 事件（candidate-pair）。 */
  onTransport(pair: unknown): void;
  /** `rtcLocalAudioStats` / `rtcLocalVideoStats` 事件（outbound-rtp 列表）；只在 candidate-pair 不带字节数时用来估上行。 */
  onLocalOutbound(kind: "audio" | "video", list: unknown): void;
  /** `rtcRemoteAudioStats` / `rtcRemoteVideoStats` 事件（inbound-rtp 列表，带 uid）。 */
  onRemoteInbound(kind: "audio" | "video", list: unknown): void;
  /** `networkQuality` 事件。 */
  onNetworkQuality(event: unknown): void;
  /** 当前统计（与 `callActions.getStats()` / 诊断引擎同口径）。 */
  stats(): CallStats;
  /** 自己的信号格：优先 SDK 下行质量，其次按往返与丢包推。 */
  selfLevel(): NetLevel;
  /** 某个远端（ARTC uid）的信号格：按该人入站丢包推；没有样本 → 0。 */
  remoteLevel(uid: string): NetLevel;
  reset(): void;
}

export function createStatsTracker(now: () => number = () => Date.now()): StatsTracker {
  let rttMs: number | null = null;
  let upKbps: number | null = null;
  let downKbps: number | null = null;
  let downLossPct: number | null = null;
  let quality: number | null = null;
  let qualityRtt: number | null = null;
  let lastPair: ByteSample | null = null;
  let pairHasBytes = false;
  let lastOutbound: { at: number; bytes: number } | null = null;
  const outboundBytes: Record<"audio" | "video", number> = { audio: 0, video: 0 };
  const remoteLoss = new Map<string, { prev: LossSample | null; pct: number | null }>();
  const remoteTotals = new Map<string, Record<"audio" | "video", LossSample>>();

  function kbps(deltaBytes: number, deltaMs: number): number | null {
    if (!(deltaMs > 0) || deltaBytes < 0) return null;
    return Math.round((deltaBytes * 8) / deltaMs);
  }

  return {
    onTransport(pair) {
      const row = (pair ?? {}) as Record<string, unknown>;
      const rtt = num(row.currentRoundTripTime);
      if (rtt !== null) rttMs = Math.round(rtt * 1000);
      const at = num(row.timestamp) ?? now();
      const sent = num(row.bytesSent);
      const received = num(row.bytesReceived);
      pairHasBytes = sent !== null || received !== null;
      if (lastPair) {
        const dt = at - lastPair.at;
        if (sent !== null && lastPair.sent !== null) upKbps = kbps(sent - lastPair.sent, dt);
        if (received !== null && lastPair.received !== null) downKbps = kbps(received - lastPair.received, dt);
      }
      lastPair = { at, sent, received };
    },
    onLocalOutbound(kind, list) {
      if (!Array.isArray(list)) return;
      let total = 0;
      for (const item of list) {
        const stats = ((item ?? {}) as { stats?: Record<string, unknown> }).stats ?? {};
        total += num(stats.bytesSent) ?? 0;
      }
      outboundBytes[kind] = total;
      if (pairHasBytes) return;
      const at = now();
      const bytes = outboundBytes.audio + outboundBytes.video;
      if (lastOutbound) upKbps = kbps(bytes - lastOutbound.bytes, at - lastOutbound.at);
      lastOutbound = { at, bytes };
    },
    onRemoteInbound(kind, list) {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        const row = (item ?? {}) as { uid?: unknown; stats?: Record<string, unknown> };
        const uid = typeof row.uid === "string" ? row.uid : "";
        if (!uid) continue;
        const stats = row.stats ?? {};
        const lost = num(stats.packetsLost);
        const received = num(stats.packetsReceived);
        if (lost === null || received === null) continue;
        const totals = remoteTotals.get(uid) ?? { audio: { lost: 0, received: 0 }, video: { lost: 0, received: 0 } };
        totals[kind] = { lost, received };
        remoteTotals.set(uid, totals);
        const sum: LossSample = {
          lost: totals.audio.lost + totals.video.lost,
          received: totals.audio.received + totals.video.received,
        };
        const entry = remoteLoss.get(uid) ?? { prev: null, pct: null };
        if (entry.prev) {
          const dLost = sum.lost - entry.prev.lost;
          const dReceived = sum.received - entry.prev.received;
          if (dLost >= 0 && dReceived >= 0 && dLost + dReceived > 0) {
            entry.pct = Math.round((dLost / (dLost + dReceived)) * 100);
          } else if (dLost < 0 || dReceived < 0) {
            entry.pct = null; // 计数被重置（重新订阅）：等下一个样本
          }
        }
        entry.prev = sum;
        remoteLoss.set(uid, entry);
      }
    },
    onNetworkQuality(event) {
      const sub = ((event ?? {}) as { subscribe?: Record<string, unknown> }).subscribe ?? {};
      const q = num(sub.quality);
      quality = q;
      if (q === null || q === NETWORK_QUALITY.unknown) {
        downLossPct = null;
        qualityRtt = null;
        return;
      }
      downLossPct = num(sub.loss);
      const rtt = num(sub.rtt);
      qualityRtt = rtt !== null && rtt > 0 ? rtt : null;
    },
    stats() {
      return {
        rttMs: rttMs ?? qualityRtt,
        upLossPct: null,
        downLossPct,
        upKbps,
        downKbps,
      };
    },
    selfLevel() {
      if (quality !== null && quality !== NETWORK_QUALITY.unknown) return netLevelFromQuality(quality);
      return netLevelFromMetrics(downLossPct, rttMs ?? qualityRtt);
    },
    remoteLevel(uid) {
      const entry = remoteLoss.get(uid);
      if (!entry || entry.pct === null) return 0;
      return netLevelFromMetrics(entry.pct, null);
    },
    reset() {
      rttMs = null;
      upKbps = null;
      downKbps = null;
      downLossPct = null;
      quality = null;
      qualityRtt = null;
      lastPair = null;
      pairHasBytes = false;
      lastOutbound = null;
      outboundBytes.audio = 0;
      outboundBytes.video = 0;
      remoteLoss.clear();
      remoteTotals.clear();
    },
  };
}
