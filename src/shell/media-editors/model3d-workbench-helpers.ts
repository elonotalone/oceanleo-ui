import type { LibraryItem } from "../library-data";
import type { Model3DSourceFormat } from "./model3d-project";

export const clampModel3DValue = (
  value: number,
  minimum: number,
  maximum: number,
) => Math.min(maximum, Math.max(minimum, Number(value)));

export function model3DWorkbenchErrorMessage(
  caught: unknown,
  fallback: string,
): string {
  if (caught instanceof DOMException && caught.name === "AbortError") return "";
  return caught instanceof Error ? caught.message : fallback;
}

export function model3DItemSourceFormat(
  item: LibraryItem,
): Model3DSourceFormat {
  const format = String(item.meta.format || "").toLowerCase();
  if (format === "glb" || format === "gltf") return format;
  const mime = String(item.meta.mime || "").toLowerCase();
  if (mime === "model/gltf+json") return "gltf";
  if (mime === "model/gltf-binary") return "glb";
  return "";
}
