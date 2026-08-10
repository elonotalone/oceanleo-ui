/**
 * Named, indivisible deck appearance packs.
 *
 * Palette keys and labels are mirrored from the single source of truth at
 * `/root/projects/asset/lib/template-dna.ts`. The deck-only decisions here are
 * measured page surfaces, full-bleed treatment, scrims, and content density.
 */

export interface DeckPackPalette {
  /** Existing `PALETTES_V2` key; never a deck-only synonym. */
  readonly key: string;
  /** Existing `PALETTES_V2` label. */
  readonly label: string;
  readonly lt1: string;
  readonly dk1: string;
  readonly lt2: string;
  readonly dk2: string;
  readonly accent1: string;
  readonly accent2: string;
  readonly accent3: string;
  readonly accent4: string;
  readonly accent5: string;
  readonly accent6: string;
}

export interface DeckPackFonts {
  readonly major: string;
  readonly minor: string;
  readonly eastAsian: string;
  readonly fontScale: number;
}

export interface DeckPackSurface {
  /** Six-digit RGB measured from the source slides' effective page surface. */
  readonly color: string;
  /** Whether a full-bleed layout promotes its picture to a centre-cropped cover. */
  readonly fullBleedImage: "cover" | "none";
}

export interface DeckPackScrim {
  /** Six-digit RGB measured from source cover masks / dominant dark ink. */
  readonly color: string;
  /** Left-to-right solid-fill opacity bands; never a shape gradient. */
  readonly verticalBands: readonly [number, number, number];
}

export interface DeckPackDensity {
  /** Existing `DENSITY_TOKENS` key. */
  readonly key: "compact" | "regular" | "airy";
  readonly imagesPerPage: readonly [number, number];
  readonly imageAreaFraction: readonly [number, number];
  readonly textCharactersPerPage: readonly [number, number];
}

export interface DeckPack {
  readonly id: string;
  readonly label: string;
  readonly palette: DeckPackPalette;
  readonly fonts: DeckPackFonts;
  readonly surface: DeckPackSurface;
  readonly scrim: DeckPackScrim;
  readonly density: DeckPackDensity;
  /** Original asset-station style categories merged into this pack. */
  readonly sourceStyles: readonly string[];
  /** Representative local files whose OOXML was measured. */
  readonly sourceFiles: readonly string[];
}

function palette(
  key: string,
  label: string,
  values: Omit<DeckPackPalette, "key" | "label">,
): DeckPackPalette {
  return Object.freeze({ key, label, ...values });
}

// Values below are copied from PALETTES_V2. The accent mapping deliberately
// picks six distinct roles from each source palette so no theme accent is empty
// or duplicated. `lt2` may repeat `lt1`; it is a surface role, not an accent.
const AMBER = palette("amber", "琥珀", {
  lt1: "FFF7ED", dk1: "1F1206", lt2: "FFF7ED", dk2: "6B5645",
  accent1: "EA580C", accent2: "C2410C", accent3: "7C2D12",
  accent4: "FB923C", accent5: "FDBA74", accent6: "F97316",
});

const CRIMSON = palette("crimson", "绯红", {
  lt1: "FFF1F2", dk1: "1C0A0F", lt2: "FFF1F2", dk2: "6B5158",
  accent1: "E11D48", accent2: "BE123C", accent3: "881337",
  accent4: "F43F5E", accent5: "FDA4AF", accent6: "EF4444",
});

const MOCHA = palette("mocha", "摩卡棕", {
  lt1: "FEF3E7", dk1: "241407", lt2: "FEF3E7", dk2: "6F5B48",
  accent1: "92400E", accent2: "78350F", accent3: "3F2212",
  accent4: "B45309", accent5: "E7B98A", accent6: "A16207",
});

const PAPER = palette("paper", "米白", {
  lt1: "F8FAFC", dk1: "0F172A", lt2: "F8FAFC", dk2: "475569",
  accent1: "0F172A", accent2: "020617", accent3: "F8FAFC",
  accent4: "E2E8F0", accent5: "475569", accent6: "E5E7EB",
});

const GLACIER = palette("glacier", "冰川灰蓝", {
  lt1: "F0F9FF", dk1: "0F172A", lt2: "F0F9FF", dk2: "526074",
  accent1: "334155", accent2: "1E293B", accent3: "E0F2FE",
  accent4: "CBD5E1", accent5: "0369A1", accent6: "94A3B8",
});

const OCEAN = palette("ocean", "深海蓝", {
  lt1: "EFF6FF", dk1: "0F172A", lt2: "EFF6FF", dk2: "475569",
  accent1: "2563EB", accent2: "1D4ED8", accent3: "1E3A8A",
  accent4: "3B82F6", accent5: "93C5FD", accent6: "475569",
});

