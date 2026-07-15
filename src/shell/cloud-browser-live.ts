"use client";

import { useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const DEFAULT_FRAME_SIZE = { width: 1280, height: 800 };

type LiveFrameMeta = {
  sequence?: number;
  width?: number;
  height?: number;
  capturedAtMs?: number;
};
type FrameBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type PendingBlobFrame = {
  blob: Blob;
  meta: LiveFrameMeta | null;
  generation: number;
};

export function pointInContainedFrame(
  clientX: number,
  clientY: number,
  bounds: FrameBounds,
  frameSize: { width: number; height: number },
): { nx: number; ny: number } | null {
  const finite = [
    clientX,
    clientY,
    bounds.width,
    bounds.height,
    frameSize.width,
    frameSize.height,
  ].every(Number.isFinite);
  if (
    !finite ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    frameSize.width <= 0 ||
    frameSize.height <= 0
  ) {
    return null;
  }
  const scale = Math.min(
    bounds.width / frameSize.width,
    bounds.height / frameSize.height,
  );
  const contentWidth = frameSize.width * scale;
  const contentHeight = frameSize.height * scale;
  const contentLeft = bounds.left + (bounds.width - contentWidth) / 2;
  const contentTop = bounds.top + (bounds.height - contentHeight) / 2;
  const x = clientX - contentLeft;
  const y = clientY - contentTop;
  if (x < 0 || y < 0 || x > contentWidth || y > contentHeight) return null;
  return {
    nx: Math.max(0, Math.min(1, x / contentWidth)),
    ny: Math.max(0, Math.min(1, y / contentHeight)),
  };
}

export function normalizedHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function frameMetaFromMessage(
  message: Record<string, unknown>,
): LiveFrameMeta {
  const finitePositive = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  return {
    sequence: finitePositive(message.sequence ?? message.seq),
    width: finitePositive(message.width ?? message.w),
    height: finitePositive(message.height ?? message.h),
    capturedAtMs: finitePositive(
      message.captured_at_ms ?? message.capturedAtMs,
    ),
  };
}

export function playwrightKey(
  event: ReactKeyboardEvent<HTMLCanvasElement>,
): string {
  const aliases: Record<string, string> = {
    Esc: "Escape",
    Spacebar: "Space",
    " ": "Space",
    Left: "ArrowLeft",
    Right: "ArrowRight",
    Up: "ArrowUp",
    Down: "ArrowDown",
  };
  let key = aliases[event.key] || event.key;
  if (key.length === 1) key = key.toUpperCase();
  const parts: string[] = [];
  if (event.ctrlKey && key !== "Control") parts.push("Control");
  if (event.metaKey && key !== "Meta") parts.push("Meta");
  if (event.altKey && key !== "Alt") parts.push("Alt");
  if (event.shiftKey && key !== "Shift") parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function useCloudBrowserFramePainter() {
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const frameDecodeGenerationRef = useRef(0);
  const frameDecodeBusyRef = useRef(false);
  const pendingBlobFrameRef = useRef<PendingBlobFrame | null>(null);
  const frameSizeRef = useRef(DEFAULT_FRAME_SIZE);
  const pendingFrameMetaRef = useRef<LiveFrameMeta | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const cancelFrameDecode = useCallback((clearCanvas = false) => {
    ++frameDecodeGenerationRef.current;
    pendingFrameMetaRef.current = null;
    pendingBlobFrameRef.current = null;
    const image = frameImageRef.current;
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    }
    if (clearCanvas) {
      const canvas = canvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      frameSizeRef.current = DEFAULT_FRAME_SIZE;
    }
  }, []);

  const paintFrame = useCallback(
    (
      image: CanvasImageSource,
      naturalWidth: number,
      naturalHeight: number,
      meta: LiveFrameMeta | null,
    ) => {
      const canvas = canvasRef.current;
      const width =
        naturalWidth || meta?.width || DEFAULT_FRAME_SIZE.width;
      const height =
        naturalHeight || meta?.height || DEFAULT_FRAME_SIZE.height;
      if (!canvas || width <= 0 || height <= 0) return;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      frameSizeRef.current = { width, height };
      if (meta?.sequence) {
        canvas.dataset.frameSequence = String(meta.sequence);
      }
      if (meta?.capturedAtMs) {
        canvas.dataset.captureToPaintMs = String(
          Math.max(0, Math.round(Date.now() - meta.capturedAtMs)),
        );
      }
    },
    [],
  );

  const drawFrameSource = useCallback(
    (source: string, meta: LiveFrameMeta | null) => {
      cancelFrameDecode(false);
      if (document.visibilityState === "hidden") return;
      const generation = frameDecodeGenerationRef.current;
      const image = frameImageRef.current || new Image();
      frameImageRef.current = image;
      image.decoding = "async";
      const release = () => {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      };
      image.onload = () => {
        if (generation === frameDecodeGenerationRef.current) {
          paintFrame(image, image.naturalWidth, image.naturalHeight, meta);
        }
        release();
      };
      image.onerror = release;
      image.src = source;
    },
    [cancelFrameDecode, paintFrame],
  );

  const pumpBlobFrames = useCallback(async () => {
    if (frameDecodeBusyRef.current) return;
    frameDecodeBusyRef.current = true;
    try {
      while (pendingBlobFrameRef.current) {
        const pending = pendingBlobFrameRef.current;
        pendingBlobFrameRef.current = null;
        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await createImageBitmap(pending.blob);
          if (
            pending.generation === frameDecodeGenerationRef.current &&
            document.visibilityState !== "hidden"
          ) {
            paintFrame(bitmap, bitmap.width, bitmap.height, pending.meta);
          }
        } catch {
          // Corrupt/truncated frames are dropped without closing the socket.
        } finally {
          bitmap?.close();
        }
      }
    } finally {
      frameDecodeBusyRef.current = false;
    }
  }, [paintFrame]);

  const drawBlobFrame = useCallback(
    (value: Blob) => {
      const meta = pendingFrameMetaRef.current;
      pendingFrameMetaRef.current = null;
      if (document.visibilityState === "hidden") return;
      pendingBlobFrameRef.current = {
        blob:
          value.type === "image/jpeg"
            ? value
            : new Blob([value], { type: "image/jpeg" }),
        meta,
        generation: frameDecodeGenerationRef.current,
      };
      void pumpBlobFrames();
    },
    [pumpBlobFrames],
  );

  const acceptFrameMeta = useCallback((message: Record<string, unknown>) => {
    pendingFrameMetaRef.current = frameMetaFromMessage(message);
  }, []);

  const drawTextFrame = useCallback(
    (base64: string, message: Record<string, unknown>) => {
      const meta =
        pendingFrameMetaRef.current || frameMetaFromMessage(message);
      pendingFrameMetaRef.current = null;
      drawFrameSource(`data:image/jpeg;base64,${base64}`, meta);
    },
    [drawFrameSource],
  );

  return {
    canvasRef,
    frameSizeRef,
    cancelFrameDecode,
    acceptFrameMeta,
    drawBlobFrame,
    drawTextFrame,
  };
}
