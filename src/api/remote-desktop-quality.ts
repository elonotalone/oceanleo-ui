/**
 * Anonymous per-session remote desktop quality report (gateway: POST /v1/devices/remote-desktop/quality).
 *
 * Why: decisions about remote desktop quality must come from every user's sessions, not one machine.
 * One report per gateway session (and one per failed session request), sent once when the session
 * ends — the panel's close path, including `pagehide`, which uses a keepalive request (a plain
 * `sendBeacon` cannot carry the owner's bearer token, so it would be refused).
 *
 * Only numbers, enums and fixed lower-case codes: no user agent string, no IP, no device or display
 * names, nothing typed or shown on screen. The device id is sent only so the gateway can check
 * ownership and read the computer's OS family; the gateway does not store it.
 *
 * Diagnostics never affect the session: every hook is try/catch-free arithmetic or swallowed.
 */
import type {
  RemoteDesktopClient, RemoteDesktopStream, RemoteDesktopStreamHandlers,
} from "./remote-desktop";
import type { RemoteControlTiming } from "./remote-desktop-control-timing";

export type QualityLane = "data_channel" | "websocket";
export interface QualityPercentiles { n: number; p50?: number; p90?: number; p99?: number; max?: number }
export interface QualityVideoSummary {
  samples: number; fps_p50?: number; fps_p10?: number; jitter_buffer_ms_avg?: number; rtt_p50_ms?: number; rtt_p90_ms?: number;
  packets_received?: number; packets_lost?: number; nack?: number; pli?: number; fir?: number; freeze_count?: number; freeze_ms?: number;
  frames_decoded?: number; frames_dropped?: number; width?: number; height?: number;
  codec?: "h264" | "h265" | "vp8" | "vp9" | "av1" | "other"; relay?: boolean;
}
export interface QualityEnvironment {
  browser: "chrome" | "edge" | "firefox" | "safari" | "webview" | "oceanleo_app" | "other";
  platform: "windows" | "macos" | "linux" | "android" | "ios" | "chromeos" | "other";
  site: "global" | "cn" | "oceanbizs" | "dev" | "other";
}
export interface RemoteDesktopQualityReport {
  v: 1; device_id: string; session_id?: string; attempt: number; transport?: "websocket-v2" | "http-v1";
  media: "artc" | "legacy" | "none"; end_reason: string; duration_ms: number; reconnects: number; media_renewals: number;
  steps: Partial<Record<QualityStep, number>>;
  input: { ws_count: number; dc_count: number; accepted?: QualityPercentiles; executed?: QualityPercentiles };
  video?: QualityVideoSummary; env: QualityEnvironment;
}
export type QualityStep = "create_ms" | "consent_ms" | "stream_open_ms" | "active_ms" | "media_negotiate_ms" | "artc_join_ms" | "first_frame_ms";
export type QualityMediaState = "joining" | "waiting_frame" | "playing" | "reconnecting" | "error";

const MAX_MS = 600_000;
const MAX_SAMPLES = 2000;
const STAT_SAMPLES = 900; // 30 min at the 2 s cadence; older samples age out

/** Fixed lower-case code (`HTTP 503` -> `http_503`); anything else becomes `unknown`. */
export function qualityCode(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const code = value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  return code || "unknown";
}

/** Nearest-rank percentiles of whole milliseconds, clamped to the gateway's bounds. */
export function percentiles(values: readonly number[]): QualityPercentiles | undefined {
  const data = values.filter((v) => Number.isFinite(v) && v >= 0).map((v) => Math.min(MAX_MS, Math.round(v))).sort((a, b) => a - b);
  if (!data.length) return undefined;
  const at = (q: number) => data[Math.max(0, Math.min(data.length - 1, Math.ceil((q / 100) * data.length) - 1))];
  return { n: data.length, p50: at(50), p90: at(90), p99: at(99), max: data[data.length - 1] };
}

