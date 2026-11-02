"use client";

// ============================================================================
// 输入框附件缩略条（LeoComposer / InputCard 共用）
// ----------------------------------------------------------------------------
// 2026-10-31 重做（操作员：「看看 chatgpt 怎么做的。它只显示图片，且过程简洁」）：
// 每个附件一块圆角方块（`UploadTile`）——图片只显示缩略图，上传中压暗 + 小圆环，
// 失败给红色小徽章，悬停右上角 ×。不再有文件名 chip、进度行、字节与用时。
//
// - 宿主传 onOpenAttachment（C1）：点方块交给宿主打开（任务右侧栏）。
// - 不传：点方块也在这里打开共享的 WorkspaceLibrary 详情（适合没有任务栏的首页/子站）。
// - 2026-10-31 A5：上传中的方块也挂 ×（与上传完成的一样）；宿主的 onRemove 负责取消上传。
// - 2026-10-31 A1：刷新后恢复的私有附件没有本地 blob，图片缩略图按引用向网关要短期地址。
// ============================================================================

import { useEffect, useState } from "react";
import type { UploadProgressSnapshot } from "../lib/upload/progress";
import { UploadTile, isImageTile, withBusProgress, type UploadTileProps } from "../lib/upload/upload-tile";
import { useAttachmentDisplayUrl } from "../lib/attachment-url";
import type { UploadInFlight } from "../lib/upload/use-attachment-intake";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem, LibraryKind } from "./library-data";
import { WorkspaceLibrary } from "./WorkspaceLibrary";
import { workspaceEntryFromLibraryItem } from "./workspace-library-model";

export interface StripAttachment {
  id: string;
  name?: string;
  previewUrl?: string;
  /** 可打开的文件地址（本地 blob 或已上传 url）；共享详情用它读取内容。 */
  url?: string;
  mime?: string;
  uploading?: boolean;
  /** 上传失败但宿主仍保留着它（等用户重试或移除）：方块右下角红色小徽章。 */
  failed?: boolean;
  /** 真上传读数；缺省时由总线读数（inFlight）按名配上，再缺省是不确定态小圈。 */
  progress?: UploadProgressSnapshot | null;
  /** 私有 Library 引用（恢复的草稿附件没有本地预览时，按它取缩略图）。 */
  artifactId?: string;
  revisionId?: string;
  /** 已上传附件的完整 typed Library 行，优先保留给详情查看器。 */
  libraryItem?: LibraryItem;
}

/** 输入框里方块的边长（px）。 */
export const COMPOSER_TILE_SIZE = 56;

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|html?|css|js|jsx|ts|tsx|py|sh|sql|ini|toml)$/i;

function libraryKindForAttachment(item: StripAttachment): LibraryKind {
  const mime = (item.mime || "").toLowerCase();
  const name = item.name || "";
  if (mime.startsWith("image/") || (!item.url && item.previewUrl)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(name)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) return "audio";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "document";
  if (/presentation|powerpoint/.test(mime) || /\.(ppt|pptx|odp)$/i.test(name)) return "ppt";
  if (/spreadsheet|ms-excel|text\/csv/.test(mime) || /\.(xls|xlsx|csv|ods)$/i.test(name)) return "sheet";
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(name)) return "document";
  return "file";
}

function libraryEntryForAttachment(item: StripAttachment) {
  if (item.libraryItem) return workspaceEntryFromLibraryItem(item.libraryItem);
  const url = item.url || item.previewUrl || undefined;
  return workspaceEntryFromLibraryItem({
    key: `local-attachment:${item.id}`,
    source: "creation",
    id: item.id,
    title: item.name || "附件",
    kind: libraryKindForAttachment(item),
    siteId: "",
    url,
    previewUrl: item.previewUrl || url,
    thumbUrl: item.previewUrl || url,
    favorite: false,
    artifactId: item.artifactId,
    revisionId: item.revisionId,
    meta: {
      library_source: "local-attachment",
      mime: item.mime || "",
      filename: item.name || "",
      local_attachment: true,
    },
  });
}

/** 一块附件方块：没有可用预览的私有图片按引用向网关要短期缩略图地址。 */
function StripTile({
  attachment,
  ...tile
}: Omit<UploadTileProps, "previewUrl"> & { attachment: StripAttachment }) {
  const needsRemote =
    !attachment.previewUrl &&
    Boolean(attachment.artifactId && attachment.revisionId) &&
    isImageTile(attachment.mime, attachment.name);
  const remote = useAttachmentDisplayUrl(
    needsRemote
      ? { artifactId: attachment.artifactId, revisionId: attachment.revisionId, mime: attachment.mime }
      : null,
  );
  return <UploadTile {...tile} previewUrl={attachment.previewUrl || remote} />;
}

