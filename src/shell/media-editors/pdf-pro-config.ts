/**
 * Pro mode = the official EmbedPDF viewer on the same document bytes.
 *
 * It is allowed to be a full editor (annotate, forms, redact, sign, stamp...),
 * but it must not be a second app around the document. OceanLeo's top bar owns
 * open / save / download / print / share, so the viewer's own file commands are
 * switched off here — both the buttons and the keyboard shortcuts, because
 * `disabledCategories` applies to the command registry as well as the UI schema
 * (snippet `PDFViewerConfig.disabledCategories`).
 *
 * Pure module: the config builder is exercised by tests/pdf-pro-viewer-config.
 */
import { PDF_VIEWER_NO_EXTERNAL_FONTS } from "./pdf-next-runtime";

/**
 * Categories of the snippet's file-level commands (read from the snippet's
 * command table, `categories: ["document", "document-<x>"]`):
 *   document:open     Ctrl+O  opens a local file into the viewer
 *   document:close    closes the only document
 *   document:print    Ctrl+P  print modal
 *   document:export   downloads a copy
 *   document:protect  encrypts, then offers a copy
 *   document:capture  screenshot -> download
 * `document-menu` hides the (otherwise empty) hamburger that held them.
 */
export const PDF_PRO_DISABLED_CATEGORIES: readonly string[] = [
  "document-menu",
  "document-open",
  "document-close",
  "document-print",
  "document-export",
  "document-protect",
  "document-capture",
];

/** Host palette the viewer is themed with (no third-party brand colours). */
export interface PdfProPalette {
  accent: string;
  dark: boolean;
}

const LIGHT = {
  background: {
    app: "#f5f5f4",
    surface: "#ffffff",
    surfaceAlt: "#fafaf9",
    elevated: "#ffffff",
    input: "#ffffff",
  },
  foreground: {
    primary: "#1c1917",
    secondary: "#44403c",
    muted: "#78716c",
    disabled: "#a8a29e",
  },
  border: { default: "#e7e5e4", subtle: "#f5f5f4", strong: "#d6d3d1" },
} as const;

const DARK = {
  background: {
    app: "#1c1917",
    surface: "#292524",
    surfaceAlt: "#231f1e",
    elevated: "#292524",
    input: "#1c1917",
  },
  foreground: {
    primary: "#fafaf9",
    secondary: "#d6d3d1",
    muted: "#a8a29e",
    disabled: "#78716c",
  },
  border: { default: "#44403c", subtle: "#292524", strong: "#57534e" },
} as const;

function safeHex(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#4f46e5";
}

export function pdfProTheme(palette: PdfProPalette) {
  const accent = safeHex(palette.accent);
  const base = palette.dark ? DARK : LIGHT;
  const colors = {
    ...base,
    accent: {
      primary: accent,
      primaryHover: accent,
      primaryActive: accent,
      primaryForeground: "#ffffff",
    },
    interactive: { focus: accent, focusRing: accent },
  };
  return {
    preference: palette.dark ? ("dark" as const) : ("light" as const),
    light: palette.dark ? undefined : colors,
    dark: palette.dark ? colors : undefined,
  };
}

export interface PdfProConfigInput {
  wasmUrl: string;
  fontFallback: unknown;
  bytes: ArrayBuffer;
  name: string;
  palette: PdfProPalette;
}

export function buildPdfProViewerConfig(input: PdfProConfigInput) {
  return {
    wasmUrl: input.wasmUrl,
    fontFallback: input.fontFallback ?? null,
    fonts: PDF_VIEWER_NO_EXTERNAL_FONTS,
    // Single document: no tab strip, no "open another file".
    tabBar: "never" as const,
    disabledCategories: [...PDF_PRO_DISABLED_CATEGORIES],
    theme: pdfProTheme(input.palette),
    documentManager: {
      maxDocuments: 1,
      initialDocuments: [{ buffer: input.bytes, name: input.name }],
    },
  };
}
