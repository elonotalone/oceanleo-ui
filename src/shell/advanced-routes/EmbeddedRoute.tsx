"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUI } from "../../i18n/ui/useUI";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { AdvancedFlushResult } from "../advanced-session-context";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { SelectionToolbar } from "../SelectionToolbar";
import { EmbedEditorPane } from "../workbench-embed";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import type { LibraryItem } from "../library-data";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
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
  const [saveRequestId, setSaveRequestId] = useState("");
  const [versionRevision, setVersionRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savedItem, setSavedItem] = useState<LibraryItem | null>(null);
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [selectionCommand, setSelectionCommand] =
    useState<SelectionCommand | null>(null);
  const pendingSaveIdRef = useRef("");
  const saveResolverRef = useRef<
    ((result: AdvancedFlushResult) => void) | null
  >(null);
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    setSelection(null);
    setSelectionCommand(null);
  }, [item.key]);
  const settleSave = useCallback((result: AdvancedFlushResult) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const resolve = saveResolverRef.current;
    saveResolverRef.current = null;
    pendingSaveIdRef.current = "";
    resolve?.(result);
  }, []);
  useEffect(
    () => () => {
      settleSave({ ok: false });
    },
    [settleSave],
  );
  const saveBeforeNewConversation = useCallback(
    () =>
      new Promise<AdvancedFlushResult>((resolve) => {
        settleSave({ ok: false });
        const requestId = `host-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        pendingSaveIdRef.current = requestId;
        saveResolverRef.current = resolve;
        setSaveRequestId(requestId);
        saveTimerRef.current = window.setTimeout(
          () => settleSave({ ok: false, error: "编辑器保存超时" }),
          item.kind === "website" ? 5 * 60_000 : 25_000,
        );
      }),
    [item.kind, settleSave],
  );
  const requestManualSave = useCallback(() => {
    setSaveRequestId(
      `host-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    );
  }, []);
  const handleSaveResult = useCallback(
    (result: { ok: boolean; saveId?: string; item?: LibraryItem }) => {
      if (result.item) setSavedItem(result.item);
      if (
        saveResolverRef.current &&
        result.saveId === pendingSaveIdRef.current
      ) {
        settleSave(
          result.ok
            ? { ok: true, item: result.item }
            : { ok: false, error: "编辑器保存失败" },
        );
      }
    },
    [settleSave],
  );
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
      const blank: Record<string, string> =
        item.meta.draft === true && !item.url && !item.previewUrl
          ? { blank: "1" }
          : {};
      if (item.kind !== "website") {
        return Object.keys(blank).length ? blank : undefined;
      }
      if (websiteId) {
        return {
          ...blank,
          siteId: websiteId,
          projectId: websiteId,
          ...(starterId ? { starterId } : {}),
        };
      }
      return Object.keys(blank).length || starterId
        ? { ...blank, ...(starterId ? { starterId } : {}) }
        : undefined;
    },
    [
      item.kind,
      item.meta.draft,
      item.previewUrl,
      item.url,
      starterId,
      websiteId,
    ],
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
      editorToolbox={
        <div className="space-y-2 p-3 text-[12px] leading-relaxed text-stone-600">
          <p>{tt("右侧是当前内容本身的专业编辑画布，不是一次性生成应用。")}</p>
          <p>
            {tt(
              "点击画布里的对象后，在对象上方直接修改属性；左侧只保留全局工具，保存时创建新版本并回到我的库。",
            )}
          </p>
          <button
            type="button"
            onClick={requestManualSave}
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
          onSelectionChange={setSelection}
          selectionCommand={selectionCommand}
          onSaveResult={handleSaveResult}
          saveRequestId={saveRequestId}
          onVersionSaved={(next) => {
            setSavedItem(next);
            setVersionRevision((value) => value + 1);
          }}
        />
      }
      editorContextualToolbar={
        <SelectionToolbar
          context={selection}
          onCommand={setSelectionCommand}
          accent={accent}
        />
      }
      editorContextualToolbarAnchor={selection?.anchor}
      versionRevision={versionRevision}
      editorDirty={dirty}
      editorUsesOwnControls
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      onClose={onClose}
    />
  );
}
