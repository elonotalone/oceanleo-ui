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
import type { UITranslate } from "../../../i18n/ui/useUI";
import type { PdfVisualRect } from "../pdf-annotation-operations";
import type { PdfMutationRunner } from "../use-pdf-annotations";
import {
  fillPdfForm,
  listPdfFormFields,
  validatePdfFormValues,
} from "./acroform";
import {
  applyPdfRedactions,
  REDACTION_BROADENED,
  REDACTION_IRREVERSIBLE,
} from "./redaction";
import {
  createSavedSignature,
  loadSavedSignatures,
  persistSavedSignatures,
  placeCrossPageSeal,
  placeImageSignature,
  signaturePngBytes,
  SIGNATURE_NOT_PKI,
} from "./signature";
import type {
  PdfFormFieldView,
  PdfOfficeTool,
  PdfOfficeWorkbenchState,
  PdfRedactionMark,
  PdfSavedSignature,
} from "./types";

function freshId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function usePdfOffice({
  bytesRef,
  pageNumber,
  documentRevision,
  pageCount,
  runMutation,
  setError,
  setNotice,
  tt: providedTranslate,
}: {
  bytesRef: MutableRefObject<Uint8Array | null>;
  pageNumber: number;
  pageCount: number;
  documentRevision: number;
  runMutation: PdfMutationRunner;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  tt: UITranslate;
}): Omit<
  PdfOfficeWorkbenchState,
  keyof import("../pdf-workbench-state").PdfWorkbenchState