/** Coarse families only. */
export function qualityEnvironment(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  hostname = typeof location !== "undefined" ? location.hostname : "", appShell = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)): QualityEnvironment {
  const ua = userAgent || "";
  const platform: QualityEnvironment["platform"] = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /CrOS/.test(ua) ? "chromeos"
    : /Windows/.test(ua) ? "windows" : /Macintosh|Mac OS X/.test(ua) ? "macos" : /Linux|X11/.test(ua) ? "linux" : "other";
  const browser: QualityEnvironment["browser"] = appShell || /OceanLeo/i.test(ua) ? "oceanleo_app"
    : /; wv\)|WebView|MicroMessenger|DingTalk|Lark|Feishu/.test(ua) ? "webview"
    : /Edg\//.test(ua) ? "edge" : /Firefox\/|FxiOS/.test(ua) ? "firefox" : /Chrome\/|CriOS|Chromium/.test(ua) ? "chrome"
    : /Safari\//.test(ua) ? "safari" : "other";
  const host = (hostname || "").toLowerCase();
  const under = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  const site: QualityEnvironment["site"] = under("oceanbizs.com") ? "oceanbizs" : under("oceanleo.cn") ? "cn" : under("oceanleo.com") ? "global"
    : host === "localhost" || /^127\./.test(host) || host.endsWith(".localhost") || under("oceandino.com") ? "dev" : "other";
  return { browser, platform, site };
}

/** One getStats snapshot of the remote screen receiver (cumulative counters as the browser reports them). */
export interface VideoStatSample {
  fps?: number; framesDecoded?: number; framesDropped?: number; jitterBufferDelay?: number; jitterBufferEmittedCount?: number;
  packetsReceived?: number; packetsLost?: number; nackCount?: number; pliCount?: number; firCount?: number;
  freezeCount?: number; totalFreezesDuration?: number; width?: number; height?: number; codec?: string; rttMs?: number; relay?: boolean;
}
type StatsEntry = Record<string, unknown> & { type?: string; id?: string };
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Parse RTCStatsReport-like collections (`receiver.getStats()`) into one sample; null without inbound video. */
export function videoStatSample(reports: Iterable<Iterable<StatsEntry> | { forEach(fn: (value: StatsEntry) => void): void }>): VideoStatSample | null {
  const all: StatsEntry[] = [];
  for (const report of reports) {
    if (report && typeof (report as { forEach?: unknown }).forEach === "function") (report as { forEach(fn: (value: StatsEntry) => void): void }).forEach((value) => all.push(value));
    else for (const value of report as Iterable<StatsEntry>) all.push(value);
  }
  const byId = new Map(all.filter((s) => typeof s.id === "string").map((s) => [s.id as string, s]));
  const inbound = all.find((s) => s.type === "inbound-rtp" && (s.kind === "video" || s.mediaType === "video"));
  if (!inbound) return null;
  const codec = typeof inbound.codecId === "string" ? byId.get(inbound.codecId) : undefined;
  const transport = all.find((s) => s.type === "transport" && typeof s.selectedCandidatePairId === "string");
  const pair = (transport && byId.get(transport.selectedCandidatePairId as string))
    ?? all.find((s) => s.type === "candidate-pair" && s.selected === true)
    ?? all.find((s) => s.type === "candidate-pair" && s.nominated === true && s.state === "succeeded");
  const local = pair && typeof pair.localCandidateId === "string" ? byId.get(pair.localCandidateId) : undefined;
  const rtt = num(pair?.currentRoundTripTime);
  return {
    fps: num(inbound.framesPerSecond), framesDecoded: num(inbound.framesDecoded), framesDropped: num(inbound.framesDropped),
    jitterBufferDelay: num(inbound.jitterBufferDelay), jitterBufferEmittedCount: num(inbound.jitterBufferEmittedCount),
    packetsReceived: num(inbound.packetsReceived), packetsLost: num(inbound.packetsLost), nackCount: num(inbound.nackCount),
    pliCount: num(inbound.pliCount), firCount: num(inbound.firCount), freezeCount: num(inbound.freezeCount),
    totalFreezesDuration: num(inbound.totalFreezesDuration), width: num(inbound.frameWidth), height: num(inbound.frameHeight),
    codec: typeof codec?.mimeType === "string" ? codec.mimeType : undefined,
    rttMs: rtt === undefined ? undefined : rtt * 1000,
    relay: local ? local.candidateType === "relay" : undefined,
  };
}

const COUNTERS = ["framesDecoded", "framesDropped", "packetsReceived", "packetsLost", "nackCount", "pliCount", "firCount", "freezeCount", "totalFreezesDuration", "jitterBufferDelay", "jitterBufferEmittedCount"] as const;
type Counter = typeof COUNTERS[number];

