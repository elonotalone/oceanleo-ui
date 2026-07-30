/**
 * deck-extension v1 visual target: theme palette (§2.1), EMU grid (§2.2),
 * font-size ladder (§2.3), accessibility helpers (§2.4), the 16 layout
 * definitions (§4) and the numeric constant table (§5).
 *
 * Every value here is Normative in
 * `docs/specs/oceanleo-material-and-game-v1/L1-carriers/deck-extension.md`.
 * Do not "round" or "improve" them; the acceptance assertions read them back.
 */

/** §2.2 — 1 pt = 12,700 EMU. */
export const EMU_PER_POINT = 12_700;
/** §2.2 — 1 in = 914,400 EMU. */
export const EMU_PER_INCH = 914_400;

/** §5 C1–C14 — the EMU grid. */
export const DECK_GRID = {
  pageWidth: 12_192_000,
  pageHeight: 6_858_000,
  margin: 685_800,
  contentWidth: 10_820_400,
  columns: 12,
  gutter: 152_400,
  columnWidth: 762_000,
  titleBarBaselineY: 620_000,
  titleTextY: 760_000,
  bodyStartY: 1_700_000,
  bodyBottomY: 6_248_400,
  bodyHeight: 4_548_400,
  footerBaselineY: 6_400_800,
  bulletPitch: 520_000,
  columnPitch: 500_000,
  tableHeaderHeight: 420_000,
  tableRowHeight: 380_000,
} as const;

/** §2.2 — `span(n) = n × 762,000 + (n − 1) × 152,400`, `n ∈ [1, 12]`. */
export function deckSpan(columns: number): number {
  const n = Math.min(DECK_GRID.columns, Math.max(1, Math.trunc(columns)));
  return n * DECK_GRID.columnWidth + (n - 1) * DECK_GRID.gutter;
}

/** §2.2 — left edge of the 1-indexed grid column `n`. */
export function deckColumnX(column: number): number {
  const n = Math.min(DECK_GRID.columns, Math.max(1, Math.trunc(column)));
  return (
    DECK_GRID.margin +
    (n - 1) * (DECK_GRID.columnWidth + DECK_GRID.gutter)
  );
}

export type DeckThemeSlot =
  | "dk1"
  | "lt1"
  | "dk2"
  | "lt2"
  | "accent1"
  | "accent2"
  | "accent3"
  | "accent4"
  | "accent5"
  | "accent6"
  | "hlink"
  | "folHlink";

/**
 * §2.1 — the 12 `a:clrScheme` slots, written verbatim into `theme1.xml`.
 * `accent2` is the 2026-07-29 correction from `D9822B` (2.93:1 on white,
 * below the 3.0:1 obligation of SC 1.4.11) to `C47323` (3.61:1).
 */
export const DECK_THEME_PALETTE: Readonly<Record<DeckThemeSlot, string>> = {
  dk1: "1F2328",
  lt1: "FFFFFF",
  dk2: "3A4149",
  lt2: "F2F5F9",
  accent1: "1F6FEB",
  accent2: "C47323",
  accent3: "2E8B6F",
  accent4: "8E5BA6",
  accent5: "CF222E",
  accent6: "57606A",
  hlink: "0969DA",
  folHlink: "8250DF",
};

/** §2.1 — slot order is fixed by ECMA-376; `a:clrScheme` children must follow it. */
export const DECK_THEME_SLOT_ORDER: readonly DeckThemeSlot[] = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
];

/** §2.1 — the six series colours used when the IR does not override them. */
export const DECK_SERIES_COLORS: readonly string[] = [
  DECK_THEME_PALETTE.accent1,
  DECK_THEME_PALETTE.accent2,
  DECK_THEME_PALETTE.accent3,
  DECK_THEME_PALETTE.accent4,
  DECK_THEME_PALETTE.accent5,
  DECK_THEME_PALETTE.accent6,
];

export type DeckFontRole =
  | "kpi"
  | "display"
  | "section"
  | "heading"
  | "subheading"
  | "body"
  | "body-sm"
  | "caption"
  | "table"
  | "note";

/** §2.3 — OOXML `sz`, in hundredths of a point. */
export const DECK_FONT_SIZES: Readonly<Record<DeckFontRole, number>> = {
  kpi: 5400,
  display: 4400,
  section: 4000,
  heading: 2800,
  subheading: 2000,
  body: 1800,
  "body-sm": 1600,
  caption: 1400,
  table: 1300,
  note: 1200,
};

