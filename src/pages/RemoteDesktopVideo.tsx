"use client";
import { useEffect, useRef, type RefObject } from "react";
import type { CSSProperties } from "react";
import type { RemoteDesktopApiResult, RemoteDesktopClient, RemoteDesktopDataLane, RemoteMediaResponse, RemoteMediaStatus } from "../api/remote-desktop";

/** A negotiation the panel started right after session create, before the stream socket opened. */
export interface RemoteEarlyMedia { sessionId: string; displayId?: string; response: Promise<RemoteDesktopApiResult<RemoteMediaResponse>>; consumed?: boolean }
import { openRemoteMedia, RemotePublisherStatusError, type RemoteMediaDiagnostic, type RemoteMediaState, type RemoteMediaViewer, type RemoteMediaDiagnosticSnapshot, type RemoteMediaStartupTimings } from "./remote-desktop-media";
import { decodeRemotePictureMarker, type RemoteDesktopMeasurements, type RemotePictureMeasurements } from "../api/remote-desktop-measure";
import { type RemoteDesktopQualityWindow, type RemoteDesktopViewerReport, type VideoStatSample } from "../api/remote-desktop-quality";

/** Window and opt-in picture measurement cadence; RTC samples come from the media watchdog. */
const QUALITY_WINDOW_TICK_MS = 1000;

/** Remote pictures always fit the stage; input maps through the contained rectangle. */
export function remoteFrameStyle(): CSSProperties {
  return { width: "100%", height: "100%", maxWidth: "none", objectFit: "contain", display: "block" };
}

