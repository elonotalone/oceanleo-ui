"use client";

// ============================================================================
// @oceanleo/ui — 附件上传 hook（AgentChat / FunctionAgentChat 共用，单一事实源）
// ----------------------------------------------------------------------------
// 用户在 agent 输入框「＋」里选/拖文件 → 本 hook 用 `uploadComposerFile` 传进**私有**
// Library（桶 project-assets，W6 2026-10-31），拿到 `{artifact_id, revision_id}` 引用随消息
// 交给 agent；网关按 owner 校验后给 agent 一个短期签名地址（音频转写进 prompt、其它文件
// 在内核里下载分析）。缩略块只用本地 blob: 地址，状态里不放任何存储 URL。见
// docs/architecture/oceanleo-agent-file-upload.md。
// ============================================================================

import { useCallback, useRef, useState } from "react";
import type { AgentAttachment } from "../lib/agent";
import {
  PRIVATE_ATTACHMENT_MAX_BYTES,
  PRIVATE_ATTACHMENT_TOO_LARGE,
  attachmentDisplayUrl,
} from "../lib/attachment-url";
import type { ComposerAttachment } from "./LeoComposer";
import { uploadComposerFile } from "./composer-upload";
import type { LibraryItem } from "./library-data";

/** 附件在组件内的状态：上传中 → 上传成功（带可交付的 attachment）。 */
export interface PendingAttachment {
  id: string;
  name: string;
  previewUrl?: string;
  url?: string;
  mime?: string;
  uploading: boolean;
  /** Upload failed: the tile stays with a retry badge (`retryAttachment`). */
  failed?: boolean;
  attachment?: AgentAttachment;
  /** Private Library identity of a finished upload (contract C2). */
  artifactId?: string;
  revisionId?: string;
  libraryItem?: LibraryItem;
}

export interface UseAttachments {
  attachments: PendingAttachment[];
  /** 传给 LeoComposer 的 attachments（缩略条）。 */
  composerAttachments: ComposerAttachment[];
  handleAttachFiles: (files: File[]) => void;
  /**
   * 直接加入一个**已上传好**的附件（如用户从「最近文件」里选已在文件库的文件）——
   * 不走 uploadFile，直接进 ready 态。按 id 去重（重复选同一个不叠加）。
   */
  addReady: (att: { id: string; name: string; previewUrl?: string; attachment: AgentAttachment }) => void;
  /** 请求失败时仅在用户尚未选择新附件的情况下恢复刚提交的附件。 */
  restoreReady: (items: PendingAttachment[]) => void;
  removeAttachment: (id: string) => void;
  /** 重新上传一个失败的附件（LeoComposer `onRetryAttachment`）。 */
  retryAttachment: (id: string) => void;
  /** 已上传成功、可随消息发送的附件。 */
  ready: () => AgentAttachment[];
  /** 是否还有附件在上传中（阻止发送）。 */
  uploading: boolean;
  /** 发送后清空。 */
  clear: () => void;
}

export function useAttachments(
  siteId: string,
  onError?: (msg: string) => void,
): UseAttachments {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  // The original File of every tile that has not finished, so a failed one can retry.
  const filesRef = useRef(new Map<string, File>());

  const startUpload = useCallback(
    (id: string, file: File) => {
      void uploadComposerFile(file, { siteId }).then((r) => {
        if (r.ok) {
          filesRef.current.delete(id);
          const up = r.upload;
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    name: up.name || file.name,
                    mime: up.mime || file.type,
                    uploading: false,
                    failed: false,
                    attachment: up.attachment,
                    artifactId: up.artifactId,
                    revisionId: up.revisionId,
                    ...(up.libraryItem ? { libraryItem: up.libraryItem } : {}),
                  }
                : a,
            ),
          );
        } else {
          // Keep the tile with a retry badge; it is not sent while failed.
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, uploading: false, failed: true } : a)),
          );
          onError?.(r.error || "文件上传失败");
        }
      });
    },
    [siteId, onError],
  );

  const handleAttachFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        if (file.size > PRIVATE_ATTACHMENT_MAX_BYTES) {
          // Private storage only: an oversize file is refused, never sent public.
          onError?.(PRIVATE_ATTACHMENT_TOO_LARGE);
          continue;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const isImage = file.type.startsWith("image/");
        const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
        const localUrl = previewUrl || URL.createObjectURL(file);
        filesRef.current.set(id, file);
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, previewUrl, url: localUrl, mime: file.type, uploading: true },
        ]);
        startUpload(id, file);
      }
    },
    [onError, startUpload],
  );

  const retryAttachment = useCallback(
    (id: string) => {
      const file = filesRef.current.get(id);
      if (!file) return;
      setAttachments((prev) =>
        prev.map((a) => (a.id === id && a.failed ? { ...a, uploading: true, failed: false } : a)),
      );
      startUpload(id, file);
    },
    [startUpload],
  );

  const addReady = useCallback(
    (att: { id: string; name: string; previewUrl?: string; attachment: AgentAttachment }) => {
      setAttachments((prev) =>
        prev.some((a) => a.id === att.id)
          ? prev
          : [
              ...prev,
              {
                id: att.id,
                name: att.name,
                previewUrl: att.previewUrl,
                uploading: false,
                attachment: att.attachment,
              },
            ],
      );
    },
    [],
  );

  const removeAttachment = useCallback((id: string) => {
    filesRef.current.delete(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const restoreReady = useCallback((items: PendingAttachment[]) => {
    const readyItems = items.filter(
      (item) => !item.uploading && Boolean(item.attachment),
    );
    if (!readyItems.length) return;
    setAttachments((current) => (current.length ? current : readyItems));
  }, []);

  const ready = useCallback(
    () =>
      attachments
        .filter((a) => !a.uploading && !a.failed && a.attachment)
        .map((a) => a.attachment as AgentAttachment),
    [attachments],
  );

  const clear = useCallback(() => {
    filesRef.current.clear();
    setAttachments([]);
  }, []);

  return {
    attachments,
    composerAttachments: attachments.map(
      (a): ComposerAttachment => ({
        id: a.id,
        name: a.name,
        // Local blob first; a legacy public URL goes through the gateway proxy.
        previewUrl: attachmentDisplayUrl({ previewUrl: a.previewUrl }),
        url: attachmentDisplayUrl({ url: a.url || a.attachment?.url }),
        mime: a.mime || a.attachment?.mime,
        uploading: a.uploading,
        ...(a.failed ? { failed: true } : {}),
        ...(a.artifactId ? { artifactId: a.artifactId } : {}),
        ...(a.revisionId ? { revisionId: a.revisionId } : {}),
        ...(a.libraryItem ? { libraryItem: a.libraryItem } : {}),
      }),
    ),
    handleAttachFiles,
    addReady,
    restoreReady,
    removeAttachment,
    retryAttachment,
    ready,
    uploading: attachments.some((a) => a.uploading),
    clear,
  };
}