/** Session totals across receiver resets (a reconnect starts a new receiver whose counters restart at 0). */
export function summarizeVideoStats(samples: readonly VideoStatSample[]): QualityVideoSummary | undefined {
  if (!samples.length) return undefined;
  const totals = {} as Record<Counter, number>, last = {} as Record<Counter, number>;
  for (const sample of samples) {
    for (const key of COUNTERS) {
      const value = sample[key];
      if (value === undefined) continue;
      const previous = last[key];
      totals[key] = (totals[key] ?? 0) + (previous === undefined || value < previous ? value : value - previous);
      last[key] = value;
    }
  }
  const fps = samples.map((s) => s.fps).filter((v): v is number => v !== undefined);
  const rtt = samples.map((s) => s.rttMs).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  const pick = (values: number[], q: number) => values.length ? values[Math.max(0, Math.ceil((q / 100) * values.length) - 1)] : undefined;
  const sortedFps = [...fps].sort((a, b) => a - b);
  const latest = [...samples].reverse();
  const mime = latest.find((s) => s.codec)?.codec?.toLowerCase() ?? "";
  const codec: QualityVideoSummary["codec"] | undefined = !mime ? undefined : mime.includes("h264") ? "h264" : mime.includes("h265") || mime.includes("hevc") ? "h265"
    : mime.includes("vp8") ? "vp8" : mime.includes("vp9") ? "vp9" : mime.includes("av1") ? "av1" : "other";
  const int = (v: number | undefined, max: number) => v === undefined ? undefined : Math.min(max, Math.max(0, Math.round(v)));
  const out: QualityVideoSummary = { samples: Math.min(10_000, samples.length) };
  const set = <K extends keyof QualityVideoSummary>(key: K, value: QualityVideoSummary[K] | undefined) => { if (value !== undefined) out[key] = value; };
  set("fps_p50", int(pick(sortedFps, 50), 240));
  set("fps_p10", int(pick(sortedFps, 10), 240));
  set("jitter_buffer_ms_avg", totals.jitterBufferEmittedCount ? int((totals.jitterBufferDelay / totals.jitterBufferEmittedCount) * 1000, MAX_MS) : undefined);
  set("rtt_p50_ms", int(pick(rtt, 50), MAX_MS));
  set("rtt_p90_ms", int(pick(rtt, 90), MAX_MS));
  const big = 10_000_000;
  set("packets_received", int(totals.packetsReceived, big));
  set("packets_lost", int(totals.packetsLost, big));
  set("nack", int(totals.nackCount, big));
  set("pli", int(totals.pliCount, big));
  set("fir", int(totals.firCount, big));
  set("freeze_count", int(totals.freezeCount, big));
  set("freeze_ms", int(totals.totalFreezesDuration === undefined ? undefined : totals.totalFreezesDuration * 1000, 86_400_000));
  set("frames_decoded", int(totals.framesDecoded, big));
  set("frames_dropped", int(totals.framesDropped, big));
  set("width", int(latest.find((s) => s.width)?.width, 16384));
  set("height", int(latest.find((s) => s.height)?.height, 16384));
  set("codec", codec);
  set("relay", latest.find((s) => s.relay !== undefined)?.relay);
  return out;
}

export interface QualityCollectorOptions {
  deviceId: string;
  origin: number;
  attempt: number;
  now: () => number;
  env: QualityEnvironment;
  send(report: RemoteDesktopQualityReport): void;
  hidden?: () => boolean;
}

/** The media-side hooks `RemoteDesktopVideo` calls (all optional to the caller). */
export interface RemoteMediaQualitySink {
  mediaState(state: QualityMediaState, error?: string): void;
  frame(): void;
  stats(sample: VideoStatSample | null): void;
}

export class RemoteDesktopQualityCollector implements RemoteMediaQualitySink {
  readonly options: QualityCollectorOptions;
  sessionId: string | undefined;
  transport: RemoteDesktopQualityReport["transport"];
  private steps: Partial<Record<QualityStep, number>> = {};
  private consentStarted: number | undefined;
  private consentWaited = 0;
  private negotiated = 0;
  private mediaMode: "artc" | "legacy" | undefined;
  private legacyFirstFrame: number | undefined;
  private reason: string | undefined;
  private reconnects = 0;
  private playing = false;
  private lanes = { websocket: 0, data_channel: 0 };
  private accepted: number[] = [];
  private executed: number[] = [];
  private samples: VideoStatSample[] = [];
  private sent = false;

  constructor(options: QualityCollectorOptions) { this.options = options; }

  get finished(): boolean { return this.sent; }

  private since(): number { return Math.max(0, Math.min(MAX_MS, Math.round(this.options.now() - this.options.origin))); }
  mark(step: QualityStep): void { if (!this.sent && this.steps[step] === undefined) this.steps[step] = this.since(); }
  /** First terminal code wins; later ones are consequences. */
  fail(code: unknown): void { if (!this.sent && this.reason === undefined) this.reason = qualityCode(code); }

