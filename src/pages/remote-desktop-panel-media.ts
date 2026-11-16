"use client";

import { useCallback, useEffect } from "react";

import { RemoteDesktopVideo } from "./RemoteDesktopVideo";

import { remoteDesktopErrorCopy } from "./remote-desktop-input";
import { isNetworkFailure } from "../api/remote-desktop-retry";

import type { RemoteDesktopPanelContext } from "./remote-desktop-panel-state";
import type { ComponentProps } from "react";
import type { useRemoteDesktopSession } from "./remote-desktop-session";

export function useRemoteDesktopPanelMedia(context: RemoteDesktopPanelContext, session: ReturnType<typeof useRemoteDesktopSession>, deviceId: string) {
  const { frame, measuring, mediaMode, mediaStatus, displayId, mediaReady, sessionRef, setFrame, setMessage,
    setPictureMeasurements, setClockUncertainty, setMediaMode, setMediaDiagnostic, setMediaNotice,
    setMediaReady, earlyMediaRef, measurements, mediaFrameGeometry, laneRef, videoRef, streamRef, markRef,
    model, releaseInput, updatePhase, acceptMediaStatus, acceptMediaFrame } = context;
  const { client, disconnect, reconnectDataChannel, reportDiagnostics } = session;
  const sessionId = sessionRef.current;
  useEffect(() => {
    if (mediaMode !== "webrtc" || !displayId || !sessionId || !client.negotiateMedia) return;
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 500;
    const select = async () => {
      const result = await client.negotiateMedia!(deviceId, sessionId, displayId, { signal: abort.signal, transport: "webrtc-v1" }).catch(() => ({ ok: false, error: "network_error" }));
      if (abort.signal.aborted) return;
      if (result.ok && "data" in result && result.data) { acceptMediaStatus(result.data.media_status); return; }
      setMediaNotice(isNetworkFailure(result.error) ? "连接不稳，正在重试…" : remoteDesktopErrorCopy(result.error));
      if (isNetworkFailure(result.error)) { retry = setTimeout(() => { void select(); }, delay); delay = Math.min(delay * 2, 4000); }
    };
    void select();
    return () => { abort.abort(); if (retry) clearTimeout(retry); };
  }, [acceptMediaStatus, client, deviceId, displayId, mediaMode, sessionId, setMediaNotice]);
  useEffect(() => { measurements.current?.setEnabled(measuring); setPictureMeasurements({}); setClockUncertainty(undefined); }, [measurements, measuring, setClockUncertainty, setPictureMeasurements]);
  useEffect(() => { if (mediaReady) markRef.current?.("frame_ready_commit"); }, [markRef, mediaReady]);
  const invalidateMediaFrame = useCallback(() => {
    releaseInput();
    mediaFrameGeometry.current = null;
    setFrame(null);
    setMediaReady(false);
    setMediaNotice("已发出请求，等这台电脑显示画面…");
  }, [mediaFrameGeometry, releaseInput, setFrame, setMediaNotice, setMediaReady]);

  const videoProps: Omit<ComponentProps<typeof RemoteDesktopVideo>, "sessionId"> = {
    client, deviceId, videoRef, displayId, early: earlyMediaRef.current, showFrame: Boolean(frame), measurements: measuring ? measurements.current : null, publisher: mediaStatus?.metrics as Record<string, number> | undefined,
    onDataChannel: lane => { laneRef.current = lane; streamRef.current?.attachDataChannel?.(lane); measurements.current?.setLane(lane); },
    onMeasurements: (value, uncertainty) => { setPictureMeasurements(value); setClockUncertainty(uncertainty); },
    onViewerReport: report => { streamRef.current?.sendViewerReport(report); },
    onQualityWindow: window => { void client.reportQualityWindow?.(window).catch(() => {}); },
    onDiagnostic: setMediaDiagnostic, onDiagnostics: reportDiagnostics, onTiming: reportDiagnostics,
          onFrame: acceptMediaFrame,
          onState: (value, error, status) => {
            // Keep the last decoded picture and its geometry during a short media interruption.
            // Input waits for a fresh frame; an SDK "playing" notification alone cannot enable it.
            if (value !== "playing") { releaseInput(); setMediaReady(false); }
            setMediaNotice(value === "playing" && model.getSnapshot().mediaReady ? "" : value === "reconnecting" ? error === "media_data_channel_unavailable" ? remoteDesktopErrorCopy(error) : "连接不稳，正在重试…" : "已发出请求，等这台电脑显示画面…");
            if (error === "media_data_channel_unavailable") { reconnectDataChannel(); return; }
            if (value === "error") { disconnect(); updatePhase(error === "denied" ? "denied" : error === "request_expired" ? "timed_out" : error === "signed_out" ? "signed_out" : error === "revoked" || error === "controller_revoked" ? "revoked" : "error"); setMessage(remoteDesktopErrorCopy(error, status)); }
          },
          onStatus: acceptMediaStatus,
  };
  return { videoProps, invalidateMediaFrame };
}
