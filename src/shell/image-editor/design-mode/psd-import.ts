/**
 * PSD import: `ag-psd` layers → carrier slots + Fabric 6 object descriptors
 * (task criterion 2, "PSD 导入用现有 ag-psd 映射为图层对象").
 *
 * Pure data in, pure data out. Rasterising a layer needs a canvas, which this
 * machine cannot give Node, so the caller hydrates images from `layerImages`
 * and this module stays testable.
 *
 * The output is a `oceanleo.fabric-carrier.v1` document and it is validated
 * against that schema by the tests — an importer whose output its own
 * validator rejects is worse than no importer, because the failure surfaces
 * only once a user has already opened a file.
 */

import {
  FABRIC_CARRIER_CONSTANTS,
  FABRIC_CARRIER_SCHEMA_ID,
  type FabricCarrierArtboard,
  type FabricCarrierDocument,
  type FabricCarrierFont,
  type FabricCarrierSlot,
  type FabricCarrierSlotKind,
} from "../fabric-carrier-schema";

/**
 * The slice of `ag-psd`'s `Layer` this importer reads.
 *
 * Declared structurally instead of importing ag-psd's own types so that the
 * import path stays a plain data contract: tests can hand it a literal, and
 * nothing here depends on a PSD parser being loadable.
 */
export interface PsdLayerInput {
  name?: string;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  /** ag-psd reports opacity as 0..1, verified by round-trip (see tests). */
  opacity?: number;
  hidden?: boolean;
  blendMode?: string;
  text?: {
    text?: string;
    style?: {
      font?: { name?: string };
      fontSize?: number;
      fillColor?: { r?: number; g?: number; b?: number };
    };
  };
  canvas?: { width?: number; height?: number };
  children?: PsdLayerInput[];
  placedLayer?: unknown;
}

export interface PsdDocumentInput {
  width: number;
  height: number;
  children?: PsdLayerInput[];
  imageResources?: { resolutionInfo?: { horizontalResolution?: number } };
}

export type PsdImportWarningCode =
  | "empty-layer"
  | "zero-size-layer"
  | "clamped-dpi"
  | "unknown-font-license"
  | "clamped-artboard";

export interface PsdImportWarning {
  code: PsdImportWarningCode;
  detail: string;
}

export interface PsdImportResult {
  carrier: FabricCarrierDocument;
  /** Object id → layer to rasterise; the caller turns these into data URLs. */
  pendingImages: Map<string, PsdLayerInput>;
  warnings: PsdImportWarning[];
}

/**
 * PSD has no notion of our two axes, so everything imported is structure.
 * Guessing which layers are "skin" from names or z-order would silently
 * mis-file a user's document; the design mode lets them mark it explicitly.
 */
const IMPORTED_AXIS = "structure" as const;

function hex(component: number | undefined): string {
  const value = Math.max(0, Math.min(255, Math.round(component ?? 0)));
  return value.toString(16).padStart(2, "0");
}

