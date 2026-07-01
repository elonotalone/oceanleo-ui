"use client";

// ============================================================================
// @oceanleo/ui — 附件上传 hook（AgentChat / FunctionAgentChat 共用，单一事实源）
// ----------------------------------------------------------------------------
// 用户在 agent 输入框「＋」里选/拖文件 → 本 hook 复用文件库 upload 端点上传到公网桶，
// 拿到 url 后作为 AgentAttachment 随消息交给 agent（后端把音频转写进 prompt、把其它
// 文件的 url 给 CodeAgent 在内核里下载分析）。见
// docs/architecture/oceanleo-agent-file-upload.md。
// ============================================================================

import { useCallback, useState } from "react";
import { uploadFile } from "../lib/database";
import type { AgentAttachment } from "../lib/agent";
import type { ComposerAttachment } from "./LeoComposer";

/** 附件在组件内的状态：上传中 → 上传成功（带可交付的 attachment）。 */
export interface PendingAttachment {
  id: string;
  name: string;
  previewUrl?: string;
  uploading: boolean;
  attachment?: AgentAttachment;
}

export interface UseAttachments {
  attachments: PendingAttachment[];
  /** 传给 LeoComposer 的 attachments（缩略条）。 */
  composerAttachments: ComposerAttachment[];
  handleAttachFiles: (files: File[]) => void;
  removeAttachment: (id: string) => void;
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

  const handleAttachFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const isImage = file.type.startsWith("image/");
        const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, previewUrl, uploading: true },
        ]);
        void uploadFile(file, { siteId }).then((r) => {
          if (r.ok && r.data?.file?.url) {
            const f = r.data.file;
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id
                  ? {
                      id,
                      name: f.title || file.name,
                      previewUrl: previewUrl || f.thumb_url,
                      uploading: false,
                      attachment: {
                        url: f.url,
                        mime: f.mime,
                        name: f.title || file.name,
                        media_type: f.media_type,
                      },
                    }
                  : a,
              ),
            );
          } else {
            setAttachments((prev) => prev.filter((a) => a.id !== id));
            onError?.(r.error || "文件上传失败");
          }
        });
      }
    },
    [siteId, onError],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const ready = useCallback(
    () =>
      attachments
        .filter((a) => !a.uploading && a.attachment)
        .map((a) => a.attachment as AgentAttachment),
    [attachments],
  );

  const clear = useCallback(() => setAttachments([]), []);

  return {
    attachments,
    composerAttachments: attachments.map(
      (a): ComposerAttachment => ({
        id: a.id,
        name: a.name,
        previewUrl: a.previewUrl,
        uploading: a.uploading,
      }),
    ),
    handleAttachFiles,
    removeAttachment,
    ready,
    uploading: attachments.some((a) => a.uploading),
    clear,
  };
}
