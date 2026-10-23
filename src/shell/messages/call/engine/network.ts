// 网络统计与信号格（纯函数 + 小状态机，不碰 SDK 对象）。
// 数据来源（SDK 每 2 秒一次的事件，见 sdk.ts）：
//   - `rtcStats`：成功的 candidate-pair（currentRoundTripTime 秒、bytesSent、bytesReceived、timestamp 毫秒）
//   - `rtcLocalAudioStats` / `rtcLocalVideoStats`：[{track, stats: outbound-rtp}]（bytesSent）
//   - `rtcRemoteAudioStats` / `rtcRemoteVideoStats`：[{uid, track, stats: inbound-rtp}]（packetsLost、packetsReceived、bytesReceived）
//   - `networkQuality`：{subscribe:{rtt 毫秒, loss 百分比, quality 0 极好 … 5 断开、6 未知}}（只有下行；没有远端时为未知）
// 取不到的字段一律给 null，不编造：Web SDK 不给上行丢包（publisher 只给 outbound-rtp，没有 remote-inbound-rtp），所以 upLossPct 恒为 null。
// 码率口径（V02 D8）：优先用媒体统计——上行 = 本地 outbound-rtp 的 bytesSent 增量（音频 + 视频），下行 = 各远端 inbound-rtp
// 的 bytesReceived 增量之和；没有媒体统计时才退回 candidate-pair 的字节数。原因：`rtcStats` 取的是 `getPCStats()` 那条连接的
// candidate-pair，多连接模式下可能是只收不发的那条，bytesSent 只涨 RTCP，四舍五入就是 0 kbps。
import { NETWORK_QUALITY } from "./sdk";
import type { CallStats, NetLevel } from "./types";

export const EMPTY_STATS: CallStats = { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null };

/** 媒体统计 2 秒一次；超过 5 秒没更新的分路不再计入码率（关了摄像头、对方离开）。 */
export const MEDIA_FRESH_MS = 5_000;

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
  /** `rtcLocalAudioStats` / `rtcLocalVideoStats` 事件（outbound-rtp 列表）：上行码率的首选来源。 */
  onLocalOutbound(kind: "audio" | "video", list: unknown): void;
  /** `rtcRemoteAudioStats` / `rtcRemoteVideoStats` 事件（inbound-rtp 列表，带 uid）：下行码率与每人丢包。 */
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
  /** 媒体统计算出的分路码率（key = 本地 "out:audio"/"out:video"，远端 "in:<uid>:<audio|video>:<track>"）。 */
  const mediaRates = new Map<string, { at: number; bytes: number; rate: number | null; seenAt: number }>();
  const remoteLoss = new Map<string, { prev: LossSample | null; pct: number | null }>();
  const remoteTotals = new Map<string, Record<"audio" | "video", LossSample>>();

  function kbps(deltaBytes: number, deltaMs: number): number | null {
    if (!(deltaMs > 0) || deltaBytes < 0) return null;
    return Math.round((deltaBytes * 8) / deltaMs);
  }

  /** 记一路累计字节数，算出这一路的码率（计数回退 = 重新订阅/重新推流，等下一个样本）。 */
  function noteMedia(key: string, bytes: number, at: number): void {
    const previous = mediaRates.get(key);
    let rate: number | null = null;
    if (previous && at > previous.at && bytes >= previous.bytes) rate = kbps(bytes - previous.bytes, at - previous.at);
    mediaRates.set(key, { at, bytes, rate, seenAt: now() });
  }

  /** 某个方向上「最近 5 秒内有样本」的分路码率之和；一路都没有返回 null。 */
  function mediaRate(prefix: "out:" | "in:"): number | null {
    const fresh = now() - MEDIA_FRESH_MS;
    let total = 0;
    let any = false;
    for (const [key, entry] of mediaRates) {
      if (!key.startsWith(prefix) || entry.seenAt < fresh || entry.rate === null) continue;
      total += entry.rate;
      any = true;
    }
    return any ? total : null;
  }

  function statsAt(stats: Record<string, unknown>): number {
    return num(stats.timestamp) ?? now();
  }

  return {
    onTransport(pair) {
      const row = (pair ?? {}) as Record<string, unknown>;
      const rtt = num(row.currentRoundTripTime);
      if (rtt !== null) rttMs = Math.round(rtt * 1000);
      const at = num(row.timestamp) ?? now();
      const sent = num(row.bytesSent);
      const received = num(row.bytesReceived);
      if (lastPair) {
        const dt = at - lastPair.at;
        if (sent !== null && lastPair.sent !== null) upKbps = kbps(sent - lastPair.sent, dt);
        if (received !== null && lastPair.received !== null) downKbps = kbps(received - lastPair.received, dt);
      }
      lastPair = { at, sent, received };
    },
    onLocalOutbound(kind, list) {
      if (!Array.isArray(list) || list.length === 0) return;
      let total = 0;
      let at = 0;
      let any = false;
      for (const item of list) {
        const stats = ((item ?? {}) as { stats?: Record<string, unknown> }).stats ?? {};
        const sent = num(stats.bytesSent);
        if (sent === null) continue;
        total += sent;
        at = Math.max(at, statsAt(stats));
        any = true;
      }
      if (any) noteMedia(`out:${kind}`, total, at);
    },
    onRemoteInbound(kind, list) {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        const row = (item ?? {}) as { uid?: unknown; stats?: Record<string, unknown> };
        const uid = typeof row.uid === "string" ? row.uid : "";
        if (!uid) continue;
        const stats = row.stats ?? {};
        const bytesReceived = num(stats.bytesReceived);
        if (bytesReceived !== null) {
          const track = num((item as { track?: unknown }).track) ?? 0;
          noteMedia(`in:${uid}:${kind}:${track}`, bytesReceived, statsAt(stats));
        }
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
        upKbps: mediaRate("out:") ?? upKbps,
        downKbps: mediaRate("in:") ?? downKbps,
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
      mediaRates.clear();
      remoteLoss.clear();
      remoteTotals.clear();
    },
  };
}
