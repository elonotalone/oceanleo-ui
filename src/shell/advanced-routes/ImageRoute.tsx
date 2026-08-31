"use client";

import { useCallback, useMemo, useState } from "react";
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
import { FabricImageStage } from "../image-editor/FabricImageStage";
import { useFabricImageEditor } from "../image-editor/use-fabric-image-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function ImageRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useFabricImageEditor(item, siteId);
  const [importNotice, setImportNotice] = useState("");
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
    [editor.addImageFromUrl, editor.replaceSelectedImageFromUrl],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  usePluginCommandSurface(
    useMemo(
      () => createImageCommandSurface({ editor, deliver }),
      [deliver, editor],
    ),
  );
  const saveBeforeNewConversation = useCallback(async () => {
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
          ? advancedCommittedRevisionItem(item, saved.item, meta)
          : advancedSavedItem(item, {
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
  }, [editor.error, editor.save, item]);
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
        }),
        cache: "no-store",
        signal: input.signal,
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
    const source = advancedEditorSourceFor(item);
    // structured 的 url 是 fabric 工程 JSON，不能当图片喂给网关。
    if (source && !source.structured && source.url) return source.url;
    throw new ImageGatewayError(
      "image-source-unavailable",
      editor.error || "这张画布还没有 AI 取得到的地址；先保存一次，再用 AI 能力。",
    );
  }, [editor.dirty, editor.error, editor.save, editor.savedUrl, item]);

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
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "image",
        label: editorToolLabel({ type: "image" }),
        drawers: [
          // 明位（不 hiddenFromRail）：抠图/放大高清这些能力此前引擎和网关都通了，
          // 界面上一个入口都没有，等于没做。
          {
            id: "image-ai",
            label: "AI 能力",
            icon: "ai",
            content: <FabricImageAiPanel editor={editor} host={aiHost} />,
          },
          {
            id: "image-brush",
            label: "画笔",
            icon: "draw",
            hiddenFromRail: true,
            content: <FabricImageBrushPanel editor={editor} />,
          },
          {
            id: "image-shapes",
            label: "形状",
            icon: "shape",
            hiddenFromRail: true,
            content: <FabricImageShapePanel editor={editor} />,
          },
          {
            id: "image-lines",
            label: "线条",
            icon: "line",
            hiddenFromRail: true,
            content: <FabricImageLinePanel editor={editor} />,
          },
          {
            id: "image-notes",
            label: "便签",
            icon: "note",
            hiddenFromRail: true,
            content: <FabricImageNotePanel editor={editor} />,
          },
          {
            id: "image-text",
            label: "文字",
            icon: "text",
            hiddenFromRail: true,
            content: <FabricImageTextPanel editor={editor} />,
          },
          {
            id: "image-signature",
            label: "签名",
            icon: "signature",
            hiddenFromRail: true,
            content: <FabricImageSignaturePanel editor={editor} />,
          },
          {
            id: "image-tables",
            label: "表格",
            icon: "table",
            hiddenFromRail: true,
            content: <FabricImageTablePanel editor={editor} />,
          },
          {
            id: "image-layers",
            label: "图层",
            icon: "layers",
            content: (
              <FabricImageControls editor={editor} sections={["layers"]} />
            ),
          },
          {
            id: "image-canvas",
            label: "尺寸与背景",
            icon: "templates",
            content: (
              <FabricImageControls editor={editor} sections={["canvas"]} />
            ),
          },
          {
            id: "image-filters",
            label: "图片调整",
            icon: "filter",
            hiddenFromRail: true,
            content: <FabricImageFilterPanel editor={editor} />,
          },
          {
            id: "image-fonts",
            label: "字体",
            icon: "font",
            hiddenFromRail: true,
            content: <FabricImageFontPanel editor={editor} />,
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
          <FabricImageContextToolbar editor={editor} accent={accent} />
        ) : null,
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
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
          // P2：抠图是办公场景天天要用的那一条（证件照、产品图、PPT 配图），
          // 所以它在工作区行上有自己的位置，不埋进 AI 列表里。
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
          onFiles: addLocalImages,
        },
        stage: <FabricImageStage editor={editor} accent={accent} />,
        status:
          editor.error ||
          importNotice ||
          editor.notice ||
          (editor.loading ? "正在载入图片编辑器" : ""),
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