function rgbToHex(color: { r?: number; g?: number; b?: number }): string {
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

/**
 * `oceanleoId` is generated the same way as `editor-objects.makeId()` so
 * imported objects are indistinguishable from ones drawn in the editor. The
 * counter suffix keeps ids unique inside a single import even if `Math.random`
 * repeats, which it does more often than people expect in a tight loop.
 */
function makeObjectId(sequence: number): string {
  return `${Math.random().toString(36).slice(2, 8)}${sequence.toString(36).padStart(2, "0")}`;
}

function slotKeyFor(kind: FabricCarrierSlotKind, sequence: number, used: Set<string>): string {
  const base = `${kind}_${sequence.toString().padStart(3, "0")}`;
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * A PSD group becomes one `smartobject` slot, not a pile of loose layers:
 * groups are how designers express "this belongs together", and flattening
 * them throws that away. Its children are kept as nested Fabric objects, which
 * is also what makes in-group text editing (criterion 2) reachable afterwards.
 */
function layerKind(layer: PsdLayerInput): FabricCarrierSlotKind {
  if (layer.text) return "text";
  if (layer.children?.length) return "smartobject";
  return "pixel";
}

interface Built {
  slots: FabricCarrierSlot[];
  objects: Record<string, unknown>[];
  pending: Map<string, PsdLayerInput>;
  warnings: PsdImportWarning[];
}

function buildLayers(
  layers: readonly PsdLayerInput[],
  fontRefs: Map<string, string>,
  used: Set<string>,
  state: { sequence: number },
  built: Built,
  nested: boolean,
): Record<string, unknown>[] {
  const produced: Record<string, unknown>[] = [];

  for (const layer of layers) {
    if (layer.hidden) continue;

    const left = layer.left ?? 0;
    const top = layer.top ?? 0;
    const right = layer.right ?? left + (layer.canvas?.width ?? 0);
    const bottom = layer.bottom ?? top + (layer.canvas?.height ?? 0);
    const width = right - left;
    const height = bottom - top;
    const kind = layerKind(layer);

    if (width <= 0 || height <= 0) {
      built.warnings.push({
        code: "zero-size-layer",
        detail: `图层「${layer.name ?? "未命名"}」宽高为 ${width}×${height}，已跳过`,
      });
      continue;
    }

    state.sequence += 1;
    const objectId = makeObjectId(state.sequence);
    const slotKey = slotKeyFor(kind, state.sequence, used);
    // ag-psd hands back 0..1; the draft this replaced divided by 255 and made
    // every layer 0.4% opaque. Round-tripped in the tests to keep it honest.
    const opacity = Math.min(1, Math.max(0, layer.opacity ?? 1));

    const slot: FabricCarrierSlot = {
      slot_key: slotKey,
      kind,
      bbox: { left, top, right, bottom, width, height },
      page: FABRIC_CARRIER_CONSTANTS.firstPage,
      locked: false,
      object_id: objectId,
      axis: IMPORTED_AXIS,
    };

    let object: Record<string, unknown>;

    if (kind === "text") {
      const text = layer.text?.text ?? "";
      slot.text = text.slice(0, FABRIC_CARRIER_CONSTANTS.maximumSlotTextLength);
      const family = layer.text?.style?.font?.name;
      if (family && !fontRefs.has(family)) {
        fontRefs.set(
          family,
          `f-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "psd-font"}`,
        );
      }
      // No `font_ref` is written: the carrier requires every referenced font to
      // appear in `fonts[]` with a known licence, and a PSD tells us neither.
      // The family still rides along on the Fabric object, which is what
      // actually renders; the warning tells the user to re-point it at a
      // licensed face.
      object = {
        type: "textbox",
        left,
        top,
        width,
        height,
        text,
        fontSize: layer.text?.style?.fontSize ?? 16,
        fontFamily: family ?? "sans-serif",
        fill: layer.text?.style?.fillColor
          ? rgbToHex(layer.text.style.fillColor)
          : "#000000",
        opacity,
        oceanleoId: objectId,
        oceanleoSlotKey: slotKey,
        oceanleoAxis: IMPORTED_AXIS,
        oceanleoKind: "text",
      };
    } else if (kind === "smartobject") {
      object = {
        type: "group",
        left,
        top,
        width,
        height,
        opacity,
        objects: buildLayers(
          layer.children ?? [],
          fontRefs,
          used,
          state,
          built,
          true,
        ),
        oceanleoId: objectId,
        oceanleoSlotKey: slotKey,
        oceanleoAxis: IMPORTED_AXIS,
        oceanleoKind: "smartobject",
      };
    } else {
      built.pending.set(objectId, layer);
      object = {
        type: "image",
        left,
        top,
        width,
        height,
        opacity,
        oceanleoId: objectId,
        oceanleoSlotKey: slotKey,
        oceanleoAxis: IMPORTED_AXIS,
        oceanleoKind: "pixel",
      };
    }

    // Only top-level layers get slots. The carrier requires every
    // `slots[].object_id` to be a top-level object on its page, so a slot for a
    // group's child would make the document fail its own validation; the group
    // carries one `smartobject` slot on behalf of its contents, and the nested
    // objects remain individually addressable through `findGroupTextTargets`.
    if (!nested) {
      built.slots.push(slot);
      built.objects.push(object);
    }
    produced.push(object);
  }

  return produced;
}

/**
 * `alpha_ratio` is the transparent-pixel share, and computing it needs the
 * decoded pixels. The caller supplies them once it has rasterised a layer;
 * the value is deliberately absent rather than defaulted, because `0` would
 * assert "this layer is fully opaque" on no evidence and would then be read
 * as "not a cutout slot" by the asset pipelines.
 */
export function attachAlphaRatio(
  carrier: FabricCarrierDocument,
  ratios: ReadonlyMap<string, number>,
): FabricCarrierDocument {
  return {
    ...carrier,
    slots: carrier.slots.map((slot) => {
      const ratio = ratios.get(slot.object_id);
      if (slot.kind !== "pixel" || ratio === undefined) return slot;
      return {
        ...slot,
        alpha_ratio: Math.min(1, Math.max(0, Math.round(ratio * 10_000) / 10_000)),
      };
    }),
  };
}

export function importPsdToCarrier(
  psd: PsdDocumentInput,
  options: { title?: string } = {},
): PsdImportResult {
  const built: Built = { slots: [], objects: [], pending: new Map(), warnings: [] };
  const fontRefs = new Map<string, string>();

  buildLayers(psd.children ?? [], fontRefs, new Set<string>(), { sequence: 0 }, built, false);

  if (built.slots.length === 0) {
    built.warnings.push({
      code: "empty-layer",
      detail: "PSD 里没有可见图层，导入结果是一块空画板",
    });
  }

  // The carrier caps dpi at 72..600; PSDs regularly carry 1200 for print.
  // Clamping with a warning beats emitting a document our own validator
  // rejects, and beats silently pretending the file was 96 dpi.
  const rawDpi = psd.imageResources?.resolutionInfo?.horizontalResolution;
  let dpi: number = FABRIC_CARRIER_CONSTANTS.dpi.fallback;
  if (typeof rawDpi === "number" && Number.isFinite(rawDpi)) {
    dpi = Math.round(
      Math.min(
        FABRIC_CARRIER_CONSTANTS.dpi.maximum,
        Math.max(FABRIC_CARRIER_CONSTANTS.dpi.minimum, rawDpi),
      ),
    );
    if (dpi !== Math.round(rawDpi)) {
      built.warnings.push({
        code: "clamped-dpi",
        detail: `PSD 标称 ${rawDpi} dpi，超出载体允许的 ${FABRIC_CARRIER_CONSTANTS.dpi.minimum}–${FABRIC_CARRIER_CONSTANTS.dpi.maximum}，已取 ${dpi}`,
      });
    }
  }

  const edge = FABRIC_CARRIER_CONSTANTS.artboardEdge;
  const width = Math.round(Math.min(edge.maximum, Math.max(edge.minimum, psd.width)));
  const height = Math.round(Math.min(edge.maximum, Math.max(edge.minimum, psd.height)));
  if (width !== Math.round(psd.width) || height !== Math.round(psd.height)) {
    built.warnings.push({
      code: "clamped-artboard",
      detail: `PSD 画布 ${psd.width}×${psd.height} 超出载体允许的 ${edge.minimum}–${edge.maximum}，已取 ${width}×${height}`,
    });
  }

  /**
   * Every PSD font is reported with an unknown licence rather than being
   * stamped `OFL`. The draft this replaces hard-coded `OFL` for anything a PSD
   * mentioned, which turns the carrier's licence field — whose whole job is to
   * keep share-alike faces out of composed output — into a rubber stamp. An
   * unresolved font is a warning the operator can act on.
   */
  const fonts: FabricCarrierFont[] = [];
  for (const [family] of fontRefs) {
    built.warnings.push({
      code: "unknown-font-license",
      detail: `PSD 字体「${family}」来源与授权未知，未写入 fonts[]；请在设计模式里改挂 platform_assets 的授权字体`,
    });
  }

  const artboard: FabricCarrierArtboard = {
    id: "ab-01",
    page: FABRIC_CARRIER_CONSTANTS.firstPage,
    width,
    height,
    background: "#ffffff",
    fabric: { version: "6.9.1", objects: built.objects },
  };

  const carrier: FabricCarrierDocument = {
    schema: FABRIC_CARRIER_SCHEMA_ID,
    version: 1,
    title: (options.title ?? "导入的 PSD").slice(0, 300),
    generator: {
      name: "W04.psd-import",
      version: "1",
      source: "psd-import",
    },
    doc: { units: "px", dpi, color_space: "sRGB" },
    artboards: [artboard],
    slots: built.slots,
    fonts,
  };

  return { carrier, pendingImages: built.pending, warnings: built.warnings };
}
