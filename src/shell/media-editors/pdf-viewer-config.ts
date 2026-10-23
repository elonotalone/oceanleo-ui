/**
 * 唯一的 EmbedPDF 查看器的配置（基础、专业两档共用一份，切档不重新配置）。
 *
 * - 文件级命令（打开 / 关闭 / 打印 / 导出 / 加密 / 截图下载）关掉：OceanLeo 顶栏负责；
 *   `disabledCategories` 同时作用于界面与快捷键。基础档额外要藏的在运行时开关
 *   （`pdf-viewer-bridge.ts`），这里只放两档都关的。
 * - 主题直接引外壳的 `--awb-*` token（snippet 把颜色原样写进 `:host{--ep-…}`，
 *   不做颜色运算），站点切明暗时查看器的工具栏、侧栏、页间底色一起变；PDF 页面
 *   本身由查看器画成白底（D6：页面保持原色）。
 * - 不向第三方要字体（Google Fonts / jsDelivr）。
 */
import { PDF_VIEWER_NO_EXTERNAL_FONTS } from "./pdf-next-runtime";
import { PDF_VIEWER_ALWAYS_DISABLED } from "./pdf-viewer-bridge";
import { pdfMarkTools } from "./pdf-mark-tools";

/** 查看器配色：全部引外壳 token，两档同形，靠外壳变量切明暗。 */
export function pdfViewerColors(accent: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(accent.trim()) ? accent.trim() : "#4f46e5";
  return {
    background: {
      app: "var(--awb-stage-bg, #f3f4f6)",
      surface: "var(--awb-chrome-bg, #ffffff)",
      surfaceAlt: "var(--awb-shell-bg, #ffffff)",
      elevated: "var(--awb-popover-bg, #ffffff)",
      input: "var(--awb-chrome-bg, #ffffff)",
    },
    foreground: {
      primary: "var(--awb-text, #18181b)",
      secondary: "var(--fg-2, #52525b)",
      muted: "var(--awb-muted, #71717a)",
      disabled: "var(--awb-muted, #a1a1aa)",
    },
    border: {
      default: "var(--awb-border, #e4e4e7)",
      subtle: "var(--divider, #e9e9ec)",
      strong: "var(--border-strong, #d4d4d8)",
    },
    accent: {
      primary: safe,
      primaryHover: safe,
      primaryActive: safe,
      primaryLight: `color-mix(in srgb, ${safe} 14%, transparent)`,
      primaryForeground: "var(--awb-on-accent, #ffffff)",
    },
    interactive: {
      hover: "var(--awb-hover, rgba(0,0,0,.05))",
      active: "var(--awb-hover, rgba(0,0,0,.08))",
      selected: `color-mix(in srgb, ${safe} 14%, transparent)`,
      focus: safe,
      focusRing: safe,
    },
    tooltip: {
      background: "var(--awb-text, #18181b)",
      foreground: "var(--awb-chrome-bg, #ffffff)",
    },
  };
}

export function pdfViewerTheme(palette: { accent: string; dark: boolean }) {
  const colors = pdfViewerColors(palette.accent);
  return {
    preference: palette.dark ? ("dark" as const) : ("light" as const),
    light: colors,
    dark: colors,
  };
}

export interface PdfViewerConfigInput {
  wasmUrl: string;
  fontFallback: unknown;
  bytes: ArrayBuffer;
  name: string;
  palette: { accent: string; dark: boolean };
  author?: string;
}

export function buildPdfViewerConfig(input: PdfViewerConfigInput) {
  return {
    wasmUrl: input.wasmUrl,
    fontFallback: input.fontFallback ?? null,
    fonts: PDF_VIEWER_NO_EXTERNAL_FONTS,
    // 单文档：没有标签条、没有「再开一份」。maxDocuments=2 只为页面整理时
    // 后台先载好新字节再切过去（旧的随即关掉）。
    tabBar: "never" as const,
    disabledCategories: [...PDF_VIEWER_ALWAYS_DISABLED],
    theme: pdfViewerTheme(input.palette),
    documentManager: {
      maxDocuments: 2,
      initialDocuments: [{ buffer: input.bytes, name: input.name }],
    },
    zoom: { minZoom: 0.25, maxZoom: 4 },
    annotations: {
      tools: pdfMarkTools(),
      ...(input.author ? { annotationAuthor: input.author } : {}),
      locked: { type: "include", categories: ["form"] },
    },
  };
}