const NEON_VIOLET = palette("neon-violet", "霓虹紫", {
  // Dark surfaces need the DNA's light `ink` in both writer text roles.
  lt1: "F0E7FF", dk1: "F0E7FF", lt2: "120B1F", dk2: "9B86B5",
  accent1: "A855F7", accent2: "9333EA", accent3: "6D28D9",
  accent4: "C084FC", accent5: "D8B4FE", accent6: "9B86B5",
});

const JADE_GOLD = palette("jade-gold", "墨绿金", {
  lt1: "ECFDF5", dk1: "062019", lt2: "ECFDF5", dk2: "4A635B",
  accent1: "065F46", accent2: "064E3B", accent3: "022C22",
  accent4: "0F766E", accent5: "FBBF24", accent6: "047857",
});

const GOLD = palette("gold", "鎏金", {
  lt1: "FFFBEB", dk1: "1C1403", lt2: "FFFBEB", dk2: "6B5E3F",
  accent1: "B45309", accent2: "92400E", accent3: "451A03",
  accent4: "F59E0B", accent5: "FCD34D", accent6: "D97706",
});

const MAUVE = palette("mauve", "藕荷", {
  lt1: "FAF3F8", dk1: "2A1526", lt2: "FAF3F8", dk2: "6D5566",
  accent1: "9D5B8B", accent2: "82486F", accent3: "4A2545",
  accent4: "C084AC", accent5: "E9C3DC", accent6: "B06FA0",
});

function freezePack(pack: DeckPack): Readonly<DeckPack> {
  Object.freeze(pack.fonts);
  Object.freeze(pack.surface);
  Object.freeze(pack.scrim.verticalBands);
  Object.freeze(pack.scrim);
  Object.freeze(pack.density.imagesPerPage);
  Object.freeze(pack.density.imageAreaFraction);
  Object.freeze(pack.density.textCharactersPerPage);
  Object.freeze(pack.density);
  Object.freeze(pack.sourceStyles);
  Object.freeze(pack.sourceFiles);
  return Object.freeze(pack);
}

/**
 * Eleven approved whole packs. These are intentionally not exposed as
 * independent colour/font/scrim controls: each entry is one finished choice.
 */
