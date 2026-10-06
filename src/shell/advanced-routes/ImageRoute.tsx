"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAdvancedSession } from "../advanced-session-context";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import {
  advancedCommittedRevisionItem,
  advancedSavedItem,
} from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedEditorSourceFor } from "../advanced-features";
import { usePluginCommandSurface } from "../plugin-command";
import { createImageCommandSurface } from "../image-editor/image-command-surface";
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
  FabricImageAiPanel,
  FabricImageBrushPanel,
  FabricImageExportPanel,
  FabricImageLinePanel,
  FabricImageNotePanel,
  FabricImageShapePanel,
  FabricImageSignaturePanel,
  FabricImageTablePanel,
  FabricImageTextPanel,
  type ImageAiPanelHost,
} from "../image-editor/FabricImageCreationPanels";
import {
  imageSourceFromBytes,
  type ImageDirectExecutor,
} from "../image-editor/image-capability-engine";
import {
  ImageGatewayError,
  createOceanLeoImageAiProvider,
} from "../../lib/image-ai-edit";
import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { payerRequestFields } from "../../lib/payer";
import { FabricImageStage } from "../image-editor/FabricImageStage";
import { useFabricImageEditor } from "../image-editor/use-fabric-image-editor";
import { IMAGE_COLLAB_ROOT, imageFromEntities, imageToEntities, type ImageSnapshot } from "../collab/adapters/image";
import { useEntityCollab } from "../collab/adapters/use-entity-collab";
import { useCollabSelections } from "../collab/adapters/visual-selection";
import {
  VIEW_ONLY_REFUSAL,
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
import { DESIGN_MODE_INITIAL_STATE } from "../image-editor/design-mode/design-mode-state";
import { applyCanvasViewClick } from "../image-editor/design-mode/canvas-view-switch";
import { ImageCanvasViewSwitch } from "../image-editor/ImageCanvasViewSwitch";
import { ImagePhotopeaHost } from "../image-editor/ImagePhotopeaHost";
import { clearLocalImageDraft } from "../image-editor/editor-persistence";
import {
  bindNormalFaceHandoff,
  bindProFaceHandoff,
  captureBeforeEnterPro,
  handoffItemKey,
  handoffRevisionOf,
  reportProSaved,
  useProSavedRevision,
} from "./editor-handoff";
import {
  toPhotopeaDocumentRef,
} from "./image-pro-handoff";
import { createPhotopeaSession } from "../image-editor/photopea-session";
import {
  IMAGE_DESIGN_MANIFEST_VERSION,
  imageDesignChipManifestEntries,
} from "../image-editor/design-mode/l4-chips";
import type { AiCommandRunner } from "../image-editor/design-mode/image-ai-commands";
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
  const proSaved = useProSavedRevision(handoffItemKey(item));
  useEffect(() => {
    setActiveItem(item);
  }, [item.id, item.key]);
  useEffect(() => {
    if (proSaved) setActiveItem(proSaved);
  }, [proSaved]);
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
  const [documentDataUrl, setDocumentDataUrl] = useState<string | undefined>();
  const advancedSession = useAdvancedSession();
  const makePhotopeaSession = useCallback((opened = activeItem) => createPhotopeaSession({
    item: opened,
    siteId,
    recordSavedItem: advancedSession ? (saved) => advancedSession.recordSavedItem(saved) : undefined,
    onSaved: (saved) => {
      clearLocalImageDraft(opened);
      reportProSaved(handoffItemKey(opened), saved);
    },
  }), [activeItem, siteId, advancedSession]);
  const [photopeaSession, setPhotopeaSession] = useState(() => makePhotopeaSession(item));
  const photopeaStatus = useSyncExternalStore(photopeaSession.subscribe, photopeaSession.snapshot, photopeaSession.snapshot);
  const photopeaItemKey = useRef(handoffItemKey(item));
  /**
   * L0 专业模式（W01：`normal | pro`）。第二行「专业编辑」页切到这里；
   * 打开时用 `currentPluginMode("image")` 记住的档位，之后只走 `setEditorMode`。
   * photo / design 是另一条轴，不占这个槽（`switchEditorMode`）。
   */
  const [pluginMode, setPluginModeState] = useState<EditorMode>(
    () => rememberedImagePluginMode(),
  );
  const { showPhotopea } = applyImageL0Mode(pluginMode);
  useEffect(() => {
    const nextKey = handoffItemKey(item);
    if (photopeaItemKey.current === nextKey) return;
    photopeaItemKey.current = nextKey;
    setDocumentDataUrl(undefined);
    setPluginModeState("normal");
    setPhotopeaSession(makePhotopeaSession(item));
  }, [item, makePhotopeaSession]);
  /**
   * 画布内结构 / 皮肤（photo | design）。不占 L0 槽。
   * 点开关走 `applyCanvasViewClick` → `switchEditorMode` → `planEditorModeSwitch`。
   */
  const [designMode, setDesignMode] = useState(DESIGN_MODE_INITIAL_STATE);
  const canvasDocument = useMemo(
    () =>
      Object.freeze({
        revision: editor.editRevision,
        width: editor.doc.width,
        height: editor.doc.height,
      }),
    [editor.doc.height, editor.doc.width, editor.editRevision],
  );
  /**
   * A request that passed the command surface's checks and is waiting for the
   * user to confirm it in the AI panel, where progress and cost are visible.
   */
  const [pendingAiRequest, setPendingAiRequest] = useState<
    Parameters<AiCommandRunner>[0] | null
  >(null);
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
  const photopeaCloud =
    showPhotopea ||
    photopeaStatus.phase === "saving" ||
    photopeaStatus.phase === "error";
  const saveBeforeNewConversation = useCallback(async () => {
    if (showPhotopea || photopeaSession.active()) {
      try {
        const next = await photopeaSession.save();
        return { ok: true as const, item: next };
      } catch (caught) {
        return {
          ok: false as const,
          error: caught instanceof Error ? caught.message : undefined,
        };
      }
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
          ? advancedCommittedRevisionItem(activeItem, saved.item, meta)
          : advancedSavedItem(activeItem, {
              url: saved.url,
              versionId: saved.versionId,
              meta,
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
  }, [activeItem, editor.error, editor.save, photopeaSession, showPhotopea]);
  useEffect(() => {
    return bindProFaceHandoff(handoffItemKey(activeItem), {
      hasUnsavedChanges: () => photopeaCloud || editor.dirty,
      flush: async () => (await saveBeforeNewConversation()).ok,
    });
  }, [activeItem, editor.dirty, photopeaCloud, saveBeforeNewConversation]);
  const addLocalImages = useCallback(
    async (files: File[]) => {
      setImportNotice("");
      // heic / bmp / tiff / raw 先转成画布吃得下的格式；转不了的说清为什么，
      // 不像以前那样按 MIME 一言不发地丢掉。
      const batch = await normalizeVisualUploads(files, "image");
      for (const file of batch.files) {
        await editor.addImageFromFile(file);
      }
      setImportNotice(batch.notes.join(" "));
    },
    [editor.addImageFromFile],
  );

  // ---- AI 能力接线 ----------------------------------------------------------
  // 抠图直连 `/v1/images/remove-bg`：这一条没有参数、只出一张图、不进 recipe
  // 血缘，走不了语义命令那套 provider（理由记在
  // `image-capability-engine.ts` 的「直连网关的图片操作」一节）。
  const removeBgExecutor = useMemo<ImageDirectExecutor>(
    () => async (_commandId, input) => {
      const token = await accessToken();
      if (!token) {
        throw new ImageGatewayError(
          "image-provider-auth",
          "登录状态已过期，重新登录后再试。",
          { status: 401 },
        );
      }
      const response = await fetch(`${GATEWAY_BASE}/v1/images/remove-bg`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          site_id: siteId || "image",
          image_url: input.sourceUrl,
          key_mode: "platform",
          ...payerRequestFields(),
        }),
        cache: "no-store",
        signal: input.signal,
        credentials: "include",
      });
      let data: { image?: string; detail?: string } | null = null;
      try {
        data = (await response.json()) as { image?: string; detail?: string };
      } catch {
        /* 非 JSON 响应，按 HTTP 状态定性 */
      }
      if (!response.ok) {
        const transient =
          response.status >= 500 ||
          response.status === 429 ||
          response.status === 408;
        throw new ImageGatewayError(
          transient ? "image-provider-unavailable" : "image-provider-job-failed",
          data?.detail || `抠图失败 HTTP ${response.status}`,
          { status: response.status, retryable: transient },
        );
      }
      // 这一条返回的是 `image` 单数，不是其余几条的 `images` 数组。
      const url = data?.image || "";
      if (!url) {
        throw new ImageGatewayError(
          "image-provider-empty-output",
          "抠图没有返回结果图。",
        );
      }
      return url;
    },
    [siteId],
  );

  // 网关只吃 URL 不吃字节，而 `FabricImageEditorState` 没有导出画布字节的方法
  // （能导出的都在 `use-fabric-image-editor.ts` 内部，本波不改那个文件）。
  // 所以「冻结画布」用状态面上已有的 durable 地址：脏了先存一次，干净就用上次那张。
  const frozenCanvasUrl = useCallback(async () => {
    if (editor.dirty) {
      const saved = await editor.save();
      if (saved?.url) return saved.url;
    }
    if (editor.savedUrl) return editor.savedUrl;
    const source = advancedEditorSourceFor(activeItem);
    // structured 的 url 是 fabric 工程 JSON，不能当图片喂给网关。
    if (source && !source.structured && source.url) return source.url;
    throw new ImageGatewayError(
      "image-source-unavailable",
      editor.error || "这张画布还没有 AI 取得到的地址；先保存一次，再用 AI 能力。",
    );
  }, [activeItem, editor.dirty, editor.error, editor.save, editor.savedUrl]);

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
        if (editor.dirty && collab.saveGate) void editor.save();
      },
    });
  }, [activeItem, collab.saveGate, editor.dirty, editor.save, editor.savedUrl]);

  const setEditorMode = useCallback((mode: EditorMode) => {
    const next = applyImageL0Mode(mode).mode;
    if (next === "pro" && pluginMode !== "pro") {
      void (async () => {
        try {
          let url = "";
          const captured = await captureBeforeEnterPro(activeItem);
          if (captured.ok && captured.handoff.kind === "url") {
            url = captured.handoff.url;
          }
          try {
            url = await frozenCanvasUrl();
          } catch {
            url =
              url ||
              activeItem.previewUrl ||
              activeItem.url ||
              "";
          }
          const ref = await toPhotopeaDocumentRef(url);
          if (!ref.ok) {
            setImportNotice(ref.error);
            return;
          }
          setImportNotice("");
          setDocumentDataUrl(ref.documentDataUrl);
          setPhotopeaSession(makePhotopeaSession());
          setPluginModeState("pro");
        } catch (caught) {
          setImportNotice(
            caught instanceof Error
              ? caught.message
              : "还没准备好打开专业编辑，稍后再试。",
          );
        }
      })();
      return;
    }
    if (next === "normal" && pluginMode === "pro") {
      setPluginModeState("normal");
      void Promise.resolve(saveBeforeNewConversation()).catch(() => {});
      return;
    }
    setPluginModeState(next);
  }, [
    activeItem,
    frozenCanvasUrl,
    makePhotopeaSession,
    pluginMode,
    saveBeforeNewConversation,
  ]);


  /**
   * Lets the edit bar and the agent reach the same AI capabilities the panel
   * has: the command surface owns parameter checking and refusals, and this
   * runner is the one place that actually spends a provider call.
   */
  const runAi = useMemo<AiCommandRunner>(
    () => async (request) => {
      // 只能查看：不抠图、不排 AI 任务（面板与指令面也各挡一次，这里是最后一道）
      if (viewOnly) return { ok: false, message: VIEW_ONLY_REFUSAL };
      if (request.id === "remove-bg") {
        // Cut-out is the one capability that goes straight to the gateway: no
        // parameters, one image out, no recipe lineage. Everything else needs
        // the panel's provider session.
        const controller = new AbortController();
        try {
          const sourceUrl = await frozenCanvasUrl();
          const resultUrl = await removeBgExecutor("remove-bg", {
            sourceUrl,
            signal: controller.signal,
          });
          await editor.addImageFromUrl(resultUrl);
          return { ok: true, message: "已抠图，结果作为新图层放上来了。" };
        } catch (caught) {
          return {
            ok: false,
            message:
              caught instanceof Error && caught.message.trim()
                ? caught.message.trim()
                : "抠图失败。",
          };
        }
      }
      // The other three run as tracked provider jobs: the panel owns the
      // progress, the receipt and the billing lineage. The command's job is to
      // be the entry point and to have already checked the parameters, so it
      // hands a prefilled request over rather than opening a second, untracked
      // execution path that would bill the user twice for one action.
      setPendingAiRequest(request);
      return {
        ok: true,
        message: "参数没问题，已在左侧「AI 能力」面板里排上，进度与用量都在那里。",
      };
    },
    [editor.addImageFromUrl, frozenCanvasUrl, removeBgExecutor, viewOnly],
  );
  usePluginCommandSurface(
    useMemo(
      () => createImageCommandSurface({ editor, deliver, runAi, readOnly: viewOnly }),
      [deliver, editor, runAi, viewOnly],
    ),
  );

  const aiHost = useMemo<ImageAiPanelHost>(
    () => ({
      provider: createOceanLeoImageAiProvider({ siteId: siteId || "image" }),
      directExecutor: removeBgExecutor,
      freezeCanvas: async () => {
        const url = await frozenCanvasUrl();
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new ImageGatewayError(
            "image-source-unavailable",
            `底图取不回来（HTTP ${response.status}），这次没有开始处理。`,
            { status: response.status, retryable: true },
          );
        }
        const declared = (response.headers.get("content-type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        return {
          url,
          source: await imageSourceFromBytes(await response.arrayBuffer(), {
            mimeType: /^image\/[a-z0-9.+-]+$/.test(declared)
              ? declared
              : "image/png",
            url,
          }),
        };
      },
    }),
    [frozenCanvasUrl, removeBgExecutor, siteId],
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
         * Photopea 只在返回 `pro` 之后才挂。
         */
        mode: bindImageModeAdapter(pluginMode, setEditorMode),
        pages: { proLabel: "Photopea" },
        drawers: [
          // 明位（不 hiddenFromRail）：抠图/放大高清这些能力此前引擎和网关都通了，
          // 界面上一个入口都没有，等于没做。
          {
            id: "image-ai",
            label: "AI 能力",
            icon: "ai",
            content: <VisualViewOnlyPanel readOnly={viewOnly}><FabricImageAiPanel editor={editor} host={aiHost} /></VisualViewOnlyPanel>,
          },
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
          // 抠图是办公天天要用的那一条，放在编辑栏文档段，不进第一行。
          {
            id: "image-cutout",
            label: "抠图（背景变透明）",
            icon: "ai",
            variant: "primary",
            panelId: "image-ai",
            disabled: editor.loading,
          },
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
          accept: visualUploadAccept("image"),
          multiple: true,
          onFiles: viewOnlyUploadHandler(viewOnly, addLocalImages),
        },
        stage: (
          <div
            className="relative flex h-full min-h-0 flex-col"
            data-editor-mode={pluginMode}
            data-image-show-photopea={showPhotopea ? "true" : "false"}
            data-canvas-view={designMode.mode}
          >
            <div className="relative min-h-0 flex-1">
              <FabricImageStage editor={editor} accent={accent} peers={peerSelections} />
              <ImagePhotopeaHost showPhotopea={showPhotopea}
                documentDataUrl={documentDataUrl || activeItem.previewUrl || activeItem.url}
                session={photopeaSession}
              />
            </div>
            {/* 结构 / 皮肤：画布右下角、与宿主缩放控件同组（规范 v2 §1），
                顶部不再画通栏。 */}
            <ImageCanvasViewSwitch
              state={designMode}
              document={canvasDocument}
              onRoute={(route) => {
                const applied = applyCanvasViewClick(
                  designMode,
                  route.state.mode,
                  canvasDocument,
                );
                setDesignMode(applied.state);
              }}
            />
          </div>
        ),
        status:
          editor.error ||
          importNotice ||
          editor.notice ||
          (editor.loading ? "正在载入图片编辑器" : ""),
        collab: collab.collab,
        persistence: {
          // Photopea has no mutation feed. Unconfirmed stays on the cloud.
          // After leaving pro, keep the cloud on this flush until export settles.
          autoSave: !photopeaCloud,
          confirmation: photopeaCloud
            ? { state: photopeaStatus.phase, message: photopeaStatus.message }
            : undefined,
          dirty: photopeaCloud || (editor.dirty && collab.saveGate),
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
        },
      }}
      onClose={onClose}
    />
  );
}
