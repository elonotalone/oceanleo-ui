"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import {
  PDF_READER_LAYOUT,
  clamp,
  pdfErrorMessage,
} from "./pdf-workbench-utils";

export function usePdfPreviewRender({
  canvas,
  documentProxy,
  pageCount,
  pageNumber,
  revision,
  rasterZoom,
  translate,
  setError,
}: {
  canvas: HTMLCanvasElement | null;
  documentProxy: PDFDocumentProxy | null;
  pageCount: number;
  pageNumber: number;
  revision: number;
  rasterZoom: number;
  translate: (value: string) => string;
  setError: (message: string) => void;
}) {
  const renderedPageKeyRef = useRef("");
  const [rotation, setRotation] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderedZoom, setRenderedZoom] = useState(100);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);

  useEffect(() => {
    if (!canvas || !documentProxy || pageCount < 1) {
      setRendering(false);
      setRotation(0);
      setPageWidth(0);
      setPageHeight(0);
      renderedPageKeyRef.current = "";
      return;
    }
    let disposed = false;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    const pageKey = `${pageNumber}:${revision}`;
    const blocking = renderedPageKeyRef.current !== pageKey;
    if (blocking) setRendering(true);
    setError("");
    void (async () => {
      try {
        page = await documentProxy.getPage(
          clamp(pageNumber, 1, documentProxy.numPages),
        );
        if (disposed) {
          page.cleanup();
          return;
        }
        const viewport = page.getViewport({ scale: rasterZoom / 100 });
        const pixelRatio = clamp(
          window.devicePixelRatio || 1,
          1,
          rasterZoom > 175 ? 1 : 2,
        );
        const offscreen = document.createElement("canvas");
        offscreen.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        offscreen.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        const context = offscreen.getContext("2d", { alpha: false });
        if (!context) throw new Error(translate("浏览器无法创建 PDF 画布"));
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform:
            pixelRatio === 1
              ? undefined
              : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: "#ffffff",
        });
        await renderTask.promise;
        if (disposed) return;
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const visibleContext = canvas.getContext("2d", { alpha: false });
        if (!visibleContext) {
          throw new Error(translate("浏览器无法创建 PDF 画布"));
        }
        visibleContext.drawImage(offscreen, 0, 0);
        setPageWidth(viewport.width);
        setPageHeight(viewport.height);
        setRenderedZoom(rasterZoom);
        renderedPageKeyRef.current = pageKey;
        setRotation(((page.rotate % 360) + 360) % 360);
      } catch (caught) {
        const name = caught instanceof Error ? caught.name : "";
        if (!disposed && name !== "RenderingCancelledException") {
          setError(pdfErrorMessage(caught, translate("PDF 页面渲染失败")));
        }
      } finally {
        if (!disposed && blocking) setRendering(false);
      }
    })();
    return () => {
      disposed = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [
    canvas,
    documentProxy,
    pageCount,
    pageNumber,
    rasterZoom,
    revision,
    setError,
    translate,
  ]);

  /**
   * §2.4 SC 2.4.5 — the thumbnail rail is one of the two required ways to
   * locate a page, and F8 forbids standing in a designed cover for it, so the
   * rail renders the real page through the same pdf.js document as the stage.
   */
  const renderThumbnail = useCallback(
    async (targetPage: number, target: HTMLCanvasElement) => {
      if (!documentProxy) return;
      const page = await documentProxy.getPage(
        clamp(targetPage, 1, documentProxy.numPages),
      );
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: PDF_READER_LAYOUT.thumbnailPageWidth / Math.max(1, base.width),
        });
        target.width = Math.max(1, Math.floor(viewport.width));
        target.height = Math.max(1, Math.floor(viewport.height));
        const context = target.getContext("2d", { alpha: false });
        if (!context) return;
        await page.render({
          canvasContext: context,
          viewport,
          background: "#ffffff",
        }).promise;
      } finally {
        page.cleanup();
      }
    },
    [documentProxy],
  );

  return {
    rotation,
    rendering,
    renderedZoom,
    pageWidth,
    pageHeight,
    renderThumbnail,
  };
}
