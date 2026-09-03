/**
 * PSD import via ag-psd — maps PSD layers to Fabric 6 objects with carrier
 * slot metadata (W04 task criterion 2: "ag-psd 导入映射为图层对象").
 *
 * This module is pure data transformation: it reads a PSD structure (from
 * `ag-psd`'s `readPsd`) and produces a `FabricCarrierDocument` plus Fabric
 * object descriptors. It does NOT instantiate Fabric objects at import time
 * — the caller (`FabricEditorController`) hydrates them on the canvas.
 *
 * The carrier spec requires `slots[].bbox` to carry all six keys and be
 * self-consistent (`width == right - left`, `height == bottom - top`).
 */

import type {
  FabricCarrierDocument,
  FabricCarrierArtboard,
  FabricCarrierSlot,
  FabricCarrierFont,
} from "../fabric-carrier-schema";
import {
  FABRIC_CARRIER_SCHEMA_ID,
  FABRIC_CARRIER_CONSTANTS,
} from "../fabric-carrier-schema";

export interface PsdLayer {
  name?: string;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  opacity?: number;
  hidden?: boolean;
  blendMode?: string;
  text?: {
    text: string;
    style?: {
      font?: { name?: string };
      fontSize?: number;
      fillColor?: { r: number; g: number; b: number; a?: number };
    };
  };
  canvas?: { width: number; height: number; toDataURL?: (type?: string) => string };
  children?: PsdLayer[];
  mask?: unknown;
}

export interface PsdDocument {
  width: number;
  height: number;
  children?: PsdLayer[];
  imageResources?: {
    resolutionInfo?: { horizontalResolution?: number };
  };
}

export interface PsdImportResult {
  carrier: FabricCarrierDocument;
  layerImages: Map<string, string>;
  warnings: string[];
}

let slotCounter = 0;
function nextSlotKey(prefix: string): string {
  return `${prefix}_${(++slotCounter).toString(36).padStart(3, "0")}`;
}

function makeObjectId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function computeAlphaRatio(canvas: { width: number; height: number; getContext?: (type: string) => unknown } | undefined): number | undefined {
  if (!canvas || !canvas.getContext) return undefined;
  try {
    const ctx = canvas.getContext("2d") as { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } } | null;
    if (!ctx) return undefined;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let transparent = 0;
    const total = data.length / 4;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) transparent++;
    }
    return total > 0 ? transparent / total : 0;
  } catch {
    return undefined;
  }
}

function inferSlotKind(layer: PsdLayer): "text" | "pixel" | "shape" | "smartobject" {
  if (layer.text) return "text";
  if (layer.children?.length) return "smartobject";
  return "pixel";
}

function flattenLayers(layers: PsdLayer[], result: PsdLayer[] = []): PsdLayer[] {
  for (const layer of layers) {
    if (layer.hidden) continue;
    if (layer.children?.length) {
      flattenLayers(layer.children, result);
    } else {
      result.push(layer);
    }
  }
  return result;
}

export function importPsdToCarrier(psd: PsdDocument): PsdImportResult {
  slotCounter = 0;
  const warnings: string[] = [];
  const layerImages = new Map<string, string>();
  const dpi = psd.imageResources?.resolutionInfo?.horizontalResolution ?? 96;

  const slots: FabricCarrierSlot[] = [];
  const fabricObjects: Record<string, unknown>[] = [];
  const fontRefs = new Map<string, { family: string; ref: string }>();

  const flatLayers = flattenLayers(psd.children || []);

  for (const layer of flatLayers) {
    const objectId = makeObjectId();
    const kind = inferSlotKind(layer);
    const left = layer.left ?? 0;
    const top = layer.top ?? 0;
    const right = layer.right ?? (left + (layer.canvas?.width ?? 0));
    const bottom = layer.bottom ?? (top + (layer.canvas?.height ?? 0));
    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) {
      warnings.push(`Skipped zero-size layer: ${layer.name || "(unnamed)"}`);
      continue;
    }

    const slotKey = nextSlotKey(kind);
    const alphaRatio = kind === "pixel" ? computeAlphaRatio(layer.canvas as Parameters<typeof computeAlphaRatio>[0]) : undefined;

    const slot: FabricCarrierSlot = {
      slot_key: slotKey,
      kind,
      bbox: { left, top, right, bottom, width, height },
      page: 1,
      locked: false,
      object_id: objectId,
      axis: kind === "text" ? "structure" : "structure",
    };

    if (alphaRatio !== undefined) {
      slot.alpha_ratio = Math.round(alphaRatio * 10000) / 10000;
    }

    if (kind === "text" && layer.text) {
      slot.text = layer.text.text;
      const fontName = layer.text.style?.font?.name;
      if (fontName && !fontRefs.has(fontName)) {
        const ref = `f-${fontName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
        fontRefs.set(fontName, { family: fontName, ref });
      }
      if (fontName) {
        slot.font_ref = fontRefs.get(fontName)!.ref;
      }
    }

    slots.push(slot);

    // Build Fabric object descriptor
    if (kind === "text" && layer.text) {
      const fill = layer.text.style?.fillColor
        ? rgbToHex(layer.text.style.fillColor.r, layer.text.style.fillColor.g, layer.text.style.fillColor.b)
        : "#000000";
      fabricObjects.push({
        type: "textbox",
        left,
        top,
        width,
        height,
        text: layer.text.text,
        fontSize: layer.text.style?.fontSize ?? 16,
        fontFamily: layer.text.style?.font?.name ?? "sans-serif",
        fill,
        opacity: (layer.opacity ?? 255) / 255,
        oceanleoId: objectId,
        oceanleoSlotKey: slotKey,
        oceanleoAxis: "structure",
        oceanleoKind: "text",
      });
    } else {
      // Image layer — caller must load the image data URL from layerImages map
      const dataUrl = layer.canvas?.toDataURL?.("image/png") ?? "";
      if (dataUrl) {
        layerImages.set(objectId, dataUrl);
      }
      fabricObjects.push({
        type: "image",
        left,
        top,
        width,
        height,
        scaleX: 1,
        scaleY: 1,
        opacity: (layer.opacity ?? 255) / 255,
        oceanleoId: objectId,
        oceanleoSlotKey: slotKey,
        oceanleoAxis: "structure",
        oceanleoKind: kind,
        src: "", // placeholder — caller replaces with loaded image
      });
    }
  }

  const fonts: FabricCarrierFont[] = Array.from(fontRefs.values()).map((f) => ({
    ref: f.ref,
    family: f.family,
    license: "OFL" as const,
  }));

  const carrier: FabricCarrierDocument = {
    schema: FABRIC_CARRIER_SCHEMA_ID,
    version: 1,
    title: "Imported PSD",
    doc: { units: "px", dpi, color_space: "sRGB" },
    artboards: [
      {
        id: "ab-01",
        page: 1,
        width: psd.width,
        height: psd.height,
        background: "#ffffff",
        fabric: {
          version: "6.9.1",
          objects: fabricObjects,
        },
      },
    ],
    slots,
    fonts,
  };

  return { carrier, layerImages, warnings };
}
