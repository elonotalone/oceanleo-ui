"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { remoteDesktopTicket, type RemoteDesktopTicket } from "../../pages/remote-desktop-ticket";
import { remoteDesktopPortal } from "../../pages/remote-desktop-fullscreen";
import { useDeviceCloudAgent } from "../../pages/devices/use-device-cloud-agent";
import { deviceSettingsClient } from "../../api/device-settings";
import { WebsitePreviewPicker } from "../website-platform/WebsitePreviewPicker";
import { useWebsiteUI } from "../website-platform/website-preview-i18n";

const RemoteDesktopPanel = lazy(() => import("../../pages/RemoteDesktopPanel").then(module => ({ default: module.RemoteDesktopPanel })));

/** Reuse the remote-desktop picture and its complete consent/billing/input lifecycle. */
export function WorkScreenPreview({ workId, deviceId, deviceName }: { workId: string; deviceId: string; deviceName: string }) {
  const tt = useWebsiteUI();
  const host = useRef<HTMLDivElement>(null);
  const [ticket, setTicket] = useState<RemoteDesktopTicket | null>(null);
  const [attached, setAttached] = useState(false);
  const [pictureRoot, setPictureRoot] = useState<HTMLElement | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const remoteAgent = useDeviceCloudAgent(ticket ? deviceId : null, deviceSettingsClient);
  useEffect(() => {
    if (!ticket || !host.current) return;
    const portal = remoteDesktopPortal();
    if (!portal) return;
    // A concurrent desktop belongs to its existing opener; never move that session.
    if (portal.childElementCount) { setError(tt("已有远程桌面正在使用，请先关闭它。")); return; }
    const originalParent = portal.parentNode;
    const container = host.current;
    container.appendChild(portal);
    setAttached(true);
    const observer = new window.MutationObserver(() => {
      const root = portal.querySelector<HTMLElement>("[data-oceanleo-remote-desktop]");
      if (root) { setPictureRoot(root); observer.disconnect(); }
    });
    observer.observe(portal, { childList: true });
    return () => {
      observer.disconnect(); setAttached(false); setPictureRoot(null); setPicking(false);
      // The panel performs its normal session cleanup when unmounted.
      if (portal.parentNode === container && originalParent?.isConnected) originalParent.appendChild(portal);
    };
    // The ticket is the person's click. Locale changes must never reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);
  const composerRoot = () => host.current?.closest("[data-workspace-split]") || host.current?.closest("[data-inline-editor]") || null;
  return <div ref={host} data-work-screen className="relative min-h-0 flex-1 overflow-hidden" style={{ transform: "translateZ(0)" }}>
    {/* The existing panel's fixed viewport is contained in this preview stage; its controls and notices stay intact. */}
    <style>{"[data-work-screen] [data-oceanleo-remote-desktop]{position:absolute!important;width:100%!important;height:100%!important}"}</style>
    {!ticket && <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
      <p>{deviceName}</p><p className="text-xs opacity-70">{tt("连接后使用远程桌面的授权、操作与计费规则。")}</p>
      <button type="button" onClick={() => { setError(""); setTicket(remoteDesktopTicket()); }}>{tt("连接服务器画面")}</button>
    </div>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setTicket(null); setError(""); }}>{tt("重试")}</button></p>}
    {ticket && attached && <Suspense fallback={<p role="status">{tt("加载中…")}</p>}>
      <RemoteDesktopPanel deviceId={deviceId} deviceName={deviceName} ticket={ticket} consent={remoteAgent.consent} agent={remoteAgent.agent}
        onClose={() => { setTicket(null); setPicking(false); }} />
    </Suspense>}
    {pictureRoot && createPortal(<>
      <button type="button" className="absolute bottom-4 right-4 z-10 rounded bg-stone-800 px-3 py-2 text-xs text-white" aria-pressed={picking}
        onClick={() => setPicking(value => !value)}>{tt(picking ? "取消指位置" : "指位置给 agent")}</button>
      {picking && <WebsitePreviewPicker workId={workId} source="screen" composerRoot={composerRoot}
        picture={() => pictureRoot.querySelector<HTMLVideoElement>("video[data-remote-video]") || pictureRoot.querySelector<HTMLImageElement>("img[data-remote-frame]")}
        onClose={() => setPicking(false)} />}
    </>, pictureRoot)}
  </div>;
}
