"use client";

import { useCallback, useEffect, useState } from "react";
import { uploadFile } from "../../lib/database";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import {
  LightweightOfficeEmptyState,
  lightweightOfficeRouteForItem,
} from "../office-editor";
import { DeckRoute } from "./DeckRoute";
import { GridRoute } from "./GridRoute";
import { RichDocRoute } from "./RichDocRoute";

/**
 * Compatibility route for artifacts still declaring the historical `office`
 * adapter. It immediately dispatches to the same in-process native routes used
 * by document, spreadsheet, and presentation capabilities.
 */
export function OfficeRoute(props: AdvancedContentWorkbenchProps) {
  const { item, siteId = "", accent = "#4f46e5" } = props;
  const [sourceItem, setSourceItem] = useState(item);
  const [replaceError, setReplaceError] = useState("");

  useEffect(() => {
    setSourceItem(item);
    setReplaceError("");
  }, [item.key, item.revisionId, item.url]);

  const route = lightweightOfficeRouteForItem(sourceItem);
  const routedProps = { ...props, item: sourceItem };

  const replaceLocalFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setReplaceError("");
      const uploaded = await uploadFile(file, {
        siteId: siteId || "oceanleo",
        title: file.name,
        registerAsset: true,
      });
      const next = uploaded.data?.file;
      if (!uploaded.ok || !next?.url) {
        const message = uploaded.error || "Office 文件上传失败。";
        setReplaceError(message);
        throw new Error(message);
      }
      setSourceItem({
        ...item,
        key: `file:${next.id}`,
        source: "creation",
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

  if (route === "richdoc") return <RichDocRoute {...routedProps} />;
  if (route === "grid") return <GridRoute {...routedProps} />;
  if (route === "deck") return <DeckRoute {...routedProps} />;

  return (
    <AdvancedWorkbenchShell
      item={sourceItem}
      taskId={props.taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "richdoc",
        label: "轻量 Office 编辑",
        available: true,
        stage: (
          <LightweightOfficeEmptyState item={sourceItem} accent={accent} />
        ),
        status: replaceError || "缺少可识别的 Office 源文件",
        upload: {
          accept:
            ".doc,.docx,.docm,.odt,.rtf,.xls,.xlsx,.xlsm,.xlsb,.xltx,.ods,.ppt,.pptx,.pptm,.pot,.potx,.potm,.odp",
          onFiles: replaceLocalFile,
        },
      }}
      onClose={props.onClose}
    />
  );
}
