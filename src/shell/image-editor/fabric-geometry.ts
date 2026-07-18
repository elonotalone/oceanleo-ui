import type { DocSize, ImageFitMode } from "./types";

export function imageFitScales(
  image: { width: number; height: number },
  doc: DocSize,
  mode: ImageFitMode,
): { scaleX: number; scaleY: number } {
  const width = Math.max(1, image.width);
  const height = Math.max(1, image.height);
  const scaleX = doc.width / width;
  const scaleY = doc.height / height;
  if (mode === "fill") return { scaleX, scaleY };
  const scale = mode === "cover"
    ? Math.max(scaleX, scaleY)
    : Math.min(scaleX, scaleY);
  return { scaleX: scale, scaleY: scale };
}
