"use client";

// ============================================================================
// 输入框附件缩略条（LeoComposer / InputCard 共用）
// ----------------------------------------------------------------------------
// 2026-10-31 重做（操作员：「看看 chatgpt 怎么做的。它只显示图片，且过程简洁」）：
// 每个附件一块圆角方块（`UploadTile`）——图片只显示缩略图，上传中压暗 + 小圆环，
// 失败给红色小徽章，悬停右上角 ×。不再有文件名 chip、进度行、字节与用时。
//
// - 宿主传 onOpenAttachment（C1）：点方块交给宿主打开（任务右侧栏），本组件不渲染预览。
// - 不传：点方块在右侧展开内置预览面板（子站沿用的旧行为）。
// ============================================================================

import { useEffect, useState } from "react";
import type { UploadProgressSnapshot } from "../lib/upload/progress";
import { UploadTile, withBusProgress } from "../lib/upload/upload-tile";
import type { UploadInFlight } from "../lib/upload/use-attachment-intake";
import { useUI } from "../i18n/ui/useUI";

export interface StripAttachment {
  id: string;
  name?: string;
  previewUrl?: string;
  /** 可打开的文件地址（本地 blob 或已上传 url）；预览面板优先用它。 */
  url?: string;
  mime?: string;
  uploading?: boolean;
  /** 上传失败但宿主仍保留着它（等用户重试或移除）：方块右下角红色小徽章。 */
  failed?: boolean;
  /** 真上传读数；缺省时由总线读数（inFlight）按名配上，再缺省是不确定态小圈。 */
  progress?: UploadProgressSnapshot | null;
}

/** 输入框里方块的边长（px）。 */
export const COMPOSER_TILE_SIZE = 56;

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
          // 不内嵌 iframe。src 经常是 blob:（与宿主同源），PDF 又不得免沙箱
          // 渲染（UC-3）；库里的 PDF 走自家 EmbedPDF 阅读器。
          // 这里只用顶栏「打开」在新标签看文件。
          <p className="text-neutral-500">{item.name || tt("附件")}</p>
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

/** 正在压缩、还没交给宿主的文件：先画一块「上传中」方块，缩略图用本地 blob。 */
function PendingFileTile({ file }: { file: File }) {
  const tt = useUI();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <UploadTile
      name={file.name}
      mime={file.type}
      previewUrl={previewUrl}
      state="uploading"
      size={COMPOSER_TILE_SIZE}
      tt={tt}
    />
  );
}

export function AttachmentStrip<T extends StripAttachment = StripAttachment>({
  attachments,
  onRemove,
  onOpenAttachment,
  onRetry,
  pendingFiles,
  inFlight,
  className = "",
}: {
  attachments: readonly T[];
  onRemove?: (id: string) => void;
  /**
   * C1 (2026-10-31): given → a tile click hands the attachment to the host
   * (e.g. the task right sidebar) and the built-in PreviewPanel never renders.
   * Omitted → the old built-in preview panel (sub-sites).
   */
  onOpenAttachment?: (att: T) => void;
  /** 失败方块上的重试；不传时失败徽章只是标记，用户可移除后重传。 */
  onRetry?: (id: string) => void;
  /** 正在压缩、尚未交给宿主的文件（`useAttachmentIntake().pending`）。 */
  pendingFiles?: readonly File[];
  /** 进度总线读数（`useAttachmentIntake().inFlight`），按名配给上传中的方块。 */
  inFlight?: readonly UploadInFlight[];
  className?: string;
}) {
  const tt = useUI();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = onOpenAttachment ? null : attachments.find((a) => a.id === openId) || null;
  useEffect(() => {
    if (openId && !opened) setOpenId(null);
  }, [openId, opened]);
  const pending = pendingFiles ?? [];
  if (attachments.length === 0 && pending.length === 0) return null;
  const shown = withBusProgress(attachments, inFlight ?? []);
  return (
    <>
      <div className={`flex flex-wrap gap-2 pt-1.5 ${className}`} data-oceanleo-attachments="">
        {shown.map((a) => {
          const failed = Boolean(a.failed || a.progress?.failed);
          const state = failed ? "failed" : a.uploading ? "uploading" : "ready";
          return (
            <UploadTile
              key={a.id}
              name={a.name}
              mime={a.mime}
              previewUrl={a.previewUrl}
              state={state}
              progress={a.progress}
              size={COMPOSER_TILE_SIZE}
              tt={tt}
              onOpen={
                a.uploading && !failed
                  ? undefined
                  : () => {
                      if (onOpenAttachment) onOpenAttachment(a);
                      else setOpenId((current) => (current === a.id ? null : a.id));
                    }
              }
              onRemove={onRemove && (!a.uploading || failed) ? () => onRemove(a.id) : undefined}
              onRetry={failed && onRetry ? () => onRetry(a.id) : undefined}
            />
          );
        })}
        {pending.map((file, index) => (
          <PendingFileTile key={`pending-${index}-${file.name}-${file.size}`} file={file} />
        ))}
      </div>
      {opened ? <PreviewPanel item={opened} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
