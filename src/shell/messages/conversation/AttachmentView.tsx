"use client";

// 附件：图片 / 视频 / 音频只用 <img> <video> <audio> 指向上传得到的存储地址；
// 其他文件只给下载链接，不内联预览 HTML/SVG（契约 §10）。
import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImAttachment } from "../../../lib/im/types";

/** 只认 http(s) 地址；其余（javascript:、data: 等）一律不渲染。 */
export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return /^https?:/i.test(url) ? url : null;
  } catch {
    return null;
  }
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatDuration(ms: number | undefined): string {
  if (!ms || ms < 0) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const tt = useUI();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" onClick={(event) => event.stopPropagation()} />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[13px] text-neutral-800"
        autoFocus
      >
        {tt("关闭")}
      </button>
    </div>
  );
}

export function AttachmentView({
  attachment,
  transcript,
}: {
  attachment: ImAttachment;
  transcript?: { status: "pending" | "done" | "failed" | "skipped"; text: string } | null;
}) {
  const tt = useUI();
  const [zoom, setZoom] = useState(false);
  const url = safeMediaUrl(attachment.url);
  if (!url) {
    return (
      <div className="rounded-lg border border-neutral-200 px-3 py-2 text-[12.5px] text-neutral-400">
        {tt("附件不可用")}
      </div>
    );
  }
  if (attachment.kind === "image") {
    return (
      <>
        <button type="button" onClick={() => setZoom(true)} className="block max-w-[320px] overflow-hidden rounded-lg border border-neutral-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={attachment.name}
            loading="lazy"
            width={attachment.width}
            height={attachment.height}
            className="max-h-72 w-auto object-contain"
          />
        </button>
        {zoom ? <Lightbox src={url} alt={attachment.name} onClose={() => setZoom(false)} /> : null}
      </>
    );
  }
  if (attachment.kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        playsInline
        className="max-h-72 max-w-[360px] rounded-lg border border-neutral-200 bg-black"
      />
    );
  }
  if (attachment.kind === "audio" || attachment.kind === "voice") {
    const isVoice = attachment.kind === "voice";
    return (
      <div className="flex max-w-[360px] flex-col gap-1">
        <div className="flex items-center gap-2">
          <audio src={url} controls preload="metadata" className="h-9 w-full min-w-[200px]" />
          {isVoice && attachment.duration_ms ? (
            <span className="shrink-0 text-[11.5px] tabular-nums text-neutral-400">{formatDuration(attachment.duration_ms)}</span>
          ) : null}
        </div>
        {isVoice && transcript ? (
          <div className="rounded-md bg-neutral-50 px-2 py-1 text-[12.5px] text-neutral-600" data-transcript={transcript.status}>
            {transcript.status === "pending" ? tt("正在转成文字…") : null}
            {transcript.status === "done" ? <span className="whitespace-pre-wrap break-words">{transcript.text}</span> : null}
            {transcript.status === "failed" ? tt("没能转成文字") : null}
            {transcript.status === "skipped" ? tt("余额不足，没有转成文字") : null}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.name}
      className="flex max-w-[320px] items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 hover:bg-neutral-50"
    >
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[11px] font-semibold uppercase text-neutral-500">
        {(attachment.name.split(".").pop() ?? "file").slice(0, 4)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-neutral-800">{attachment.name}</span>
        <span className="block text-[11.5px] text-neutral-400">{formatBytes(attachment.size)} · {tt("下载")}</span>
      </span>
    </a>
  );
}
