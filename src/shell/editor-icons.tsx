"use client";

// @oceanleo/ui — 高级内容工作台「编辑器工具图标」单一事实源。
// ---------------------------------------------------------------------------
// Canva 风格工具栏靠图标而非文字。selection-context 的 control.icon / 顶栏
// action.icon 都是一个字符串名字，运行时经 editorIcon(name) 解析成一个 SVG。
// 名字未知 → 返回 null，调用方回退到文字标签（保证纯增量、老控件不破）。
//
// 全部图标共用同一几何：24x24 viewBox、stroke=currentColor、线宽 1.7、圆角端点，
// 与 shell/icons.tsx 一致，暗色下随 currentColor 走主题前景色。
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";

export interface EditorIconProps {
  className?: string;
}

function svg(children: ReactNode, strokeWidth = 1.7) {
  return function Icon({ className = "h-4 w-4" }: EditorIconProps): ReactNode {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

// --- 文字排版 ---------------------------------------------------------------
const IconBold = svg(
  <>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </>,
  1.9,
);
const IconItalic = svg(
  <>
    <path d="M10 5h8M6 19h8M14 5l-4 14" />
  </>,
);
const IconUnderline = svg(
  <>
    <path d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14" />
  </>,
);
const IconStrikethrough = svg(
  <>
    <path d="M5 12h14" />
    <path d="M8 8a3 3 0 0 1 3-2h3a3 3 0 0 1 3 3M8 16a3 3 0 0 0 3 2h2" />
  </>,
);
const IconTextCase = svg(
  <>
    <path d="M4 17 8 7l4 10M5.4 14h5.2" />
    <path d="M14 17l3-7 3 7M14.9 15h4.2" />
  </>,
);
const IconType = svg(
  <>
    <path d="M4 7V5h16v2M9 5v14M7 19h4" />
  </>,
);
const IconFontSize = svg(
  <>
    <path d="M3 16 7 6l4 10M4 13h6" />
    <path d="M14 8h6M14 12h6M14 16h4" />
  </>,
);
const IconLineHeight = svg(
  <>
    <path d="M3 5v14M6 7 3 4 0.5 6.5M3 4v0M6 17l-3 3-3-3" transform="translate(3 0)" />
    <path d="M10 6h11M10 12h11M10 18h11" />
  </>,
);
const IconLetterSpacing = svg(
  <>
    <path d="M4 16 7 8l3 8M4.8 13.5h4.4" />
    <path d="M14 8v8M20 8v8" />
    <path d="M3 20h18" />
  </>,
);

// --- 对齐 -------------------------------------------------------------------
const IconAlignLeft = svg(
  <>
    <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
  </>,
);
const IconAlignCenter = svg(
  <>
    <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
  </>,
);
const IconAlignRight = svg(
  <>
    <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
  </>,
);
const IconAlignJustify = svg(
  <>
    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </>,
);
const IconAlignTop = svg(
  <>
    <path d="M4 4h16M8 8v10M12 8v6M16 8v10" />
  </>,
);
const IconAlignMiddleV = svg(
  <>
    <path d="M4 12h16M8 6v12M16 8v8" />
  </>,
);
const IconAlignBottom = svg(
  <>
    <path d="M4 20h16M8 6v10M12 10v6M16 6v10" />
  </>,
);

// --- 列表 -------------------------------------------------------------------
const IconBulletList = svg(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
  </>,
);
const IconOrderedList = svg(
  <>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M3 5h1.4v4M3 9h2.4" />
    <path d="M3.2 15.2c.2-.7 2-.7 2 .3 0 .8-2 1.3-2 2.5h2.2" />
  </>,
);
const IconQuote = svg(
  <>
    <path d="M7 7c-2 0-3 1.6-3 3.5S5 14 7 14c0-1.2 0-3.5-.5-4.5M17 7c-2 0-3 1.6-3 3.5S15 14 17 14c0-1.2 0-3.5-.5-4.5" />
  </>,
);

// --- 颜色 / 填充 ------------------------------------------------------------
const IconTextColor = svg(
  <>
    <path d="M5 16 9 6l4 10M6 13h6" />
    <rect x="4" y="19" width="16" height="2.4" rx="1" fill="currentColor" stroke="none" />
  </>,
);
const IconFill = svg(
  <>
    <path d="M11 4 4 11a2 2 0 0 0 0 3l4 4a2 2 0 0 0 3 0l6-6z" />
    <path d="M6.5 8.5 14 16" />
    <path d="M19 15c1.2 1.4 2 2.5 2 3.4a2 2 0 1 1-4 0c0-.9.8-2 2-3.4z" fill="currentColor" stroke="none" />
  </>,
);
const IconHighlight = svg(
  <>
    <path d="m9 14 7-7 3 3-7 7z" />
    <path d="m9 14-2 4 4-2M5 21h6" />
  </>,
);
const IconStroke = svg(
  <>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" strokeDasharray="1.5 1.8" />
  </>,
);
const IconOpacity = svg(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
  </>,
);
const IconShadow = svg(
  <>
    <rect x="4" y="4" width="12" height="12" rx="2.5" />
    <path d="M9 20h9a2 2 0 0 0 2-2V9" opacity="0.55" />
  </>,
);

// --- 变换 -------------------------------------------------------------------
const IconCrop = svg(
  <>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M2 6h14a2 2 0 0 1 2 2v14" />
  </>,
);
const IconRotateLeft = svg(
  <>
    <path d="M4 5v5h5" />
    <path d="M4.5 10a8 8 0 1 1-1.5 5" />
  </>,
);
const IconRotateRight = svg(
  <>
    <path d="M20 5v5h-5" />
    <path d="M19.5 10a8 8 0 1 0 1.5 5" />
  </>,
);
const IconFlipH = svg(
  <>
    <path d="M12 3v18" strokeDasharray="2 2" />
    <path d="M9 7 4 12l5 5zM15 7l5 5-5 5z" />
  </>,
);
const IconFlipV = svg(
  <>
    <path d="M3 12h18" strokeDasharray="2 2" />
    <path d="M7 9 12 4l5 5zM7 15l5 5 5-5z" />
  </>,
);
const IconRotate = svg(
  <>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </>,
);

// --- 图层 -------------------------------------------------------------------
const IconLayerUp = svg(
  <>
    <path d="M12 3 3 8l9 5 9-5z" />
    <path d="M12 3v10" opacity="0" />
    <path d="M3 14l9 5 9-5" opacity="0.5" />
  </>,
);
const IconLayerDown = svg(
  <>
    <path d="M3 16l9 5 9-5z" />
    <path d="M3 10l9 5 9-5" opacity="0.5" />
  </>,
);
const IconLayers = svg(
  <>
    <path d="M12 3 3 8l9 5 9-5z" />
    <path d="m3 12 9 5 9-5M3 16l9 5 9-5" opacity="0.55" />
  </>,
);
const IconBringFront = svg(
  <>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 4H6a2 2 0 0 0-2 2v10" opacity="0.55" />
  </>,
);
const IconSendBack = svg(
  <>
    <rect x="4" y="4" width="12" height="12" rx="2" opacity="0.55" />
    <rect x="8" y="8" width="12" height="12" rx="2" />
  </>,
);

// --- 通用动作 ---------------------------------------------------------------
const IconDuplicate = svg(
  <>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </>,
);
const IconTrash = svg(
  <>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M10 11v6M14 11v6" />
  </>,
);
const IconUndo = svg(
  <>
    <path d="M9 7 4 12l5 5" />
    <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
  </>,
);
const IconRedo = svg(
  <>
    <path d="m15 7 5 5-5 5" />
    <path d="M20 12H9a5 5 0 0 0 0 10h1" />
  </>,
);
const IconPlus = svg(<path d="M12 5v14M5 12h14" strokeWidth={2} />);
const IconImage = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4 17 5-4 4 3 3-2 4 3" />
  </>,
);
const IconShapes = svg(
  <>
    <rect x="3" y="12" width="8" height="8" rx="1.5" />
    <circle cx="16.5" cy="16" r="4" />
    <path d="M12 3 8.5 9h7z" />
  </>,
);
const IconTable = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
  </>,
);
const IconLink = svg(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 7" />
    <path d="M14 10a4 4 0 0 0-5.7 0L6 12.3a4 4 0 0 0 5.7 5.7L13 17" />
  </>,
);
const IconUnlink = svg(
  <>
    <path d="M9 15 6 18a4 4 0 0 1-5.7-5.7L3 9.7" transform="translate(3 0)" />
    <path d="M15 9l3-3a4 4 0 0 1 5.7 5.7" transform="translate(-3 0)" />
    <path d="M4 4l16 16" />
  </>,
);
const IconClear = svg(
  <>
    <path d="M8 6h12M10 6 9 4M11 6l7 14M6 20h9" />
    <path d="m4 12 6 6M10 12l-6 6" />
  </>,
);
const IconAdjust = svg(
  <>
    <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="15" cy="17" r="2" />
  </>,
);
const IconFilter = svg(
  <>
    <circle cx="9" cy="9" r="5" />
    <circle cx="15" cy="15" r="5" opacity="0.6" />
  </>,
);
const IconGrayscale = svg(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
  </>,
);
const IconLayout = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" />
  </>,
);
const IconBackground = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="m3 15 4-3 3 2 4-3 7 5" opacity="0.5" />
    <circle cx="8" cy="9" r="1.4" />
  </>,
);
const IconNote = svg(
  <>
    <path d="M5 4h14v11l-5 5H5z" />
    <path d="M14 20v-5h5M8 9h8M8 13h5" />
  </>,
);
const IconPalette = svg(
  <>
    <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.3-1-1.6-1-2.6 0-.8.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
  </>,
);
const IconAiSpark = svg(
  <>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />
  </>,
);
const IconWand = svg(
  <>
    <path d="M4 20 14 10M15 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z" />
  </>,
);
const IconEye = svg(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
const IconDownload = svg(
  <>
    <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />
  </>,
);
const IconSave = svg(
  <>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7M8 20v-6h8v6" />
  </>,
);
const IconPresent = svg(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M12 16v4M8 20h8" />
    <path d="m10 8 4 2-4 2z" fill="currentColor" stroke="none" />
  </>,
);
const IconRatio = svg(
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10v4M17 10v4" opacity="0.5" />
  </>,
);
const IconGrid = svg(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>,
);
const IconScissors = svg(
  <>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8 8 20 18M8 16 20 6" />
  </>,
);
const IconVolume = svg(
  <>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
  </>,
);
const IconSpeed = svg(
  <>
    <path d="M12 14 15 9" />
    <path d="M4 18a9 9 0 1 1 16 0" />
    <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
  </>,
);
const IconPage = svg(
  <>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </>,
);

// ---------------------------------------------------------------------------
// 名字 → 组件登记表（单一事实源）。别名收敛到同一图标，方便各编辑器复用。
// ---------------------------------------------------------------------------
const REGISTRY: Record<string, (props: EditorIconProps) => ReactNode> = {
  bold: IconBold,
  italic: IconItalic,
  underline: IconUnderline,
  strike: IconStrikethrough,
  strikethrough: IconStrikethrough,
  case: IconTextCase,
  uppercase: IconTextCase,
  type: IconType,
  font: IconType,
  "font-family": IconType,
  "font-size": IconFontSize,
  "text-size": IconFontSize,
  "line-height": IconLineHeight,
  "letter-spacing": IconLetterSpacing,
  "align-left": IconAlignLeft,
  "align-center": IconAlignCenter,
  "align-right": IconAlignRight,
  "align-justify": IconAlignJustify,
  align: IconAlignLeft,
  "align-top": IconAlignTop,
  "align-middle": IconAlignMiddleV,
  "align-bottom": IconAlignBottom,
  "bullet-list": IconBulletList,
  bullets: IconBulletList,
  "ordered-list": IconOrderedList,
  numbered: IconOrderedList,
  quote: IconQuote,
  blockquote: IconQuote,
  "text-color": IconTextColor,
  color: IconTextColor,
  fill: IconFill,
  highlight: IconHighlight,
  stroke: IconStroke,
  border: IconStroke,
  "stroke-width": IconStroke,
  opacity: IconOpacity,
  shadow: IconShadow,
  crop: IconCrop,
  "rotate-left": IconRotateLeft,
  "rotate-right": IconRotateRight,
  rotate: IconRotate,
  "flip-h": IconFlipH,
  "flip-x": IconFlipH,
  "flip-v": IconFlipV,
  "flip-y": IconFlipV,
  "layer-up": IconLayerUp,
  "layer-down": IconLayerDown,
  layers: IconLayers,
  "bring-front": IconBringFront,
  "send-back": IconSendBack,
  duplicate: IconDuplicate,
  copy: IconDuplicate,
  delete: IconTrash,
  trash: IconTrash,
  remove: IconTrash,
  undo: IconUndo,
  redo: IconRedo,
  plus: IconPlus,
  add: IconPlus,
  "add-text": IconType,
  "add-image": IconImage,
  image: IconImage,
  "add-shape": IconShapes,
  shape: IconShapes,
  shapes: IconShapes,
  table: IconTable,
  "add-table": IconTable,
  link: IconLink,
  unlink: IconUnlink,
  clear: IconClear,
  "clear-format": IconClear,
  adjust: IconAdjust,
  adjustments: IconAdjust,
  filter: IconFilter,
  filters: IconFilter,
  grayscale: IconGrayscale,
  layout: IconLayout,
  background: IconBackground,
  "canvas-background": IconBackground,
  note: IconNote,
  notes: IconNote,
  palette: IconPalette,
  theme: IconPalette,
  ai: IconAiSpark,
  spark: IconAiSpark,
  "ai-edit": IconWand,
  wand: IconWand,
  eye: IconEye,
  preview: IconEye,
  download: IconDownload,
  save: IconSave,
  present: IconPresent,
  ratio: IconRatio,
  aspect: IconRatio,
  grid: IconGrid,
  scissors: IconScissors,
  cut: IconScissors,
  split: IconScissors,
  volume: IconVolume,
  speed: IconSpeed,
  page: IconPage,
  slide: IconPage,
};

/**
 * Resolve an icon name to a renderer. Unknown names return null so callers can
 * fall back to a text label — this keeps icon adoption incremental.
 */
export function editorIcon(
  name: string | undefined | null,
): ((props: EditorIconProps) => ReactNode) | null {
  if (!name) return null;
  return REGISTRY[name] || null;
}

export function hasEditorIcon(name: string | undefined | null): boolean {
  return Boolean(name && REGISTRY[name]);
}

/** Render helper: returns the icon element or null. */
export function EditorIcon({
  name,
  className,
}: {
  name: string | undefined | null;
  className?: string;
}): ReactNode {
  const Icon = editorIcon(name);
  return Icon ? <Icon className={className} /> : null;
}
