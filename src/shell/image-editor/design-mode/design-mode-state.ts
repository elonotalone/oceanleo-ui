/**
 * The `photo | design` mode pair and the design-only surfaces that hang off it
 * (task criteria 1, 2 and 6).
 *
 * R2 merges the image editor and the design canvas into one editor with two
 * modes. They are two *views over one document*, not two documents: the
 * carrier (`oceanleo.fabric-carrier.v1`) is the same either way, so switching
 * modes must never rewrite the file. That is what `switchEditorMode` below is
 * for, and what the mode-switch tests pin down.
 */

import {
  FABRIC_CARRIER_FORBIDDEN_LICENSES,
  type FabricCarrierAxis,
  type FabricCarrierDocument,
  type FabricCarrierFont,
} from "../fabric-carrier-schema";
import type { DesignGuide } from "./design-mode-geometry";

export type FabricEditorMode = "photo" | "design";

export const FABRIC_EDITOR_MODES: readonly FabricEditorMode[] = Object.freeze([
  "photo",
  "design",
]);

/**
 * Photo mode is the default. A user who opened a single picture should not be
 * met with artboard tabs and rulers; design mode is the deliberate step up.
 */
export const FABRIC_EDITOR_DEFAULT_MODE: FabricEditorMode = "photo";

export interface DesignModeState {
  mode: FabricEditorMode;
  activeArtboardId: string | null;
  rulerVisible: boolean;
  guidesVisible: boolean;
  guidesLocked: boolean;
  snapEnabled: boolean;
  zoom: number;
  guides: readonly DesignGuide[];
}

export const DESIGN_MODE_INITIAL_STATE: Readonly<DesignModeState> = Object.freeze({
  mode: FABRIC_EDITOR_DEFAULT_MODE,
  activeArtboardId: null,
  rulerVisible: false,
  guidesVisible: true,
  guidesLocked: false,
  snapEnabled: true,
  zoom: 1,
  guides: Object.freeze([]) as readonly DesignGuide[],
});

/**
 * Rulers and artboard tabs belong to design mode; photo mode keeps the frame
 * clear. Guides that were placed in design mode are kept in state (just not
 * shown) so that switching back does not throw the user's work away.
 */
export function switchEditorMode(
  state: DesignModeState,
  mode: FabricEditorMode,
): DesignModeState {
  if (state.mode === mode) return state;
  return { ...state, mode, rulerVisible: mode === "design" };
}

/** Modes are views, so nothing about the document may change when switching. */
export function modeSwitchPreservesCarrier(
  before: FabricCarrierDocument,
  after: FabricCarrierDocument,
): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

export interface ArtboardSummary {
  id: string;
  page: number;
  name: string;
  width: number;
  height: number;
  objectCount: number;
  slotCount: number;
}

export function artboardSummaries(
  carrier: FabricCarrierDocument,
): ArtboardSummary[] {
  return carrier.artboards
    .map((artboard) => ({
      id: artboard.id,
      page: artboard.page,
      name: artboard.name ?? `画板 ${artboard.page}`,
      width: artboard.width,
      height: artboard.height,
      objectCount: artboard.fabric.objects.length,
      slotCount: carrier.slots.filter((slot) => slot.page === artboard.page).length,
    }))
    .sort((left, right) => left.page - right.page);
}

/**
 * Design mode addresses artboards by id, but slots address them by `page`
 * (that column is shared with `wash_slots`). Resolving one to the other in a
 * single place keeps that mapping from being re-derived, and differently, all
 * over the UI.
 */
export function artboardPageForId(
  carrier: FabricCarrierDocument,
  artboardId: string,
): number | null {
  const artboard = carrier.artboards.find((entry) => entry.id === artboardId);
  return artboard ? artboard.page : null;
}

export interface GroupTextTarget {
  artboardId: string;
  /** Path of object indices from the artboard down to the text object. */
  path: readonly number[];
  text: string;
  objectId: string;
}

/**
 * Finds text objects nested inside groups so they can be edited in place
 * rather than only after ungrouping — the "成组内文字编辑" item of criterion 2.
 *
 * Fabric serialises a group's children under `objects`, so the search has to
 * recurse; a flat scan silently misses every grouped caption, which is exactly
 * the case this feature exists for.
 */
export function findGroupTextTargets(
  carrier: FabricCarrierDocument,
): GroupTextTarget[] {
  const targets: GroupTextTarget[] = [];
  const textTypes = new Set(["textbox", "i-text", "text"]);

  const visit = (
    artboardId: string,
    objects: readonly unknown[],
    path: readonly number[],
    insideGroup: boolean,
  ): void => {
    objects.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) return;
      const object = entry as Record<string, unknown>;
      const type = typeof object.type === "string" ? object.type : "";
      const here = [...path, index];
      if (Array.isArray(object.objects)) {
        visit(artboardId, object.objects, here, true);
        return;
      }
      if (!insideGroup || !textTypes.has(type)) return;
      targets.push({
        artboardId,
        path: here,
        text: typeof object.text === "string" ? object.text : "",
        objectId: typeof object.oceanleoId === "string" ? object.oceanleoId : "",
      });
    });
  };

  for (const artboard of carrier.artboards) {
    visit(artboard.id, artboard.fabric.objects, [], false);
  }
  return targets;
}

export type WatermarkPlacement =
  | "tile"
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface WatermarkOptions {
  text: string;
  placement?: WatermarkPlacement;
  fontSize?: number;
  color?: string;
  opacity?: number;
  angle?: number;
  /** Tile spacing as a multiple of the stamp's own size. */
  spacing?: number;
  margin?: number;
}

