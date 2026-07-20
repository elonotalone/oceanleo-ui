"use client";

import { useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  CloudBrowserControlLease,
  CloudBrowserFrameMeta,
  CloudBrowserTab,
  CloudBrowserTabState,
} from "../lib/browser";

export const DEFAULT_BROWSER_URL = "https://www.google.com/";
export const DEFAULT_FRAME_SIZE = { width: 1280, height: 800 };

type FrameBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PendingBlobFrame = {
  blob: Blob;
  meta: CloudBrowserFrameMeta | null;
  generation: number;
};

export type CloudBrowserTextCommit = {
  text: string;
  compositionId: string;
  source: "beforeinput" | "input" | "composition" | "paste";
};

export type CloudBrowserTextCommitGate = {
  compositionStart: () => string;
  compositionEnd: (text: string) => CloudBrowserTextCommit | null;
  beforeInput: (
    inputType: string,
    data: string | null,
  ) => CloudBrowserTextCommit | null;
  input: (
    inputType: string,
    data: string | null,
    value: string,
  ) => CloudBrowserTextCommit | null;
  paste: (text: string) => CloudBrowserTextCommit | null;
  isComposing: () => boolean;
  reset: () => void;
};

function finitePositive(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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

export function browserNavigationTarget(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const looksLikeAddress =
    /^https?:\/\//i.test(value) ||
    /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/|$)/i.test(value) ||
    /^(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?::\d+)?(?:\/|$)/iu.test(value);
  if (looksLikeAddress) return normalizedHttpUrl(value);
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

const PRIVATE_QUERY_KEY =
  /^(?:access_?token|auth|code|credential|key|otp|pass(?:word)?|secret|session|signature|sig|token)$/i;

export function redactedDisplayUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (PRIVATE_QUERY_KEY.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return value.replace(/[#?].*$/, "");
  }
}

export function parseCloudBrowserFrameMeta(
  message: Record<string, unknown>,
): CloudBrowserFrameMeta {
  return {
    sequence: finitePositive(message.sequence ?? message.seq),
    width: finitePositive(message.width ?? message.w),
    height: finitePositive(message.height ?? message.h),
    byteLength: finitePositive(
      message.byte_length ?? message.byteLength,
    ),
    capturedAtMs: finitePositive(
      message.captured_at_ms ?? message.capturedAtMs,
    ),
    streamId: stringValue(message.stream_id ?? message.streamId) || undefined,
    generation: finitePositive(
      message.generation ?? message.stream_generation,
    ),
    tabId: stringValue(message.tab_id ?? message.tabId) || undefined,
    runtimeId: stringValue(message.runtime_id ?? message.runtimeId) || undefined,
    incarnation: finitePositive(message.incarnation),
    kind: stringValue(message.kind) || undefined,
  };
}

function tabState(value: unknown): CloudBrowserTabState {
  switch (value) {
    case "opening":
    case "loading":
    case "ready":
    case "crashed":
    case "closing":
    case "closed":
      return value;
    default:
      return "ready";
  }
}

export function normalizeCloudBrowserTab(
  value: unknown,
): CloudBrowserTab | null {
  const item = recordValue(value);
  if (!item) return null;
  const id = stringValue(item.tab_id ?? item.id);
  if (!id) return null;
  return {
    id,
    title: stringValue(item.title),
    displayUrl: redactedDisplayUrl(
      stringValue(item.display_url ?? item.url),
    ),
    faviconUrl:
      stringValue(item.favicon_url ?? item.faviconUrl) || undefined,
    status: tabState(item.status),
    openerTabId:
      stringValue(item.opener_tab_id ?? item.openerTabId) || null,
  };
}

export function normalizeCloudBrowserTabs(value: unknown): CloudBrowserTab[] {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(recordValue(value)?.tabs)
      ? (recordValue(value)?.tabs as unknown[])
      : [];
  return source
    .map(normalizeCloudBrowserTab)
    .filter((item): item is CloudBrowserTab => item !== null);
}

export function normalizeCloudBrowserLease(
  value: unknown,
): CloudBrowserControlLease {
  const item = recordValue(value) || {};
  const explicitExpiry = stringValue(
    item.expires_at ?? item.expiresAt,
  );
  const expiryMs = finitePositive(item.expires_at_ms ?? item.expiresAtMs);
  const holderRaw = stringValue(
    item.holder_kind ?? item.holder ?? item.driving,
  );
  const holderKind =
    holderRaw === "human" ? "human" : holderRaw === "agent" ? "agent" : "free";
  return {
    leaseId: stringValue(item.lease_id ?? item.leaseId),
    epoch: finitePositive(item.epoch ?? item.lease_epoch) || 0,
    holderKind,
    holderId: stringValue(item.holder_id ?? item.holderId) || undefined,
    connectionId:
      stringValue(item.connection_id ?? item.connectionId) || undefined,
    expiresAt:
      explicitExpiry ||
      (expiryMs ? new Date(expiryMs).toISOString() : undefined),
    privacyMode:
      item.privacy_mode === true || item.privacyMode === true,
  };
}

/**
 * Browser text events overlap by design: compositionend is commonly followed
 * by input, and beforeinput is followed by input unless prevented. This gate
 * emits exactly one semantic commit while still accepting input-only mobile
 * keyboards.
 */
export function createCloudBrowserTextCommitGate(): CloudBrowserTextCommitGate {
  let composing = false;
  let serial = 0;
  let activeCompositionId = "";
  let pendingEcho: {
    text: string;
    expectedSources: Set<CloudBrowserTextCommit["source"]>;
    expiresAt: number;
  } | null = null;

  const commit = (
    text: string,
    source: CloudBrowserTextCommit["source"],
    compositionId = `text-${++serial}`,
  ): CloudBrowserTextCommit | null => {
    if (!text) return null;
    return { text, source, compositionId };
  };

  const consumeEcho = (
    text: string,
    source: CloudBrowserTextCommit["source"],
  ) => {
    if (!pendingEcho || Date.now() > pendingEcho.expiresAt) {
      pendingEcho = null;
      return false;
    }
    if (
      pendingEcho.text !== text ||
      !pendingEcho.expectedSources.has(source)
    ) {
      return false;
    }
    pendingEcho.expectedSources.delete(source);
    if (pendingEcho.expectedSources.size === 0) pendingEcho = null;
    return true;
  };

  return {
    compositionStart() {
      composing = true;
      activeCompositionId = `composition-${++serial}`;
      pendingEcho = null;
      return activeCompositionId;
    },
    compositionEnd(text) {
      const compositionId =
        activeCompositionId || `composition-${++serial}`;
      composing = false;
      activeCompositionId = "";
      if (!text) return null;
      pendingEcho = {
        text,
        expectedSources: new Set(["input"]),
        expiresAt: Date.now() + 500,
      };
      return commit(text, "composition", compositionId);
    },
    beforeInput(inputType, data) {
      if (
        composing ||
        inputType === "insertCompositionText" ||
        inputType === "deleteCompositionText"
      ) {
        return null;
      }
      if (!inputType.startsWith("insert") || !data) return null;
      if (consumeEcho(data, "beforeinput")) return null;
      pendingEcho = {
        text: data,
        expectedSources: new Set(["input"]),
        expiresAt: Date.now() + 500,
      };
      return commit(data, "beforeinput");
    },
    input(inputType, data, value) {
      if (composing || inputType === "insertCompositionText") return null;
      const text = data || value;
      if (!text || consumeEcho(text, "input")) return null;
      return commit(text, "input");
    },
    paste(text) {
      if (!text || consumeEcho(text, "paste")) return null;
      pendingEcho = {
        text,
        expectedSources: new Set(["beforeinput", "input"]),
        expiresAt: Date.now() + 500,
      };
      return commit(text, "paste");
    },
    isComposing() {
      return composing;
    },
    reset() {
      composing = false;
      activeCompositionId = "";
      pendingEcho = null;
    },
  };
}

export function playwrightKey(
  event: ReactKeyboardEvent<HTMLElement>,
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

export function useCloudBrowserFramePainter(options: {
  onPresented?: (meta: CloudBrowserFrameMeta | null) => void;
  onDecodeError?: () => void;
} = {}) {
  const presentedCallbackRef = useRef(options.onPresented);
  const decodeErrorCallbackRef = useRef(options.onDecodeError);
  presentedCallbackRef.current = options.onPresented;
  decodeErrorCallbackRef.current = options.onDecodeError;

  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const frameDecodeGenerationRef = useRef(0);
  const frameDecodeBusyRef = useRef(false);
  const pendingBlobFrameRef = useRef<PendingBlobFrame | null>(null);
  const frameSizeRef = useRef(DEFAULT_FRAME_SIZE);
  const pendingFrameMetaRef = useRef<CloudBrowserFrameMeta | null>(null);
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
      if (canvas) {
        delete canvas.dataset.frameSequence;
        delete canvas.dataset.captureToPaintMs;
      }
    }
  }, []);

  const paintFrame = useCallback(
    (
      image: CanvasImageSource,
      naturalWidth: number,
      naturalHeight: number,
      meta: CloudBrowserFrameMeta | null,
    ) => {
      const canvas = canvasRef.current;
      const width =
        naturalWidth || meta?.width || DEFAULT_FRAME_SIZE.width;
      const height =
        naturalHeight || meta?.height || DEFAULT_FRAME_SIZE.height;
      if (!canvas || width <= 0 || height <= 0) return false;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return false;
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
      presentedCallbackRef.current?.(meta);
      return true;
    },
    [],
  );

  const drawFrameSource = useCallback(
    (source: string, meta: CloudBrowserFrameMeta | null) => {
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
      image.onerror = () => {
        decodeErrorCallbackRef.current?.();
        release();
      };
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
          decodeErrorCallbackRef.current?.();
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
      if (meta?.byteLength && value.size !== meta.byteLength) {
        decodeErrorCallbackRef.current?.();
        return;
      }
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

  const acceptFrameMeta = useCallback(
    (message: Record<string, unknown>) => {
      const meta = parseCloudBrowserFrameMeta(message);
      pendingFrameMetaRef.current = meta;
      return meta;
    },
    [],
  );

  const drawTextFrame = useCallback(
    (base64: string, message: Record<string, unknown>) => {
      const meta =
        pendingFrameMetaRef.current || parseCloudBrowserFrameMeta(message);
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