export function RemoteDesktopVideo({ client, deviceId, sessionId, videoRef, early, onState, onFrame, onLegacy, onStatus, onDataChannel, onViewerReport, onQualityWindow, publisher, onDiagnostic, onDiagnostics, onTiming, measurements, onMeasurements, displayId, showFrame = true }: {
  client: RemoteDesktopClient; deviceId: string; sessionId: string; early?: RemoteEarlyMedia | null;
  videoRef: RefObject<HTMLVideoElement | null>; displayId?: string; showFrame?: boolean;
  measurements?: RemoteDesktopMeasurements | null;
  onMeasurements?(value: RemotePictureMeasurements, uncertainty?: number): void;
  onDataChannel?(lane: RemoteDesktopDataLane | null): void;
  onViewerReport?(report: RemoteDesktopViewerReport): void;
  onQualityWindow?(window: RemoteDesktopQualityWindow): void;
  publisher?: Record<string, number>;
  onDiagnostic?(detail: RemoteMediaDiagnostic): void;
  onDiagnostics?(value: RemoteMediaDiagnosticSnapshot): void;
  onTiming?(value: RemoteMediaStartupTimings): void;
  onState(value: RemoteMediaState, error?: string, status?: number): void;
  onFrame(width: number, height: number): void;
  onLegacy(): void;
  onStatus(status: RemoteMediaStatus | null): void;
}) {
  const callbacks = useRef({ onState, onFrame, onLegacy, onStatus, onDataChannel, onViewerReport, onQualityWindow, onDiagnostic, onDiagnostics, onTiming, onMeasurements });
  callbacks.current = { onState, onFrame, onLegacy, onStatus, onDataChannel, onViewerReport, onQualityWindow, onDiagnostic, onDiagnostics, onTiming, onMeasurements };
  const measurementsRef = useRef(measurements); measurementsRef.current = measurements;
  const previousClose = useRef<Promise<void>>(Promise.resolve());
  const earlyRef = useRef(early); earlyRef.current = early;
  // Publisher metrics are refreshed on every status response; their object identity
  // must not restart the receive engine while joinChannel is pending.
  const publisherRef = useRef(publisher); publisherRef.current = publisher;
  useEffect(() => {
    const abort = new AbortController();
    let viewer: RemoteMediaViewer | undefined;
    const quality = client.mediaQuality?.(sessionId) ?? null;
    let windowTimer: ReturnType<typeof setInterval> | undefined;
    let reportSeq = 0;
    let directPublisher: Record<string, number> = {};
    let markerCanvas: HTMLCanvasElement | null = null;
    let latestReport: RemoteDesktopViewerReport = { t: "rd.viewer_report", v: 1, seq: 1 };
    let latestReportAt = -Infinity;
    let qualityWindowStart = Date.now();
    let previousStats: VideoStatSample | null = null;
    let previousStatsAt = performance.now();
    let negotiated = false;
    const first = earlyRef.current;
    const timing = (step: "media_negotiate_started_ms" | "media_negotiated_ms") => {
      try { callbacks.current.onTiming?.({ v: 1, kind: 3, at_ms: performance.now(), [step]: performance.now() }); } catch { /* measurement only */ }
    };
    const negotiate = async () => {
      if (!negotiated) timing("media_negotiate_started_ms");
      // The first negotiation may already be in flight since session create; a failed one is retried normally.
      const usable = !negotiated && first && !first.consumed && first.sessionId === sessionId && first.displayId === displayId;
      if (usable) first.consumed = true;
      const prefetched = usable ? await first.response.catch(() => null) : null;
      const response = prefetched?.ok && prefetched.data ? prefetched : await client.negotiateMedia!(deviceId, sessionId, displayId, { signal: abort.signal });
      if (!negotiated) { negotiated = true; timing("media_negotiated_ms"); }
      if (abort.signal.aborted) throw new Error("aborted");
      if (!response.ok || !response.data) throw Object.assign(new Error(response.error || "media_unavailable"), { status: response.status });
      callbacks.current.onStatus(response.data.media_status);
      if (response.data.media_status?.state === "failed") {
        throw new RemotePublisherStatusError(response.data.media_status.error);
      }
      return response.data.media;
    };
    const start = (async () => {
      await previousClose.current;
      if (abort.signal.aborted) return;
      callbacks.current.onState("joining");
      const credentials = await negotiate();
      if (abort.signal.aborted || !videoRef.current) return;
      viewer = await openRemoteMedia(credentials, videoRef.current, {
        sessionId,
        state: (state, error, status) => { if (!abort.signal.aborted) { quality?.mediaState(state, error); callbacks.current.onState(state, error, status); } },
        frame: (width, height, sample) => {
          if (abort.signal.aborted) return;
          // C6 v3 measures only a validated code read from this displayed frame; unmarked age stays unknown.
          quality?.frame(); callbacks.current.onFrame(width, height);
          const measuring = measurementsRef.current, video = videoRef.current;
          measuring?.invalidateFrame();
          const short = Math.min(width, height);
          if (measuring && video && short >= 256) {
            try {
              markerCanvas ??= document.createElement("canvas"); markerCanvas.width = 8; markerCanvas.height = 7;
              const context = markerCanvas.getContext("2d", { willReadFrequently: true });
              if (context) {
                context.imageSmoothingEnabled = false;
                const w = Math.round(short * 8 / 32), h = Math.round(short * 7 / 32);
                context.drawImage(video, width - w, height - h, w, h, 0, 0, 8, 7);
                const mark = decodeRemotePictureMarker(context.getImageData(0, 0, 8, 7).data);
                if (mark) measuring.displayed(mark.captureLow24, mark.appliedLow16, performance.timeOrigin + (sample?.presentation_time_ms ?? performance.now()));
              }
            } catch { /* unavailable/tainted canvas means unknown measurement; picture remains live */ }
          }
        },
        stats: (sample) => {
          if (abort.signal.aborted) return;
          quality?.stats(sample);
          const now = performance.now();
          const seconds = Math.max(0.001, (now - previousStatsAt) / 1000);
          const delta = (key: keyof VideoStatSample) => {
            const value = sample?.[key], previous = previousStats?.[key];
            return typeof value === "number" && typeof previous === "number" && value >= previous ? (value - previous) / seconds : undefined;
          };
          const received = delta("packetsReceived"), lost = delta("packetsLost");
          const report: RemoteDesktopViewerReport = { t: "rd.viewer_report", v: 1, seq: ++reportSeq,
            ...(sample?.rttMs !== undefined ? { edge_rtt_ms: Math.round(sample.rttMs) } : {}),
            ...(received !== undefined && lost !== undefined && received + lost > 0 ? { loss_pct: Math.min(100, Math.max(0, Number((lost / (received + lost) * 100).toFixed(2)))) } : {}),
            ...(delta("nackCount") !== undefined ? { nack_ps: Math.max(0, Number(delta("nackCount")!.toFixed(2))) } : {}),
            ...(delta("pliCount") !== undefined ? { pli_ps: Math.max(0, Number(delta("pliCount")!.toFixed(2))) } : {}),
            ...(delta("totalFreezesDuration") !== undefined ? { freeze_ms_2s: Math.min(2000, Math.max(0, Math.round(delta("totalFreezesDuration")! * 1000))) } : {}),
            ...(sample?.fps !== undefined ? { fps_decoded: Number(sample.fps.toFixed(2)) } : {}),
            ...(sample?.jitterBufferDelay !== undefined && sample.jitterBufferEmittedCount ? { jitter_ms: Math.round(sample.jitterBufferDelay / sample.jitterBufferEmittedCount * 1000) } : {}),
          };
          latestReport = report; latestReportAt = now;
          callbacks.current.onViewerReport?.(report);
          previousStats = sample; previousStatsAt = now;
        },
        publisherStats: metrics => { directPublisher = metrics; },
        renew: negotiate,
        dataChannel: (lane) => { callbacks.current.onDataChannel?.(abort.signal.aborted ? null : lane); },
        diagnostic: (detail) => { if (!abort.signal.aborted) { quality?.mediaDiagnostic?.(detail); callbacks.current.onDiagnostic?.(detail); } },
        timing: (value) => { callbacks.current.onTiming?.(value); },
        diagnostics: (value) => { callbacks.current.onDiagnostics?.(value); },
      }, abort.signal);
      if (!abort.signal.aborted) {
        windowTimer = setInterval(() => {
          const measuring = measurementsRef.current;
          measuring?.tick(); measuring?.sampleCurrentPicture();
          if (measuring) callbacks.current.onMeasurements?.(measuring.snapshot(), measuring.clockUncertainty());
          if (Date.now() - qualityWindowStart >= 10_000) {
            const ack = quality?.takeDirectAckWindow?.() ?? {};
            const publisherMetrics = { ...publisherRef.current, ...directPublisher };
            const currentReport = performance.now() - latestReportAt < 2500 ? latestReport : { t: "rd.viewer_report" as const, v: 1 as const, seq: Math.max(1, reportSeq) };
            callbacks.current.onQualityWindow?.({ v: 1, device_id: deviceId, session_id: sessionId,
              window_start_ms: qualityWindowStart, viewer: { ...currentReport, ...ack, ...measuring?.takeWindow() },
              ...(quality?.mediaDiagnostics?.() ? { media_diagnostics: quality.mediaDiagnostics() } : {}),
              ...(Object.keys(publisherMetrics).length ? { publisher: publisherMetrics } : {}) });
            qualityWindowStart = Date.now();
          }
        }, QUALITY_WINDOW_TICK_MS);
      }
    })().catch((error: unknown) => {
      if (abort.signal.aborted) return;
      const code = error instanceof Error ? error.message : "media_unavailable";
      if (code !== "media_unsupported") quality?.mediaState("error", code);
      if (code === "media_unsupported") callbacks.current.onLegacy();
      else callbacks.current.onState("error", code, error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : undefined);
    });
    return () => {
      abort.abort();
      clearInterval(windowTimer);
      callbacks.current.onDataChannel?.(null);
      previousClose.current = start.then(async () => { await viewer?.close(); });
    };
  }, [client, deviceId, sessionId, videoRef, displayId]);
  // The SDK displays the stream directly. Only opt-in measurement reads the 8×7 corner code.
  // Stalls retain the last picture; publisher telemetry never gates decoded pixels.
  return <video ref={videoRef} data-remote-video autoPlay muted playsInline style={{ ...remoteFrameStyle(), opacity: showFrame ? 1 : 0 }} />;
}
