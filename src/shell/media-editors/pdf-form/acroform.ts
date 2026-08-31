import {
  PDFCheckBox,
  PDFDropdown,
  PDFField,
  PDFForm,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
} from "pdf-lib";
import {
  pdfPageGeometry,
  pdfRectToVisual,
  visualRectToPdf,
  type PdfVisualRect,
} from "../pdf-annotation-operations";
import { loadPdfDocument, savePdfDocument } from "./pdf-document-io";
import type { PdfFormFieldKind, PdfFormFieldView } from "./types";

function fieldKind(field: PDFField): PdfFormFieldKind {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "option-list";
  if (field instanceof PDFSignature) return "signature";
  return "text";
}

function readFieldValue(field: PDFField): string | boolean | string[] {
  if (field instanceof PDFTextField) return field.getText() ?? "";
  if (field instanceof PDFCheckBox) return field.isChecked();
  if (field instanceof PDFRadioGroup) return field.getSelected() ?? "";
  if (field instanceof PDFDropdown) return field.getSelected()?.[0] ?? "";
  if (field instanceof PDFOptionList) return field.getSelected();
  if (field instanceof PDFSignature) return "";
  return "";
}

function readOptions(field: PDFField): string[] {
  if (field instanceof PDFRadioGroup) return field.getOptions();
  if (field instanceof PDFDropdown) return field.getOptions();
  if (field instanceof PDFOptionList) return field.getOptions();
  return [];
}

function widgetPageIndex(form: PDFForm, field: PDFField): number {
  const widgets = field.acroField.getWidgets();
  if (!widgets.length) return 0;
  const pageRef = widgets[0].P();
  if (!pageRef) return 0;
  const pages = form.doc.getPages();
  const index = pages.findIndex((page) => page.ref === pageRef);
  return index >= 0 ? index : 0;
}

function widgetVisualRect(
  document: PDFForm["doc"],
  field: PDFField,
  pageIndex: number,
): PdfVisualRect | null {
  const widgets = field.acroField.getWidgets();
  if (!widgets.length) return null;
  const rect = widgets[0].getRectangle();
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    return null;
  }
  try {
    const geometry = pdfPageGeometry(document, pageIndex);
    return pdfRectToVisual(
      {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      geometry,
    );
  } catch {
    return null;
  }
}

export const PDF_FORM_NO_FIELDS = "此 PDF 无表单域";

export async function listPdfFormFields(bytes: Uint8Array): Promise<PdfFormFieldView[]> {
  const document = await loadPdfDocument(bytes);
  const form = document.getForm();
  return form.getFields().map((field) => {
    const pageIndex = widgetPageIndex(form, field);
    return {
      name: field.getName(),
      kind: fieldKind(field),
      pageIndex,
      rect: widgetVisualRect(document, field, pageIndex),
      required: field.isRequired(),
      readOnly: field.isReadOnly(),
      value: readFieldValue(field),
      options: readOptions(field),
    };
  });
}

export function validatePdfFormValues(
  fields: readonly PdfFormFieldView[],
  values: Record<string, string | boolean | string[]>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.readOnly || field.kind === "signature") continue;
    const raw = values[field.name] ?? field.value;
    if (!field.required) continue;
    if (field.kind === "checkbox") {
      if (raw !== true) errors[field.name] = "此字段为必填项";
      continue;
    }
    if (field.kind === "option-list") {
      const selected = Array.isArray(raw) ? raw : [];
      if (!selected.length) errors[field.name] = "此字段为必填项";
      continue;
    }
    const text = String(raw ?? "").trim();
    if (!text) errors[field.name] = "此字段为必填项";
    if (field.kind === "text" && field.name.toLowerCase().includes("email")) {
      if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        errors[field.name] = "请输入有效的电子邮件地址";
      }
    }
  }
  return errors;
}

function applyFieldValue(
  field: PDFField,
  value: string | boolean | string[],
): void {
  if (field.isReadOnly()) return;
  if (field instanceof PDFTextField) {
    field.setText(String(value ?? ""));
    return;
  }
  if (field instanceof PDFCheckBox) {
    if (value === true) field.check();
    else field.uncheck();
    return;
  }
  if (field instanceof PDFRadioGroup) {
    const selected = String(value ?? "");
    if (selected) field.select(selected);
    return;
  }
  if (field instanceof PDFDropdown) {
    const selected = String(value ?? "");
    if (selected) field.select(selected);
    return;
  }
  if (field instanceof PDFOptionList) {
    const selected = Array.isArray(value) ? value : [];
    field.select(selected);
  }
}

export async function fillPdfForm(
  bytes: Uint8Array,
  values: Record<string, string | boolean | string[]>,
  flatten: boolean,
): Promise<Uint8Array> {
  const document = await loadPdfDocument(bytes);
  const form = document.getForm();
  const fields = form.getFields();
  if (!fields.length) {
    throw new Error(PDF_FORM_NO_FIELDS);
  }
  for (const field of fields) {
    const next = values[field.getName()];
    if (next === undefined) continue;
    applyFieldValue(field, next);
  }
  form.updateFieldAppearances();
  if (flatten) {
    form.flatten();
  }
  return savePdfDocument(document);
}

export function formFieldCount(bytes: Uint8Array): Promise<number> {
  return listPdfFormFields(bytes).then((fields) => fields.length);
}

/** Whether the saved bytes still carry an interactive AcroForm dictionary. */
export async function pdfHasInteractiveForm(bytes: Uint8Array): Promise<boolean> {
  const document = await loadPdfDocument(bytes);
  try {
    return document.getForm().getFields().length > 0;
  } catch {
    return false;
  }
}

export function visualRectForFormWidget(
  bytes: Uint8Array,
  pageIndex: number,
  rect: PdfVisualRect,
): Promise<PdfVisualRect> {
  return loadPdfDocument(bytes).then((document) => {
    pdfPageGeometry(document, pageIndex);
    visualRectToPdf(rect, pdfPageGeometry(document, pageIndex));
    return rect;
  });
}
