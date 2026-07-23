/**
 * Pure Office-family classification used by the lightweight browser editors.
 *
 * This module deliberately has no transport, script-loader, DOM-global, or
 * embedded-editor lifecycle. Source retrieval and durable saves stay in the
 * RichDoc, Grid, and Deck editor chains.
 */

export type LightweightOfficeKind = "document" | "sheet" | "ppt";
export type LightweightOfficeRoute = "richdoc" | "grid" | "deck";

const DOCUMENT_EXTENSIONS = new Set([
  "docx",
  "doc",
  "docm",
  "dotx",
  "odt",
  "rtf",
  "txt",
  "epub",
  "mht",
]);
const CELL_EXTENSIONS = new Set([
  "xlsx",
  "xls",
  "xlsm",
  "xlsb",
  "xltx",
  "ods",
  "csv",
  "tsv",
]);
const SLIDE_EXTENSIONS = new Set([
  "pptx",
  "ppt",
  "pptm",
  "pot",
  "potx",
  "potm",
  "odp",
]);

const OFFICE_EXTENSIONS = new Set([
  ...DOCUMENT_EXTENSIONS,
  ...CELL_EXTENSIONS,
  ...SLIDE_EXTENSIONS,
]);

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\./, "");
  if (OFFICE_EXTENSIONS.has(normalized)) return normalized;
  try {
    const path = new URL(value, "https://local.invalid").pathname.toLowerCase();
    const extension = path.includes(".") ? path.split(".").pop() || "" : "";
    return OFFICE_EXTENSIONS.has(extension) ? extension : "";
  } catch {
    return "";
  }
}

/** Return the recognized Office extension from a URL, filename, or token. */
export function officeExtensionOf(value: string): string {
  return normalizeExtension(value);
}

/** Normalize a recognized extension to the material family used for saves. */
export function officeKindForExtension(
  extension: string,
): LightweightOfficeKind {
  const normalized = normalizeExtension(extension);
  if (CELL_EXTENSIONS.has(normalized)) return "sheet";
  if (SLIDE_EXTENSIONS.has(normalized)) return "ppt";
  return "document";
}

/** Select one of the in-process native editor routes, or null when unknown. */
export function lightweightOfficeRouteForExtension(
  extension: string,
): LightweightOfficeRoute | null {
  const normalized = normalizeExtension(extension);
  if (DOCUMENT_EXTENSIONS.has(normalized)) return "richdoc";
  if (CELL_EXTENSIONS.has(normalized)) return "grid";
  if (SLIDE_EXTENSIONS.has(normalized)) return "deck";
  return null;
}
