"use client";

import { useEffect, type RefObject } from "react";
import type { RemoteDesktopStream } from "../api/remote-desktop";

/** The stream owns the peer and its recovery; mounting pixels never opens another connection. */
export function RemoteDesktopWebRtcVideo({ stream, videoRef, showFrame }: {
  stream: RemoteDesktopStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  showFrame: boolean;
}) {
  useEffect(() => {
    stream?.attachVideo?.(videoRef.current);
    return () => { stream?.attachVideo?.(null); };
  }, [stream, videoRef]);

  return <video ref={videoRef} data-remote-webrtc-video autoPlay playsInline muted
    style={{ width: "100%", height: "100%", maxWidth: "none", objectFit: "contain", display: "block", visibility: showFrame ? "visible" : "hidden" }} />;
}
