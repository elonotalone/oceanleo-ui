/**
 * 图片编辑器的指令面（合同 §3.1，editorId 与编辑栏适配器 id 逐字相同：`image`）。
 *
 * 左栏的 agent 靠这里对画布动手：裁剪、缩放、旋转、加一行字、换底色、导出某格式。
 * 会改文档的一律 `mutates: true`——执行前的用户确认在 agent 侧（W4）做，这里不弹框。
 */

import type { PluginCommandSurfaceInput } from "../plugin-command/types";
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
  editor: FabricImageEditorState;
  /** 由路由提供：按格式与质量把当前画布交到用户手上。 */
  deliver: (format: string, quality: number) => Promise<void>;
}

export function imageCommandDefinitions(
  deps: ImageCommandDeps,
): VisualCommandDefinition[] {
  const { editor } = deps;
  if (editor.loading) return [];
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
  return createVisualCommandSurface({
    editorId: EDITOR_ID,
    commands: () => imageCommandDefinitions(deps),
    state: () => imageCommandState(deps.editor),
  });
}