/** §2.3 / §5 C35 — body copy must never fall below the `note` step. */
export const DECK_MIN_FONT_SIZE = DECK_FONT_SIZES.note;

/** §2.4 / §5 C38 — SC 1.4.3 minimum contrast for body copy. */
export const DECK_CONTRAST_BODY = 4.5;
/** §2.4 / §5 C39 — SC 1.4.3 large-text / SC 1.4.11 non-text minimum. */
export const DECK_CONTRAST_LARGE = 3;

function channelLuminance(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.040_45
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance of a 6-digit hex colour (with or without `#`). */
export function deckRelativeLuminance(hex: string): number {
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`deck theme colour must be 6-digit hex, got "${hex}"`);
  }
  const red = channelLuminance(Number.parseInt(value.slice(0, 2), 16));
  const green = channelLuminance(Number.parseInt(value.slice(2, 4), 16));
  const blue = channelLuminance(Number.parseInt(value.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** §2.4 — WCAG 2.2 contrast ratio between two colours. */
export function deckContrastRatio(foreground: string, background: string): number {
  const first = deckRelativeLuminance(foreground);
  const second = deckRelativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * §2.1 last bullet — `a:accent2` carries only fills and ≥ 18 pt bold / ≥ 24 pt
 * text; white on `C47323` measures 3.61:1 and `dk1` on it 4.38:1, so neither
 * clears the 4.5:1 body obligation.
 */
export const DECK_BODY_TEXT_FORBIDDEN_FILLS: readonly DeckThemeSlot[] = [
  "accent2",
];

export type DeckIrLayout =
  | "title"
  | "section"
  | "bullets"
  | "two-column"
  | "data-table"
  | "image-full"
  | "image-left"
  | "image-right"
  | "image-grid"
  | "chart-focus"
  | "chart-with-notes"
  | "kpi-row"
  | "comparison"
  | "timeline"
  | "quote"
  | "mixed-triptych";

/** §4 / §5 C15 — the 16 layout grammars, in L1…L16 order. */
export const DECK_IR_LAYOUTS: readonly DeckIrLayout[] = [
  "title",
  "section",
  "bullets",
  "two-column",
  "data-table",
  "image-full",
  "image-left",
  "image-right",
  "image-grid",
  "chart-focus",
  "chart-with-notes",
  "kpi-row",
  "comparison",
  "timeline",
  "quote",
  "mixed-triptych",
];

/** §4 note — layouts that carry picture, prose and numbers on one page. */
export const DECK_DENSE_LAYOUTS: readonly DeckIrLayout[] = [
  "mixed-triptych",
  "chart-with-notes",
];

export interface DeckBox {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

export interface DeckLayoutDefinition {
  /** `L1`…`L16` as written in §4. */
  readonly ordinal: number;
  readonly id: DeckIrLayout;
  /** `existing` = one of the five grammars R2 already emitted. */
  readonly status: "existing" | "new";
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly fontRoles: readonly DeckFontRole[];
  /** §4 "图文比例" — picture area over content area. */
  readonly imageTextRatio: number;
  /** ECMA-376 `p:sldLayout/@type` (§3.5). */
  readonly ooxmlType: string;
  readonly boxes: Readonly<Record<string, DeckBox>>;
}

const FULL_WIDTH = deckSpan(12);

function box(x: number, y: number, cx: number, cy: number): DeckBox {
  return { x, y, cx, cy };
}

/**
 * §4 — the per-layout EMU placements.
 *
 * Where §4 states an explicit EMU literal it wins over the §2.2 `span(n)`
 * formula: §2.2's own worked examples disagree with its formula for n = 6
 * (4,724,400 vs 5,334,000) and n = 8 (7,163,400 vs 7,162,800), while §4's
 * literals close exactly on the content right edge 11,506,200. The conflict is
 * reported in the W9 marker; `deckSpan()` still implements the formula.
 */
export const DECK_LAYOUT_DEFINITIONS: readonly DeckLayoutDefinition[] = [
  {
    ordinal: 1,
    id: "title",
    status: "existing",
    required: ["title"],
    optional: ["subtitle"],
    fontRoles: ["display", "body"],
    imageTextRatio: 0,
    ooxmlType: "title",
    boxes: {
      title: box(DECK_GRID.margin, 1_500_000, FULL_WIDTH, 900_000),
      accentBar: box(DECK_GRID.margin, 2_400_000, FULL_WIDTH, 90_000),
      subtitle: box(DECK_GRID.margin, 2_700_000, FULL_WIDTH, 600_000),
    },
  },
  {
    ordinal: 2,
    id: "section",
    status: "existing",
    required: ["title"],
    optional: ["subtitle"],
    fontRoles: ["section", "body-sm"],
    imageTextRatio: 0,
    ooxmlType: "secHead",
    boxes: {
      accentBar: box(0, 0, 460_000, DECK_GRID.pageHeight),
      title: box(1_000_000, 2_600_000, 10_506_200, 900_000),
      subtitle: box(1_000_000, 3_600_000, 10_506_200, 600_000),
    },
  },
  {
    ordinal: 3,
    id: "bullets",
    status: "existing",
    required: ["title", "bullets"],
    optional: ["note"],
    fontRoles: ["heading", "body"],
    imageTextRatio: 0,
    ooxmlType: "obj",
    boxes: {
      accentDot: box(
        DECK_GRID.margin,
        DECK_GRID.titleBarBaselineY,
        200_000,
        70_000,
      ),
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      bullets: box(
        DECK_GRID.margin,
        DECK_GRID.bodyStartY,
        FULL_WIDTH,
        DECK_GRID.bodyHeight,
      ),
    },
  },
  {
    ordinal: 4,
    id: "two-column",
    status: "existing",
    required: ["title", "left", "right"],
    optional: [],
    fontRoles: ["heading", "body-sm"],
    imageTextRatio: 0,
    ooxmlType: "twoObj",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      left: box(
        DECK_GRID.margin,
        DECK_GRID.bodyStartY,
        4_724_400,
        DECK_GRID.bodyHeight,
      ),
      right: box(
        5_810_200,
        DECK_GRID.bodyStartY,
        4_724_400,
        DECK_GRID.bodyHeight,
      ),
    },
  },
  {
    ordinal: 5,
    id: "data-table",
    status: "existing",
    required: ["title", "table"],
    optional: ["note"],
    fontRoles: ["heading", "caption", "table"],
    imageTextRatio: 0,
    ooxmlType: "tbl",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      table: box(
        DECK_GRID.margin,
        DECK_GRID.bodyStartY,
        FULL_WIDTH,
        DECK_GRID.bodyHeight,
      ),
    },
  },
  {
    ordinal: 6,
    id: "image-full",
    status: "new",
    required: ["images", "title"],
    optional: ["note"],
    fontRoles: ["section"],
    imageTextRatio: 1,
    ooxmlType: "cust",
    boxes: {
      image: box(0, 0, DECK_GRID.pageWidth, DECK_GRID.pageHeight),
      scrim: box(0, 5_200_000, DECK_GRID.pageWidth, 1_000_000),
      title: box(DECK_GRID.margin, 5_200_000, FULL_WIDTH, 1_000_000),
    },
  },
  {
    ordinal: 7,
    id: "image-left",
    status: "new",
    required: ["images", "title", "bullets"],
    optional: ["note"],
    fontRoles: ["heading", "body"],
    imageTextRatio: 0.33,
    ooxmlType: "cust",
    boxes: {
      image: box(DECK_GRID.margin, DECK_GRID.bodyStartY, 3_962_400, 3_600_000),
      title: box(5_562_600, DECK_GRID.titleTextY, 5_943_600, 800_000),
      bullets: box(5_562_600, DECK_GRID.bodyStartY, 5_943_600, 3_600_000),
    },
  },
  {
    ordinal: 8,
    id: "image-right",
    status: "new",
    required: ["images", "title", "bullets"],
    optional: ["note"],
    fontRoles: ["heading", "body"],
    imageTextRatio: 0.33,
    ooxmlType: "cust",
    boxes: {
      image: box(7_543_800, DECK_GRID.bodyStartY, 3_962_400, 3_600_000),
      title: box(
        DECK_GRID.margin,
        DECK_GRID.titleTextY,
        5_943_600,
        800_000,
      ),
      bullets: box(
        DECK_GRID.margin,
        DECK_GRID.bodyStartY,
        5_943_600,
        3_600_000,
      ),
    },
  },
  {
    ordinal: 9,
    id: "image-grid",
    status: "new",
    required: ["images", "title"],
    optional: ["note"],
    fontRoles: ["heading", "caption"],
    imageTextRatio: 0.62,
    ooxmlType: "cust",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      cell: box(DECK_GRID.margin, DECK_GRID.bodyStartY, 3_505_200, 2_020_000),
    },
  },
  {
    ordinal: 10,
    id: "chart-focus",
    status: "new",
    required: ["chart", "title"],
    optional: ["note"],
    fontRoles: ["heading", "body-sm"],
    imageTextRatio: 0,
    ooxmlType: "chart",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      chart: box(DECK_GRID.margin, DECK_GRID.bodyStartY, FULL_WIDTH, 3_800_000),
      conclusion: box(DECK_GRID.margin, 5_600_000, FULL_WIDTH, 480_000),
    },
  },
  {
    ordinal: 11,
    id: "chart-with-notes",
    status: "new",
    required: ["chart", "title", "bullets"],
    optional: ["note"],
    fontRoles: ["heading", "body-sm"],
    imageTextRatio: 0,
    ooxmlType: "cust",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      chart: box(DECK_GRID.margin, DECK_GRID.bodyStartY, 5_943_600, 3_800_000),
      bullets: box(6_934_200, DECK_GRID.bodyStartY, 3_962_400, 3_800_000),
    },
  },
  {
    ordinal: 12,
    id: "kpi-row",
    status: "new",
    required: ["kpis", "title"],
    optional: ["note"],
    fontRoles: ["heading", "kpi", "caption"],
    imageTextRatio: 0,
    ooxmlType: "cust",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      card: box(DECK_GRID.margin, 2_000_000, 4_724_400, 1_900_000),
    },
  },
  {
    ordinal: 13,
    id: "comparison",
    status: "new",
    required: ["left", "right", "title"],
    optional: ["note"],
    fontRoles: ["heading", "caption", "body-sm"],
    imageTextRatio: 0,
    ooxmlType: "twoObj",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      leftHeader: box(
        DECK_GRID.margin,
        DECK_GRID.bodyStartY,
        4_724_400,
        DECK_GRID.tableHeaderHeight,
      ),
      rightHeader: box(
        5_810_200,
        DECK_GRID.bodyStartY,
        4_724_400,
        DECK_GRID.tableHeaderHeight,
      ),
      left: box(DECK_GRID.margin, 2_120_000, 4_724_400, 2_760_000),
      right: box(5_810_200, 2_120_000, 4_724_400, 2_760_000),
    },
  },
  {
    ordinal: 14,
    id: "timeline",
    status: "new",
    required: ["milestones", "title"],
    optional: ["note"],
    fontRoles: ["heading", "subheading", "caption"],
    imageTextRatio: 0,
    ooxmlType: "cust",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      axis: box(DECK_GRID.margin, 3_400_000, FULL_WIDTH, 40_000),
      node: box(DECK_GRID.margin, 3_310_000, 180_000, 180_000),
    },
  },
  {
    ordinal: 15,
    id: "quote",
    status: "new",
    required: ["quote"],
    optional: ["images", "note"],
    fontRoles: ["section", "body"],
    imageTextRatio: 0,
    ooxmlType: "cust",
    boxes: {
      mark: box(1_609_800, 2_200_000, 300_000, 300_000),
      quote: box(2_209_800, 2_200_000, 7_163_400, 1_400_000),
      attribution: box(2_209_800, 4_000_000, 7_163_400, 400_000),
      background: box(0, 0, DECK_GRID.pageWidth, DECK_GRID.pageHeight),
    },
  },
  {
    ordinal: 16,
    id: "mixed-triptych",
    status: "new",
    required: ["images", "chart", "bullets", "title"],
    optional: ["note"],
    fontRoles: ["heading", "body-sm", "caption"],
    imageTextRatio: 0.24,
    ooxmlType: "cust",
    boxes: {
      title: box(DECK_GRID.margin, DECK_GRID.titleTextY, FULL_WIDTH, 800_000),
      image: box(DECK_GRID.margin, DECK_GRID.bodyStartY, 3_505_200, 2_400_000),
      chart: box(4_343_400, DECK_GRID.bodyStartY, 3_505_200, 2_400_000),
      bullets: box(8_001_000, DECK_GRID.bodyStartY, 3_505_200, 2_400_000),
      conclusion: box(DECK_GRID.margin, 4_400_000, FULL_WIDTH, 700_000),
    },
  },
];

