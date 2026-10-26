"use client";
import { useEffect, useRef, type RefObject } from "react";
import type { RemoteDesktopClient, RemoteMediaStatus } from "../api/remote-desktop";
import { openRemoteMedia, type RemoteMediaState, type RemoteMediaViewer } from "./remote-desktop-media";

export function RemoteDesktopVideo({ client, deviceId, sessionId, videoRef, onState, onFrame, onLegacy, onStatus, displayId, zoom }: {
  client: RemoteDesktopClient; deviceId: string; sessionId: string;
  videoRef: RefObject<HTMLVideoElement | null>; displayId?: string; zoom: number;
  onState(value: RemoteMediaState, error?: string): void;
  onFrame(width: number, height: number): void;
  onLegacy(): void;
  onStatus(status: RemoteMediaStatus | null): void;
}) {
  const callbacks = useRef({ onState, onFrame, onLegacy, onStatus });
  callbacks.current = { onState, onFrame, onLegacy, onStatus };
  const previousClose = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const abort = new AbortController();
    let viewer: RemoteMediaViewer | undefined;
    const negotiate = async () => {
      const response = await client.negotiateMedia!(deviceId, sessionId, displayId, { signal: abort.signal });
      if (abort.signal.aborted) throw new Error("aborted");
      if (!response.ok || !response.data) throw new Error(response.error || "media_unavailable");
      callbacks.current.onStatus(response.data.media_status);
      return response.data.media;
    };
    const start = (async () => {
      await previousClose.current;
      if (abort.signal.aborted) return;
      callbacks.current.onState("joining");
      const credentials = await negotiate();
      if (abort.signal.aborted || !videoRef.current) return;
      viewer = await openRemoteMedia(credentials, videoRef.current, {
        state: (state, error) => { if (!abort.signal.aborted) callbacks.current.onState(state, error); },
        frame: (width, height) => { if (!abort.signal.aborted) callbacks.current.onFrame(width, height); },
        renew: negotiate,
      }, abort.signal);
    })().catch((error: unknown) => {
      if (abort.signal.aborted) return;
      const code = error instanceof Error ? error.message : "media_unavailable";
      if (code === "media_unsupported") callbacks.current.onLegacy();
      else callbacks.current.onState("error", code);
    });
    return () => {
      abort.abort();
      previousClose.current = start.then(async () => { await viewer?.close(); });
    };
  }, [client, deviceId, sessionId, videoRef, displayId]);
  return <video ref={videoRef} data-remote-video autoPlay muted playsInline
    style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, maxWidth: "none", objectFit: "contain", display: "block" }} />;
}
