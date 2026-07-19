export interface ImageEditorSnapshot {
  json: Record<string, unknown>;
  doc: { width: number; height: number };
  canvasBackground: string;
}

export function normalizeImageEditorSnapshot(
  value: unknown,
): ImageEditorSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as {
    json?: unknown;
    doc?: { width?: unknown; height?: unknown };
    canvasBackground?: unknown;
  };
  const width = candidate.doc?.width;
  const height = candidate.doc?.height;
  if (
    !candidate.json ||
    typeof candidate.json !== "object" ||
    Array.isArray(candidate.json) ||
    !Array.isArray((candidate.json as { objects?: unknown }).objects) ||
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    typeof height !== "number" ||
    !Number.isFinite(height) ||
    typeof candidate.canvasBackground !== "string"
  ) {
    return null;
  }
  return {
    json: candidate.json as Record<string, unknown>,
    doc: { width, height },
    canvasBackground: candidate.canvasBackground.slice(0, 100),
  };
}

type Viewport = [number, number, number, number, number, number];

export interface FrozenRasterCanvas {
  viewportTransform: readonly number[];
  setViewportTransform(transform: Viewport): void;
  requestRenderAll(): void;
  toCanvasElement(
    multiplier: number,
    options: {
      left: number;
      top: number;
      width: number;
      height: number;
    },
  ): {
    toBlob(
      callback: (blob: Blob | null) => void,
      mimeType?: string,
      quality?: number,
    ): void;
  };
}

export async function exportFrozenImageDocument(
  canvas: FrozenRasterCanvas,
  doc: { width: number; height: number },
  options: {
    format: "png" | "jpeg" | "webp";
    quality: number;
    multiplier: number;
  },
): Promise<Blob | null> {
  const previous = [...canvas.viewportTransform] as Viewport;
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  let exported: ReturnType<FrozenRasterCanvas["toCanvasElement"]>;
  try {
    exported = canvas.toCanvasElement(options.multiplier, {
      left: 0,
      top: 0,
      width: doc.width,
      height: doc.height,
    });
  } finally {
    canvas.setViewportTransform(previous);
    canvas.requestRenderAll();
  }
  const mime =
    options.format === "jpeg" ? "image/jpeg" : `image/${options.format}`;
  return new Promise<Blob | null>((resolve) => {
    exported.toBlob(resolve, mime, options.quality);
  });
}
