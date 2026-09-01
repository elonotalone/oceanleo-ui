"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import { usePdfDocument } from "./use-pdf-document";
import { usePdfPreviewRender } from "./use-pdf-preview-render";
import { usePdfReaderMachine } from "./use-pdf-reader-machine";
import { usePdfTextLayer } from "./use-pdf-text-layer";

/**
 * The read path: bytes in, a viewable page out.
 *
 * Four hooks have to run in this order and only ever talk to each other —
 * the pdf.js document proxy feeds the raster render, the text-layer probe and
 * the reader state machine, and `previewRevision` is the token that keeps all
 * three on the same revision of the bytes. Nothing outside needs the proxy or
 * that token, so they stay in here and `usePdfWorkbench` sees only what it
 * actually renders.
 */
export function usePdfViewPipeline({
  bytesRef,
  canvas,
  documentRevision,
  item,
  pageCount,
  pageNumber,
  rasterZoom,
  translate,
  onPageCount,
  setError,
}: {
  bytesRef: MutableRefObject<Uint8Array | null>;
  canvas: HTMLCanvasElement | null;
  documentRevision: number;
  item: LibraryItem;
  pageCount: number;
  pageNumber: number;
  rasterZoom: number;
  translate: UITranslate;
  onPageCount: (pageCount: number) => void;
  setError: Dispatch<SetStateAction<string>>;
}) {
  const {
    documentProxy,
    previewRevision,
    loading: previewLoading,
  } = usePdfDocument({
    bytesRef,
    documentRevision,
    translate,
    setError,
    onPageCount,
  });
  const {
    rotation,
    rendering,
    renderedZoom,
    pageWidth,
    pageHeight,
    renderThumbnail,
  } = usePdfPreviewRender({
    canvas,
    documentProxy,
    pageCount,
    pageNumber,
    revision: previewRevision,
    rasterZoom,
    translate,
    setError,
  });
  const textLayer = usePdfTextLayer({ documentProxy, revision: previewRevision });
  const machine = usePdfReaderMachine({
    pages: textLayer.pages,
    textLayer,
    annotatable: true,
    provenance: {
      channel: item.meta.provenance_channel,
      licenseCode: item.meta.license_code,
      licenseUrl: item.meta.license_url,
      sourceUrl: item.meta.source_url,
      attribution: item.meta.attribution,
    },
  });

  return {
    previewLoading,
    rotation,
    rendering,
    renderedZoom,
    pageWidth,
    pageHeight,
    renderThumbnail,
    textLayer,
    machine,
  };
}
