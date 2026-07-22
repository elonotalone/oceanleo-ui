"use client";

import { useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  CloudBrowserControlLease,
  CloudBrowserFrameContractV3,
  CloudBrowserFrameMeta,
} from "../lib/browser";
import type { CloudBrowserWireBinding } from "./cloud-browser-wire";
import { CLOUD_BROWSER_MAX_FRAME_BYTES } from "./cloud-browser-wire";

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
  meta: ValidatedCloudBrowserFrameMeta;
  generation: number;
  settled: boolean;
};

export type ValidatedCloudBrowserFrameMeta = Required<
  Pick<
    CloudBrowserFrameMeta,
    | "sequence"
    | "actionSequence"
    | "width"
    | "height"
    | "byteLength"
    | "capturedAtMs"
    | "streamId"
    | "generation"
    | "windowId"
    | "runtimeId"
    | "runtimeVersion"
    | "sessionVersion"
    | "incarnation"
    | "connectionId"
    | "nonce"
    | "codec"
    | "source"
    | "paintState"
    | "nativeChromeWindow"
  >
>;

export type CloudBrowserFrameExpectation = {
  binding: CloudBrowserWireBinding;
  contract: CloudBrowserFrameContractV3;
  afterSequence: number;
  minimumActionSequence?: number;
  maxAgeMs?: number;
};

export type CloudBrowserFrameValidation =
  | { ok: true; meta: ValidatedCloudBrowserFrameMeta }
  | {
      ok: false;
      reason:
        | "invalid_schema"
        | "binding_mismatch"
        | "stale_sequence"
        | "stale_action"
        | "stale_capture"
        | "size_exceeded"
        | "native_chrome_missing";
    };

export type CloudBrowserTextCommit = {
  text: string;
  compositionId: string;
  source: "beforeinput" | "input" | "composition" | "paste";
};

export type CloudBrowserTextCommitGate = {
  compositionStart: () => string;
  compositionUpdate: (
    text: string,
  ) => { text: string; compositionId: string } | null;
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
  const nativeChrome = recordValue(message.native_chrome);
  return {
    sequence: finitePositive(message.frame_sequence),
    actionSequence: finitePositive(message.action_sequence) ?? 0,
    width: finitePositive(message.width),
    height: finitePositive(message.height),
    byteLength: finitePositive(message.byte_length),
    capturedAtMs: finitePositive(message.captured_at_ms),
    streamId: stringValue(message.stream_id) || undefined,
    generation: finitePositive(message.stream_generation),
    windowId: stringValue(message.window_id) || undefined,
    runtimeId: stringValue(message.runtime_id) || undefined,
    runtimeVersion: stringValue(message.runtime_version) || undefined,
    sessionVersion: finitePositive(message.session_version),
    incarnation: finitePositive(message.incarnation),
    connectionId: stringValue(message.connection_id) || undefined,
    nonce: stringValue(message.nonce) || undefined,
    codec: stringValue(message.codec) || undefined,
    source: stringValue(message.source) || undefined,
    paintState: stringValue(message.paint_state) || undefined,
    nativeChromeWindow: Boolean(
      nativeChrome &&
        nativeChrome.window_id === message.window_id &&
        nativeChrome.tab_strip === true &&
        nativeChrome.omnibox === true &&
        nativeChrome.maximized === true,
    ),
  };
}

const FRAME_META_KEYS = new Set([
  "v",
  "t",
  "session_id",
  "session_version",
  "runtime_id",
  "runtime_version",
  "incarnation",
  "nonce",
  "connection_id",
  "stream_id",
  "stream_generation",
  "window_id",
  "frame_sequence",
  "action_sequence",
  "width",
  "height",
  "byte_length",
  "captured_at_ms",
  "codec",
  "source",
  "paint_state",
  "native_chrome",
]);
const NATIVE_CHROME_KEYS = new Set([
  "window_id",
  "tab_strip",
  "omnibox",
  "maximized",
]);

