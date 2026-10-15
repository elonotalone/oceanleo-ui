"use client";

// ============================================================================
// 输入框附件缩略条 + 右侧预览面板（LeoComposer / InputCard 共用）
// ----------------------------------------------------------------------------
// - 点击缩略卡 → 右侧展开预览面板（图片 / 文本 / PDF / 音视频，其余给文件名 + 打开）。
// - 上传中：缩略图上盖一圈转动圈（不用进度条，也不在文件右侧显示百分比 / 序号）。
// - 删除键附着在卡片右上角。
// ============================================================================

import { useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";

export interface StripAttachment {
  id: string;
  name?: string;
  previewUrl?: string;
  /** 可打开的文件地址（本地 blob 或已上传 url）；预览面板优先用它。 */
  url?: string;
  mime?: string;
  uploading?: boolean;
}

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|html?|css|js|jsx|ts|tsx|py|sh|sql|ini|toml)$/i;
const MAX_TEXT_BYTES = 256 * 1024;

type Kind = "image" | "text" | "pdf" | "audio" | "video" | "other";

function kindOf(a: StripAttachment): Kind {
  const mime = (a.mime || "").toLowerCase();
  const name = a.name || "";
  if (mime.startsWith("image/") || (!a.url && a.previewUrl)) return "image";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(name)) return "text";
  return "other";
}

function FileGlyph() {
  return (
    <svg className="h-4 w-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      data-attachment-spinner=""
      className={`inline-block animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 ${className}`}
    />
  );
}

function PreviewPanel({ item, onClose }: { item: StripAttachment; onClose: () => void }) {
  const tt = useUI();
  const kind = kindOf(item);
  const src = item.url || item.previewUrl || "";
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setText(null);
    setFailed(false);
    if (kind !== "text" || !src) return;
    let alive = true;
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => blob.slice(0, MAX_TEXT_BYTES).text())
      .then((value) => alive && setText(value))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [kind, src]);

  return (
    <aside
      data-attachment-preview=""
      className="fixed inset-y-0 right-0 z-[80] flex w-[min(520px,92vw)] flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-1.5 dark:border-neutral-800">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name || tt("附件")}</span>
        {src ? (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            download={item.name || undefined}
            className="rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {tt("打开")}
          </a>
        ) : null}
        <button
          type="button"
          aria-label={tt("关闭")}
          onClick={onClose}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
        {kind === "image" && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={item.name || ""} className="mx-auto max-h-full max-w-full object-contain" />
        ) : kind === "text" ? (
          failed ? (
            <p className="text-neutral-500">{item.name || tt("附件")}</p>
          ) : text === null ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed">{text}</pre>
          )
        ) : kind === "pdf" && src ? (
          <iframe title={item.name || "pdf"} src={src} className="h-full w-full rounded-md border-0" />
        ) : kind === "audio" && src ? (
          <audio controls src={src} className="w-full" />
        ) : kind === "video" && src ? (
          <video controls src={src} className="max-h-full w-full" />
        ) : (
          <p className="text-neutral-500">{item.name || tt("附件")}</p>
        )}
      </div>
    </aside>
  );
}

export function AttachmentStrip({
  attachments,
  onRemove,
  className = "",
}: {
  attachments: readonly StripAttachment[];
  onRemove?: (id: string) => void;
  className?: string;
}) {
  const tt = useUI();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = attachments.find((a) => a.id === openId) || null;
  useEffect(() => {
    if (openId && !opened) setOpenId(null);
  }, [openId, opened]);
  if (attachments.length === 0) return null;
  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className}`} data-oceanleo-attachments="">
        {attachments.map((a) => (
          <div key={a.id} className="group relative">
            <button
              type="button"
              disabled={a.uploading}
              aria-label={a.name || tt("附件")}
              onClick={() => setOpenId((current) => (current === a.id ? null : a.id))}
              className={`flex items-center gap-1.5 rounded-lg border bg-white px-1 py-1 pr-2 text-left text-[11px] text-neutral-600 shadow-sm transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 disabled:cursor-default dark:bg-neutral-900 dark:text-neutral-300 ${
                openId === a.id ? "border-neutral-400" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800">
                {a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileGlyph />
                )}
                {a.uploading ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-black/50">
                    <Spinner className="h-4 w-4" />
                  </span>
                ) : null}
              </span>
              <span className="max-w-[120px] truncate">{a.name || tt("附件")}</span>
            </button>
            {onRemove && !a.uploading ? (
              <button
                type="button"
                aria-label={tt("移除")}
                onClick={() => onRemove(a.id)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[11px] leading-none text-white shadow hover:bg-neutral-900"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {opened ? <PreviewPanel item={opened} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
