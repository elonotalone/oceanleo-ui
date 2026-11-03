"use client";
import { useEffect, useRef, type RefObject } from "react";
import type { CSSProperties } from "react";
import type { RemoteDesktopApiResult, RemoteDesktopClient, RemoteDesktopDataLane, RemoteMediaResponse, RemoteMediaStatus } from "../api/remote-desktop";

/** A negotiation the panel started right after session create, before the stream socket opened. */
export interface RemoteEarlyMedia { sessionId: string; displayId?: string; response: Promise<RemoteDesktopApiResult<RemoteMediaResponse>>; consumed?: boolean }
import { openRemoteMedia, RemotePublisherStatusError, type RemoteMediaDiagnostic, type RemoteMediaState, type RemoteMediaViewer, type RemoteMediaDiagnosticSnapshot, type RemoteMediaStartupTimings } from "./remote-desktop-media";
import { videoStatSample } from "../api/remote-desktop-quality";

/** Anonymous quality report cadence for the receiver's getStats (diagnostics only). */
const QUALITY_STATS_MS = 2000;

/** D7: fit-to-window (default) or the remote screen at its original pixel size. */
export function remoteFrameStyle(fit: boolean, width?: number, height?: number): CSSProperties {
  const ratio = typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  if (fit || !width || !height) return { width: "100%", height: "100%", maxWidth: "none", objectFit: "contain", display: "block" };
  return { width: `${width / ratio}px`, height: `${height / ratio}px`, maxWidth: "none", objectFit: "contain", display: "block", flex: "none" };
}

export function RemoteDesktopVideo({ client, deviceId, sessionId, videoRef, early, onState, onFrame, onLegacy, onStatus, onDataChannel, onDiagnostic, onDiagnostics, onTiming, displayId, fit, width, height, showFrame = true }: {
  client: RemoteDesktopClient; deviceId: string; sessionId: string; early?: RemoteEarlyMedia | null;
  videoRef: RefObject<HTMLVideoElement | null>; displayId?: string; fit: boolean; width?: number; height?: number; showFrame?: boolean;
  onDataChannel?(lane: RemoteDesktopDataLane | null): void;
  onDiagnostic?(detail: RemoteMediaDiagnostic): void;
  onDiagnostics?(value: RemoteMediaDiagnosticSnapshot): void;
  onTiming?(value: RemoteMediaStartupTimings): void;
  onState(value: RemoteMediaState, error?: string, status?: number): void;
  onFrame(width: number, height: number): void;
  onLegacy(): void;
  onStatus(status: RemoteMediaStatus | null): void;
}) {
  const callbacks = useRef({ onState, onFrame, onLegacy, onStatus, onDataChannel, onDiagnostic, onDiagnostics, onTiming });
  callbacks.current = { onState, onFrame, onLegacy, onStatus, onDataChannel, onDiagnostic, onDiagnostics, onTiming };
  const previousClose = useRef<Promise<void>>(Promise.resolve());
  const earlyRef = useRef(early); earlyRef.current = early;
  useEffect(() => {
    const abort = new AbortController();
    let viewer: RemoteMediaViewer | undefined;
    const quality = client.mediaQuality?.(sessionId) ?? null;
    let statsTimer: ReturnType<typeof setInterval> | undefined;
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
        state: (state, error, status) => { if (!abort.signal.aborted) { quality?.mediaState(state, error); callbacks.current.onState(state, error, status); } },
        frame: (width, height) => { if (!abort.signal.aborted) { quality?.frame(); callbacks.current.onFrame(width, height); } },
        renew: negotiate,
        dataChannel: (lane) => { callbacks.current.onDataChannel?.(abort.signal.aborted ? null : lane); },
        diagnostic: (detail) => { if (!abort.signal.aborted) callbacks.current.onDiagnostic?.(detail); },
        timing: (value) => { callbacks.current.onTiming?.(value); },
        diagnostics: (value) => { callbacks.current.onDiagnostics?.(value); },
      }, abort.signal);
      const opened = viewer;
      if (quality && opened?.stats && !abort.signal.aborted) {
        statsTimer = setInterval(() => {
          void opened.stats!().then((reports) => { if (!abort.signal.aborted) quality.stats(videoStatSample(reports as Parameters<typeof videoStatSample>[0])); }).catch(() => {});
        }, QUALITY_STATS_MS);
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
      clearInterval(statsTimer);
      callbacks.current.onDataChannel?.(null);
      previousClose.current = start.then(async () => { await viewer?.close(); });
    };
  }, [client, deviceId, sessionId, videoRef, displayId]);
  // No canvas copy: the SDK attaches the decoded MediaStream to this element directly (D5).
  // Geometry changes hide obsolete pixels without detaching the decoder; stalls keep showFrame true.
  return <video ref={videoRef} data-remote-video autoPlay muted playsInline style={{ ...remoteFrameStyle(fit, width, height), opacity: showFrame ? 1 : 0 }} />;
}
