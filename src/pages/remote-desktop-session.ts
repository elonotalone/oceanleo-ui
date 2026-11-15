"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { remoteDesktopClient, type RemoteDesktopActivity, type RemoteDesktopAccess, type RemoteDesktopAction, type RemoteDesktopApiResult, type RemoteDesktopStream, type RemoteDesktopStreamHandlers } from "../api/remote-desktop";
import { isNetworkFailure, newRequestId } from "../api/remote-desktop-retry";

import { remoteDesktopTicket } from "./remote-desktop-ticket";
import { remoteDesktopErrorCopy, remoteDesktopNoticeCopy } from "./remote-desktop-input";
import { releaseRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";

import { RemoteDesktopMeasurements } from "../api/remote-desktop-measure";
import { RemoteDesktopQualityHub } from "../api/remote-desktop-quality";

import type { RemoteMediaDiagnostic, RemoteMediaStartupTimings } from "./remote-desktop-media";

import type { Phase, PanelTimingStep, RemoteDesktopPanelProps, RemoteDesktopDiagnosticSample } from "./remote-desktop-panel-types";
import type { RemoteDesktopPanelContext } from "./remote-desktop-panel-state";
const terminal = (code?: string): Phase => code === "denied" ? "denied" : code === "request_expired" ? "timed_out" : code === "signed_out" ? "signed_out" : code === "revoked" || code === "controller_revoked" ? "revoked" : "error";
/** Recovery budget for the same session, matching the gateway default. */
export const RECONNECT_WINDOW_MS = 180_000;
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms);
  if (signal.aborted) done(); else signal.addEventListener("abort", done, { once: true });
});