function safeInteger(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function validateCloudBrowserFrameMeta(
  message: Record<string, unknown>,
  expectation: CloudBrowserFrameExpectation,
  now = Date.now(),
): CloudBrowserFrameValidation {
  const nativeChrome = recordValue(message.native_chrome);
  if (
    !exactKeys(message, FRAME_META_KEYS) ||
    message.v !== 3 ||
    message.t !== "frame.meta" ||
    !nativeChrome ||
    !exactKeys(nativeChrome, NATIVE_CHROME_KEYS) ||
    !safeInteger(message.frame_sequence, 1) ||
    !safeInteger(message.action_sequence, 0) ||
    !safeInteger(message.width, 1) ||
    !safeInteger(message.height, 1) ||
    !safeInteger(message.byte_length, 1, CLOUD_BROWSER_MAX_FRAME_BYTES) ||
    !safeInteger(message.captured_at_ms, 1)
  ) {
    return { ok: false, reason: "invalid_schema" };
  }
  const { binding, contract } = expectation;
  if (
    message.session_id !== binding.sessionId ||
    message.session_version !== binding.sessionVersion ||
    message.runtime_id !== binding.runtimeId ||
    message.runtime_version !== binding.runtimeVersion ||
    message.incarnation !== binding.incarnation ||
    message.nonce !== binding.nonce ||
    message.connection_id !== binding.connectionId ||
    message.stream_id !== binding.streamId ||
    message.stream_generation !== binding.streamGeneration ||
    message.window_id !== binding.windowId
  ) {
    return { ok: false, reason: "binding_mismatch" };
  }
  if ((message.frame_sequence as number) <= expectation.afterSequence) {
    return { ok: false, reason: "stale_sequence" };
  }
  if (
    (message.action_sequence as number) <
      (expectation.minimumActionSequence ?? 0)
  ) {
    return { ok: false, reason: "stale_action" };
  }
  const maxAgeMs = expectation.maxAgeMs ?? 10_000;
  const captureAge = now - (message.captured_at_ms as number);
  if (captureAge > maxAgeMs || captureAge < -2_000) {
    return { ok: false, reason: "stale_capture" };
  }
  if (
    message.codec !== contract.codec ||
    message.source !== contract.source ||
    (message.byte_length as number) > contract.max_frame_bytes ||
    (message.width as number) > contract.max_width ||
    (message.height as number) > contract.max_height
  ) {
    return { ok: false, reason: "size_exceeded" };
  }
  if (
    message.paint_state !== "real" ||
    nativeChrome.window_id !== binding.windowId ||
    nativeChrome.tab_strip !== true ||
    nativeChrome.omnibox !== true ||
    nativeChrome.maximized !== true
  ) {
    return { ok: false, reason: "native_chrome_missing" };
  }
  const parsed = parseCloudBrowserFrameMeta(message);
  return {
    ok: true,
    meta: parsed as ValidatedCloudBrowserFrameMeta,
  };
}

export function normalizeCloudBrowserLease(
  value: unknown,
): CloudBrowserControlLease {
  const item = recordValue(value) || {};
  const explicitExpiry = stringValue(item.expires_at);
  const holderRaw = stringValue(item.holder_kind);
  const holderKind =
    holderRaw === "human" ? "human" : holderRaw === "agent" ? "agent" : "free";
  return {
    leaseId: stringValue(item.lease_id),
    epoch: finitePositive(item.lease_epoch) || 0,
    holderKind,
    holderId: stringValue(item.holder_id) || undefined,
    connectionId: stringValue(item.connection_id) || undefined,
    expiresAt: explicitExpiry || undefined,
    privacyMode: item.privacy_mode === true,
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
    compositionUpdate(text) {
      if (!composing || !activeCompositionId) return null;
      return { text, compositionId: activeCompositionId };
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
  onReceived?: (
    meta: ValidatedCloudBrowserFrameMeta,
  ) => boolean | void;
  onPresented?: (meta: ValidatedCloudBrowserFrameMeta) => void;
  onDropped?: (meta: ValidatedCloudBrowserFrameMeta) => void;
  onDecodeError?: (reason: string) => void;
} = {}) {
  const receivedCallbackRef = useRef(options.onReceived);
  const presentedCallbackRef = useRef(options.onPresented);
  const droppedCallbackRef = useRef(options.onDropped);
  const decodeErrorCallbackRef = useRef(options.onDecodeError);
  receivedCallbackRef.current = options.onReceived;
  presentedCallbackRef.current = options.onPresented;
  droppedCallbackRef.current = options.onDropped;
  decodeErrorCallbackRef.current = options.onDecodeError;

  const frameDecodeGenerationRef = useRef(0);
  const frameDecodeBusyGenerationRef = useRef<number | null>(null);
  const activeBlobFrameRef = useRef<PendingBlobFrame | null>(null);
  const pendingBlobFrameRef = useRef<PendingBlobFrame | null>(null);
  const frameSizeRef = useRef(DEFAULT_FRAME_SIZE);
  const pendingFrameMetaRef =
    useRef<ValidatedCloudBrowserFrameMeta | null>(null);
  const lastPresentedSequenceRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const dropBlobFrame = useCallback((frame: PendingBlobFrame) => {
    if (frame.settled) return;
    frame.settled = true;
    droppedCallbackRef.current?.(frame.meta);
  }, []);

  const cancelFrameDecode = useCallback((
    clearCanvas = false,
    preservePendingMeta = false,
  ) => {
    const generation = frameDecodeGenerationRef.current;
    ++frameDecodeGenerationRef.current;
    if (!preservePendingMeta) pendingFrameMetaRef.current = null;
    const active = activeBlobFrameRef.current;
    if (active?.generation === generation) {
      dropBlobFrame(active);
    }
    const pending = pendingBlobFrameRef.current;
    if (pending?.generation === generation) {
      dropBlobFrame(pending);
    }
    pendingBlobFrameRef.current = null;
    lastPresentedSequenceRef.current = 0;
    if (clearCanvas) {
      const canvas = canvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      frameSizeRef.current = DEFAULT_FRAME_SIZE;
      if (canvas) {
        delete canvas.dataset.frameSequence;
        delete canvas.dataset.actionSequence;
        delete canvas.dataset.captureToPaintMs;
        delete canvas.dataset.frameSource;
      }
    }
  }, [dropBlobFrame]);

  const paintFrame = useCallback(
    (
      image: CanvasImageSource,
      naturalWidth: number,
      naturalHeight: number,
      meta: ValidatedCloudBrowserFrameMeta,
    ) => {
      const canvas = canvasRef.current;
      const width = naturalWidth || meta.width;
      const height = naturalHeight || meta.height;
      if (
        !canvas ||
        width !== meta.width ||
        height !== meta.height ||
        meta.sequence <= lastPresentedSequenceRef.current
      ) {
        decodeErrorCallbackRef.current?.("frame dimensions or order mismatch");
        return false;
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        decodeErrorCallbackRef.current?.("canvas context unavailable");
        return false;
      }
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      frameSizeRef.current = { width, height };
      lastPresentedSequenceRef.current = meta.sequence;
      canvas.dataset.frameSequence = String(meta.sequence);
      canvas.dataset.actionSequence = String(meta.actionSequence);
      canvas.dataset.captureToPaintMs = String(
        Math.max(0, Math.round(Date.now() - meta.capturedAtMs)),
      );
      canvas.dataset.frameSource = meta.source;
      presentedCallbackRef.current?.(meta);
      return true;
    },
    [],
  );

  const pumpBlobFrames = useCallback(async (generation: number) => {
    if (frameDecodeBusyGenerationRef.current === generation) return;
    frameDecodeBusyGenerationRef.current = generation;
    try {
      while (
        pendingBlobFrameRef.current?.generation === generation
      ) {
        const pending = pendingBlobFrameRef.current;
        pendingBlobFrameRef.current = null;
        activeBlobFrameRef.current = pending;
        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await createImageBitmap(pending.blob);
          if (!pending.settled) {
            if (
              pending.generation !== frameDecodeGenerationRef.current ||
              document.visibilityState === "hidden"
            ) {
              dropBlobFrame(pending);
              continue;
            }
            const newer =
              pendingBlobFrameRef.current as PendingBlobFrame | null;
            if (
              newer?.generation === generation &&
              newer.meta.sequence > pending.meta.sequence
            ) {
              // latest-frame-backpressure: retain one pending value.
              dropBlobFrame(pending);
            } else {
              const painted = paintFrame(
                bitmap,
                bitmap.width,
                bitmap.height,
                pending.meta,
              );
              if (!painted) dropBlobFrame(pending);
            }
          }
        } catch {
          if (
            !pending.settled &&
            pending.generation === frameDecodeGenerationRef.current &&
            document.visibilityState !== "hidden"
          ) {
            dropBlobFrame(pending);
            decodeErrorCallbackRef.current?.("jpeg decode failed");
          }
        } finally {
          if (activeBlobFrameRef.current === pending) {
            activeBlobFrameRef.current = null;
          }
          bitmap?.close();
        }
      }
    } finally {
      if (frameDecodeBusyGenerationRef.current === generation) {
        frameDecodeBusyGenerationRef.current = null;
      }
    }
  }, [dropBlobFrame, paintFrame]);

  const drawBlobFrame = useCallback(
    (value: Blob) => {
      const meta = pendingFrameMetaRef.current;
      pendingFrameMetaRef.current = null;
      if (!meta) {
        decodeErrorCallbackRef.current?.("binary frame missing metadata");
        return false;
      }
      if (
        value.size !== meta.byteLength ||
        value.size > CLOUD_BROWSER_MAX_FRAME_BYTES
      ) {
        decodeErrorCallbackRef.current?.("binary frame size mismatch");
        return false;
      }
      if (receivedCallbackRef.current?.(meta) === false) return true;
      const generation = frameDecodeGenerationRef.current;
      const pending: PendingBlobFrame = {
        blob:
          value.type === "image/jpeg"
            ? value
            : new Blob([value], { type: "image/jpeg" }),
        meta,
        generation,
        settled: false,
      };
      if (document.visibilityState === "hidden") {
        dropBlobFrame(pending);
        return true;
      }
      if (pendingBlobFrameRef.current) {
        dropBlobFrame(pendingBlobFrameRef.current);
      }
      pendingBlobFrameRef.current = pending;
      void pumpBlobFrames(generation);
      return true;
    },
    [dropBlobFrame, pumpBlobFrames],
  );

  const acceptFrameMeta = useCallback(
    (meta: ValidatedCloudBrowserFrameMeta) => {
      if (pendingFrameMetaRef.current) {
        decodeErrorCallbackRef.current?.("frame metadata was not paired");
        return false;
      }
      pendingFrameMetaRef.current = meta;
      return true;
    },
    [],
  );

  return {
    canvasRef,
    frameSizeRef,
    cancelFrameDecode,
    acceptFrameMeta,
    drawBlobFrame,
  };
}
