"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  PDF_CARRIER_CONSTANTS,
  PDF_TEXT_LAYER_EXTRACTOR,
} from "./pdf-manifest";
import type { PdfManifestPage } from "./pdf-manifest";
import type {
  PdfSearchHit,
  PdfTextLayerSummary,
} from "./pdf-workbench-state";

// Full-text search keeps page strings in memory. C14 allows twenty million
// characters, which is far more than a browser tab should hold, so the cache
// stops here and search degrades to the cached prefix rather than the tab dying.
const MAX_CACHED_CHARACTERS = 2_000_000;
const SEARCH_EXCERPT_RADIUS = 48;
const MAX_SEARCH_HITS = 200;

export interface PdfTextLayerProbe extends PdfTextLayerSummary {
  pageCharacters: number[];
  /** §3.1 `pages[]` — collected in the same walk that counts characters. */
  pages: PdfManifestPage[];
  searchFullText: (query: string) => PdfSearchHit[];
}

function manifestRotation(value: number): 0 | 90 | 180 | 270 {
  const rotation = (((Math.round(value / 90) * 90) % 360) + 360) % 360;
  return rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
}

const IDLE: PdfTextLayerSummary = {
  status: "idle",
  present: false,
  totalCharacters: 0,
  coveragePageRatio: 0,
  extractor: PDF_TEXT_LAYER_EXTRACTOR,
};

/**
 * §3.2 — decides between `text-ready` and `image-only`. The ratio is the share
 * of pages that carry any extractable glyph, which is what F2 ("a scan posing
 * as full text") turns on; character totals alone would let one dense cover
 * page vouch for a two-hundred-page scan.
 */
export function usePdfTextLayer({
  documentProxy,
  revision,
}: {
  documentProxy: PDFDocumentProxy | null;
  revision: number;
}): PdfTextLayerProbe {
  const pageTextRef = useRef<string[]>([]);
  const [summary, setSummary] = useState<PdfTextLayerSummary>(IDLE);
  const [pageCharacters, setPageCharacters] = useState<number[]>([]);
  const [pages, setPages] = useState<PdfManifestPage[]>([]);

  useEffect(() => {
    pageTextRef.current = [];
    if (!documentProxy) {
      setSummary(IDLE);
      setPageCharacters([]);
      setPages([]);
      return;
    }
    let disposed = false;
    setSummary({ ...IDLE, status: "probing" });
    setPageCharacters([]);
    setPages([]);
    void (async () => {
      const counts: number[] = [];
      const texts: string[] = [];
      const geometry: PdfManifestPage[] = [];
      let total = 0;
      let cached = 0;
      let pagesWithText = 0;
      try {
        for (let index = 1; index <= documentProxy.numPages; index += 1) {
          if (disposed) return;
          const page = await documentProxy.getPage(index);
          try {
            const view = page.view;
            geometry.push({
              index: index - 1,
              widthPt: Math.abs(view[2] - view[0]),
              heightPt: Math.abs(view[3] - view[1]),
              rotation: manifestRotation(page.rotate),
            });
            const content = await page.getTextContent();
            const text = content.items
              .map((item) =>
                typeof (item as { str?: unknown }).str === "string"
                  ? (item as { str: string }).str
                  : "",
              )
              .join("");
            const length = Math.min(
              text.length,
              PDF_CARRIER_CONSTANTS.C13_maximumPageCharacters,
            );
            counts.push(length);
            if (text.trim().length > 0) pagesWithText += 1;
            total = Math.min(
              total + length,
              PDF_CARRIER_CONSTANTS.C14_maximumTotalCharacters,
            );
            if (cached + text.length <= MAX_CACHED_CHARACTERS) {
              texts.push(text);
              cached += text.length;
            } else {
              texts.push("");
            }
          } finally {
            page.cleanup();
          }
        }
      } catch {
        // A page that refuses to yield text is not a load failure: the document
        // still renders. Fall through with whatever was collected, which will
        // usually land the reader in `image-only`.
      }
      if (disposed) return;
      pageTextRef.current = texts;
      setPageCharacters(counts);
      setPages(
        geometry.map((page, index) => ({
          ...page,
          textCharacters: counts[index] ?? 0,
        })),
      );
      setSummary({
        status: "ready",
        present: total > 0,
        totalCharacters: total,
        coveragePageRatio: documentProxy.numPages
          ? pagesWithText / documentProxy.numPages
          : 0,
        extractor: PDF_TEXT_LAYER_EXTRACTOR,
      });
    })();
    return () => {
      disposed = true;
    };
  }, [documentProxy, revision]);

  const searchFullText = useCallback((query: string): PdfSearchHit[] => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const hits: PdfSearchHit[] = [];
    pageTextRef.current.forEach((text, index) => {
      if (hits.length >= MAX_SEARCH_HITS) return;
      const haystack = text.toLowerCase();
      let offset = haystack.indexOf(needle);
      while (offset >= 0 && hits.length < MAX_SEARCH_HITS) {
        hits.push({
          pageNumber: index + 1,
          offset,
          excerpt: text
            .slice(
              Math.max(0, offset - SEARCH_EXCERPT_RADIUS),
              offset + needle.length + SEARCH_EXCERPT_RADIUS,
            )
            .replace(/\s+/g, " ")
            .trim(),
        });
        offset = haystack.indexOf(needle, offset + needle.length);
      }
    });
    return hits;
  }, []);

  return { ...summary, pageCharacters, pages, searchFullText };
}
