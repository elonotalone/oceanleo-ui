/**
 * 图片编辑器的指令面（合同 §3.1，editorId 与编辑栏适配器 id 逐字相同：`image`）。
 *
 * 左栏的 agent 靠这里对画布动手：裁剪、缩放、旋转、加一行字、换底色、导出某格式。
 * 会改文档的一律 `mutates: true`——执行前的用户确认在 agent 侧（W4）做，这里不弹框。
 *
 * Remaining optional AI commands (inpaint / rewrite-text) live in
 * `design-mode/image-ai-commands.ts` and register only when `runAi` is passed.
 * Retired 2026-10-21 surfaces (抠图 / 放大高清 / 扩图 / 打光 / 人像 / 全景)
 * are not on this surface.
 */

import type { PluginCommandSurfaceInput } from "../plugin-command/types";
import type { LibraryItem } from "../library-data";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import {
  createVisualCommandSurface,
  fail,
  ok,
  type VisualCommandDefinition,
} from "../media-editors/visual-command-kit";
import {
  DEFAULT_LOSSY_QUALITY,
  MAX_LOSSY_QUALITY,
  MIN_LOSSY_QUALITY,
  visualDownloadFormats,
} from "../media-editors/visual-formats";
import type { CropRatio, FabricImageEditorState, TextPreset } from "./types";
import { guardVisualCommands } from "../collab/adapters/visual-readonly";
import {
  imageAiCommandDefinitions,
  type AiCommandRunner,
} from "./design-mode/image-ai-commands";

const EDITOR_ID = "image";

const RATIO_VALUES: readonly { value: CropRatio; label: string }[] = [
  { value: "1:1", label: "正方形 1:1" },
  { value: "4:3", label: "横版 4:3" },
  { value: "16:9", label: "宽屏 16:9" },
  { value: "9:16", label: "竖屏 9:16" },
];

const TEXT_PRESETS: readonly { value: TextPreset; label: string }[] = [
  { value: "heading", label: "大标题" },
  { value: "subheading", label: "小标题" },
  { value: "body", label: "正文" },
];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface ImageCommandDeps {
  /** `collab.readOnly` 为真（浏览者，或别人正占着编辑）时，会改画布的指令一律拒绝。 */
  editor: FabricImageEditorState & { collab?: { readOnly: boolean } };
  /** 由路由提供：按格式与质量把当前画布交到用户手上。 */
  deliver: (format: string, quality: number) => Promise<void>;
  item?: LibraryItem;
  /** Candidate public, credential-free source renditions, in preferred order. */
  visionSourceUrls?: readonly unknown[];
  /**
   * Optional remaining AI runner (inpaint / rewrite-text).
   * Omit it to register no AI commands.
   */
  runAi?: AiCommandRunner;
}

/** Pick a fetchable source for the backend vision tool without exposing URL credentials. */
export function usableImageVisionSource(candidates: readonly unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    try {
      const parsed = new URL(candidate.trim());
      const host = parsed.hostname.toLowerCase();
      if (
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash &&
        host !== "localhost" &&
        !host.endsWith(".localhost") &&
        !host.endsWith(".local") &&
        !host.endsWith(".internal") &&
        !/^\d+(?:\.\d+){3}$/.test(host) &&
        !host.includes(":")
      ) return parsed.toString();
    } catch {
      // Relative/private source paths are not fetchable by the server vision tool.
    }
  }
  return "";
}

