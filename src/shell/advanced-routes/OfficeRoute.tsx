"use client";

import { useCallback, useEffect, useState } from "react";
import { uploadFile } from "../../lib/database";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import {
  OfficeStage,
  useOfficeWorkbench,
} from "../office-editor";

export function OfficeRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const [sourceItem, setSourceItem] = useState(item);
  useEffect(() => setSourceItem(item), [item.key, item.url]);
  const editor = useOfficeWorkbench(sourceItem, siteId, onClose);
  const saveBeforeNewConversation = useCallback(async () => {
    const savedItem = await editor.waitForSave();
    return savedItem
      ? { ok: true as const, item: savedItem }
      : { ok: false as const };
  }, [editor.waitForSave]);
  const downloadCurrent = useCallback(async () => {
    let target = editor.savedItem;
    if (editor.dirty || (editor.saveCount > 0 && !target)) {
      target = await editor.waitForSave();
      if (!target) {
        throw new Error("当前修改尚未完成云端保存，暂不能下载旧版本。");
      }
    }
    const url = target?.url || sourceItem.url;
    if (!url) throw new Error("当前文件还没有可下载地址。");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = target?.title || sourceItem.title || "document";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [
    editor.dirty,
    editor.saveCount,
    editor.savedItem,
    editor.waitForSave,
    sourceItem,
  ]);
  const replaceLocalFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const uploaded = await uploadFile(file, {
        siteId: siteId || "oceanleo",
        title: file.name,
        registerAsset: true,
      });
      const next = uploaded.data?.file;
      if (!uploaded.ok || !next?.url) {
        throw new Error(uploaded.error || "Office 文件上传失败。");
      }
      setSourceItem({
        ...item,
        key: `file:${next.id}`,
        id: next.id,
        title: next.title || file.name,
        url: next.url,
        previewUrl: next.thumb_url || next.url,
        thumbUrl: next.thumb_url || item.thumbUrl,
        meta: {
          ...item.meta,
          ...(next.meta || {}),
          format: file.name.split(".").pop()?.toLowerCase() || "",
          mime: next.mime || file.type,
        },
      });
    },
    [item, siteId],
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "office",
        label: editorToolLabel(editorRouteFor(item)),
        stage: <OfficeStage editor={editor} />,
        available: Boolean(editor.extension),
        status: editor.error,
        nativeChrome: {
          toolbar: true,
          viewport: true,
          closeGuard: true,
        },
        directDownload: {
          id: "office-download-current",
          label: "直接下载当前文件",
          icon: "download",
          disabled: editor.state !== "ready",
          onTrigger: downloadCurrent,
        },
        actions:
          editor.state === "error"
            ? [
                {
                  id: "office-retry",
                  label: "重试加载",
                  onTrigger: editor.retry,
                },
              ]
            : [],
        upload: {
          accept:
            ".doc,.docx,.docm,.odt,.rtf,.xls,.xlsx,.xlsm,.xlsb,.xltx,.ods,.ppt,.pptx,.pptm,.pot,.potx,.potm,.odp",
          onFiles: replaceLocalFile,
        },
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
        },
      }}
      onClose={onClose}
    />
  );
}