export const DECK_PACKS: readonly Readonly<DeckPack>[] = Object.freeze([
  // Measured from src-annual-amber.pptx, slot-ppt-p1-academic-report-e3ba4160.pptx,
  // slot-ppt-p1-marketing-plan-783a2848.pptx and slot-ppt-p1-roadshow-invest-5a37680d.pptx.
  freezePack({
    id: "paper-cut-amber", label: "暖调剪纸", palette: AMBER,
    fonts: { major: "ZCOOL KuaiLe", minor: "Noto Sans SC", eastAsian: "ZCOOL KuaiLe", fontScale: 1 },
    surface: { color: "F7EFE2", fullBleedImage: "cover" },
    scrim: { color: "4A3B2A", verticalBands: [82, 68, 56] },
    density: { key: "regular", imagesPerPage: [1, 2], imageAreaFraction: [0.2, 0.32], textCharactersPerPage: [35, 110] },
    sourceStyles: ["amber", "sunset", "terrazzo"],
    sourceFiles: ["src-annual-amber.pptx", "slot-ppt-p1-marketing-plan-783a2848.pptx", "slot-ppt-p1-roadshow-invest-5a37680d.pptx"],
  }),

  // Measured from slot-ppt-p3-marketing-plan-8278f211.pptx,
  // slot-meeting-p1-action-items-4ee39b6f.pptx and slot-meeting-p4-decision-memo-a487809d.pptx.
  freezePack({
    id: "riso-crimson", label: "孔版几何", palette: CRIMSON,
    fonts: { major: "Smiley Sans", minor: "Noto Sans SC", eastAsian: "Smiley Sans", fontScale: 1 },
    surface: { color: "F7F3EB", fullBleedImage: "cover" },
    scrim: { color: "28324E", verticalBands: [88, 76, 64] },
    density: { key: "regular", imagesPerPage: [1, 2], imageAreaFraction: [0.2, 0.34], textCharactersPerPage: [35, 105] },
    sourceStyles: ["bauhaus", "memphis", "pixel", "riso"],
    sourceFiles: ["slot-ppt-p3-marketing-plan-8278f211.pptx", "slot-meeting-p1-action-items-4ee39b6f.pptx", "slot-meeting-p4-decision-memo-a487809d.pptx"],
  }),

  // Measured from slot-ppt-p1-brand-intro-ae4e5615.pptx,
  // ppt-academic-report-shelf-d3f6e7f0eb.pptx and scratch/deck-audit/px/audit-meridian.pptx.
  freezePack({
    id: "archive-mocha", label: "档案复古", palette: MOCHA,
    fonts: { major: "EB Garamond", minor: "Noto Serif SC", eastAsian: "Noto Serif SC", fontScale: 1 },
    surface: { color: "EFEAE0", fullBleedImage: "cover" },
    scrim: { color: "26221C", verticalBands: [70, 46, 28] },
    density: { key: "regular", imagesPerPage: [1, 2], imageAreaFraction: [0.2, 0.34], textCharactersPerPage: [35, 120] },
    sourceStyles: ["dossier", "gazette", "meridian"],
    sourceFiles: ["slot-ppt-p1-brand-intro-ae4e5615.pptx", "ppt-academic-report-shelf-d3f6e7f0eb.pptx", "audit-meridian.pptx"],
  }),

  // Measured from ppt-academic-report-shelf-29e39d59a2.pptx,
  // bizdev-company-research-shelf-e1ae429f3e.pptx and ppt-academic-report-shelf-59685ae1f9.pptx.
  freezePack({
    id: "editorial-paper", label: "黑白编辑", palette: PAPER,
    fonts: { major: "Playfair Display", minor: "Noto Serif SC", eastAsian: "Noto Serif SC", fontScale: 1 },
    surface: { color: "FAFAF8", fullBleedImage: "cover" },
    scrim: { color: "111015", verticalBands: [80, 66, 52] },
    density: { key: "regular", imagesPerPage: [1, 2], imageAreaFraction: [0.2, 0.32], textCharactersPerPage: [35, 115] },
    sourceStyles: ["alabaster", "editorial"],
    sourceFiles: ["ppt-academic-report-shelf-29e39d59a2.pptx", "bizdev-company-research-shelf-e1ae429f3e.pptx", "ppt-academic-report-shelf-59685ae1f9.pptx"],
  }),

  // Measured from slot-ppt-p1-work-report-9b9645d1.pptx, platform-citytour.pptx,
  // ppt-academic-report-shelf-8359101a2c.pptx and scratch/deck-audit/quarterly-quartz.pptx.
  freezePack({
    id: "glacier-air", label: "冰川留白", palette: GLACIER,
    fonts: { major: "Space Grotesk", minor: "Noto Sans SC", eastAsian: "Noto Sans SC", fontScale: 1 },
    surface: { color: "EDEFF0", fullBleedImage: "cover" },
    scrim: { color: "33393E", verticalBands: [90, 78, 66] },
    density: { key: "airy", imagesPerPage: [1, 2], imageAreaFraction: [0.2, 0.34], textCharactersPerPage: [45, 125] },
    sourceStyles: ["arctic", "cerulean", "mist", "quartz"],
    sourceFiles: ["slot-ppt-p1-work-report-9b9645d1.pptx", "platform-citytour.pptx", "ppt-academic-report-shelf-8359101a2c.pptx", "quarterly-quartz.pptx"],
  }),

  // Measured from ppt-academic-report-shelf-4dcbf42d45.pptx,
  // slot-meeting-p1-client-agenda-2aa732ac.pptx and slot-meeting-p1-minutes-2ab470d0.pptx.
  freezePack({
    id: "blueprint-ocean", label: "工程蓝图", palette: OCEAN,
    fonts: { major: "Space Grotesk", minor: "Noto Sans SC", eastAsian: "Noto Sans SC", fontScale: 1 },
    surface: { color: "F2F6FC", fullBleedImage: "cover" },
    scrim: { color: "16295C", verticalBands: [88, 74, 62] },
    density: { key: "regular", imagesPerPage: [1, 2], imageAreaFraction: [0.2, 0.34], textCharactersPerPage: [35, 105] },
    sourceStyles: ["blueprint", "cobalt"],
    sourceFiles: ["ppt-academic-report-shelf-4dcbf42d45.pptx", "slot-meeting-p1-client-agenda-2aa732ac.pptx", "slot-meeting-p1-minutes-2ab470d0.pptx"],
  }),

  // Measured from meeting-action-items-shelf-38190d9a25.pptx,
  // slot-ppt-p1-business-plan-01bd8a0d.pptx and slot-ppt-p1-project-proposal-26169714.pptx.
  freezePack({
    id: "cyber-neon", label: "赛博霓虹", palette: NEON_VIOLET,
    fonts: { major: "Orbitron", minor: "Noto Sans SC", eastAsian: "Noto Sans SC", fontScale: 1 },
    surface: { color: "0A0714", fullBleedImage: "cover" },
    scrim: { color: "0A0714", verticalBands: [68, 44, 24] },
    density: { key: "compact", imagesPerPage: [0, 2], imageAreaFraction: [0.18, 0.32], textCharactersPerPage: [30, 100] },
    sourceStyles: ["aurora", "neon", "onyx"],
    sourceFiles: ["meeting-action-items-shelf-38190d9a25.pptx", "slot-ppt-p1-business-plan-01bd8a0d.pptx", "slot-ppt-p1-project-proposal-26169714.pptx"],
  }),

  // Measured from slot-ppt-p2-knowledge-share-0b3f32c9.pptx,
  // slot-ppt-p1-event-plan-36a9589f.pptx and slot-ppt-p4-academic-report-dd9aec3d.pptx.
  freezePack({
    id: "botanical-jade", label: "古典博物", palette: JADE_GOLD,
    fonts: { major: "EB Garamond", minor: "Noto Serif SC", eastAsian: "Noto Serif SC", fontScale: 1 },
    surface: { color: "EDF2EA", fullBleedImage: "cover" },
    scrim: { color: "24382B", verticalBands: [88, 76, 64] },
    density: { key: "airy", imagesPerPage: [1, 2], imageAreaFraction: [0.22, 0.36], textCharactersPerPage: [35, 110] },
    sourceStyles: ["botany", "emerald", "sand", "vellum"],
    sourceFiles: ["slot-ppt-p2-knowledge-share-0b3f32c9.pptx", "slot-ppt-p1-event-plan-36a9589f.pptx", "slot-ppt-p4-academic-report-dd9aec3d.pptx"],
  }),

  // Measured from bizdev-cold-email-shelf-adaf09d24e.pptx,
  // slot-ppt-p1-product-launch-593836f2.pptx and slot-ppt-p1-class-competition-7493ac25.pptx.
  freezePack({
    id: "gilt-gold", label: "金箔典雅", palette: GOLD,
    fonts: { major: "Playfair Display", minor: "Noto Serif SC", eastAsian: "Noto Serif SC", fontScale: 1 },
    surface: { color: "FDFCF8", fullBleedImage: "cover" },
    scrim: { color: "4A4433", verticalBands: [94, 82, 70] },
    density: { key: "regular", imagesPerPage: [1, 2], imageAreaFraction: [0.16, 0.3], textCharactersPerPage: [35, 110] },
    sourceStyles: ["ginkgo", "glamour"],
    sourceFiles: ["bizdev-cold-email-shelf-adaf09d24e.pptx", "slot-ppt-p1-product-launch-593836f2.pptx", "slot-ppt-p1-class-competition-7493ac25.pptx"],
  }),

  // Measured from slot-edu-p4-lecture-script-92f0f6c9.pptx,
  // slot-edu-p4-lesson-plan-848d3794.pptx and slot-ppt-p1-sales-pitch-f4d79ed0.pptx.
  freezePack({
    id: "sketchbook-amber", label: "手账涂鸦", palette: AMBER,
    fonts: { major: "Caveat", minor: "LXGW WenKai", eastAsian: "LXGW WenKai", fontScale: 1 },
    surface: { color: "F5EFE3", fullBleedImage: "cover" },
    scrim: { color: "37342E", verticalBands: [92, 80, 66] },
    density: { key: "regular", imagesPerPage: [1, 2], imageAreaFraction: [0.18, 0.32], textCharactersPerPage: [35, 110] },
    sourceStyles: ["linen", "sketch", "ukiyo", "whiteboard"],
    sourceFiles: ["slot-edu-p4-lecture-script-92f0f6c9.pptx", "slot-edu-p4-lesson-plan-848d3794.pptx", "slot-ppt-p1-sales-pitch-f4d79ed0.pptx"],
  }),

  // Measured from meeting--followup-email--archdesign-lavender.pptx and
  // slot-ppt-p2-business-plan-0d98fff3.pptx.
  freezePack({
    id: "mauve-minimal", label: "暮紫极简", palette: MAUVE,
    fonts: { major: "Playfair Display", minor: "Noto Serif SC", eastAsian: "Noto Serif SC", fontScale: 1 },
    surface: { color: "EBDFE6", fullBleedImage: "cover" },
    scrim: { color: "5C4658", verticalBands: [68, 44, 24] },
    density: { key: "airy", imagesPerPage: [1, 2], imageAreaFraction: [0.2, 0.34], textCharactersPerPage: [45, 125] },
    sourceStyles: ["lavender", "basalt"],
    sourceFiles: ["meeting--followup-email--archdesign-lavender.pptx", "slot-ppt-p2-business-plan-0d98fff3.pptx"],
  }),
]);

const PACK_BY_ID = new Map(DECK_PACKS.map((pack) => [pack.id, pack]));

/** Resolve a stable pack id. Unknown or absent ids intentionally select nothing. */
export function packById(id: string | null | undefined): Readonly<DeckPack> | undefined {
  return typeof id === "string" ? PACK_BY_ID.get(id) : undefined;
}
