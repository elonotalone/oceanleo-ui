"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { remoteDesktopClient, type RemoteDesktopBilling } from "../api/remote-desktop";

import { RemoteDesktopVideo, remoteFrameStyle } from "./RemoteDesktopVideo";
import { useUI } from "../i18n/ui/useUI";
import { remoteDesktopRemainingSeconds } from "./remote-desktop-input";
import { remoteDesktopPortal, releaseRemoteDesktopFullscreen, requestRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";
import { CLOUD_AGENT_COPY } from "../lib/local-agent-task";
import { remoteDesktopTicket, type RemoteDesktopTicket } from "./remote-desktop-ticket";

import { useRemoteDesktopPanelContext } from "./remote-desktop-panel-state";
import { useRemoteDesktopSession } from "./remote-desktop-session";
import { useRemoteDesktopInput } from "./remote-desktop-panel-input";
import { useRemoteDesktopPanelMedia } from "./remote-desktop-panel-media";
import { useRemoteDesktopToolbar } from "./remote-desktop-toolbar";
import type { RemoteDesktopPanelProps } from "./remote-desktop-panel-types";
export type { RemoteDesktopPanelProps, RemoteDesktopAgentBanner, RemoteDesktopPanelTiming, RemoteDesktopDiagnosticSample } from "./remote-desktop-panel-types";
export { RECONNECT_WINDOW_MS } from "./remote-desktop-session";
export { requestRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";
export { remoteDesktopTicket, type RemoteDesktopTicket } from "./remote-desktop-ticket";
/** "¥0.096" / "$0.013": the amount exactly as the gateway priced it, trimmed to 4 decimals. */
export function billingPrice(billing: RemoteDesktopBilling): string {
  return `${billing.currency === "CNY" ? "¥" : "$"}${Number(billing.per_minute.toFixed(4))}`;
}

export function RemoteDesktopPanel(props: RemoteDesktopPanelProps) {
  const { deviceId, deviceName, client: baseClient = remoteDesktopClient, onClose, agent, consent } = props;
  const tt = useUI();
  const [portal] = useState(remoteDesktopPortal);
  const context = useRemoteDesktopPanelContext(props.ticket, baseClient, agent, props.onDiagnostics);
  const { ticket, phase, frame, message, handingBack, handoffFrozen, handoffDone, toolbar, measuring,
    pictureMeasurements, clockUncertainty, coarse, keyboard, mediaMode, mediaStatus, displayId, access,
    billing, mediaDiagnostic, mediaNotice, mediaReady, reconnecting, reconnectDeadline, idleDeadline,
    clockNow, connectTiming, dock, fullscreen, setTicket, setFrame, setMessage, setToolbar, setMeasuring,
    setKeyboard, setDisplayId, setDock, sessionRef, completedHandoff, stageRef, imageRef, inputRef,
    streamRef, streamModeRef, queueRef, pointerRef, toolbarRoot, toolbarPanel, positionKey, dragging,
    ignoreHandleClick, model, releaseInput, updatePhase } = context;
  const session = useRemoteDesktopSession(context, props);
  const { client, disconnect, pump, handBack } = session;
  const { pointerDown, pointerMove, pointerUp, keyDown, keyUp } = useRemoteDesktopInput(context, session, props.doubleClickWindowMs);
  const { videoProps, invalidateMediaFrame } = useRemoteDesktopPanelMedia(context, session, deviceId);
  useRemoteDesktopToolbar(context);
  if (!portal) return null;
  const active = phase === "active";
  const reconnectSeconds = remoteDesktopRemainingSeconds(reconnectDeadline, clockNow);
  const idleSeconds = remoteDesktopRemainingSeconds(idleDeadline, clockNow);
  const reconnectCopy = tt("重连中… 剩余 {seconds} 秒", { seconds: String(reconnectSeconds ?? 180) });
  // `direct`: the computer approves without a dialog, so this is only the connection; `ask`: a person must approve there.
  const waiting = consent === "direct" ? CLOUD_AGENT_COPY.statusConnecting : consent === "ask" ? CLOUD_AGENT_COPY.waitConsent : "等待这台电脑确认…";
  // Ended sessions: the top bar says only 「已断开」; the full reason is shown once, in the center.
  const ended = !active && !reconnecting && !["idle", "starting", "waiting", "connecting"].includes(phase);
  const status = reconnecting ? reconnectCopy : phase === "idle" ? CLOUD_AGENT_COPY.remoteIdle : phase === "starting" ? "正在请求这台电脑…" : phase === "waiting" ? waiting : phase === "connecting" ? "已发出请求，等这台电脑显示画面…" : active ? "已连接" : message || "远程会话已结束。";
  return createPortal(
    <div data-oceanleo-remote-desktop data-remote-phase={phase} data-remote-media={mediaMode} data-remote-video-ready={mediaReady}
      data-remote-reconnecting={reconnecting || undefined} data-remote-connect-timing={connectTiming || undefined}
      data-remote-media-blocked-host={mediaDiagnostic?.blocked_host} data-remote-media-sdk-error={mediaDiagnostic?.sdk_error} style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: "#08090b", color: "#fff", width: "100%", height: "100dvh", overflow: "hidden" }}>
      <div ref={stageRef} data-remote-stage tabIndex={0} aria-label={tt("远程桌面")}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={releaseInput} onLostPointerCapture={() => { if (pointerRef.current) releaseInput(); }}
        onKeyDown={keyDown} onKeyUp={keyUp} onContextMenu={(event) => event.preventDefault()}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) releaseInput(); }}
        /* D6: the controller's own OS cursor stays visible over the video; no remote cursor is drawn. */
        style={{ position: "absolute", inset: 0, outline: "none", touchAction: "none", userSelect: "none", cursor: "default", overflow: "hidden" }}>
        {mediaMode === "artc" && (active || phase === "connecting" || phase === "reconnecting") && sessionRef.current ? <RemoteDesktopVideo {...videoProps} sessionId={sessionRef.current} /> : frame && active ? <img ref={imageRef} data-remote-frame src={frame.image} alt={tt("远程桌面画面，点击后可用键盘")} draggable={false}
          onLoad={() => {
            streamRef.current?.acknowledgeFrame(frame.sequence);
          }}
          onError={() => { releaseInput(); disconnect(); updatePhase("error"); setFrame(null); setMessage("画面无法显示，请重新连接。"); }}
          style={remoteFrameStyle()} /> :
          <div role="status" style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 14 }}>{tt(status, { host: mediaDiagnostic?.blocked_host ?? "", code: String(mediaDiagnostic?.sdk_error ?? "") })}</div>}
        {reconnecting || mediaMode === "artc" && (active || phase === "connecting") && !mediaReady ? <div role="status" data-remote-reconnecting-notice={reconnecting || undefined} data-remote-media-notice={!reconnecting || undefined}
          style={{ position: "absolute", bottom: "max(16px, env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100% - 32px)", padding: "7px 12px", borderRadius: 16, fontSize: 12, background: "rgba(25,28,32,.92)", pointerEvents: "none" }}>{reconnecting ? <>{tt("网络连接中断，正在重新连接…")} · {reconnectCopy}</> : tt(mediaNotice)}</div> : null}
        <textarea ref={inputRef} data-remote-input aria-label={tt("远程桌面键盘输入")} disabled={!active || !frame || (mediaMode === "artc" && !mediaReady)} inputMode={coarse && !keyboard ? "none" : "text"}
          autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
          style={{ position: "absolute", left: "50%", top: "50%", width: 1, height: 1, opacity: 0, padding: 0, border: 0, resize: "none" }} />
      </div>
      <div ref={toolbarRoot} data-remote-toolbar-dock={dock.edge} style={{ position: "absolute", zIndex: 2,
        ...(dock.edge === "left" || dock.edge === "right" ? { [dock.edge]: "max(8px, env(safe-area-inset-" + dock.edge + "))", top: `clamp(24px, ${dock.offset * 100}%, calc(100% - 24px))`, transform: "translateY(-50%)" }
          : { [dock.edge]: "max(8px, env(safe-area-inset-" + dock.edge + "))", left: `clamp(24px, ${dock.offset * 100}%, calc(100% - 24px))`, transform: "translateX(-50%)" }) }}>
        <button type="button" data-remote-toolbar-handle aria-label={tt("远程桌面控制")} aria-expanded={toolbar}
          onPointerDown={(event) => { event.preventDefault(); releaseInput(); dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; ignoreHandleClick.current = false; event.currentTarget.setPointerCapture?.(event.pointerId); }}
          onPointerMove={(event) => {
            const drag = dragging.current;
            if (!drag || drag.id !== event.pointerId) return;
            if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
            drag.moved = true; ignoreHandleClick.current = true;
            const w = window.innerWidth, h = window.innerHeight;
            const distances = { left: event.clientX, right: w - event.clientX, top: event.clientY, bottom: h - event.clientY };
            const edge = (Object.keys(distances) as Array<keyof typeof distances>).reduce((a, b) => distances[a] <= distances[b] ? a : b);
            const next = { edge, offset: Math.max(0, Math.min(1, edge === "left" || edge === "right" ? event.clientY / h : event.clientX / w)) };
            setDock(next);
          }}
          onPointerUp={(event) => {
            if (dragging.current?.moved && positionKey.current) { try { window.localStorage.setItem(positionKey.current, JSON.stringify(model.getSnapshot().dock)); } catch { /* optional preference */ } }
            dragging.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerCancel={() => { dragging.current = null; ignoreHandleClick.current = true; }}
          onClick={() => { if (ignoreHandleClick.current) { ignoreHandleClick.current = false; return; } releaseInput(); setToolbar(value => !value); }}
          style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #ffffff40", background: "#25282deb", color: "white", touchAction: "none", padding: 0, position: "relative", cursor: "grab" }}>
          <span aria-hidden="true">O</span><span aria-hidden="true" style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", right: 0, bottom: 0, background: ended ? "#f87171" : active && !reconnecting && (mediaMode !== "artc" || mediaReady) ? "#4ade80" : "#fbbf24" }} />
        </button>
        {toolbar ? <div ref={toolbarPanel} data-remote-toolbar role="dialog" aria-label={tt("远程桌面控制")} style={{ position: "absolute", width: 264, boxSizing: "border-box", maxWidth: "calc(100vw - 64px)", maxHeight: "calc(100dvh - 32px)", overflow: "auto", padding: 12, borderRadius: 12, background: "#191c20f5", fontSize: 12, boxShadow: "0 4px 24px #0006", display: "flex", flexDirection: "column", gap: 10 }}>
          <strong style={{ overflowWrap: "anywhere" }}>{deviceName}</strong>
          {active && (mediaMode !== "artc" || mediaReady) ? <span>{tt("已连接")}{frame ? ` · ${frame.width}×${frame.height}` : ""}{!measuring ? ` · ${tt("画面延迟未知")}` : ""}</span> : null}
          {active && access?.input_allowed === false ? <span data-remote-view-only>{tt("对方仅允许查看")}</span> : null}
          {active && (mediaStatus?.displays?.length ?? 0) > 1 ? <select aria-label={tt("显示器")} value={displayId || mediaStatus?.geometry?.display_id || ""} onChange={(event) => { invalidateMediaFrame(); setDisplayId(event.target.value); }}>{mediaStatus?.displays?.map((display) => <option key={display.display_id} value={display.display_id}>{display.label} · {display.width}×{display.height}</option>)}</select> : null}
          {coarse && active ? <button data-remote-keyboard-toggle type="button" aria-pressed={keyboard} onMouseDown={(event) => event.preventDefault()} onClick={() => {
            const next = !keyboard; setKeyboard(next); inputRef.current?.setAttribute("inputmode", next ? "text" : "none");
            if (next) inputRef.current?.focus({ preventScroll: true }); else { inputRef.current?.blur(); stageRef.current?.focus({ preventScroll: true }); releaseInput(); }
          }}>{tt("键盘")}</button> : null}
          {mediaMode === "artc" ? <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" data-remote-measure checked={measuring} onChange={event => setMeasuring(event.target.checked)} />{tt("测量延迟")}</label> : null}
          {measuring ? <small data-remote-measurements>
            {pictureMeasurements.picture_age_p50_ms !== undefined ? tt("画面延迟 p50/p95：{p50}/{p95} 毫秒", { p50: String(pictureMeasurements.picture_age_p50_ms), p95: String(pictureMeasurements.picture_age_p95_ms) }) : tt("画面延迟未知")}
            {clockUncertainty !== undefined && pictureMeasurements.picture_age_p50_ms !== undefined ? ` ±${Math.ceil(clockUncertainty)} ms` : ""}
            {pictureMeasurements.input_to_picture_p50_ms !== undefined ? <><br />{tt("输入到画面标记 p50/p95：{p50}/{p95} 毫秒", { p50: String(pictureMeasurements.input_to_picture_p50_ms), p95: String(pictureMeasurements.input_to_picture_p95_ms) })}</> : null}
          </small> : null}
          <button type="button" onClick={() => fullscreen ? releaseRemoteDesktopFullscreen() : requestRemoteDesktopFullscreen()}>{tt(fullscreen ? "退出全屏" : "全屏")}</button>
          {!active && !["starting", "waiting", "connecting", "reconnecting"].includes(phase) && !reconnecting ? <button type="button" data-remote-connect onClick={() => { disconnect(); setTicket(remoteDesktopTicket()); }}>{tt(phase === "idle" ? "连接" : "重新连接")}</button> : null}
          <button type="button" onClick={() => { disconnect(); onClose(); }}>{tt("退出桌面")}</button>
          {billing ? <small data-remote-billing style={{ opacity: .65 }}>{tt("按分钟从账户余额扣费 · {price}/分钟 · 已计 {minutes} 分钟", { price: billingPrice(billing), minutes: String(billing.charged_minutes) })}</small> : null}
        </div> : null}
      </div>
      {agent ? <div data-remote-agent-banner role="status" style={{ position: "absolute", left: "50%", bottom: "max(64px, calc(env(safe-area-inset-bottom) + 56px))", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10, background: "rgba(25,28,32,.92)", maxWidth: "calc(100% - 24px)", fontSize: 12, boxShadow: "0 4px 24px #0006" }}>
        <span>{tt(agent.text)}</span>
        {agent.note ? <span data-remote-agent-note style={{ opacity: .75 }}>{tt(agent.note)}</span> : null}
        {/* Let go of anything this viewer still holds first: the computer resumes the AI only once no person holds input. */}
        {agent.handBack ? <button type="button" data-remote-agent-hand-back disabled={agent.busy || handingBack || handoffFrozen || (handoffDone && (agent.handoffKey ? completedHandoff.current?.key === agent.handoffKey : completedHandoff.current?.callback === agent.onHandBack))} onClick={() => { void handBack(); }} style={{ whiteSpace: "nowrap" }}>{tt(CLOUD_AGENT_COPY.handBack)}</button> : null}
      </div> : null}
      {active && idleSeconds !== null ? <div role="alertdialog" aria-label={tt("仍在使用吗？")} data-remote-idle-confirm style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", background: "#25282d", padding: 20, borderRadius: 8 }}>
        <p>{tt("仍在使用吗？")}</p>
        <p>{tt("长时间没有输入，{seconds} 秒后将结束会话。", { seconds: String(idleSeconds) })}</p>
        <button type="button" onClick={() => {
          // An explicit confirmation releases held input, on either existing transport.
          // Only the computer's execution receipt clears the server's idle prompt.
          if (streamModeRef.current) streamRef.current?.send({ kind: "release_all" });
          else if (sessionRef.current) { queueRef.current.push({ kind: "release_all" }); void pump(); }
        }}>{tt("仍在使用")}</button>
      </div> : null}
      {active && (message || (mediaMode === "legacy" && mediaNotice)) ? <div role="status" data-remote-input-status style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#25282d", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>{tt(message || mediaNotice, { name: deviceName })}</div> : null}
    </div>, portal,
  );
}