export interface WatermarkStamp {
  left: number;
  top: number;
  angle: number;
  text: string;
  fontSize: number;
  fill: string;
  opacity: number;
  originX: "center";
  originY: "center";
  selectable: false;
  evented: false;
  oceanleoAxis: FabricCarrierAxis;
}

export const WATERMARK_DEFAULTS = Object.freeze({
  placement: "tile" as WatermarkPlacement,
  fontSize: 24,
  color: "#000000",
  opacity: 0.15,
  angle: -30,
  spacing: 2.5,
  margin: 24,
});

/**
 * Produces plain stamp descriptors rather than Fabric objects, so watermark
 * layout can be asserted on directly.
 *
 * Stamps are marked `axis: "skin"`: a watermark is not part of the document's
 * structure, and a reskin is entitled to drop or restyle it. Marking it
 * `structure` would freeze it into every derived template.
 */
export function watermarkStamps(
  artboard: { width: number; height: number },
  options: WatermarkOptions,
): WatermarkStamp[] {
  const text = options.text.trim();
  if (text.length === 0) return [];

  const fontSize = options.fontSize ?? WATERMARK_DEFAULTS.fontSize;
  const angle = options.angle ?? WATERMARK_DEFAULTS.angle;
  const fill = options.color ?? WATERMARK_DEFAULTS.color;
  const opacity = options.opacity ?? WATERMARK_DEFAULTS.opacity;
  const margin = options.margin ?? WATERMARK_DEFAULTS.margin;
  const placement = options.placement ?? WATERMARK_DEFAULTS.placement;

  const stamp = (left: number, top: number): WatermarkStamp => ({
    left,
    top,
    angle,
    text,
    fontSize,
    fill,
    opacity,
    originX: "center",
    originY: "center",
    selectable: false,
    evented: false,
    oceanleoAxis: "skin",
  });

  if (placement !== "tile") {
    const insetX = margin + (fontSize * text.length) / 4;
    const insetY = margin + fontSize / 2;
    const positions: Record<Exclude<WatermarkPlacement, "tile">, [number, number]> = {
      center: [artboard.width / 2, artboard.height / 2],
      "top-left": [insetX, insetY],
      "top-right": [artboard.width - insetX, insetY],
      "bottom-left": [insetX, artboard.height - insetY],
      "bottom-right": [artboard.width - insetX, artboard.height - insetY],
    };
    const [left, top] = positions[placement];
    return [stamp(left, top)];
  }

  // Tile density follows the stamp's own size, so the pattern keeps its
  // spacing on a 1080-wide social image and on a 2480-wide A4 poster alike.
  const spacing = Math.max(1, options.spacing ?? WATERMARK_DEFAULTS.spacing);
  const wantX = Math.max(fontSize * spacing * Math.max(text.length, 1) * 0.6, fontSize);
  const wantY = Math.max(fontSize * spacing, fontSize);
  const columns = Math.max(1, Math.ceil(artboard.width / wantX));
  const rows = Math.max(1, Math.ceil(artboard.height / wantY));
  // The desired step rarely divides the artboard exactly. Spreading the
  // remainder across the grid keeps every stamp on the canvas; stepping by the
  // desired size instead pushes the last column past the right edge, where it
  // is clipped and the pattern looks lopsided.
  const stepX = artboard.width / columns;
  const stepY = artboard.height / rows;

  const stamps: WatermarkStamp[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      stamps.push(
        stamp((column + 0.5) * stepX, (row + 0.5) * stepY),
      );
    }
  }
  return stamps;
}

export interface FontLoadOutcome {
  ref: string;
  family: string;
  loaded: boolean;
  reason?: "no-source" | "forbidden-license" | "load-failed";
}

export interface FontLoader {
  (descriptor: {
    family: string;
    url: string;
    weight: number;
  }): Promise<boolean>;
}

/**
 * Loads the carrier's font table through an injected loader.
 *
 * The loader is a parameter because `FontFace` only exists in a browser; with
 * it injected, the licence gate and the failure reporting below can be tested
 * here rather than only in a browser we are not allowed to drive (§2 rule 5).
 *
 * Forbidden licences are refused before any network request: the carrier
 * forbids share-alike fonts in composed output, and a font that has already
 * been fetched and applied is one that has already leaked into an export.
 */
export async function loadCarrierFonts(
  fonts: readonly FabricCarrierFont[],
  options: { assetBaseUrl: string; load: FontLoader },
): Promise<FontLoadOutcome[]> {
  const outcomes: FontLoadOutcome[] = [];
  for (const font of fonts) {
    if ((FABRIC_CARRIER_FORBIDDEN_LICENSES as readonly string[]).includes(font.license)) {
      outcomes.push({
        ref: font.ref,
        family: font.family,
        loaded: false,
        reason: "forbidden-license",
      });
      continue;
    }

    const url =
      font.source_url ??
      (font.asset_key
        ? `${options.assetBaseUrl.replace(/\/+$/, "")}/${font.asset_key.replace(/^\/+/, "")}`
        : "");
    if (url.length === 0) {
      outcomes.push({
        ref: font.ref,
        family: font.family,
        loaded: false,
        reason: "no-source",
      });
      continue;
    }

    const weights = font.weights?.length ? font.weights : [400];
    let loaded = true;
    for (const weight of weights) {
      // Sequential on purpose: these all hit the same origin, and a font that
      // fails should not be reported as loaded because a sibling weight was.
      // eslint-disable-next-line no-await-in-loop
      const ok = await options.load({ family: font.family, url, weight });
      if (!ok) loaded = false;
    }
    outcomes.push({
      ref: font.ref,
      family: font.family,
      loaded,
      ...(loaded ? {} : { reason: "load-failed" as const }),
    });
  }
  return outcomes;
}
