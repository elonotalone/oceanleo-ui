"use client";
import { useEffect, useRef, type RefObject } from "react";
import type { CSSProperties } from "react";
import type { RemoteDesktopClient, RemoteDesktopDataLane, RemoteMediaStatus } from "../api/remote-desktop";
import { openRemoteMedia, RemotePublisherStatusError, type RemoteMediaDiagnostic, type RemoteMediaState, type RemoteMediaViewer } from "./remote-desktop-media";
import { videoStatSample } from "../api/remote-desktop-quality";

/** Anonymous quality report cadence for the receiver's getStats (diagnostics only). */
const QUALITY_STATS_MS = 2000;

/** D7: fit-to-window (default) or the remote screen at its original pixel size. */
export function remoteFrameStyle(fit: boolean, width?: number, height?: number): CSSProperties {
  const ratio = typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  if (fit || !width || !height) return { width: "100%", height: "100%", maxWidth: "none", objectFit: "contain", display: "block" };
  return { width: `${width / ratio}px`, height: `${height / ratio}px`, maxWidth: "none", objectFit: "contain", display: "block", flex: "none" };
}

export function RemoteDesktopVideo({ client, deviceId, sessionId, videoRef, onState, onFrame, onLegacy, onStatus, onDataChannel, onDiagnostic, displayId, fit, width, height }: {
  client: RemoteDesktopClient; deviceId: string; sessionId: string;
  videoRef: RefObject<HTMLVideoElement | null>; displayId?: string; fit: boolean; width?: number; height?: number;
  onDataChannel?(lane: RemoteDesktopDataLane | null): void;
  onDiagnostic?(detail: RemoteMediaDiagnostic): void;
  onState(value: RemoteMediaState, error?: string, status?: number): void;
  onFrame(width: number, height: number): void;
  onLegacy(): void;
  onStatus(status: RemoteMediaStatus | null): void;
}) {
  const callbacks = useRef({ onState, onFrame, onLegacy, onStatus, onDataChannel, onDiagnostic });
  callbacks.current = { onState, onFrame, onLegacy, onStatus, onDataChannel, onDiagnostic };
  const previousClose = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const abort = new AbortController();
    let viewer: RemoteMediaViewer | undefined;
    const quality = client.mediaQuality?.(sessionId) ?? null;
    let statsTimer: ReturnType<typeof setInterval> | undefined;
    const negotiate = async () => {
      const response = await client.negotiateMedia!(deviceId, sessionId, displayId, { signal: abort.signal });
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
  return <video ref={videoRef} data-remote-video autoPlay muted playsInline style={remoteFrameStyle(fit, width, height)} />;
}
