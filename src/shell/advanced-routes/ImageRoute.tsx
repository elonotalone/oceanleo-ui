"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { imageSaveReceiptItem } from "../image-editor/image-save-receipt";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedEditorSourceFor } from "../advanced-features";
import { usePluginCommandSurface } from "../plugin-command";
import { createImageCommandSurface } from "../image-editor/image-command-surface";
import { isPsdSource } from "../image-editor/psd-composite";
import { normalizeVisualUploads } from "../media-editors/visual-import-normalize";
import {
  DEFAULT_LOSSY_QUALITY,
  imageCanvasFormat,
  visualDownloadFormats,
  visualUploadAccept,
} from "../media-editors/visual-formats";
import type { ExportFormat } from "../image-editor/types";
import { FabricImageContextToolbar } from "../image-editor/FabricImageContextToolbar";
import {
  FabricImageControls,
  FabricImageFilterPanel,
  FabricImageFontPanel,
} from "../image-editor/FabricImageControls";
import {
  FabricImageBrushPanel,
  FabricImageExportPanel,
  FabricImageLinePanel,
  FabricImageNotePanel,
  FabricImageShapePanel,
  FabricImageSignaturePanel,
  FabricImageTablePanel,
  FabricImageTextPanel,
} from "../image-editor/FabricImageCreationPanels";
import { FabricImageStage } from "../image-editor/FabricImageStage";
import { useFabricImageEditor } from "../image-editor/use-fabric-image-editor";
import { IMAGE_COLLAB_ROOT, imageFromEntities, imageToEntities, type ImageSnapshot } from "../collab/adapters/image";
import { useEntityCollab } from "../collab/adapters/use-entity-collab";
import { useCollabSelections } from "../collab/adapters/visual-selection";
import {
  VIEW_ONLY_REFUSAL,
  guardPluginSurface,
  viewOnlyUploadHandler,
} from "../collab/adapters/visual-readonly";
import { VisualViewOnlyPanel } from "../collab/adapters/VisualViewOnlyPanel";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import {
  applyImageL0Mode,
  bindImageModeAdapter,
  rememberedImagePluginMode,
} from "../image-editor/design-mode/image-plugin-mode";
import {
  bindNormalFaceHandoff,
  bindProFaceHandoff,
  handoffItemKey,
  handoffRevisionOf,
} from "./editor-handoff";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { imageSourcePersistenceAdmitted } from "./non-richdoc-source-gate";
import {
  imageStageShowsSourceLoadOverlay,
} from "../image-editor/image-source-ready";
import { imageRouteChrome } from "../image-editor/image-editor-ui-offerings";
import type { EditorMode } from "../editor-protocol-types";