const DEFINITIONS_BY_ID = new Map<DeckIrLayout, DeckLayoutDefinition>(
  DECK_LAYOUT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function deckLayoutDefinition(
  layout: DeckIrLayout,
): DeckLayoutDefinition {
  const definition = DEFINITIONS_BY_ID.get(layout);
  if (!definition) throw new Error(`unknown deck layout "${layout}"`);
  return definition;
}

/**
 * §4 L9 — the grid cells. §4's literals (2 rows × 2,020,000 + 200,000 gap +
 * 2 × 300,000 caption = 4,840,000) overflow §2.2's 4,548,400 body height by
 * 291,600, so the caption occupies the bottom 300,000 of each cover-fit cell
 * instead of an extra band underneath. Reported in the W9 marker.
 */
export function deckImageGridCells(count: number): {
  image: DeckBox;
  caption: DeckBox;
}[] {
  const total = Math.min(6, Math.max(3, Math.trunc(count)));
  const cell = deckLayoutDefinition("image-grid").boxes.cell;
  const rowPitch = cell.cy + 200_000;
  return Array.from({ length: total }, (_, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = DECK_GRID.margin + column * (cell.cx + DECK_GRID.gutter);
    const y = cell.y + row * rowPitch;
    return {
      image: box(x, y, cell.cx, cell.cy),
      caption: box(x, y + cell.cy - 300_000, cell.cx, 300_000),
    };
  });
}

/**
 * §4 L12 — "卡片等分内容区". §4 fixes the per-card width (2 cards 4,724,400;
 * 3 cards 3,505,200; 4 cards 2,438,400) and the remaining content width is
 * shared evenly as gaps. The 3-card case lands exactly on the 152,400 gutter.
 */
export function deckKpiCards(count: number): DeckBox[] {
  const total = Math.min(4, Math.max(2, Math.trunc(count)));
  const width = total === 2 ? 4_724_400 : total === 3 ? 3_505_200 : 2_438_400;
  const card = deckLayoutDefinition("kpi-row").boxes.card;
  const gap = (DECK_GRID.contentWidth - total * width) / (total - 1);
  return Array.from({ length: total }, (_, index) =>
    box(
      Math.round(DECK_GRID.margin + index * (width + gap)),
      card.y,
      width,
      card.cy,
    ),
  );
}

/** §4 L14 — milestone dots spread evenly along the axis. */
export function deckTimelineNodes(count: number): DeckBox[] {
  const total = Math.min(6, Math.max(3, Math.trunc(count)));
  const axis = deckLayoutDefinition("timeline").boxes.axis;
  const node = deckLayoutDefinition("timeline").boxes.node;
  const step = (axis.cx - node.cx) / (total - 1);
  return Array.from({ length: total }, (_, index) =>
    box(Math.round(axis.x + index * step), node.y, node.cx, node.cy),
  );
}

/** §5 C1–C51 — the numeric constant table, keyed by constant id. */
export const DECK_CONSTANTS = {
  C1: DECK_GRID.pageWidth,
  C2: DECK_GRID.pageHeight,
  C3: DECK_GRID.margin,
  C4: DECK_GRID.contentWidth,
  C5: DECK_GRID.columns,
  C6: DECK_GRID.gutter,
  C7: DECK_GRID.columnWidth,
  C8: DECK_GRID.bodyStartY,
  C9: DECK_GRID.bodyBottomY,
  C10: DECK_GRID.bodyHeight,
  C11: DECK_GRID.bulletPitch,
  C12: DECK_GRID.columnPitch,
  C13: DECK_GRID.tableHeaderHeight,
  C14: DECK_GRID.tableRowHeight,
  C15: 16,
  C16: 11,
  C17: 6,
  C18: 80,
  C19: 7,
  C20: [2, 8],
  C21: [2, 12],
  C22: [1, 6],
  C23: [2, 24],
  C24: [2, 4],
  C25: [3, 6],
  C26: [3, 6],
  C27: [2_048, 8_388_608],
  C28: [320, 8_000],
  C29: 120,
  C30: 6,
  C31: 12,
  C32: 3,
  C33: 16,
  C34: [0, 100_000],
  C35: 1_200,
  C36: 4_400,
  C37: 5_400,
  C38: 4.5,
  C39: 3,
  C40: 4,
  C41: 49_152,
  C42: 52_428_800,
  C43: 4_096,
  C44: 100,
  C45: 24,
  C46: 0.85,
  C47: 0.99,
  C48: 4_000,
  C49: 8,
  C50: 2,
  C51: 1_200,
} as const;