export function imageCommandDefinitions(
  deps: ImageCommandDeps,
): VisualCommandDefinition[] {
  const { editor } = deps;
  if (editor.loading || editor.sourceReady === false) return [];
  const revision = () => editor.editRevision;
  const definitions: VisualCommandDefinition[] = [];

  if (!editor.cropping) {
    definitions.push({
      spec: {
        id: "image.crop-to-ratio",
        label: "裁剪到指定比例",
        summary: "按选定比例居中裁掉画布多余的部分。",
        mutates: true,
        params: [
          {
            key: "ratio",
            label: "画面比例",
            type: "enum",
            required: true,
            enumValues: RATIO_VALUES,
          },
        ],
      },
      run: async (params) => {
        editor.startCrop();
        editor.setCropRatio(params.ratio as CropRatio);
        await editor.confirmCrop();
        if (editor.error) return fail(editor.error);
        return ok(`已裁剪到 ${String(params.ratio)}。`, revision());
      },
    });
  }

  definitions.push({
    spec: {
      id: "image.resize-canvas",
      label: "改画布尺寸",
      summary: "把画布改成指定的像素宽高，画面内容保持原位。",
      mutates: true,
      params: [
        {
          key: "width",
          label: "宽度（像素）",
          type: "number",
          required: true,
          hint: "1 到 8000 之间的整数",
        },
        {
          key: "height",
          label: "高度（像素）",
          type: "number",
          required: true,
          hint: "1 到 8000 之间的整数",
        },
      ],
    },
    bounds: {
      width: { min: 1, max: 8000, integer: true },
      height: { min: 1, max: 8000, integer: true },
    },
    run: (params) => {
      editor.resizeDoc(Number(params.width), Number(params.height));
      return ok(
        `画布已改成 ${Number(params.width)}×${Number(params.height)} 像素。`,
        revision(),
      );
    },
  });

  definitions.push({
    spec: {
      id: "image.rotate",
      label: "旋转",
      summary: "把选中的对象转 90 度；没有选中对象时转的是底图。",
      mutates: true,
      params: [
        {
          key: "direction",
          label: "方向",
          type: "enum",
          required: true,
          enumValues: [
            { value: "right", label: "顺时针 90°" },
            { value: "left", label: "逆时针 90°" },
            { value: "half", label: "转 180°" },
          ],
        },
      ],
    },
    run: (params) => {
      const direction = String(params.direction);
      if (direction === "half") {
        editor.rotateTarget(90);
        editor.rotateTarget(90);
        return ok("已转 180°。", revision());
      }
      editor.rotateTarget(direction === "left" ? -90 : 90);
      return ok(
        direction === "left" ? "已逆时针转 90°。" : "已顺时针转 90°。",
        revision(),
      );
    },
  });

  definitions.push({
    spec: {
      id: "image.add-text",
      label: "加一行字",
      summary: "在画布中间放一段文字，之后可以直接拖动和改样式。",
      mutates: true,
      params: [
        {
          key: "text",
          label: "文字内容",
          type: "string",
          required: true,
          hint: "最多 200 个字",
        },
        {
          key: "style",
          label: "字号预设",
          type: "enum",
          enumValues: TEXT_PRESETS,
        },
      ],
    },
    bounds: { text: { maxLength: 200, nonEmpty: true } },
    run: (params) => {
      const preset = (params.style as TextPreset) || "body";
      // addText 会把新文字设成当前选中对象，setSelectedText 紧接着改的就是它。
      // 两步都直接落在画布控制器上，不经过 React 状态，所以同一拍里是连得上的。
      editor.addText(preset);
      editor.setSelectedText({ value: String(params.text) });
      return ok(`已加入文字「${String(params.text).slice(0, 20)}」。`, revision());
    },
  });

  definitions.push({
    spec: {
      id: "image.set-background",
      label: "换画布底色",
      summary: "把画布背景换成指定颜色。",
      mutates: true,
      params: [
        {
          key: "color",
          label: "颜色",
          type: "string",
          required: true,
          hint: "十六进制色值，例如 #ffffff",
        },
      ],
    },
    bounds: { color: { maxLength: 7, nonEmpty: true } },
    run: (params) => {
      const color = String(params.color).trim();
      if (!HEX_COLOR.test(color)) {
        return fail("颜色要写成 #ffffff 这样的十六进制色值。");
      }
      editor.setCanvasBackground(color);
      return ok(`底色已换成 ${color}。`, revision());
    },
  });

  definitions.push({
    spec: {
      id: "image.export",
      label: "导出图片",
      summary: "按选定格式把当前画面下载下来；不改文档本身。",
      mutates: false,
      params: [
        {
          key: "format",
          label: "文件格式",
          type: "enum",
          required: true,
          enumValues: visualDownloadFormats(EDITOR_ID).map((entry) => ({
            value: entry.format,
            label: entry.label,
          })),
        },
        {
          key: "quality",
          label: "画质",
          type: "number",
          hint: `${MIN_LOSSY_QUALITY} 到 ${MAX_LOSSY_QUALITY}，只对 JPG / WebP 有意义，默认 ${DEFAULT_LOSSY_QUALITY}`,
        },
      ],
    },
    bounds: {
      quality: {
        min: MIN_LOSSY_QUALITY,
        max: MAX_LOSSY_QUALITY,
        integer: true,
      },
    },
    run: async (params) => {
      const format = String(params.format);
      const quality =
        typeof params.quality === "number"
          ? params.quality
          : DEFAULT_LOSSY_QUALITY;
      try {
        await deps.deliver(format, quality);
      } catch (caught) {
        return fail(
          caught instanceof Error && caught.message.trim()
            ? caught.message.trim()
            : "导出失败。",
        );
      }
      return ok(`已按 ${format.toUpperCase()} 导出。`);
    },
  });

  if (deps.runAi) {
    definitions.push(
      ...imageAiCommandDefinitions({
        doc: editor.doc,
        selected: editor.selected,
        aiAvailable: editor.aiAvailable,
        busy: editor.aiBusy,
        revision,
        run: deps.runAi,
      }),
    );
  }

  return definitions;
}

