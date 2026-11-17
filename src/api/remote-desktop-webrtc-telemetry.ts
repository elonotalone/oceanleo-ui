import { qualityEnvironment, type QualityEnvironment } from "./remote-desktop-quality";
import type { WebRtcInputReceipt, WebRtcInputWrite } from "./remote-desktop-webrtc-input";

export type WebRtcViewerState = "connecting" | "playing" | "input_reconnecting" | "picture_reconnecting";
export interface WebRtcPath {
  local_type?: "host" | "srflx" | "prflx" | "relay";
  remote_type?: "host" | "srflx" | "prflx" | "relay";
  address_family?: "ipv4" | "ipv6"; protocol?: "udp" | "tcp"; relay_region?: string; rtt_ms?: number;
  direct_rtt_ms?: number; relay_rtt_ms?: number; best_relay_region?: string;
  comparison_source?: "ice" | "ctl"; selection_state?: "measuring" | "stable" | "switching" | "unavailable";
}
export interface WebRtcPercentiles { n: number; p50?: number; p95?: number; max?: number }
/** Observed compositor callbacks, not decoded frames or the browser's resettable presentedFrames. */
export interface WebRtcPresentation {
  host_capture_wall_ms?: number;
  session_frame_count: number; peer_generation: number; presented_at_ms: number; gap_ms?: number;
  expectedDisplayTime?: number; presentationTime?: number; captureTime?: number; receiveTime?: number;
  processingDuration?: number; presentedFrames?: number; rtpTimestamp?: number;
}
export type WebRtcPictureAgeSource = "captureTime" | "receiveTime" | "unknown";
export interface WebRtcQualityReport {
  v: 1; transport: "webrtc-v1"; media: "webrtc"; device_id: string; session_id: string;
  attempt: number; end_reason: string; duration_ms: number; reconnects: number; media_renewals: number;
  steps: Partial<Record<"session_created_ms" | "descriptor_received_ms" | "offer_sent_ms" | "answer_received_ms" | "ice_connected_ms" | "first_frame_decoded_ms" | "first_frame_presented_ms", number>>;
  input: { ws_count: number; dc_count: number; sent_executed?: WebRtcPercentiles };
  video: { picture_age?: WebRtcPercentiles; picture_age_source: WebRtcPictureAgeSource; picture_age_by_source?: Partial<Record<"captureTime" | "receiveTime", WebRtcPercentiles>>; frames_rendered: number; freeze_count: number; freeze_ms: number };
  path?: WebRtcPath; env: QualityEnvironment;
  window_start_ms: number; viewer: { t: "rd.viewer_report"; v: 1; seq: number }; publisher?: Record<string, number>;
}
type Histogram = Map<number, number>;
interface Bucket { input: Histogram; ages: Histogram; captureTime: Histogram; receiveTime: Histogram; frames: number; freezes: number; freezeMs: number; writes: number }
const bucket = (): Bucket => ({ input: new Map(), ages: new Map(), captureTime: new Map(), receiveTime: new Map(), frames: 0, freezes: 0, freezeMs: 0, writes: 0 });
const integer = (n: number, max = 86_400_000): number => Math.round(Math.max(0, Math.min(max, n)));
export function webRtcPercentiles(values: readonly number[]): WebRtcPercentiles | undefined {
  const sorted = values.filter(n => Number.isFinite(n) && n >= 0).map(n => integer(n, 600_000)).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const at = (q: number) => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
  return { n: sorted.length, p50: at(.5), p95: at(.95), max: sorted[sorted.length - 1] };
}
function histogramPercentiles(histogram: Histogram): WebRtcPercentiles | undefined {
  const entries = [...histogram].sort(([a], [b]) => a - b);
  const n = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!n) return undefined;
  const at = (q: number) => { let count = 0; for (const [value, frequency] of entries) { count += frequency; if (count >= Math.ceil(n * q)) return value; } return entries[entries.length - 1][0]; };
  return { n, p50: at(.5), p95: at(.95), max: entries[entries.length - 1][0] };
}
/** Host-minus-viewer wall-clock offset; the lowest RTT sample in the rolling 30 seconds wins. */
export class WebRtcClock {
  private samples: { at: number; rtt: number; offset: number }[] = [];
  sample(viewerSent: number, hostReceived: number, hostSent: number, viewerReceived: number, now: number): void {
    if (![viewerSent, hostReceived, hostSent, viewerReceived, now].every(Number.isFinite) || hostSent < hostReceived || viewerReceived < viewerSent) return;
    const rtt = viewerReceived - viewerSent - (hostSent - hostReceived);
    if (rtt < 0 || rtt > 30_000) return;
    this.samples.push({ at: now, rtt, offset: ((hostReceived - viewerSent) + (hostSent - viewerReceived)) / 2 });
    this.trim(now);
  }
  private trim(now: number): void { this.samples = this.samples.filter(s => now - s.at <= 30_000).slice(-128); }
  offset(now: number): number | undefined { this.trim(now); return [...this.samples].sort((a, b) => a.rtt - b.rtt)[0]?.offset; }
}

