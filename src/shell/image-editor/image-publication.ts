import { yieldToEditor } from "../editor-publish-yield";
import type { FabricObject } from "fabric";
import type { EditorSnapshot } from "./editor-runtime";
import { createFabricImageProject, resolveFabricImageWorkingCopy } from "./editor-persistence";
import { installFabricFontShaping } from "./fabric-font-shaping";
import { prepareEditorFonts } from "./editor-fonts";
import { exportVectorSvg } from "./vector-svg-scene";

/** Detached publication rendering. Preparation keeps only the owned JSON scene. */
export async function renderImagePublication(snapshot: EditorSnapshot, vector = false): Promise<{ preview: Blob; svg?: string }> {
  await yieldToEditor();
  const fabric = await import("fabric");
  installFabricFontShaping(fabric);
  const fresh = await resolveFabricImageWorkingCopy(createFabricImageProject(snapshot));
  await prepareEditorFonts(fresh.snapshot.json.objects as Record<string, unknown>[], () => fabric.cache.clearFontCache());
  const { width, height } = snapshot.doc;
  const canvas = new fabric.StaticCanvas(undefined, { width, height, enableRetinaScaling: false, renderOnAddRemove: false });
  // No scheduled full-frame render may escape the bounded tile loop below.
  canvas.requestRenderAll = () => canvas;
  const output = document.createElement("canvas");
  output.width = width; output.height = height;
  try {
    const context = output.getContext("2d");
    if (!context) throw new Error("当前画布无法生成静态 preview");
    await canvas.loadFromJSON({ ...fresh.snapshot.json, objects: [] });
    let sliceAt = performance.now();
    for (const json of fresh.snapshot.json.objects as Record<string, unknown>[]) {
      const objects = await fabric.util.enlivenObjects<FabricObject>([json]);
      for (const object of objects) {
        const uncached = (entry: typeof object): void => {
          entry.objectCaching = false;
          if ("getObjects" in entry && typeof entry.getObjects === "function") entry.getObjects().forEach(uncached);
        };
        uncached(object);
        canvas.add(object);
      }
      if (performance.now() - sliceAt >= 8) { await yieldToEditor(); sliceAt = performance.now(); }
    }
    await yieldToEditor();
    const svg = vector ? exportVectorSvg(canvas, snapshot.doc) : undefined;
    // Each tile is at most 128K pixels, even for an 8192px document. Releasing
    // each tile also avoids retaining a second full-size bitmap during encode.
    for (let top = 0; top < height; top += 256) {
      for (let left = 0; left < width; left += 512) {
        await yieldToEditor();
        const tile = canvas.toCanvasElement(1, { left, top, width: Math.min(512, width - left), height: Math.min(256, height - top) });
        context.drawImage(tile, left, top);
        tile.width = 0; tile.height = 0;
      }
    }
    await yieldToEditor();
    const preview = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/png"));
    if (!preview) throw new Error("当前画布无法生成静态 preview");
    return { preview, svg };
  } finally {
    output.width = 0; output.height = 0;
    await canvas.dispose();
  }
}
