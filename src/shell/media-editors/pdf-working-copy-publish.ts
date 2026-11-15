import type { PdfAnnotationObject, PdfWidgetAnnoObject } from "@embedpdf/models";
import { resolvePdfMedia } from "./pdf-source-reference";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { openPdfEngineDocument } from "./pdf-engine-host";
import { applyPdfPageOperations, createBlankPdf } from "./pdf-operations";
import { pdfLiveAnnotation, type PdfWorkingCopy } from "./pdf-recovery";

export { applyPdfPageOperations } from "./pdf-operations";

export async function pdfWorkingSource(doc: PdfWorkingCopy): Promise<Uint8Array> {
  return doc.source.blank ? createBlankPdf() : new Uint8Array(await (await fetchMediaBlob(await resolvePdfMedia(doc.source))).arrayBuffer());
}

/** Independent PDFium document: no mounted viewer, canvas or React state is needed. */
export async function buildPdfWorkingCopy(doc: PdfWorkingCopy, source?: Uint8Array): Promise<Uint8Array> {
  const annotationOperationCount = doc.annotationOperationCount ?? doc.operations.length;
  const bytes = await applyPdfPageOperations(source ?? await pdfWorkingSource(doc), doc.operations.slice(0, annotationOperationCount));
  const opened = await openPdfEngineDocument(bytes);
  const { engine, doc: pdf } = opened;
  try {
    for (const page of pdf.pages) {
      const existing = await engine.getPageAnnotations(pdf, page).toPromise();
      const wanted = doc.annotations.filter(({ annotation }) => annotation.pageIndex === page.index);
      const ids = new Set(wanted.map(({ annotation }) => annotation.id));
      for (const annotation of existing) {
        if (!ids.has(annotation.id)) if (!await engine.removePageAnnotation(pdf, page, annotation).toPromise()) throw new Error("PDF 保存失败");
      }
      for (const entry of wanted) {
        const annotation = pdfLiveAnnotation(entry.annotation) as PdfAnnotationObject;
        if (annotation.type === 20 && Object.hasOwn(doc.formValues, annotation.field.name)) {
          annotation.field = { ...annotation.field, value: doc.formValues[annotation.field.name] };
        }
        if (existing.some((current) => current.id === annotation.id)) {
          if (!await engine.updatePageAnnotation(pdf, page, annotation).toPromise()) throw new Error("PDF 保存失败");
          if (annotation.type === 20 && (annotation as PdfWidgetAnnoObject).field) {
            if (!await engine.setFormFieldState(pdf, page, annotation as PdfWidgetAnnoObject, (annotation as PdfWidgetAnnoObject).field).toPromise()) throw new Error("PDF 保存失败");
          }
        } else {
          const context = entry.media ? {
            data: await (await fetchMediaBlob(await resolvePdfMedia(entry.media))).arrayBuffer(),
            mimeType: entry.media.mimeType,
          } : undefined;
          if (!await engine.createPageAnnotation(pdf, page, annotation, context as never).toPromise()) throw new Error("PDF 保存失败");
        }
      }
    }
    let saved = new Uint8Array(await engine.saveAsCopy(pdf).toPromise());
    if (doc.annotations.some(({ annotation }) => annotation.type === 3 && /[^\u0000-\u00ff]/u.test(String(annotation.contents ?? "")))) {
      const { fixPdfCjkFreeTextAppearances } = await import("./pdf-cjk-appearance");
      saved = new Uint8Array((await fixPdfCjkFreeTextAppearances(saved)).bytes);
    }
    return applyPdfPageOperations(saved, doc.operations.slice(annotationOperationCount));
  } finally { await opened.close(); }
}
