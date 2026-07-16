"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUI } from "../../i18n/ui/useUI";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { AdvancedFlushResult } from "../advanced-session-context";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import type { EditorMaterialInsertion } from "../editor-protocol";
import { SelectionToolbar } from "../SelectionToolbar";
import { EmbedEditorPane } from "../workbench-embed";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import type { LibraryItem } from "../library-data";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
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
  const [materialInsertion, setMaterialInsertion] =
    useState<EditorMaterialInsertion | null>(null);
  const materialResolversRef = useRef(
    new Map<
      string,
      {
        resolve: () => void;
        reject: (error: Error) => void;
        timer: number;
      }
    >(),
  );
  const pendingSaveIdRef = useRef("");
  const saveResolverRef = useRef<
    ((result: AdvancedFlushResult) => void) | null
  >(null);
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    setSelection(null);
    setSelectionCommand(null);
    setMaterialInsertion(null);
  }, [item.key]);
  useEffect(
    () => () => {
      materialResolversRef.current.forEach((pending) => {
        window.clearTimeout(pending.timer);
        pending.reject(new Error("嵌入编辑器已关闭。"));
      });
      materialResolversRef.current.clear();
    },
    [],
  );
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
  const materialAdapter = useMemo<WorkbenchMaterialAdapter | null>(() => {
    if (route.type !== "embed") return null;
    return {
      id: `embed-materials:${route.mediaType}@2`,
      actions: ["insert"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        const mime = String(material.meta.mime || "").toLowerCase();
        if (route.mediaType === "website" || route.mediaType === "image") {
          return (
            Boolean(material.previewUrl || material.thumbUrl) ||
            material.kind === "image" ||
            mime.startsWith("image/") ||
            urls.some((url) =>
              /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
            )
          );
        }
        return (
          ["image", "video", "audio"].includes(material.kind) ||
          /^(?:image|video|audio)\//.test(mime) ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|m4a|ogg)(?:$|[?#])/i.test(
              url || "",
            ),
          )
        );
      },
      mutate: (_action, material, placement) => {
        const candidates = (
          route.mediaType === "video"
            ? [material.url, material.previewUrl, material.thumbUrl]
            : [material.previewUrl, material.thumbUrl, material.url]
        ).filter(Boolean) as string[];
        const supportedUrl =
          route.mediaType === "video"
            ? /\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|m4a|ogg)(?:$|[?#])/i
            : /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i;
        const url =
          candidates.find((candidate) => supportedUrl.test(candidate)) ||
          candidates[0] ||
          "";
        if (!url) throw new Error("这个素材没有可用地址。");
        const resolvedKind = /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(url)
          ? "video"
          : /\.(?:mp3|wav|m4a|ogg)(?:$|[?#])/i.test(url)
            ? "audio"
            : /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url)
              ? "image"
              : material.kind;
        const commandId = `material-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
        return new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            materialResolversRef.current.delete(commandId);
            setMaterialInsertion((current) =>
              current?.commandId === commandId ? null : current,
            );
            reject(new Error("嵌入编辑器添加素材超时。"));
          }, 20_000);
          materialResolversRef.current.set(commandId, {
            resolve,
            reject,
            timer,
          });
          setMaterialInsertion({
            commandId,
            action: "insert",
            material: {
              id: material.key || material.id,
              kind: resolvedKind,
              title: material.title,
              url,
              previewUrl: material.previewUrl || material.thumbUrl,
              meta: {
                format: material.meta.format,
                mime: material.meta.mime,
                content_type: material.meta.content_type,
                subtype: material.meta.subtype,
              },
              writable: false,
            },
            ...(placement?.source === "drop" &&
            Number.isFinite(placement.clientX) &&
            Number.isFinite(placement.clientY)
              ? {
                  point: {
                    x: placement.clientX as number,
                    y: placement.clientY as number,
                  },
                }
              : {}),
          });
        });
      },
    };
  }, [route]);
  useWorkbenchMaterialAdapter(materialAdapter);
  const handleMaterialResult = useCallback(
    (result: { commandId: string; ok: boolean; message?: string }) => {
      const pending = materialResolversRef.current.get(result.commandId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      materialResolversRef.current.delete(result.commandId);
      setMaterialInsertion((current) =>
        current?.commandId === result.commandId ? null : current,
      );
      if (result.ok) pending.resolve();
      else pending.reject(new Error(result.message || "素材添加失败。"));
    },
    [],
  );
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
  const githubRepo = useMemo(
    () => String(item.meta.github_repo || "").trim(),
    [item.meta],
  );
  const commitSha = useMemo(
    () => String(item.meta.commit_sha || "").trim(),
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
          ...(githubRepo ? { githubRepo } : {}),
          ...(commitSha ? { commitSha } : {}),
        };
      }
      return Object.keys(blank).length || starterId || githubRepo
        ? {
            ...blank,
            ...(starterId ? { starterId } : {}),
            ...(githubRepo ? { githubRepo } : {}),
            ...(commitSha ? { commitSha } : {}),
          }
        : undefined;
    },
    [
      item.kind,
      item.meta.draft,
      item.previewUrl,
      item.url,
      starterId,
      websiteId,
      githubRepo,
      commitSha,
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
      editorHeaderActions={
        <button
          type="button"
          onClick={requestManualSave}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-105"
        >
          <AdvancedEditorIcon name="save" className="h-4 w-4" />
          {dirty
            ? tt("advanced.saveNewVersion")
            : tt("advanced.saveToMyLibrary")}
        </button>
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
          materialInsertion={materialInsertion}
          onMaterialResult={handleMaterialResult}
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
      editorHistory={{
        canUndo: Boolean(
          selection?.controls.some(
            (control) => control.id === "undo" && !control.disabled,
          ),
        ),
        canRedo: Boolean(
          selection?.controls.some(
            (control) => control.id === "redo" && !control.disabled,
          ),
        ),
        undo: () => {
          if (!selection) return;
          setSelectionCommand({
            requestId: `header-undo-${Date.now()}`,
            selectionId: selection.id,
            controlId: "undo",
          });
        },
        redo: () => {
          if (!selection) return;
          setSelectionCommand({
            requestId: `header-redo-${Date.now()}`,
            selectionId: selection.id,
            controlId: "redo",
          });
        },
      }}
      versionRevision={versionRevision}
      editorDirty={dirty}
      editorUsesOwnControls
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      onClose={onClose}
    />
  );
}