  sessionState(state: string, error?: string): void {
    if (state === "pending_consent") { if (this.consentStarted === undefined) this.consentStarted = this.options.now(); return; }
    if (this.consentStarted !== undefined && this.steps.consent_ms === undefined && (state === "connecting" || state === "active")) {
      this.consentWaited = Math.max(0, this.options.now() - this.consentStarted);
      this.steps.consent_ms = Math.min(MAX_MS, Math.round(this.consentWaited));
    }
    if (state === "active") this.mark("active_ms");
    if (state === "closed") this.fail(error || "session_closed");
  }
  negotiate(ok: boolean, error?: string): void {
    this.negotiated++;
    if (this.negotiated === 1) {
      if (ok) { this.mediaMode = "artc"; this.mark("media_negotiate_ms"); }
      else if (error === "media_unsupported") this.mediaMode = "legacy";
    }
  }
  legacyFrame(): void { if (this.legacyFirstFrame === undefined && this.mediaMode !== "artc") this.legacyFirstFrame = this.since(); }
  inputSent(lane: QualityLane): void { this.lanes[lane]++; }
  controlTiming(sample: RemoteControlTiming): void {
    const list = sample.stage === "accepted" ? this.accepted : this.executed;
    if (list.length < MAX_SAMPLES) list.push(sample.elapsedMs);
  }
  mediaState(state: QualityMediaState, error?: string): void {
    if (state === "waiting_frame" || state === "playing") this.mark("artc_join_ms");
    if (state === "playing") this.playing = true;
    if (state === "reconnecting" && this.playing) { this.playing = false; this.reconnects++; }
    if (state === "error") this.fail(error || "media_error");
  }
  frame(): void { this.mark("artc_join_ms"); this.mark("first_frame_ms"); }
  stats(sample: VideoStatSample | null): void {
    if (!sample || this.sent) return;
    this.samples.push(sample);
    if (this.samples.length > STAT_SAMPLES) this.samples.splice(0, this.samples.length - STAT_SAMPLES);
  }

  report(defaultReason = "viewer_closed"): RemoteDesktopQualityReport {
    const steps = { ...this.steps };
    const media = this.mediaMode ?? (this.legacyFirstFrame !== undefined ? "legacy" : "none");
    if (media !== "artc") {
      delete steps.first_frame_ms;
      delete steps.artc_join_ms;
      if (this.legacyFirstFrame !== undefined) steps.first_frame_ms = this.legacyFirstFrame;
    }
    const accepted = percentiles(this.accepted), executed = percentiles(this.executed);
    const video = summarizeVideoStats(this.samples);
    return {
      v: 1, device_id: this.options.deviceId, ...(this.sessionId ? { session_id: this.sessionId } : {}),
      attempt: Math.min(20, Math.max(0, this.options.attempt | 0)), ...(this.transport ? { transport: this.transport } : {}),
      media, end_reason: this.reason ?? qualityCode(defaultReason),
      duration_ms: Math.max(0, Math.min(86_400_000, Math.round(this.options.now() - this.options.origin))),
      reconnects: Math.min(10_000, this.reconnects), media_renewals: Math.min(10_000, Math.max(0, this.negotiated - 1)),
      steps,
      input: { ws_count: this.lanes.websocket, dc_count: this.lanes.data_channel, ...(accepted ? { accepted } : {}), ...(executed ? { executed } : {}) },
      ...(video ? { video } : {}),
      env: this.options.env,
    };
  }

  /** Send once. Later calls are no-ops. */
  finish(defaultReason?: string): void {
    if (this.sent) return;
    const reason = defaultReason ?? (this.options.hidden?.() ? "page_hidden" : "viewer_closed");
    const report = this.report(reason);
    this.sent = true;
    try { this.options.send(report); } catch { /* diagnostics only */ }
  }
}

/**
 * Wraps a panel's client so the session it drives is measured without touching its control flow.
 * `begin` is called when the person's click (or the one automatic retry) is spent; each
 * `createSession` then starts one collector, finished by `closeSession` or a failed request.
 */
