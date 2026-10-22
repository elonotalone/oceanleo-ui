"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { paintImageData, type PdfEngineDocument } from "./pdf-engine-host";
import type { UITranslate } from "../../i18n/ui/useUI";
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
  translate: providedTranslate,
  setError,
}: {
  canvas: HTMLCanvasElement | null;
  documentProxy: PdfEngineDocument | null;
  pageCount: number;
  pageNumber: number;
  revision: number;
  rasterZoom: number;
  translate: UITranslate;
  setError: (message: string) => void;
}) {
  const renderedPageKeyRef = useRef("");
  const [rotation, setRotation] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderedZoom, setRenderedZoom] = useState(100);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);

  // 同 `use-pdf-document.ts`：形参名叫 `translate` 不代表身份稳定，
  // `use-pdf-workbench.ts` 过去把裸 `tt` 直接传了进来。它进下面这个渲染 effect 的
  // 依赖，就是 W13 治过的自锁引信：effect 体里 `setPageWidth` / `setRotation` 等
  // 写 state → 重渲染 → `translate` 换身份 → 整页重新光栅化一遍。
  // 语言切换与「这一页要不要重画」无关，答案明确是不该重跑。
  // ref + 空依赖 `useCallback` 包出恒定身份，`vars` 一并转发；代价是渲染失败文案
  // 停在报错当时那个语言（`error` 由不在本 owner 面上的 `PdfStage` 原样渲染）。
  const translateRef = useRef(providedTranslate);
  useEffect(() => {
    translateRef.current = providedTranslate;
  }, [providedTranslate]);
  const translate = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

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
    const pageKey = `${pageNumber}:${revision}`;
    const blocking = renderedPageKeyRef.current !== pageKey;
    if (blocking) setRendering(true);
    setError("");
    void (async () => {
      try {
        const { engine, doc, numPages } = documentProxy;
        const page = doc.pages[clamp(pageNumber, 1, numPages) - 1];
        if (!page) throw new Error(translate("PDF 页面渲染失败"));
        const scale = rasterZoom / 100;
        const pixelRatio = clamp(
          window.devicePixelRatio || 1,
          1,
          rasterZoom > 175 ? 1 : 2,
        );
        const image = await engine
          .renderPageRaw(doc, page, {
            scaleFactor: scale,
            dpr: pixelRatio,
            withAnnotations: true,
          })
          .toPromise();
        if (disposed) return;
        paintImageData(canvas, image);
        const width = page.size.width * scale;
        const height = page.size.height * scale;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        setPageWidth(width);
        setPageHeight(height);
        setRenderedZoom(rasterZoom);
        renderedPageKeyRef.current = pageKey;
        setRotation((((page.rotation * 90) % 360) + 360) % 360);
      } catch (caught) {
        if (!disposed) {
          setError(pdfErrorMessage(caught, translate("PDF 页面渲染失败")));
        }
      } finally {
        if (!disposed && blocking) setRendering(false);
      }
    })();
    return () => {
      disposed = true;
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
   * rail renders the real page through the same PDFium document as the stage.
   */
  const renderThumbnail = useCallback(
    async (targetPage: number, target: HTMLCanvasElement) => {
      if (!documentProxy) return;
      const { engine, doc, numPages } = documentProxy;
      const page = doc.pages[clamp(targetPage, 1, numPages) - 1];
      if (!page) return;
      const image = await engine
        .renderPageRaw(doc, page, {
          scaleFactor:
            PDF_READER_LAYOUT.thumbnailPageWidth / Math.max(1, page.size.width),
          withAnnotations: true,
        })
        .toPromise();
      paintImageData(target, image);
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
