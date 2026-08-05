"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  addPdfHighlightAnnotation,
  addPdfTextAnnotationAt,
  deletePdfAnnotation,
  listPdfAnnotations,
  movePdfAnnotation,
  updatePdfAnnotation,
  type PdfAnnotationView,
  type PdfVisualPoint,
  type PdfVisualRect,
} from "./pdf-annotation-operations";
import { pdfErrorMessage } from "./pdf-workbench-utils";

export interface PdfMutationResult {
  bytes: Uint8Array;
  pageNumber?: number;
  notice: string;
}

export type PdfMutationRunner = (
  mutation: (bytes: Uint8Array) => Promise<PdfMutationResult>,
) => Promise<PdfMutationResult | null>;

export function usePdfAnnotations({
  bytesRef,
  pageNumber,
  pageCount,
  documentRevision,
  resetKey,
  runMutation,
  setError,
  tt: providedTranslate,
}: {
  bytesRef: MutableRefObject<Uint8Array | null>;
  pageNumber: number;
  pageCount: number;
  documentRevision: number;
  resetKey: string;
  runMutation: PdfMutationRunner;
  setError: Dispatch<SetStateAction<string>>;
  tt: UITranslate;
}) {
  // `tt` 由 `usePdfWorkbench` 从 `useUI()` 直接透传，是 provider 所有的函数。它进
  // 下面那个批注读取 effect 的依赖，就是 W13 治过的自锁引信：effect 体里
  // `setAnnotations(...)` / `setError(...)` → 重渲染 → `tt` 换身份 → 再解析一遍
  // 整份 PDF 的批注。语言切换与「这一页有哪些批注」无关，答案明确是不该重跑。
  // 沿用 W13 在 `doc-editors/use-grid-editor.ts:518-531` 定下的 ref + 恒定包装，
  // 下面的 `tt` 即该包装（`vars` 一并转发）。其余 `tt` 调用都在延迟执行的回调体里，
  // 读的是 ref 中的最新 `tt`，文案不会提前定格。
  const translateRef = useRef(providedTranslate);
  useEffect(() => {
    translateRef.current = providedTranslate;
  }, [providedTranslate]);
  const tt = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

  const [annotationText, setAnnotationText] = useState("");
  const [annotations, setAnnotations] = useState<PdfAnnotationView[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState("");
  const [annotationTool, setAnnotationTool] = useState<
    "select" | "text" | "highlight"
  >("select");

  useEffect(() => {
    setAnnotationText("");
    setAnnotations([]);
    setSelectedAnnotationId("");
    setAnnotationTool("select");
  }, [resetKey]);

  useEffect(() => {
    const bytes = bytesRef.current;
    if (!bytes || pageNumber < 1 || pageNumber > pageCount) {
      setAnnotations([]);
      setSelectedAnnotationId("");
      return;
    }
    let active = true;
    void listPdfAnnotations(bytes, pageNumber - 1)
      .then((next) => {
        if (!active) return;
        setAnnotations(next);
        setSelectedAnnotationId((current) =>
          next.some((annotation) => annotation.id === current) ? current : "",
        );
      })
      .catch((caught) => {
        if (active) {
          setError(pdfErrorMessage(caught, tt("PDF 批注读取失败")));
        }
      });
    return () => {
      active = false;
    };
  }, [
    bytesRef,
    documentRevision,
    pageCount,
    pageNumber,
    setError,
    tt,
  ]);

  const placeTextAnnotation = useCallback(
    async (point: PdfVisualPoint) => {
      const text = annotationText.trim();
      if (!text) {
        setError(tt("请输入批注内容"));
        return;
      }
      let createdId = "";
      const committed = await runMutation(async (bytes) => {
        const result = await addPdfTextAnnotationAt(
          bytes,
          pageNumber - 1,
          text,
          point,
        );
        createdId = result.id;
        return {
          bytes: result.bytes,
          pageNumber,
          notice: tt("文字批注已添加到当前页"),
        };
      });
      if (committed) {
        setSelectedAnnotationId(createdId);
        setAnnotationTool("select");
      }
    },
    [annotationText, pageNumber, runMutation, setError, tt],
  );

  const addHighlight = useCallback(
    async (rect: PdfVisualRect) => {
      let createdId = "";
      const committed = await runMutation(async (bytes) => {
        const result = await addPdfHighlightAnnotation(
          bytes,
          pageNumber - 1,
          rect,
          annotationText,
        );
        createdId = result.id;
        return {
          bytes: result.bytes,
          pageNumber,
          notice: tt("高亮已添加到当前页"),
        };
      });
      if (committed) {
        setSelectedAnnotationId(createdId);
        setAnnotationTool("select");
      }
    },
    [annotationText, pageNumber, runMutation, tt],
  );

  const updateSelectedAnnotation = useCallback(
    async (contents: string) => {
      if (!selectedAnnotationId) return;
      const committed = await runMutation(async (bytes) => ({
        bytes: await updatePdfAnnotation(
          bytes,
          pageNumber - 1,
          selectedAnnotationId,
          contents,
        ),
        pageNumber,
        notice: tt("批注已更新"),
      }));
      if (committed) setSelectedAnnotationId(selectedAnnotationId);
    },
    [pageNumber, runMutation, selectedAnnotationId, tt],
  );

  const moveAnnotation = useCallback(
    async (id: string, rect: PdfVisualRect) => {
      if (!id) return;
      const committed = await runMutation(async (bytes) => ({
        bytes: await movePdfAnnotation(
          bytes,
          pageNumber - 1,
          id,
          rect,
        ),
        pageNumber,
        notice: tt("批注已移动"),
      }));
      if (committed) setSelectedAnnotationId(id);
    },
    [pageNumber, runMutation, tt],
  );

  const deleteSelectedAnnotation = useCallback(async () => {
    if (!selectedAnnotationId) return;
    const committed = await runMutation(async (bytes) => ({
      bytes: await deletePdfAnnotation(
        bytes,
        pageNumber - 1,
        selectedAnnotationId,
      ),
      pageNumber,
      notice: tt("批注已删除"),
    }));
    if (committed) {
      setSelectedAnnotationId("");
      setAnnotationText("");
      setAnnotationTool("select");
    }
  }, [pageNumber, runMutation, selectedAnnotationId, tt]);

  const selectedAnnotation = useMemo(
    () =>
      annotations.find(
        (annotation) => annotation.id === selectedAnnotationId,
      ) || null,
    [annotations, selectedAnnotationId],
  );

  return {
    annotationText,
    setAnnotationText,
    annotations,
    selectedAnnotationId,
    selectedAnnotation,
    annotationTool,
    setAnnotationTool,
    selectAnnotation: (id: string) => {
      const annotation = annotations.find((entry) => entry.id === id);
      setSelectedAnnotationId(annotation?.id || "");
      setAnnotationText(annotation?.contents || "");
      setAnnotationTool("select");
    },
    clearSelection: () => {
      setSelectedAnnotationId("");
      setAnnotationTool("select");
    },
    addTextAnnotation: () => placeTextAnnotation({ x: 0.9, y: 0.1 }),
    addTextAnnotationAt: placeTextAnnotation,
    addHighlightAnnotation: addHighlight,
    moveAnnotation,
    updateSelectedAnnotation,
    deleteSelectedAnnotation,
  };
}
