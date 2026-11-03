"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useAdvancedLayout } from "../advanced-layout-context";
import { useConsoleAgentFocus } from "../SplitWorkspace";
import { PLUGIN_AGENT_DRAWER_ID } from "../plugin-chrome/agent-drawer";
import { insertPreviewReferenceWhenReady, type PreviewReference } from "./website-preview-reference";
import { useWebsiteUI } from "./website-preview-i18n";

export function WebsitePreviewPicker({ projectId, url, frame, onClose }: {
  projectId: string; url: string; frame: RefObject<HTMLIFrameElement | null>; onClose: () => void;
}) {
  const tt = useWebsiteUI();
  const layout = useAdvancedLayout();
  const consoleAgent = useConsoleAgentFocus();
  const picker = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const [message, setMessage] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [ready, setReady] = useState(false);
  const inserting = useRef(false);
  const operation = useRef(0);
  const waiting = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [retryReference, setRetryReference] = useState<PreviewReference | null>(null);
  const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; video.current = null; };
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current++; waiting.current?.abort(); stop(); }; }, [projectId, url]);
  const cancel = () => { operation.current++; waiting.current?.abort(); stop(); onClose(); };
  async function insert(ref: PreviewReference) {
    waiting.current?.abort();
    const controller = new AbortController();
    waiting.current = controller;
    setMessage(tt("正在打开 agent 对话并等待输入框…"));
    try {
      const result = await insertPreviewReferenceWhenReady(ref, {
        root: () => picker.current?.closest("[data-workspace-split]") || picker.current?.closest("[data-inline-editor]") || null,
        openConversation: () => {
          if (layout) { layout.openDrawer(PLUGIN_AGENT_DRAWER_ID); return true; }
          return consoleAgent?.focusAgent() ?? false;
        },
        conversationHidden: consoleAgent?.agentVisible === false,
        signal: controller.signal,
      });
      if (!alive.current || controller.signal.aborted) return;
      if (result === "inserted") { setRetryReference(null); onClose(); }
      else setMessage(tt(result === "unavailable"
        ? "无法打开此网站的 agent 对话，请重试。"
        : "等待 agent 对话输入框超时，引用已保留，请重试插入。"));
    } catch {
      if (alive.current && !controller.signal.aborted) setMessage(tt("引用插入失败，引用已保留，请重试插入。"));
    } finally {
      inserting.current = false;
      if (alive.current) setPending(false);
    }
  }
  async function capture() {
    const captureOperation = operation.current;
    setCapturing(true);
    try {
      stop();
      const captured = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
      if (!alive.current || captureOperation !== operation.current) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured;
      const element = document.createElement("video");
      element.muted = true; element.srcObject = captured;
      await element.play();
      if (!alive.current || captureOperation !== operation.current) { stop(); return; }
      video.current = element;
      setReady(true);
      setMessage(tt("请使用当前标签页截图，以便坐标对应预览。"));
    } catch { stop(); if (alive.current) { setReady(false); setMessage(tt("截图失败，可继续发送位置引用。")); } }
    finally { if (alive.current) setCapturing(false); }
  }
  return <div ref={picker} className="absolute inset-0 z-10" data-testid="website-preview-picker" aria-busy={pending}
    onKeyDown={event => { if (event.key === "Escape") cancel(); }}>
    <button type="button" disabled={pending || capturing} className="absolute inset-0 cursor-crosshair bg-blue-500/5" aria-label={tt("点选元素")} onClick={async event => {
      if (inserting.current) return;
      const rect = frame.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const selectedOperation = ++operation.current;
      inserting.current = true; setPending(true); setRetryReference(null);
      // The frame keeps its desktop/phone viewport while CSS scales its visible rectangle.
      const width = frame.current?.clientWidth || rect.width;
      const height = frame.current?.clientHeight || rect.height;
      const ref: PreviewReference = { projectId, url,
        x: (event.clientX - rect.left) * width / rect.width,
        y: (event.clientY - rect.top) * height / rect.height, width, height };
      // Normally inaccessible: keep sandbox isolation rather than granting same-origin.
      try {
        const el = frame.current?.contentDocument?.elementFromPoint(ref.x, ref.y);
        if (el) { ref.tag = el.tagName.toLowerCase(); ref.text = el.textContent || ""; ref.className = el.getAttribute("class") || ""; ref.selector = el.id ? "#" + CSS.escape(el.id) : ref.tag + (el.classList[0] ? "." + CSS.escape(el.classList[0]) : ""); }
      } catch { /* Cross-origin fallback: coordinates and optional captured pixels. */ }
      const source = video.current;
      try {
        if (source?.videoWidth) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(rect.width); canvas.height = Math.round(rect.height);
          const scaleX = source.videoWidth / window.innerWidth, scaleY = source.videoHeight / window.innerHeight;
          canvas.getContext("2d")?.drawImage(source, rect.left * scaleX, rect.top * scaleY, rect.width * scaleX, rect.height * scaleY, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
          if (blob) ref.screenshot = new File([blob], "website-preview.png", { type: "image/png" });
        }
      } catch { /* Screenshot failure still permits the coordinate reference. */ }
      stop(); setReady(false);
      if (!alive.current || selectedOperation !== operation.current) return;
      setRetryReference(ref);
      await insert(ref);
    }} />
    <div className="absolute bottom-3 left-3 right-3 rounded border bg-[var(--awb-chrome-bg,#fff)] p-3 text-xs shadow">
      <p>{tt("点击预览位置，将坐标和截图引用放入对话输入框。")}</p>
      <p role={retryReference && !pending ? "alert" : "status"}>{message || tt("跨域预览仅记录点击坐标，不读取页面 DOM。")}</p>
      <button type="button" className="mr-4 mt-2 underline" disabled={pending || capturing || ready} onClick={() => void capture()}>{tt("添加截图")}</button>
      {retryReference && !pending && <button type="button" className="mr-4 underline" onClick={() => {
        if (inserting.current) return;
        inserting.current = true; setPending(true); void insert(retryReference);
      }}>{tt("重试插入")}</button>}
      <button type="button" onClick={cancel}>{tt("取消点选")}</button>
    </div>
  </div>;
}