export function imageCommandState(
  editor: FabricImageEditorState,
): Record<string, unknown> {
  return {
    editor: "图片",
    widthPx: editor.doc.width,
    heightPx: editor.doc.height,
    background: editor.canvasBackground,
    layerCount: editor.layers.length,
    selected: editor.selected
      ? { kind: editor.selected.kind, id: editor.selected.id }
      : null,
    cropping: editor.cropping,
    zoomPercent: Math.round(editor.zoom * 100),
    exportFormat: editor.exportFormat,
    exportQuality: editor.exportQuality,
    unsaved: editor.dirty,
    loading: editor.loading,
  };
}

export function createImageCommandSurface(
  deps: ImageCommandDeps,
): PluginCommandSurfaceInput {
  const surface = createVisualCommandSurface({
    editorId: EDITOR_ID,
    // 只能查看：会改画布的指令在这一层直接拒绝，导出照常
    commands: () =>
      guardVisualCommands(
        imageCommandDefinitions(deps),
        Boolean(deps.editor.collab?.readOnly),
      ),
    state: () => imageCommandState(deps.editor),
  });
  return {
    ...surface,
    target: () => deps.item
      ? pluginTargetForLibraryItem(deps.item, EDITOR_ID, deps.editor.editRevision)
      : null,
    agentContext: () => {
      const editor = deps.editor;
      if (editor.loading || !editor.sourceReady) {
        return { ready: false, reason: "图片源或当前 Fabric 场景尚未成功载入。" };
      }
      const raw = editor.captureRecovery() as {
        snapshot?: { json?: { objects?: unknown[] }; doc?: unknown; canvasBackground?: unknown };
      } | null;
      if (!raw?.snapshot || !Array.isArray(raw.snapshot.json?.objects)) {
        return { ready: false, reason: "当前图片编辑器还没有可读取的实时场景快照。" };
      }
      const visionSource = usableImageVisionSource([
        editor.savedUrl,
        ...(deps.visionSourceUrls || []),
        deps.item?.previewUrl,
        deps.item?.url,
      ]);
      const objects = raw.snapshot.json.objects.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const object = value as Record<string, unknown>;
        return {
          id: object.oceanleoId || object.id,
          type: object.type,
          x: object.left,
          y: object.top,
          width: object.width,
          height: object.height,
          scaleX: object.scaleX,
          scaleY: object.scaleY,
          angle: object.angle,
          visible: object.visible,
          opacity: object.opacity,
          fill: object.fill,
          stroke: object.stroke,
          text: object.text,
          alt: object.alt,
          hasImageSource: typeof object.src === "string" || typeof object.data === "string",
        };
      }).filter(Boolean);
      return boundedAgentContent({
        visionSource: visionSource || undefined,
        pixelInspectionAvailable: Boolean(visionSource),
        scene: {
          documentSize: raw.snapshot.doc,
          canvasBackground: raw.snapshot.canvasBackground,
          objects,
          layerOrder: editor.layers,
          selected: editor.selected,
          tool: editor.activeTool,
          cropping: editor.cropping,
          dirty: editor.dirty,
          editRevision: editor.editRevision,
        },
      }, visionSource
        ? "像素判断必须调用 read_image，并把 visionSource 作为 image_url；这只是已保存/公开源图，未保存的 scene overlay 以 scene 数据为准。若来源不可访问，不得声称看见像素。"
        : "已提供当前画布尺寸、图层、选中对象和实时 scene 对象数据，但没有不含凭据且可由服务端读取的像素源；不能声称已视觉检查像素。图片对象本身的 src/data 已省略。",
      );
    },
  };
}