/** 正在压缩、还没交给宿主的文件：先画一块「上传中」方块，缩略图用本地 blob。 */
function PendingFileTile({ file, onOpen }: {
  file: File;
  onOpen: (attachment: StripAttachment) => void;
}) {
  const tt = useUI();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isImageTile(file.type, file.name) || typeof URL.createObjectURL !== "function") return;
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
      onOpen={previewUrl ? () => {
        // 查看器独立持有一个 URL，不受压缩占位块卸载/缩略图释放影响。
        const url = URL.createObjectURL(file);
        onOpen({
          id: `pending:${url}`,
          name: file.name,
          mime: file.type || "image/unknown",
          previewUrl: url,
          url,
          uploading: true,
        });
      } : undefined}
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
   * (e.g. the task right sidebar); the shared Library detail handles opening.
   * Omitted → the shared Library detail opens locally (home/sub-sites).
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
  const [pendingPreview, setPendingPreview] = useState<{
    attachment: StripAttachment;
    file: File;
    existingIds: Set<string>;
  } | null>(null);
  useEffect(() => {
    const url = pendingPreview?.attachment.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pendingPreview?.attachment.previewUrl]);
  const opened = onOpenAttachment ? null :
    attachments.find((a) => a.id === openId) ||
    (pendingPreview?.attachment.id === openId ? pendingPreview.attachment : null);
  useEffect(() => {
    if (openId && !opened) setOpenId(null);
  }, [openId, opened]);
  const pending = pendingFiles ?? [];
  useEffect(() => {
    if (!pendingPreview || pending.includes(pendingPreview.file)) return;
    const original = pendingPreview.file.name;
    // 压缩可能把 PNG 改成 JPEG；仅匹配本次点击之后新增的同名/同 stem 图片。
    const stem = (name: string) => name.replace(/\.[^.]+$/, "");
    const candidates = attachments.filter((a) =>
      !pendingPreview.existingIds.has(a.id) &&
      isImageTile(a.mime, a.name, a.previewUrl) &&
      (a.name === original || stem(a.name || "") === stem(original)) &&
      Boolean(a.previewUrl || a.url || a.libraryItem || (a.artifactId && a.revisionId)),
    );
    // 同名并发附件无法可靠区分：继续保留准确的本地原图，绝不切错文件。
    if (candidates.length !== 1) return;
    const attachment = candidates[0];
    if (onOpenAttachment) onOpenAttachment(attachment);
    else setOpenId(attachment.id);
    setPendingPreview(null);
  }, [attachments, pending, pendingPreview, onOpenAttachment]);
  if (attachments.length === 0 && pending.length === 0 && !opened) return null;
  const shown = withBusProgress(attachments, inFlight ?? []);
  const openedEntry = opened ? libraryEntryForAttachment(opened) : null;
  return (
    <>
      <div className={`flex flex-wrap gap-2 pt-1.5 ${className}`} data-oceanleo-attachments="">
        {shown.map((a) => {
          const failed = Boolean(a.failed || a.progress?.failed);
          const state = failed ? "failed" : a.uploading ? "uploading" : "ready";
          return (
            <StripTile
              key={a.id}
              attachment={a}
              name={a.name}
              mime={a.mime}
              state={state}
              progress={a.progress}
              size={COMPOSER_TILE_SIZE}
              tt={tt}
              onOpen={
                a.uploading && !failed && !isImageTile(a.mime, a.name, a.previewUrl)
                  ? undefined
                  : () => {
                      if (onOpenAttachment) onOpenAttachment(a);
                      else setOpenId((current) => (current === a.id ? null : a.id));
                      setPendingPreview(null);
                    }
              }
              // A5：上传中也能删（宿主取消上传、迟到的结果不会把它加回来）。
              onRemove={onRemove ? () => onRemove(a.id) : undefined}
              onRetry={failed && onRetry ? () => onRetry(a.id) : undefined}
            />
          );
        })}
        {pending.map((file, index) => (
          <PendingFileTile
            key={`pending-${index}-${file.name}-${file.size}`}
            file={file}
            onOpen={(attachment) => {
              setPendingPreview({ attachment, file, existingIds: new Set(attachments.map((a) => a.id)) });
              // pending 还没有宿主的 T 扩展字段，打开入口只消费 StripAttachment 字段。
              if (onOpenAttachment) onOpenAttachment(attachment as T);
              else setOpenId(attachment.id);
            }}
          />
        ))}
      </div>
      {opened ? (
        <div className="fixed inset-0 z-[80] bg-[var(--surface,#fafaf9)]">
          <WorkspaceLibrary
            entries={openedEntry ? [openedEntry] : []}
            openEntryId={openedEntry?.id}
            onDetailOpenChange={(open) => {
              if (!open) {
                setOpenId(null);
                setPendingPreview(null);
              }
            }}
            plain
            emptyTitle=""
            emptyDescription=""
          />
        </div>
      ) : null}
    </>
  );
}