> {
  const translateRef = useRef(providedTranslate);
  useEffect(() => {
    translateRef.current = providedTranslate;
  }, [providedTranslate]);
  const tt = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

  const [formFields, setFormFields] = useState<PdfFormFieldView[]>([]);
  const [formValues, setFormValuesState] = useState<
    Record<string, string | boolean | string[]>
  >({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formFlatten, setFormFlatten] = useState(false);
  const [officeTool, setOfficeTool] = useState<PdfOfficeTool>("none");
  const [savedSignatures, setSavedSignatures] = useState<PdfSavedSignature[]>(
    () => loadSavedSignatures(),
  );
  const [pendingSignatureId, setPendingSignatureId] = useState("");
  const [redactionMarks, setRedactionMarks] = useState<PdfRedactionMark[]>([]);
  const [redactionPreview, setRedactionPreview] = useState<PdfVisualRect | null>(
    null,
  );

  useEffect(() => {
    const bytes = bytesRef.current;
    if (!bytes || pageCount < 1) {
      setFormFields([]);
      setFormValuesState({});
      return;
    }
    let cancelled = false;
    void listPdfFormFields(bytes)
      .then((fields) => {
        if (cancelled) return;
        setFormFields(fields);
        const initial: Record<string, string | boolean | string[]> = {};
        for (const field of fields) {
          initial[field.name] = field.value;
        }
        setFormValuesState(initial);
        setFormErrors({});
      })
      .catch(() => {
        if (!cancelled) {
          setFormFields([]);
          setFormValuesState({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bytesRef, documentRevision, pageCount]);

  const formHasFields = formFields.length > 0;

  const setFormValue = useCallback(
    (name: string, value: string | boolean | string[]) => {
      setFormValuesState((current) => ({ ...current, [name]: value }));
      setFormErrors((current) => {
        if (!current[name]) return current;
        const next = { ...current };
        delete next[name];
        return next;
      });
    },
    [],
  );

  const applyFormFill = useCallback(async () => {
    const errors = validatePdfFormValues(formFields, formValues);
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      setError(tt("请先修正表单校验错误"));
      return;
    }
    await runMutation(async (bytes) => {
      const next = await fillPdfForm(bytes, formValues, formFlatten);
      return {
        bytes: next,
        notice: formFlatten
          ? tt("表单已填写并扁平化为定稿")
          : tt("表单已填写，字段仍可编辑"),
      };
    });
  }, [formFields, formFlatten, formValues, runMutation, setError, tt]);

  const saveSignatureFromPng = useCallback(
    (label: string, pngBytes: Uint8Array) => {
      const entry = createSavedSignature(label, pngBytes);
      setSavedSignatures((current) => {
        const next = [entry, ...current.filter((item) => item.id !== entry.id)];
        persistSavedSignatures(next);
        return next;
      });
      setNotice(tt("已保存常用图像签章"));
    },
    [setNotice, tt],
  );

  const removeSavedSignature = useCallback((id: string) => {
    setSavedSignatures((current) => {
      const next = current.filter((entry) => entry.id !== id);
      persistSavedSignatures(next);
      return next;
    });
  }, []);

  const placeSignatureAt = useCallback(
    async (rect: PdfVisualRect) => {
      const entry = savedSignatures.find((item) => item.id === pendingSignatureId);
      if (!entry) {
        setError(tt("请先选择要放置的图像签章"));
        return;
      }
      await runMutation(async (bytes) => {
        const next = await placeImageSignature(
          bytes,
          pageNumber - 1,
          rect,
          signaturePngBytes(entry),
        );
        return { bytes: next, notice: tt("已放置图像签章（非 PKI 数字签名）") };
      });
      setOfficeTool("none");
    },
    [pageNumber, pendingSignatureId, runMutation, savedSignatures, setError, tt],
  );

  const addRedactionMark = useCallback(
    (rect: PdfVisualRect) => {
      if (rect.width < 0.005 || rect.height < 0.005) return;
      setRedactionMarks((current) => [
        ...current,
        {
          id: freshId("redact"),
          pageIndex: pageNumber - 1,
          rect,
        },
      ]);
      setRedactionPreview(null);
      setNotice(tt("已标记涂黑区域，应用前仍可删除"));
    },
    [pageNumber, setNotice, tt],
  );

  const removeRedactionMark = useCallback((id: string) => {
    setRedactionMarks((current) => current.filter((mark) => mark.id !== id));
  }, []);

  const applyRedactions = useCallback(async () => {
    if (!redactionMarks.length) {
      setError(tt("请先标记要涂黑的区域"));
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm(REDACTION_IRREVERSIBLE);
      if (!ok) return;
    }
    await runMutation(async (bytes) => {
      const outcome = await applyPdfRedactions(bytes, redactionMarks);
      const summary = tt("涂黑已应用：移除 {text} 处文字、{image} 处图像", {
        text: outcome.removedTextCount,
        image: outcome.removedImageCount,
      });
      return {
        bytes: outcome.bytes,
        notice: outcome.broadenedPages.length
          ? `${summary}。${tt(REDACTION_BROADENED)}`
          : summary,
      };
    });
    setRedactionMarks([]);
    setOfficeTool("none");
  }, [redactionMarks, runMutation, setError, tt]);

  const applyCrossPageSeal = useCallback(async () => {
    const entry = savedSignatures.find((item) => item.id === pendingSignatureId);
    if (!entry) {
      setError(tt("请先选择骑缝章图像"));
      return;
    }
    if (pageCount < 2) {
      setError(tt("骑缝章至少需要两页"));
      return;
    }
    await runMutation(async (bytes) => {
      const next = await placeCrossPageSeal(bytes, signaturePngBytes(entry));
      return {
        bytes: next,
        notice: tt("已添加骑缝图像签章：印章已切成 {count} 片，每页一片", {
          count: pageCount,
        }),
      };
    });
  }, [pageCount, pendingSignatureId, runMutation, savedSignatures, setError, tt]);

  const signaturePlacementLabel = useMemo(() => {
    if (officeTool !== "signature") return "";
    const entry = savedSignatures.find((item) => item.id === pendingSignatureId);
    return entry
      ? tt("在页面上拖画以放置「{label}」", { label: entry.label })
      : tt("请选择图像签章后在页面上拖画区域");
  }, [officeTool, pendingSignatureId, savedSignatures, tt]);

  return {
    formFields,
    formHasFields,
    formValues,
    formErrors,
    formFlatten,
    setFormValue,
    setFormFlatten,
    applyFormFill,
    officeTool,
    setOfficeTool,
    savedSignatures,
    saveSignatureFromPng,
    removeSavedSignature,
    pendingSignatureId,
    setPendingSignatureId,
    placeSignatureAt,
    applyCrossPageSeal,
    redactionMarks,
    redactionPreview,
    setRedactionPreview,
    addRedactionMark,
    removeRedactionMark,
    applyRedactions,
    signaturePlacementLabel,
    signatureDisclaimer: SIGNATURE_NOT_PKI,
  };
}