export function ImageRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const [activeItem, setActiveItem] = useState(item);
  useEffect(() => {
    // Same picture, new revision / preview URL: adopt the receipt in place.
    // A different picture still replaces the open.
    setActiveItem(item);
  }, [item.id, item.key, item.revisionId]);
  // 多人同改：画布编辑器先创建（房间要读画布），所以「只读」「存成功」「本地多了一步」走 state / ref 回填。
  const [collabReadOnly, setCollabReadOnly] = useState<boolean>(false);
  const [localSnapshot, setLocalSnapshot] = useState<ImageSnapshot | null>(null);
  const collabSavedRef = useRef<(revisionId: string) => void>(() => undefined);
  const editorCollabRef = useRef<ReturnType<typeof useFabricImageEditor>["collab"] | null>(null);
  const collabOptions = useMemo(
    () => ({
      readOnly: collabReadOnly,
      onLocalChange: () => {
        const handle = editorCollabRef.current;
        if (!handle) return;
        handle.ensureIds();
        setLocalSnapshot(handle.snapshot());
      },
      onSavedRevision: (revisionId: string) => collabSavedRef.current(revisionId),
    }),
    [collabReadOnly],
  );
  const editor = useFabricImageEditor(activeItem, siteId, { collab: collabOptions });
  editorCollabRef.current = editor.collab;
  // 载入完成：补齐旧稿对象的 id，把画布现状交给协同层（它据此种子或对齐）
  useEffect(() => {
    if (editor.loading) {
      setLocalSnapshot(null);
      return;
    }
    editor.collab.ensureIds();
    setLocalSnapshot(editor.collab.snapshot());
  }, [editor.loading]);
  const adoptingRevisionRef = useRef(false);
  const collab = useEntityCollab<ImageSnapshot>({
    item: { artifactId: activeItem.artifactId, title: activeItem.title },
    editorKind: "image",
    rootName: IMAGE_COLLAB_ROOT,
    toEntities: imageToEntities,
    fromEntities: imageFromEntities,
    local: editor.loading ? null : localSnapshot,
    applyRemote: (state) => {
      editor.collab.applyRemote(state);
      if (adoptingRevisionRef.current) {
        adoptingRevisionRef.current = false;
        editor.collab.markClean();
      }
    },
    loadRevision: async (revisionId) => {
      const snapshot = await editor.collab.adoptRevision(String(activeItem.artifactId || ""), revisionId);
      adoptingRevisionRef.current = Boolean(snapshot);
      return snapshot;
    },
  });
  collabSavedRef.current = collab.markSaved;
  useEffect(() => {
    setCollabReadOnly(collab.readOnly);
  }, [collab.readOnly]);
  // 工具条、侧边面板、素材入口、AI 入口、上传都按这一个值灰掉（画布控制器与指令面另有同一条拒绝）
  const viewOnly = collab.readOnly || editor.collab.readOnly;
  const selectedLayerIds = useMemo(
    () => editor.layers.filter((layer) => layer.selected).map((layer) => layer.id),
    [editor.layers],
  );
  const peerSelections = useCollabSelections(collab.room, selectedLayerIds);
  const [importNotice, setImportNotice] = useState("");
  /**
   * L0 专业模式（W01：`normal | pro`）。第二行「专业编辑」页切到这里；
   * 打开时用 `currentPluginMode("image")` 记住的档位，之后只走 `setEditorMode`。
   * 两页共用同一份 Fabric 稿，切页不卸载画布。
   * photo / design 是另一条轴，不占这个槽（`switchEditorMode`）。
   */
  const [pluginMode, setPluginModeState] = useState<EditorMode>(
    () => rememberedImagePluginMode(),
  );
  const openedItemKey = useRef(editor.openIdentity);
  useEffect(() => {
    const nextKey = editor.openIdentity;
    if (openedItemKey.current === nextKey) return;
    openedItemKey.current = nextKey;
    setPluginModeState("normal");
  }, [editor.openIdentity]);
  const sourceLoadOverlay = imageStageShowsSourceLoadOverlay({
    loading: editor.loading,
    sourceReady: editor.sourceReady,
  });
  // 菜单里的 jpg 与画布导出器的 "jpeg" 是同一件事；对用户只说 JPG。
  const deliver = useCallback(
    async (format: string, quality: number = editor.exportQuality) => {
      const canvasFormat: ExportFormat = imageCanvasFormat(format);
      await editor.downloadAs(
        canvasFormat,
        canvasFormat === "png" ? 100 : quality,
      );
    },
    [editor.downloadAs, editor.exportQuality],
  );
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "fabric-image-materials@3",
      actions: ["insert", "replace"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        const mime = String(material.meta.mime || "").toLowerCase();
        return (
          Boolean(material.previewUrl || material.thumbUrl) ||
          material.kind === "image" ||
          mime.startsWith("image/") ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
          )
        );
      },
      mutate: async (action, material, placement) => {
        if (viewOnly) throw new Error(VIEW_ONLY_REFUSAL);
        const candidates = [
          material.previewUrl,
          material.thumbUrl,
          material.url,
        ].filter(Boolean) as string[];
        const url =
          candidates.find((candidate) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(candidate),
          ) || candidates[0] || "";
        if (!url) throw new Error("这个图片素材没有可用地址。");
        if (action === "replace") {
          await editor.replaceSelectedImageFromUrl(url);
        } else {
          await editor.addImageFromUrl(
            url,
            placement?.source === "drop" &&
              Number.isFinite(placement.clientX) &&
              Number.isFinite(placement.clientY)
              ? {
                  clientX: placement.clientX as number,
                  clientY: placement.clientY as number,
                }
              : undefined,
          );
        }
      },
    }),
    [editor.addImageFromUrl, editor.replaceSelectedImageFromUrl, viewOnly],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const imageAdmitted = imageSourcePersistenceAdmitted({
    loading: editor.loading,
    sceneDiagnostic: editor.sceneDiagnostic,
    sourceReady: editor.sourceReady,
  });
  const saveBeforeNewConversation = useCallback(async () => {
    const admitted = imageSourcePersistenceAdmitted({
      loading: editor.loading,
      sceneDiagnostic: editor.sceneDiagnostic,
      sourceReady: editor.sourceReady,
    });
    if (!admitted.ok) {
      return { ok: false as const, error: admitted.error };
    }
    const saved = await editor.save();
    if (!saved) {
      return {
        ok: false as const,
        error:
          editor.error ||
          "图片没有产生新的 durable revision；画布仍保持未保存状态。",
      };
    }
    const meta = {
      editor: "fabric-v3",
      fabric_document_url: saved.projectUrl,
      fabric_preview_url: saved.url,
      fabric_saved_at: saved.savedAt,
      editor_project_url: saved.projectUrl,
      editor_project_schema: "oceanleo.fabric-image.v1",
      editor_saved_at: saved.savedAt,
    };
    try {
      return {
        ok: true as const,
        item: saved.item
          ? imageSaveReceiptItem(saved.baseItem || activeItem, saved.item, meta, {
              url: saved.url,
              versionId: saved.versionId,
            })
          : imageSaveReceiptItem(saved.baseItem || activeItem, undefined, meta, {
              url: saved.url,
              versionId: saved.versionId,
            }),
      };
    } catch (caught) {
      return {
        ok: false as const,
        error:
          caught instanceof Error
            ? caught.message
            : "图片 revision 回执无法固定到当前 artifact head。",
      };
    }
  }, [
    activeItem,
    editor.error,
    editor.loading,
    editor.save,
    editor.sceneDiagnostic,
    editor.sourceReady,
  ]);
  useEffect(() => {
    return bindProFaceHandoff(handoffItemKey(activeItem), {
      hasUnsavedChanges: () => editor.dirty && imageAdmitted.ok,
      flush: async () => (await saveBeforeNewConversation()).ok,
    });
  }, [
    activeItem,
    editor.dirty,
    imageAdmitted.ok,
    saveBeforeNewConversation,
  ]);
  const addLocalImages = useCallback(
    async (files: File[]) => {
      setImportNotice("");
      // heic / bmp / tiff / raw 先转成画布吃得下的格式；转不了的说清为什么，
      // 不像以前那样按 MIME 一言不发地丢掉。
      const psdFiles: File[] = [];
      const otherFiles: File[] = [];
      for (const file of files) {
        if (isPsdSource({ name: file.name, mime: file.type })) {
          psdFiles.push(file);
        } else {
          otherFiles.push(file);
        }
      }
      const batch = await normalizeVisualUploads(otherFiles, "image");
      for (const file of [...psdFiles, ...batch.files]) {
        await editor.addImageFromFile(file);
      }
      setImportNotice(batch.notes.join(" "));
    },
    [editor.addImageFromFile],
  );

  useEffect(() => {
    return bindNormalFaceHandoff(handoffItemKey(activeItem), {
      getHandoff: () => {
        const url =
          editor.savedUrl ||
          (!advancedEditorSourceFor(activeItem)?.structured
            ? advancedEditorSourceFor(activeItem)?.url
            : "") ||
          activeItem.previewUrl ||
          activeItem.url ||
          "";
        if (!url) return { kind: "empty" };
        return {
          kind: "url",
          url,
          format: "png",
          revision: handoffRevisionOf(activeItem),
        };
      },
      persistInBackground: () => {
        if (
          !imageSourcePersistenceAdmitted({
            loading: editor.loading,
            sceneDiagnostic: editor.sceneDiagnostic,
            sourceReady: editor.sourceReady,
          }).ok
        ) {
          return;
        }
        if (editor.dirty && collab.saveGate) void editor.save();
      },
    });
  }, [
    activeItem,
    collab.saveGate,
    editor.dirty,
    editor.loading,
    editor.save,
    editor.savedUrl,
    editor.sceneDiagnostic,
    editor.sourceReady,
  ]);

  const setEditorMode = useCallback((mode: EditorMode) => {
    setPluginModeState(applyImageL0Mode(mode).mode);
  }, []);


  usePluginCommandSurface(
    useMemo(
      () =>
        guardPluginSurface(
          createImageCommandSurface({ editor, deliver }),
          viewOnly,
        ),
      [deliver, editor, viewOnly],
    ),
  );

  return (
    <AdvancedWorkbenchShell
      item={activeItem}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "image",
        label: editorToolLabel({ type: "image" }),
        /**
         * L0 专业模式。第二行「专业编辑」页调用 `setEditorMode`；
         * 两页共用同一份 Fabric 稿，切页不卸载画布。
         */
        mode: bindImageModeAdapter(pluginMode, setEditorMode),
        drawers: [
          {
            id: "image-brush",
            label: "画笔",
            icon: "draw",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageBrushPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-shapes",
            label: "形状",
            icon: "shape",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageShapePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-lines",
            label: "线条",
            icon: "line",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageLinePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-notes",
            label: "便签",
            icon: "note",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageNotePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-text",
            label: "文字",
            icon: "text",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageTextPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-signature",
            label: "签名",
            icon: "signature",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageSignaturePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-tables",
            label: "表格",
            icon: "table",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageTablePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-layers",
            label: "图层",
            icon: "layers",
            content: (
              <VisualViewOnlyPanel readOnly={viewOnly}>
                <FabricImageControls editor={editor} sections={["layers"]} />
              </VisualViewOnlyPanel>
            ),
          },
          {
            id: "image-canvas",
            label: "尺寸与背景",
            icon: "templates",
            content: (
              <VisualViewOnlyPanel readOnly={viewOnly}>
                <FabricImageControls editor={editor} sections={["canvas"]} />
              </VisualViewOnlyPanel>
            ),
          },
          {
            id: "image-filters",
            label: "图片调整",
            icon: "filter",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageFilterPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-fonts",
            label: "字体",
            icon: "font",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageFontPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "image-export",
            label: "导出图片",
            icon: "download",
            hiddenFromRail: true,
            content: <FabricImageExportPanel editor={editor} />,
          },
        ],
        contextToolbar: editor.selected ? (
          <FabricImageContextToolbar editor={editor} accent={accent} readOnly={viewOnly} />
        ) : null,
        history: {
          canUndo: editor.canUndo && !viewOnly,
          canRedo: editor.canRedo && !viewOnly,
          undo: editor.undo,
          redo: editor.redo,
        },
        viewport: {
          value: Math.round(editor.zoom * 100),
          min: 10,
          max: 400,
          step: 1,
          setValue: (value) => editor.setZoom(value / 100),
          fit: editor.zoomFit,
        },
        directDownload: {
          id: "image-download-png",
          label: visualDownloadFormats("image")[0].label,
          icon: "download",
          disabled: editor.loading,
          onTrigger: editor.downloadDefaultPng,
        },
        actions: [
          ...visualDownloadFormats("image")
            .slice(1)
            .map((entry) => ({
              id: entry.id,
              label: entry.label,
              icon: "download" as const,
              group: "download" as const,
              disabled: editor.loading,
              onTrigger: () =>
                deliver(
                  entry.format,
                  entry.lossy ? editor.exportQuality : DEFAULT_LOSSY_QUALITY,
                ),
            })),
          {
            id: "image-export",
            label: "更多导出设置（画质、倍数）",
            icon: "download",
            group: "download",
            panelId: "image-export",
            disabled: editor.loading,
          },
        ],
        upload: {
          accept: `${visualUploadAccept("image")},.psd,image/vnd.adobe.photoshop`,
          multiple: true,
          onFiles: viewOnlyUploadHandler(viewOnly, addLocalImages),
        },
        stage: (
          <div
            className="relative flex h-full min-h-0 flex-col"
            data-editor-mode={pluginMode}
            data-canvas-view-switch={imageRouteChrome.canvasViewSwitch ? "on" : "off"}
            data-image-ai-drawer={imageRouteChrome.aiDrawer ? "on" : "off"}
            data-image-cutout-action={imageRouteChrome.cutoutAction ? "on" : "off"}
          >
            <div className="relative min-h-0 flex-1">
              {!editor.loading && !editor.sourceReady ? (
                <EditorSourceFailurePanel
                  message={
                    imageAdmitted.ok
                      ? editor.error || "图片源未成功载入，未改用空白画布覆盖原件。"
                      : imageAdmitted.error
                  }
                  onReload={editor.reload}
                  variant="surface"
                />
              ) : (
                <FabricImageStage editor={editor} accent={accent} peers={peerSelections} />
              )}
            </div>
          </div>
        ),
        status:
          editor.error ||
          importNotice ||
          editor.notice ||
          (sourceLoadOverlay ? "正在载入图片编辑器" : ""),
        collab: collab.collab,
        persistence: {
          autoSave: true,
          userEditKey: editor.openIdentity,
          dirty: editor.dirty && collab.saveGate && imageAdmitted.ok,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
        },
      }}
      onClose={onClose}
    />
  );
}
