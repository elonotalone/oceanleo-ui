"use client";

/**
 * One place that builds the PDFium (EmbedPDF) engine outside React.
 *
 * Everything that reads a PDF in the editor, the Library reader and the
 * redaction verifier goes through here — there is no pdf.js path any more.
 * The wasm address is resolved by the same pure rules as the Pro viewer
 * (`pdf-next-runtime.ts`): env > bundler asset > refuse, never a third-party CDN.
 *
 * - `"worker"` runs PDFium off the main thread (editor / Library rendering).
 * - `"direct"` runs it in-process; used by redaction (needs no Worker, and runs
 *   under node for tests).
 */
import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import {
  PDFIUM_FONT_BASE_ENV_KEY,
  PDFIUM_WASM_ENV_KEY,
  absolutizePdfiumWasmUrl,
  resolvePdfiumFontFallback,
  resolvePdfiumWasmUrl,
} from "./pdf-next-runtime";

export type PdfEngineMode = "worker" | "direct";

function bundledWasmUrl(): string | null {
  try {
    return new URL("@embedpdf/pdfium/pdfium.wasm", import.meta.url).href;
  } catch {
    return null;
  }
}

function envValue(key: string): string | null {
  if (typeof process === "undefined") return null;
  const bag = process.env as Record<string, string | undefined> | undefined;
  return bag?.[key] ?? null;
}

/** Resolved once per page load; pure besides reading env + the bundler asset. */
export function resolvePdfiumLoadPlan() {
  const wasm = resolvePdfiumWasmUrl({
    envUrl: envValue(PDFIUM_WASM_ENV_KEY),
    bundledUrl: bundledWasmUrl(),
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const resolved = wasm.ok
    ? { ...wasm, wasmUrl: absolutizePdfiumWasmUrl(wasm.wasmUrl, origin) }
    : wasm;
  const fontFallback = resolvePdfiumFontFallback(
    envValue(PDFIUM_FONT_BASE_ENV_KEY),
  );
  return { wasm: resolved, fontFallback };
}

let wasmUrlOverride: string | null = null;

/** Tests (node has no bundler asset) point the engine at a served wasm. */
export function overridePdfiumWasmUrlForTests(url: string | null): void {
  wasmUrlOverride = url;
  engines.clear();
}

const engines = new Map<PdfEngineMode, Promise<PdfEngine<Blob>>>();

export function getPdfiumEngine(
  mode: PdfEngineMode = "worker",
): Promise<PdfEngine<Blob>> {
  const cached = engines.get(mode);
  if (cached) return cached;
  const plan = resolvePdfiumLoadPlan();
  const wasmUrl = wasmUrlOverride ?? (plan.wasm.ok ? plan.wasm.wasmUrl : null);
  const pending: Promise<PdfEngine<Blob>> = (async () => {
    if (!wasmUrl) {
      throw new Error(plan.wasm.ok ? "没有可用的 PDFium WASM 地址。" : plan.wasm.reason);
    }
    const options = { fontFallback: plan.fontFallback ?? null };
    if (mode === "direct") {
      const { createPdfiumEngine } = await import(
        "@embedpdf/engines/pdfium-direct-engine"
      );
      return createPdfiumEngine(wasmUrl, options);
    }
    const { createPdfiumEngine } = await import(
      "@embedpdf/engines/pdfium-worker-engine"
    );
    return createPdfiumEngine(wasmUrl, options);
  })();
  // A failed load must not be cached forever.
  pending.catch(() => {
    if (engines.get(mode) === pending) engines.delete(mode);
  });
  engines.set(mode, pending);
  return pending;
}

/** `Uint8Array` → a standalone `ArrayBuffer` (the engine wants to own its bytes). */
export function pdfEngineBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

/** An opened document: the engine, PDFium's page table, and a disposer. */
export interface PdfEngineDocument {
  engine: PdfEngine<Blob>;
  doc: PdfDocumentObject;
  numPages: number;
  close: () => Promise<void>;
}

export async function openPdfEngineDocument(
  bytes: Uint8Array,
  options: {
    mode?: PdfEngineMode;
    /** Coordinates in 0-degree space (redaction); the editor view keeps rotation. */
    normalizeRotation?: boolean;
    id?: string;
  } = {},
): Promise<PdfEngineDocument> {
  const engine = await getPdfiumEngine(options.mode ?? "worker");
  const doc = await engine
    .openDocumentBuffer(
      {
        id: options.id ?? `pdf-${Math.random().toString(36).slice(2)}`,
        content: pdfEngineBuffer(bytes),
      },
      options.normalizeRotation ? { normalizeRotation: true } : undefined,
    )
    .toPromise();
  let closed = false;
  return {
    engine,
    doc,
    numPages: doc.pageCount,
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await engine.closeDocument(doc).toPromise();
      } catch {
        // Closing is best effort; the document is already unreachable.
      }
    },
  };
}

/** Paint a raw RGBA render into a canvas, sizing the canvas to the pixels. */
export function paintImageData(
  target: HTMLCanvasElement,
  image: { data: Uint8ClampedArray; width: number; height: number },
): void {
  target.width = image.width;
  target.height = image.height;
  const context = target.getContext("2d", { alpha: false });
  if (!context) throw new Error("浏览器无法创建 PDF 画布");
  context.putImageData(
    new ImageData(
      new Uint8ClampedArray(image.data) as Uint8ClampedArray<ArrayBuffer>,
      image.width,
      image.height,
    ),
    0,
    0,
  );
}

/**
 * Plain text of one page, from PDFium's text runs.
 *
 * Not `engine.extractText`: for a page with zero characters (scans, or text
 * that was redacted away) PDFium's extractor returns uninitialised buffer
 * garbage instead of "", which would make an image-only page look like it has a
 * text layer. Runs are empty in that case, which is the truth.
 */
export async function readPdfPageText(
  opened: PdfEngineDocument,
  pageIndex: number,
): Promise<string> {
  const page = opened.doc.pages[pageIndex];
  if (!page) return "";
  const { runs } = await opened.engine
    .getPageTextRuns(opened.doc, page)
    .toPromise();
  return runs
    .filter((run) => run.charCount > 0)
    .map((run) => run.text.replace(/[\r\n]+$/, ""))
    .filter((text) => text.length > 0)
    .join("\n");
}