/** Numeric measurements only. Collection never drives connection or input lifetime. */
export class WebRtcTelemetry {
  readonly clock = new WebRtcClock();
  readonly steps: WebRtcQualityReport["steps"] = {};
  path: WebRtcPath | undefined;
  reconnects = 0;
  publisher: Record<string, number> | undefined;
  private total = bucket(); private window = bucket();
  private windowStart: number; private sequence = 0; private lastFrame: number | undefined;
  private lastBytes: number | undefined; private lastReceivedFrames: number | undefined;
  private sendingUntil = -Infinity; private sendingSince = 0;
  private freezeActive = false; private freezeAccounted = 0;
  private options: { sessionId: string; deviceId?: string; clickedAt: number; now(): number; wallNow(): number };
  constructor(options: WebRtcTelemetry["options"]) { this.options = options; this.windowStart = options.wallNow(); }
  rebaseClick(at: number): void {
    const shift = at - this.options.clickedAt;
    for (const key of Object.keys(this.steps) as (keyof WebRtcQualityReport["steps"])[]) this.steps[key] = Math.max(0, this.steps[key]! - shift);
    this.options.clickedAt = at;
  }
  step(name: keyof WebRtcQualityReport["steps"], at = this.options.now()): void { if (this.steps[name] === undefined) this.steps[name] = integer(at - this.options.clickedAt, 600_000); }
  written(): void { this.total.writes++; this.window.writes++; }
  receipt(write: WebRtcInputWrite, receipt: WebRtcInputReceipt): void {
    if (receipt.status !== "executed" || write.action.kind === "release_all") return;
    const offset = this.clock.offset(this.options.now());
    if (offset === undefined) return; // Unknown clocks are not invented zero-latency samples.
    const elapsed = receipt.executed_at_ms - offset - write.sentWall;
    if (Number.isFinite(elapsed) && elapsed >= 0) this.add("input", elapsed);
  }
  private add(key: "input" | "ages" | "captureTime" | "receiveTime", value: number): void {
    // Exact whole-ms histograms are bounded to 600001 distinct values, even for multi-day sessions.
    const ms = integer(value, 600_000);
    for (const b of [this.total, this.window]) {
      b[key].set(ms, (b[key].get(ms) ?? 0) + 1);
    }
  }
  hostSample(bytes?: number, frames?: number): void {
    const progressing = bytes !== undefined && bytes > (this.lastBytes ?? 0) || frames !== undefined && frames > (this.lastReceivedFrames ?? 0);
    if (bytes !== undefined) this.lastBytes = bytes;
    if (frames !== undefined) this.lastReceivedFrames = frames;
    if (progressing) {
      const now = this.options.now();
      if (now > this.sendingUntil) { this.sendingSince = now; this.freezeActive = false; }
      this.sendingUntil = now + 1500;
    }
  }
  tick(): void {
    const now = Math.min(this.options.now(), this.sendingUntil);
    if (this.lastFrame === undefined) return;
    const baseline = Math.max(this.lastFrame, this.sendingSince);
    if (now - baseline <= 200) return;
    if (!this.freezeActive) {
      this.freezeActive = true; this.freezeAccounted = baseline;
      for (const b of [this.total, this.window]) b.freezes++;
    }
    const duration = Math.max(0, now - this.freezeAccounted);
    for (const b of [this.total, this.window]) b.freezeMs += duration;
    this.freezeAccounted = now;
  }
  frame(presentedAt: number, metadata: { captureTime?: number; receiveTime?: number; presentationTime?: number }): void {
    if (!Number.isFinite(presentedAt)) return;
    // presentationTime is a compositor-submission upper bound for decode, not a decoder timestamp.
    this.step("first_frame_decoded_ms", Number.isFinite(metadata.presentationTime) ? metadata.presentationTime : this.options.now());
    this.step("first_frame_presented_ms", presentedAt);
    for (const b of [this.total, this.window]) b.frames++;
    this.tick(); this.lastFrame = presentedAt; this.freezeActive = false;
    // rVFC timestamps are already in the RECEIVER monotonic timeline (RTCP estimates captureTime).
    // Applying the rd.pong wall-clock offset here would double-correct capture age.
    const captured = Number.isFinite(metadata.captureTime) ? metadata.captureTime : metadata.receiveTime;
    const source = Number.isFinite(metadata.captureTime) ? "captureTime" : Number.isFinite(metadata.receiveTime) ? "receiveTime" : "unknown";
    if (captured !== undefined && Number.isFinite(captured) && presentedAt >= captured) { this.add("ages", presentedAt - captured); if (source !== "unknown") this.add(source, presentedAt - captured); }
  }
  /** Exact RTP match from the authenticated host, corrected with the rolling minimum-RTT clock. */
  captureFrameTime(presentedAt: number, captureUnixMs: number): void {
    const offset = this.clock.offset(this.options.now());
    if (offset === undefined || !Number.isFinite(presentedAt) || !Number.isFinite(captureUnixMs)) return;
    const age = this.options.wallNow() + presentedAt - this.options.now() - (captureUnixMs - offset);
    if (age >= 0 && age < 600_000) this.add("captureTime", age);
  }
  report(final: boolean, reason = "active"): WebRtcQualityReport {
    const b = final ? this.total : this.window;
    const result: WebRtcQualityReport = {
      v: 1, transport: "webrtc-v1", media: "webrtc", device_id: this.options.deviceId ?? "", session_id: this.options.sessionId,
      attempt: 1, end_reason: reason, duration_ms: integer(this.options.now() - this.options.clickedAt), reconnects: this.reconnects, media_renewals: 0,
      steps: { ...this.steps }, input: { ws_count: 0, dc_count: b.writes, sent_executed: histogramPercentiles(b.input) },
      video: { picture_age: histogramPercentiles(b.captureTime.size ? b.captureTime : b.ages), picture_age_source: b.captureTime.size ? "captureTime" : b.receiveTime.size ? "receiveTime" : "unknown", picture_age_by_source: { captureTime: histogramPercentiles(b.captureTime), receiveTime: histogramPercentiles(b.receiveTime) }, frames_rendered: b.frames, freeze_count: b.freezes, freeze_ms: integer(b.freezeMs) },
      path: this.path ? { ...this.path } : undefined, env: qualityEnvironment(), window_start_ms: integer(this.windowStart, Number.MAX_SAFE_INTEGER),
      viewer: { t: "rd.viewer_report", v: 1, seq: ++this.sequence }, publisher: this.publisher,
    };
    if (!final) { this.window = bucket(); this.windowStart = this.options.wallNow(); }
    return result;
  }
}
