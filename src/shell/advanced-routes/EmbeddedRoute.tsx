"use client";

import { useCallback, useMemo, useState } from "react";

import { useUI } from "../../i18n/ui/useUI";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { EmbedEditorPane } from "../workbench-embed";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import { UnsupportedRoute } from "./UnsupportedRoute";

export function EmbeddedRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const route = editorRouteFor(item);
  const [saveRequestNonce, setSaveRequestNonce] = useState(0);
  const [versionRevision, setVersionRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const requestEditorClose = useCallback(() => {
    if (
      dirty &&
      !window.confirm(tt("当前有未保存的修改，确定要离开高级工作台吗？"))
    ) {
      return;
    }
    onClose();
  }, [dirty, onClose, tt]);
  const websiteId = useMemo(
    () =>
      String(
        item.meta.website_id ||
          item.meta.project_id ||
          item.meta.slug ||
          item.meta.site_id ||
          "",
      ),
    [item.meta],
  );
  const starterId = useMemo(
    () => String(item.meta.starter_id || "").trim(),
    [item.meta],
  );
  const extraParams = useMemo(
    () => {
      if (item.kind !== "website") return undefined;
      if (websiteId) {
        return {
          siteId: websiteId,
          projectId: websiteId,
          ...(starterId ? { starterId } : {}),
        };
      }
      return starterId ? { starterId } : undefined;
    },
    [item.kind, starterId, websiteId],
  );

  if (route.type !== "embed") {
    return (
      <UnsupportedRoute
        item={item}
        previewContent={previewContent}
        linkUrl={linkUrl}
        taskId={taskId}
        siteId={siteId}
        accent={accent}
        onClose={onClose}
      />
    );
  }

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel(route)}
      editorControls={
        <div className="space-y-2 p-3 text-[12px] leading-relaxed text-stone-600">
          <p>{tt("右侧是当前内容本身的专业编辑画布，不是一次性生成应用。")}</p>
          <p>
            {tt(
              "画布内的选择、属性和节点工具会直接修改当前项目；保存时创建新版本并回到我的库。",
            )}
          </p>
          <button
            type="button"
            onClick={() => setSaveRequestNonce((value) => value + 1)}
            className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-white"
            style={{ background: accent }}
          >
            {tt("保存当前版本到我的库")}
          </button>
        </div>
      }
      editorStage={
        <EmbedEditorPane
          key={`${item.key}:${item.url || ""}:${item.previewUrl || ""}:${item.title}`}
          item={item}
          editorBase={route.base}
          mediaType={route.mediaType}
          siteId={siteId}
          extraParams={extraParams}
          onCloseRequest={requestEditorClose}
          onDirtyChange={setDirty}
          saveRequestNonce={saveRequestNonce}
          onVersionSaved={() => setVersionRevision((value) => value + 1)}
        />
      }
      versionRevision={versionRevision}
      editorDirty={dirty}
      onClose={onClose}
    />
  );
}