export class RemoteDesktopQualityHub {
  private pending: { at: number; attempt: number } | null = null;
  private collectors = new Map<string, RemoteDesktopQualityCollector>();
  private readonly now: () => number;
  private readonly env: () => QualityEnvironment;
  constructor(now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now()), env: () => QualityEnvironment = () => qualityEnvironment()) {
    this.now = now; this.env = env;
  }

  begin(origin: { at?: number; attempt?: number }): void {
    this.pending = { at: Number.isFinite(origin.at) ? origin.at as number : this.now(), attempt: origin.attempt ?? 0 };
  }

  forSession(sessionId: string): RemoteDesktopQualityCollector | undefined {
    const collector = this.collectors.get(sessionId);
    return collector && !collector.finished ? collector : undefined;
  }

  wrap(client: RemoteDesktopClient): RemoteDesktopClient {
    const hub = this;
    const send = (report: RemoteDesktopQualityReport) => { void client.reportQuality?.(report).catch(() => {}); };
    const start = (deviceId: string) => {
      const origin = hub.pending ?? { at: hub.now(), attempt: 0 };
      hub.pending = null;
      return new RemoteDesktopQualityCollector({
        deviceId, origin: origin.at, attempt: origin.attempt, now: hub.now, env: safeEnv(hub.env), send,
        hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
      });
    };
    const wrapped: RemoteDesktopClient = {
      ...client,
      async createSession(deviceId, options) {
        const collector = start(deviceId);
        const result = await client.createSession(deviceId, options);
        collector.mark("create_ms");
        if (!result.ok || !result.data) {
          if (result.error !== "aborted") collector.finish(qualityCode(result.error ?? (result.status ? `http_${result.status}` : "unknown")));
          return result;
        }
        collector.sessionId = result.data.session_id;
        collector.transport = result.data.transport ?? "http-v1";
        if (result.data.state === "pending_consent") collector.sessionState("pending_consent");
        hub.collectors.set(result.data.session_id, collector);
        while (hub.collectors.size > 8) hub.collectors.delete(hub.collectors.keys().next().value!);
        return result;
      },
      async getFrame(deviceId, sessionId, options) {
        const result = await client.getFrame(deviceId, sessionId, options);
        const collector = hub.forSession(sessionId);
        if (collector && result.ok && result.data) {
          collector.sessionState(result.data.state, result.data.error);
          if (result.data.frame) collector.legacyFrame();
        }
        return result;
      },
      async closeSession(deviceId, sessionId) {
        hub.forSession(sessionId)?.finish();
        return client.closeSession(deviceId, sessionId);
      },
    };
    if (client.openStream) {
      const open = client.openStream.bind(client);
      wrapped.openStream = async (deviceId, sessionId, handlers, options) => {
        const collector = hub.forSession(sessionId);
        if (!collector) return open(deviceId, sessionId, handlers, options);
        const measured: RemoteDesktopStreamHandlers = {
          ...handlers,
          state(state, error) { collector.sessionState(state, error); handlers.state(state, error); },
          frame(frame) { collector.legacyFrame(); handlers.frame(frame); },
          error(code) { collector.fail(code); handlers.error(code); },
          controlTiming(sample) { collector.controlTiming(sample); handlers.controlTiming?.(sample); },
          media(media, status) {
            if (status?.state === "failed") collector.fail(status.error || "media_capture_or_publish_failed");
            handlers.media?.(media, status);
          },
        };
        const result = await open(deviceId, sessionId, measured, options);
        if (!result.ok || !result.data) { collector.fail(result.error ?? "stream_failed"); return result; }
        collector.mark("stream_open_ms");
        const stream = result.data;
        const instrumented: RemoteDesktopStream = Object.assign(Object.create(stream) as RemoteDesktopStream, {
          send(action: Parameters<RemoteDesktopStream["send"]>[0]) {
            const ok = stream.send(action);
            if (ok) collector.inputSent(stream.inputPath?.() ?? "websocket");
            return ok;
          },
        });
        return { ...result, data: instrumented };
      };
    }
    if (client.negotiateMedia) {
      const negotiate = client.negotiateMedia.bind(client);
      wrapped.negotiateMedia = async (deviceId, sessionId, displayId, options) => {
        const result = await negotiate(deviceId, sessionId, displayId, options);
        if (result.error !== "aborted") hub.forSession(sessionId)?.negotiate(result.ok, result.error);
        return result;
      };
    }
    wrapped.mediaQuality = (sessionId) => hub.forSession(sessionId) ?? null;
    return wrapped;
  }
}

function safeEnv(read: () => QualityEnvironment): QualityEnvironment {
  try { return read(); } catch { return { browser: "other", platform: "other", site: "other" }; }
}