export function useRemoteDesktopSession(context: RemoteDesktopPanelContext, props: RemoteDesktopPanelProps) {
  const { ticket, phase, frame, measuring, mediaMode, access, billing, mediaDiagnostic, reconnecting,
    reconnectDeadline, idleDeadline, setTicket, setFrame, setMessage, setHandingBack, setHandoffFrozen,
    setHandoffDone, setPictureMeasurements, setClockUncertainty, setCoarse, setKeyboard, setMediaMode,
    setMediaStatus, setDisplayId, setAccess, setBilling, setMediaDiagnostic, setMediaNotice,
    setMediaReady, setReconnecting, setReconnectDeadline, setIdleDeadline, setClockNow, setConnectTiming,
    qualityRef, sessionRef, diagnosticsRef, earlyMediaRef, sessionClientRef, completedHandoff, handoffRef,
    agentRef, measurements, mediaFrameGeometry, laneRef, streamRef, streamModeRef, closedRef, abortRef,
    previousCloseRef, reconnectAttempts, reconnectTicket, recoveryWindow, markRef, queueRef, pumpingRef,
    sequenceRef, model, clearLocalInput, releaseInput, updatePhase, acceptMediaStatus, canSend } = context;
  const { deviceId, client: baseClient = remoteDesktopClient, frameIntervalMs = 250, agentRequest = false, ticket: requested } = props;
  const reportDiagnostics = useCallback((value: RemoteDesktopDiagnosticSample) => {
    try {
      diagnosticsRef.current?.(value);
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      const collector = qualityRef.current?.forSession(sessionId);
      if (!collector) return;
      if ((value as RemoteMediaStartupTimings).kind === 3) collector.mediaTiming(value as RemoteMediaStartupTimings);
      else if ("sdk_error" in value || "renew_reason" in value) collector.mediaDiagnostic(value as RemoteMediaDiagnostic);
    } catch { /* measurement only */ }
  }, [diagnosticsRef, qualityRef, sessionRef]);
  // Anonymous per-session quality report: the wrapper measures the client calls; control flow is unchanged.
  const client = useMemo(() => {
    if (!baseClient) return baseClient;
    qualityRef.current ??= new RemoteDesktopQualityHub();
    return qualityRef.current.wrap(baseClient);
  }, [baseClient, qualityRef]);
  useEffect(() => { if (requested) setTicket(requested); }, [requested, setTicket]);
  useEffect(() => {
    if (reconnectDeadline === null && idleDeadline === null) return;
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [reconnectDeadline, idleDeadline, setClockNow]);
  const acceptActivity = useCallback((activity: RemoteDesktopActivity | null) => {
    const now = Date.now();
    if (activity?.reconnect_window_s) recoveryWindow.current = activity.reconnect_window_s * 1000;
    setClockNow(now);
    setReconnectDeadline(activity?.reconnect_remaining_s != null ? now + activity.reconnect_remaining_s * 1000 : null);
    setIdleDeadline(activity?.idle_confirmation_required && activity.idle_remaining_s != null ? now + activity.idle_remaining_s * 1000 : null);
  }, [recoveryWindow, setClockNow, setIdleDeadline, setReconnectDeadline]);
  const send = useCallback((action: RemoteDesktopAction) => {
    if (!canSend()) return;
    if (streamRef.current?.send(action) && action.kind !== "release_all") { completedHandoff.current = null; setHandoffDone(false); }
  }, [canSend, completedHandoff, setHandoffDone, streamRef]);

  const handBack = useCallback(async () => {
    const original = agentRef.current, stream = streamRef.current;
    const sessionId = sessionRef.current, signal = abortRef.current?.signal;
    if (!original?.handBack || original.busy || handoffRef.current) return;
    if (completedHandoff.current && (original.handoffKey ? completedHandoff.current.key === original.handoffKey
      : completedHandoff.current.callback === original.onHandBack)) return;
    const attempt = {}; handoffRef.current = attempt;
    setHandingBack(true); setHandoffFrozen(true);
    clearLocalInput();
    const sameSession = () => handoffRef.current === attempt && !closedRef.current && !signal?.aborted
      && sessionRef.current === sessionId && streamRef.current === stream;
    const current = () => sameSession() && model.getSnapshot().phase === "active"
      && (original.handoffKey ? agentRef.current?.handoffKey === original.handoffKey : agentRef.current?.onHandBack === original.onHandBack);
    try {
      if (!streamModeRef.current || !stream?.releaseForHandoff) throw new Error("input_ack_unknown");
      await stream.releaseForHandoff();
      const latest = agentRef.current;
      if (!current() || !latest?.handBack || latest.busy
        || (original.handoffKey ? latest.handoffKey !== original.handoffKey : latest.onHandBack !== original.onHandBack)) throw new Error("input_ack_unknown");
      const confirmed = await latest.onHandBack();
      if (!current()) return;
      if (confirmed !== true) throw new Error("input_ack_unknown");
      clearLocalInput(); stream.finishHandoff(); completedHandoff.current = {key: original.handoffKey, callback: original.onHandBack}; setHandoffDone(true); handoffRef.current = null; setHandoffFrozen(false);
    } catch (error) {
      if (sameSession()) {
        setMessage("没有收到电脑控制的确认，请核对最新状态；不会自动重复操作。");
        if (error instanceof Error && /^input_receipt_(merged|rejected)$/.test(error.message)) {
          handoffRef.current = null;
          setHandoffFrozen(false);
          setHandingBack(false);
        }
      }
    } finally { if (sameSession() || handoffRef.current === null && !closedRef.current) setHandingBack(false); }
  }, [abortRef, agentRef, clearLocalInput, closedRef, completedHandoff, handoffRef, model, sessionRef, setHandingBack, setHandoffDone, setHandoffFrozen, setMessage, streamModeRef, streamRef]);

  const dcRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dcRecovering = useRef(false);
  const disconnect = useCallback(() => {
    if (dcRetry.current) { clearTimeout(dcRetry.current); dcRetry.current = null; }
    if (closedRef.current) return;
    releaseInput();
    closedRef.current = true;
    measurements.current?.dispose(); measurements.current = null;
    streamRef.current?.close();
    streamRef.current = null;
    abortRef.current?.abort();
    queueRef.current = [];
    pumpingRef.current = null;
    if (sessionRef.current) {
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      previousCloseRef.current = sessionClientRef.current.closeSession(deviceId, sessionId).catch(() => {});
    }
  }, [abortRef, closedRef, deviceId, measurements, previousCloseRef, pumpingRef, queueRef, releaseInput, sessionClientRef, sessionRef, streamRef]);

  useEffect(() => () => { if (dcRetry.current) clearTimeout(dcRetry.current); }, []);
  const reconnectDataChannel = useCallback((reason = "media_data_channel_unavailable") => {
    if (dcRetry.current || dcRecovering.current || closedRef.current) return;
    dcRecovering.current = true;
    disconnect();
    updatePhase("reconnecting"); setReconnecting(true); setMediaReady(false);
    setMessage(remoteDesktopErrorCopy(reason));
    setMediaNotice(remoteDesktopErrorCopy(reason));
    const delay = Math.min(500 * 2 ** Math.min(reconnectAttempts.current++, 4), 8000);
    dcRetry.current = setTimeout(() => {
      dcRetry.current = null; dcRecovering.current = false;
      const next = remoteDesktopTicket(); reconnectTicket.current = next; setTicket(next);
    }, delay);
  }, [closedRef, disconnect, reconnectAttempts, reconnectTicket, setMediaNotice, setMediaReady, setMessage, setReconnecting, setTicket, updatePhase]);

  useEffect(() => {
    if (ticket !== reconnectTicket.current) reconnectAttempts.current = 0;
    const abort = new AbortController();
    abortRef.current = abort;
    closedRef.current = false;
    handoffRef.current = null; completedHandoff.current = null; setHandoffDone(false); setHandingBack(false); setHandoffFrozen(false);
    sessionRef.current = null;
    sessionClientRef.current = client;
    streamRef.current = null;
    streamModeRef.current = false;
    sequenceRef.current = 0;
    setKeyboard(false);
    setFrame(null);
    setMediaMode("artc");
    setMediaStatus(null);
    mediaFrameGeometry.current = null;
    setMediaReady(false);
    setMediaMode("artc"); setMediaReady(false); setMediaStatus(null); setDisplayId(undefined); setMediaNotice(""); setMessage("");
     setAccess(null); setBilling(null); laneRef.current = null; setMediaDiagnostic(null);
    const acceptAccess = (value: RemoteDesktopAccess | null) => {

      setAccess(value);
    };
    updatePhase(ticket && !ticket.spent ? "starting" : "idle");
    const previousOverflow = document.body.style.overflow;
    let mediaAttempted = false, mediaDescriptorSeen = false;
    document.body.style.overflow = "hidden";
    setCoarse(Boolean(window.matchMedia?.("(pointer: coarse)").matches));
    setReconnecting(false); setReconnectDeadline(null); setIdleDeadline(null); setConnectTiming("");
    // Step timings of this connection (ms since the click started it). Diagnostics only.
    const clickedAt = typeof ticket?.at === "number" && Number.isFinite(ticket.at) ? ticket.at : performance.now();
    const marks: Record<string, number> = {};
    let gatewayTiming: Record<string, number> = {};
    const publishTiming = () => {
      setConnectTiming([...Object.entries(marks), ...Object.entries(gatewayTiming).map(([key, value]) => [`gw_${key}`, value])].map(([key, value]) => `${key}=${Math.round(Number(value))}`).join(" "));
    };
    const mark = (name: PanelTimingStep) => {
      if (name in marks) return;
      marks[name] = Math.max(0, performance.now() - clickedAt);
      publishTiming();
      reportDiagnostics({ v: 1, kind: 5, at_ms: performance.now(), click_ms: clickedAt,
        ...Object.fromEntries(Object.entries(marks).map(([key, value]) => [`${key}_ms`, clickedAt + value])) });
    };
    markRef.current = mark;
    mark("effect");
    let wakeRetry: (() => void) | null = null;
    const online = () => wakeRetry?.();
    window.addEventListener("online", online);
    const end = (error?: string, status?: number) => {
      // A closed session is final. Network trouble on a live session never comes here first:
      // `reattach` re-joins the same session (no second request, consent prompt or bill).
      disconnect();
      setFrame(null);
      setReconnecting(false); setReconnectDeadline(null); setIdleDeadline(null);
      updatePhase(terminal(error));
      setMessage(error === "media_capabilities_stale"
        ? "这台电脑还没有上报视频能力，请稍后重新连接。"
        : remoteDesktopErrorCopy(error, status));
    };
    const connect = async () => {
      // Allow cleanup to finish first, but a broken network must not stall the retry indefinitely.
      await Promise.race([previousCloseRef.current, wait(1500, abort.signal)]);
      if (abort.signal.aborted) return;
      mark("request");
      const sessionClient = client;
      // One id per click; capability refresh retries reuse it so a delayed
      // reply can never create a second consent request or bill.
      const requestId = newRequestId();
      let result: Awaited<ReturnType<typeof sessionClient.createSession>>;
      let capabilityAttempt = 0;
      for (;;) {
        result = await sessionClient.createSession(deviceId, { signal: abort.signal, requestId, ownerDirect: !agentRequest });
        if (result.ok || result.error !== "media_capabilities_stale" || capabilityAttempt >= 2 || abort.signal.aborted) break;
        capabilityAttempt++;
        setMessage(`等待电脑上报画面能力…（${capabilityAttempt}/3）`);
        await wait(2000, abort.signal);
      }
      if (abort.signal.aborted) {
        if (result.ok && result.data) void sessionClient.closeSession(deviceId, result.data.session_id).catch(() => {});
        return;
      }
      if (!result.ok || !result.data) { end(result.error, result.status); return; }
      mark("session");
      sessionRef.current = result.data.session_id;
      measurements.current = new RemoteDesktopMeasurements(result.data.session_id);
      measurements.current.setEnabled(model.getSnapshot().measuring);
      setPictureMeasurements({}); setClockUncertainty(undefined);
      if (result.data.billing) setBilling(result.data.billing);
      updatePhase(result.data.state === "pending_consent" ? "waiting" : "connecting");
      // First-frame chain: negotiate video while the stream socket is still opening (cold TLS from the
      // controller's network). The gateway refuses media while consent is pending, so only for a live session
      // or the owner's own idle-computer handshake (the computer still publishes only after it answers).
      earlyMediaRef.current = result.data.media
        ? { sessionId: result.data.session_id, response: Promise.resolve({ ok: true, data: result.data.media }) }
        : (result.data.state === "connecting" || result.data.owner_handshake === true) && client.openStream && client.negotiateMedia
          ? { sessionId: result.data.session_id, response: client.negotiateMedia(deviceId, result.data.session_id, undefined, { signal: abort.signal }).catch(() => ({ ok: false, error: "media_unavailable" })) }
        : null;
      if (client.openStream) {
        streamModeRef.current = true;
        const sessionId = result.data.session_id;
        const handlers: RemoteDesktopStreamHandlers = {
          activity: acceptActivity,
          diagnostics: reportDiagnostics,
          inputWritten: (seq, measurable) => measurements.current?.inputSent(seq, measurable),
          inputDiagnostics: (value) => reportDiagnostics({ v: 1, kind: 4, at_ms: performance.now(), ...value }),
          state(state, error) {
            if (abort.signal.aborted) return;
            if (state === "closed") end(error || "session_closed");
            else {
              if (state !== "pending_consent") mark("consented");
              // Negotiate video the moment the computer consents: the gateway counts the session
              // as live (and bills) only once that video is publishing, so waiting for "active"
              // here would deadlock, and it used to cost a full device report round trip.
              if ((state === "connecting" || state === "active") && client.negotiateMedia && !mediaAttempted) {
                mediaAttempted = true;
                setMediaMode("artc"); setFrame(null);
              }
              if (state === "active") mark("active");
              if (state === "reconnecting") {
                releaseInput();
                setReconnecting(true);
              } else {
                setReconnecting(false);
              }
              updatePhase(state === "pending_consent" ? "waiting" : state);
            }
          },
          serverTiming(timing) { gatewayTiming = timing; if (!abort.signal.aborted) { mark("gateway"); publishTiming(); } },
          frame() {},
          media(media, status) {
            if (abort.signal.aborted) return;
            acceptMediaStatus(status);
            if (media?.data_channel_input === false) { laneRef.current = null; streamRef.current?.attachDataChannel?.(null); }
            if (status?.state === "failed" && status.error !== "screen_locked") { end(status.error || "media_capture_or_publish_failed"); return; }
            // Video is fine but input cannot reach the target (admin window, lock screen): say so, keep the session.
            const notice = remoteDesktopNoticeCopy(status?.error);
            setMessage((current) => status?.state === "locked" || status?.error === "screen_locked" ? "已锁定 — 可以输入密码解锁" : notice ? notice : current && [remoteDesktopNoticeCopy("input_target_elevated"), remoteDesktopNoticeCopy("screen_locked")].includes(current) ? "" : current);
            // A missing descriptor before negotiation is normal. After activation it revokes video.
            if (media) mediaDescriptorSeen = true;
            else if (mediaDescriptorSeen) end("media_session_closed");
          },
          error(code) {
            if (abort.signal.aborted) return;
            // The socket broke (lossy path, Wi-Fi switch, sleep): the session is still there.
            if (code === "media_data_channel_unavailable" || code === "media_data_channel_write_unknown") reconnectDataChannel(code);
            else if (isNetworkFailure(code)) void reattach();
            else end(code);
          },
          congestion(busy) {
            if (abort.signal.aborted) return;
            setMessage((current) => busy ? "输入队列暂时繁忙，请稍后重试。" : current === "输入队列暂时繁忙，请稍后重试。" ? "" : current);
          },
          session(info) {
            if (abort.signal.aborted) return;
            if (info.access?.input_allowed === false && !(model.getSnapshot().access?.input_allowed === false)) releaseInput();
            acceptAccess(info.access);
            setBilling(info.billing);
          },
          inputRefused() {
            if (abort.signal.aborted) return;
            acceptAccess({ input_allowed: false, audio: false });
            setMessage("对方仅允许查看，输入没有发送。");
          },
        };
        const adopt = (opened: RemoteDesktopApiResult<RemoteDesktopStream>, resuming = false): boolean => {
          if (abort.signal.aborted || closedRef.current) { opened.data?.close(); return true; }
          if (!opened.ok || !opened.data) return false;
          streamRef.current = opened.data;
          if (opened.data.inputHistory) measurements.current?.setInputHistory(opened.data.inputHistory);
          opened.data.attachDataChannel?.(laneRef.current);
          // Back on the same session: let go of anything held before the drop, first.
          // openStream may deliver "active" synchronously before returning the replacement stream.
          if (resuming || model.getSnapshot().reconnecting) {
            opened.data.send({ kind: "release_all" });
            if (mediaFrameGeometry.current) opened.data.acknowledgeMediaFrame?.();
          }
          setReconnecting(model.getSnapshot().phase === "reconnecting"); setReconnecting(model.getSnapshot().reconnecting);
          return true;
        };
        /**
         * Re-attach to the SAME session with backoff while the gateway keeps it
         * (VIEWER_RECONNECT_S = 180 s there). No new request, no new consent prompt on the
         * computer, no new bill; the gateway starts no minute while we are away.
         */
        let reattaching = false;
        const reattach = async () => {
          if (reattaching || abort.signal.aborted || closedRef.current) return;
          reattaching = true;
          const lost = streamRef.current;
          streamRef.current = null;
          const floor = lost?.lastSequence ? lost.lastSequence() + 1 : 0;
          lost?.close();
          setReconnecting(true);
          releaseInput();
          reconnectAttempts.current++;
          const started = Date.now();
          setReconnectDeadline(started + recoveryWindow.current); setClockNow(started);
          for (let delay = 500; !abort.signal.aborted && !closedRef.current; delay = Math.min(delay * 2, 4000)) {
            // Offline: wait for the browser's "online" (or the next backoff tick) before trying.
            if (typeof navigator === "undefined" || navigator.onLine !== false) {
              const opened = await client.openStream!(deviceId, sessionId, handlers, { signal: abort.signal, sequenceFloor: floor });
              if (adopt(opened, true)) { reattaching = false; return; }
              if (!isNetworkFailure(opened.error)) { end(opened.error, opened.status); return; }
            }
            const left = recoveryWindow.current - (Date.now() - started);
            if (left <= 0) break;
            await new Promise<void>((resolve) => {
              const done = () => { clearTimeout(timer); if (wakeRetry === done) wakeRetry = null; abort.signal.removeEventListener("abort", done); resolve(); };
              const timer = setTimeout(done, Math.min(delay, left));
              wakeRetry = done;
              abort.signal.addEventListener("abort", done, { once: true });
            });
          }
          if (!abort.signal.aborted && !closedRef.current) end("link_lost");
        };
        const opened = await client.openStream(deviceId, sessionId, handlers, { signal: abort.signal });
        if (!adopt(opened)) {
          mark("stream_failed");
          if (isNetworkFailure(opened.error)) void reattach();
          else end(opened.error, opened.status);
        } else mark("stream");
        return;
      }
      end("media_artc_required");
    };
    // One session request per fresh ticket: a click or the single network retry. Spent in a
    // microtask: React's dev double run of a new effect (StrictMode) cleans the
    // first run up synchronously, so only the second one sends. A remount,
    // reload, back/forward or Fast Refresh re-run finds it spent and stays idle.
    let cancelled = false;
    if (ticket && !ticket.spent) {
      queueMicrotask(() => {
        if (cancelled || abort.signal.aborted || ticket.spent) return;
        ticket.spent = true;
        qualityRef.current?.begin({ at: ticket.at, attempt: ticket === reconnectTicket.current ? reconnectAttempts.current : 0 });
        connect().catch(() => { if (!abort.signal.aborted) end("network_error"); });
      });
    }
    return () => {
      cancelled = true;
      window.removeEventListener("online", online);
      wakeRetry = null;
      markRef.current = null;
      disconnect();
      document.body.style.overflow = previousOverflow;
      releaseRemoteDesktopFullscreen();
    };
  }, [client, deviceId, disconnect, reconnectDataChannel, frameIntervalMs, releaseInput, updatePhase, ticket, acceptMediaStatus, acceptActivity, agentRequest, reportDiagnostics, reconnectTicket, reconnectAttempts, abortRef, closedRef, handoffRef, completedHandoff, setHandoffDone, setHandingBack, setHandoffFrozen, sessionRef, sessionClientRef, streamRef, streamModeRef, sequenceRef, setKeyboard, setFrame, setMediaMode, setMediaStatus, mediaFrameGeometry, setMediaReady, setDisplayId, setMediaNotice, setMessage, setAccess, setBilling, laneRef, setMediaDiagnostic, setCoarse, setReconnecting, setReconnectDeadline, setIdleDeadline, setConnectTiming, markRef, previousCloseRef, measurements, model, setPictureMeasurements, setClockUncertainty, earlyMediaRef, recoveryWindow, setClockNow, qualityRef]);

  return { client, reportDiagnostics, reconnectDataChannel, send, handBack, disconnect };
}
