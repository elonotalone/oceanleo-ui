"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { insertPreviewReference, type PreviewReference } from "./website-preview-reference";
import { useWebsiteUI } from "./website-preview-i18n";

export function WebsitePreviewPicker({ projectId, url, frame, onClose }: {
  projectId: string; url: string; frame: RefObject<HTMLIFrameElement | null>; onClose: () => void;
}) {
  const tt = useWebsiteUI();
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const [message, setMessage] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);
  const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; video.current = null; };
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop(); }; }, []);
  async function capture() {
    setCapturing(true);
    try {
      stop();
      const captured = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
      if (!alive.current) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured;
      const element = document.createElement("video");
      element.muted = true; element.srcObject = captured;
      await element.play();
      if (!alive.current) { stop(); return; }
      video.current = element;
      setReady(true);
      setMessage(tt("请使用当前标签页截图，以便坐标对应预览。"));
    } catch { stop(); if (alive.current) { setReady(false); setMessage(tt("截图失败，可继续发送位置引用。")); } }
    finally { if (alive.current) setCapturing(false); }
  }
  return <div className="absolute inset-0 z-10" data-testid="website-preview-picker"
    onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <button className="absolute inset-0 cursor-crosshair bg-blue-500/5" aria-label={tt("点选元素")} onClick={async event => {
      const rect = frame.current?.getBoundingClientRect();
      if (!rect) return;
      const ref: PreviewReference = { projectId, url, x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
      // Normally inaccessible: keep sandbox isolation rather than granting same-origin.
      try {
        const el = frame.current?.contentDocument?.elementFromPoint(ref.x, ref.y);
        if (el) { ref.tag = el.tagName.toLowerCase(); ref.text = el.textContent || ""; ref.className = el.getAttribute("class") || ""; ref.selector = el.id ? "#" + CSS.escape(el.id) : ref.tag + (el.classList[0] ? "." + CSS.escape(el.classList[0]) : ""); }
      } catch { /* Cross-origin fallback: coordinates and optional captured pixels. */ }
      const source = video.current;
      if (source?.videoWidth) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(rect.width); canvas.height = Math.round(rect.height);
        const scaleX = source.videoWidth / window.innerWidth, scaleY = source.videoHeight / window.innerHeight;
        canvas.getContext("2d")?.drawImage(source, rect.left * scaleX, rect.top * scaleY, rect.width * scaleX, rect.height * scaleY, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
        if (blob) ref.screenshot = new File([blob], "website-preview.png", { type: "image/png" });
      }
      stop(); setReady(false);
      if (insertPreviewReference(ref)) onClose();
      else setMessage(tt("对话输入框尚未就绪，请先打开 agent 对话。"));
    }} />
    <div className="absolute bottom-3 left-3 right-3 rounded border bg-[var(--awb-chrome-bg,#fff)] p-3 text-xs shadow">
      <p>{tt("点击预览位置，将坐标和截图引用放入对话输入框。")}</p>
      <p>{message || tt("跨域预览仅记录点击坐标，不读取页面 DOM。")}</p>
      <button type="button" className="mr-4 mt-2 underline" disabled={capturing || ready} onClick={() => void capture()}>{tt("添加截图")}</button>
      <button type="button" onClick={onClose}>{tt("取消点选")}</button>
    </div>
  </div>;
}
