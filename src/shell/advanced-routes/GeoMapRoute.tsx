"use client";

import { useCallback, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { GeoMapContextToolbar } from "../geo-map-editor/GeoMapContextToolbar";
import { GeoMapControls } from "../geo-map-editor/GeoMapControls";
import { GeoMapStage } from "../geo-map-editor/GeoMapStage";
import {
  GEO_MAP_LAYOUT,
  renderGeoMapToCanvas,
} from "../geo-map-editor/geo-map-render";
import { serializeGeoMapProject } from "../geo-map-editor/geo-map-source";
import {
  geoMapEditorManifest,
  useGeoMapWorkbench,
  type GeoMapCommitSuccess,
} from "../geo-map-editor/use-geo-map-workbench";
import { downloadText } from "../doc-editors/doc-io";
import { libraryContentDescriptor, type LibraryItem } from "../library-data";
import { editorToolLabel } from "../workbench-routes";

const GEO_MAP_ADAPTER_ID = "geo-map" as const;

export function GeoMapRoute({
  item,
  taskId,
  siteId = "",
  accent = "#1F6FEB",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useGeoMapWorkbench(item, siteId);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportBusyRef = useRef(false);
  // `degraded` renders but must not be exported or saved as a finished map:
  // its data layers are missing, so any deliverable would be a hollow copy.
  const exportUnavailable =
    editor.loading || !editor.sourceReady || !editor.project;

  const buildSavedItem = useCallback(
    (saved: GeoMapCommitSuccess): LibraryItem => {
      const canonicalMeta = {
        editor: geoMapEditorManifest(),
        content_type: "geo_map",
        representation: "geo-map-project",
        editor_project_url: saved.projectUrl,
        editor_project_schema: saved.projectSchema,
        editor_revision_id: saved.revisionId,
        previous_revision_id: saved.previousRevisionId,
      };
      if (saved.item) {
        const meta = { ...saved.item.meta, ...canonicalMeta };
        return {
          ...saved.item,
          content: saved.json,
          meta,
          descriptor: libraryContentDescriptor({
            kind: saved.item.kind,
            meta,
          }),
        };
      }
      const next = advancedSavedItem(item, {
        url: saved.projectUrl,
        versionId: saved.revisionId,
        previewUrl: item.previewUrl || item.thumbUrl,
        thumbUrl: item.thumbUrl || item.previewUrl,
        meta: {
          ...canonicalMeta,
          subtype: String(item.meta.subtype || item.meta.category || ""),
        },
      });
      const { geo_map_project: _geoMapProject, ...sessionMeta } = next.meta;
      return {
        ...next,
        meta: sessionMeta,
        content: saved.json,
        descriptor: libraryContentDescriptor({
          kind: next.kind,
          meta: sessionMeta,
        }),
      };
    },
    [item],
  );

  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? { ok: true as const, item: buildSavedItem(saved) }
      : {
          ok: false as const,
          error:
            editor.error ||
            (editor.state === "degraded"
              ? "依赖闭包不完整，降级态不得写入新 revision。"
              : !editor.sourceReady
                ? "地图源未成功载入，未保存回退内容。"
                : "地图保存失败"),
        };
  }, [buildSavedItem, editor]);

  const importLocalProject = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setExportError("");
      try {
        editor.importProject(await file.text());
      } catch (caught) {
        setExportError(
          caught instanceof Error ? caught.message : "地图工程读取失败",
        );
      }
    },
    [editor.importProject],
  );

  const exportPng = useCallback(async () => {
    const project = editor.project;
    if (exportBusyRef.current || !project) return;
    exportBusyRef.current = true;
    setExporting(true);
    setExportError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = GEO_MAP_LAYOUT.canvasWidthPx;
      canvas.height = GEO_MAP_LAYOUT.canvasHeightPx;
      const result = renderGeoMapToCanvas({
        project,
        canvas,
        width: GEO_MAP_LAYOUT.canvasWidthPx,
        height: GEO_MAP_LAYOUT.canvasHeightPx,
        chrome: true,
      });
      if (!result.ok) {
        throw new Error(
          result.errors.map((entry) => entry.message).join("；") ||
            "地图渲染未产出有效帧",
        );
      }
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = `${item.title || "geo-map"}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "地图导出失败",
      );
    } finally {
      exportBusyRef.current = false;
      setExporting(false);
    }
  }, [editor.project, item.title]);

  const exportJson = useCallback(() => {
    const project = editor.project;
    if (!project) return;
    setExportError("");
    try {
      downloadText(
        `${item.title || "geo-map"}.geo-map.json`,
        serializeGeoMapProject(project),
        "application/json;charset=utf-8",
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "地图 JSON 导出失败",
      );
    }
  }, [editor.project, item.title]);

  const statusLine = () => {
    if (exportError) return exportError;
    if (editor.error) return editor.error;
    if (editor.state === "degraded") {
      return `依赖缺失 ${editor.closure.missingDependencies.length} 件，已降级为只渲底图，本状态不可保存。`;
    }
    if (editor.state === "parsing") return "正在读取结构化地图源…";
    if (editor.state === "resolving") return "正在解析依赖闭包与图层引用…";
    return editor.notice;
  };

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: GEO_MAP_ADAPTER_ID,
        label: editorToolLabel({ type: "geo-map" }),
        toolbox: {
          label: "图层与依赖",
          icon: "layers",
          content: <GeoMapControls editor={editor} />,
        },
        contextToolbar: <GeoMapContextToolbar editor={editor} accent={accent} />,
        // EDITOR_ADAPTER_RUNTIME["geo-map"]: viewportOwnership "content" means
        // the editor owns the in-canvas viewport controls, while
        // toolbarOwnership "shared" leaves the chrome toolbar to the shell.
        nativeChrome: { viewport: true },
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        directDownload: {
          id: "geo-map-download-png",
          label: "直接下载 PNG",
          icon: "download",
          busy: exporting,
          busyLabel: "导出中…",
          disabled: exporting || exportUnavailable,
          onTrigger: exportPng,
        },
        actions: [
          {
            id: "geo-map-download-json",
            label: "导出结构化 JSON",
            group: "download",
            disabled: exporting || exportUnavailable,
            onTrigger: exportJson,
          },
        ],
        upload: {
          accept: ".json,.geojson,application/json,application/geo+json",
          onFiles: importLocalProject,
        },
        stage: <GeoMapStage editor={editor} />,
        status: statusLine(),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("geo-map-editor@1", item),
            ready: !editor.loading,
            capture: () =>
              editor.sourceReady && editor.project
                ? structuredClone(editor.project)
                : null,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}

export default GeoMapRoute;
