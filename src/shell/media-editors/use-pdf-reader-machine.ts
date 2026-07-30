"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PDF_FAILURE_CODES,
  buildPdfBinaryManifest,
  validatePdfBinaryManifest,
  type PdfBinaryManifest,
  type PdfManifestPage,
  type PdfProvenanceChannel,
  type PdfFailureCode,
} from "./pdf-manifest";
import {
  pdfReaderTransition,
  type PdfReaderEvent,
  type PdfReaderFailure,
  type PdfReaderState,
  type PdfTextLayerSummary,
} from "./pdf-workbench-state";

const CHANNELS: readonly PdfProvenanceChannel[] = [
  "arxiv-api",
  "arxiv-oai-pmh",
  "arxiv-s3-bulk",
  "owned",
  "user-upload",
  "approved-provider",
];

function channelOf(value: unknown): PdfProvenanceChannel {
  const candidate = String(value || "").trim();
  return CHANNELS.includes(candidate as PdfProvenanceChannel)
    ? (candidate as PdfProvenanceChannel)
    : "user-upload";
}

export interface PdfReaderMachine {
  readerState: PdfReaderState;
  failure: PdfReaderFailure | null;
  manifest: PdfBinaryManifest | null;
  advance: (event: PdfReaderEvent) => void;
  reportFailure: (code: PdfFailureCode, message: string) => void;
  clearFailure: () => void;
}

/**
 * §3.2 — the reader's position in the load/annotate/save cycle, kept as one
 * explicit state instead of the four independent booleans the workbench used
 * to expose. Transitions go through `pdfReaderTransition`, so an event that
 * the table does not define leaves the state alone rather than teleporting;
 * that is what keeps the five forbidden migrations unreachable at runtime.
 *
 * The manifest (§3.1) is derived here too, because both answers come from the
 * same facts: page geometry, the text-layer probe, and the item's provenance.
 */
export function usePdfReaderMachine({
  pages,
  textLayer,
  annotatable,
  provenance,
}: {
  pages: readonly PdfManifestPage[];
  textLayer: PdfTextLayerSummary;
  annotatable: boolean;
  provenance: {
    channel?: unknown;
    licenseCode?: unknown;
    licenseUrl?: unknown;
    sourceUrl?: unknown;
    attribution?: unknown;
  };
}): PdfReaderMachine {
  const [readerState, setReaderState] = useState<PdfReaderState>("empty");
  const [failure, setFailure] = useState<PdfReaderFailure | null>(null);
  const textLayerPresentRef = useRef(true);

  const readable =
    textLayer.present &&
    textLayer.coveragePageRatio >= 0.6 &&
    textLayer.totalCharacters >= 2000;
  textLayerPresentRef.current = readable;

  const advance = useCallback((event: PdfReaderEvent) => {
    setReaderState(
      (current) =>
        pdfReaderTransition(current, event, textLayerPresentRef.current) ??
        current,
    );
  }, []);

  const reportFailure = useCallback(
    (code: PdfFailureCode, message: string) => setFailure({ code, message }),
    [],
  );
  const clearFailure = useCallback(() => setFailure(null), []);

  // §3.2 `paged → text-ready` / `paged → image-only`. F2 lands here: a scan
  // whose coverage is under C11 is routed to `image-only` and the interface
  // says so, rather than offering a search that would return nothing.
  useEffect(() => {
    if (textLayer.status !== "ready") return;
    if (readable) {
      advance("text-layer-ready");
      return;
    }
    advance("text-layer-absent");
    setFailure((current) =>
      current ??
      ({
        code: PDF_FAILURE_CODES.F2_noTextLayer,
        message: "此文档无文本层",
      } satisfies PdfReaderFailure),
    );
  }, [advance, readable, textLayer.status]);

  const manifest = useMemo<PdfBinaryManifest | null>(() => {
    if (pages.length === 0) return null;
    const licenseCode = String(provenance.licenseCode || "").trim();
    const licenseUrl = String(provenance.licenseUrl || "").trim();
    if (!licenseCode || !licenseUrl) return null;
    const sourceUrl = String(provenance.sourceUrl || "").trim();
    const attribution = String(provenance.attribution || "").trim();
    const candidate = buildPdfBinaryManifest({
      pages,
      textLayer: {
        present: textLayer.present,
        totalCharacters: textLayer.totalCharacters,
        coveragePageRatio: textLayer.coveragePageRatio,
      },
      permissions: { annotatable, printable: true },
      provenance: {
        channel: channelOf(provenance.channel),
        licenseCode,
        licenseUrl,
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(attribution ? { attribution } : {}),
      },
    });
    const validated = validatePdfBinaryManifest(candidate);
    return validated.ok ? validated.manifest : null;
  }, [
    annotatable,
    pages,
    provenance.attribution,
    provenance.channel,
    provenance.licenseCode,
    provenance.licenseUrl,
    provenance.sourceUrl,
    textLayer.coveragePageRatio,
    textLayer.present,
    textLayer.totalCharacters,
  ]);

  return { readerState, failure, manifest, advance, reportFailure, clearFailure };
}
