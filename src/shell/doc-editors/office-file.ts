import { unzipSync } from "fflate";

import { fetchMediaBlob } from "../../lib/media-proxy";
import type { ArtifactRenditionPurpose } from "../artifact-contract";
import type { LibraryItem } from "../library-data";

export type OfficePackageKind = "pptx" | "xlsx" | "docx";

interface OfficePackageSpec {
  label: string;
  mainPart: string;
  extensions: readonly string[];
  mediaTypes: readonly string[];
}

const OFFICE_PACKAGE_SPECS: Record<OfficePackageKind, OfficePackageSpec> = {
  pptx: {
    label: "PPTX",
    mainPart: "ppt/presentation.xml",
    extensions: ["pptx", "pptm", "potx", "potm"],
    mediaTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint.presentation.macroenabled.12",
      "application/vnd.openxmlformats-officedocument.presentationml.template",
      "application/vnd.ms-powerpoint.template.macroenabled.12",
    ],
  },
  xlsx: {
    label: "XLSX",
    mainPart: "xl/workbook.xml",
    extensions: ["xlsx", "xlsm", "xltx"],
    mediaTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroenabled.12",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
    ],
  },
  docx: {
    label: "DOCX",
    mainPart: "word/document.xml",
    extensions: ["docx", "docm", "dotx"],
    mediaTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-word.document.macroenabled.12",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    ],
  },
};

const GENERIC_BINARY_MEDIA_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
]);

export class OfficeFileDiagnosticError extends Error {
  readonly code: string;
  readonly expectedKind: OfficePackageKind;

  constructor(code: string, expectedKind: OfficePackageKind, message: string) {
    super(message);
    this.name = "OfficeFileDiagnosticError";
    this.code = code;
    this.expectedKind = expectedKind;
  }
}

function normalizedMediaType(value: string): string {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function extensionHint(value: unknown): string {
  const text = String(value || "").trim().toLowerCase().replace(/^\./, "");
  if (/^[a-z0-9]{2,8}$/.test(text)) return text;
  try {
    const path = new URL(text, "https://office.invalid").pathname;
    return path.includes(".") ? path.split(".").pop() || "" : "";
  } catch {
    return "";
  }
}

function kindForHint(value: unknown): OfficePackageKind | null {
  const text = String(value || "").trim().toLowerCase();
  const mediaType = normalizedMediaType(text);
  const extension = extensionHint(text);
  for (const [kind, spec] of Object.entries(OFFICE_PACKAGE_SPECS) as Array<
    [OfficePackageKind, OfficePackageSpec]
  >) {
    if (
      spec.extensions.includes(extension) ||
      spec.mediaTypes.includes(mediaType)
    ) {
      return kind;
    }
  }
  return null;
}

/**
 * Resolve only real OOXML packages. CSV, legacy OLE Office files, markdown and
 * rendered previews deliberately return null instead of being guessed as ZIP.
 */
export function officePackageKindForItem(
  item: LibraryItem,
): OfficePackageKind | null {
  const hints = [
    item.artifact?.sourceFormat,
    item.meta.source_format,
    item.meta.format,
    item.meta.extension,
    item.meta.ext,
    item.meta.mime,
    item.artifact?.renditions.source?.mediaType,
    item.artifact?.renditions.source?.url,
    item.artifact?.renditions.full?.mediaType,
    item.artifact?.renditions.full?.url,
    item.url,
    item.title,
  ];
  for (const hint of hints) {
    const kind = kindForHint(hint);
    if (kind) return kind;
  }
  const explicitNonOoxml =
    hints.some((hint) =>
      [
        "application/msword",
        "application/vnd.ms-excel",
        "application/vnd.ms-powerpoint",
        "application/json",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.oasis.opendocument.presentation",
      ].includes(normalizedMediaType(String(hint || ""))),
    ) ||
    hints.map((hint) => extensionHint(hint)).some((extension) =>
      [
        "csv",
        "tsv",
        "xls",
        "xlsb",
        "ods",
        "doc",
        "rtf",
        "odt",
        "ppt",
        "pot",
        "odp",
        "json",
      ].includes(extension),
    );
  if (explicitNonOoxml) return null;
  if (item.artifactType === "deck" || item.kind === "ppt") return "pptx";
  if (item.artifactType === "grid" || item.kind === "sheet") return "xlsx";
  return null;
}

function renditionMatchesKind(
  rendition: { url: string; mediaType: string } | undefined,
  kind: OfficePackageKind,
): boolean {
  if (!rendition) return false;
  return (
    kindForHint(rendition.mediaType) === kind ||
    kindForHint(rendition.url) === kind
  );
}

function renditionExplicitlyConflicts(
  rendition: { url: string; mediaType: string } | undefined,
  kind: OfficePackageKind,
): boolean {
  if (!rendition) return false;
  const mediaType = normalizedMediaType(rendition.mediaType || "");
  if (GENERIC_BINARY_MEDIA_TYPES.has(mediaType)) return false;
  return kindForHint(mediaType) !== kind;
}

/**
 * Office viewers/editors may consume only the editable source or full delivery.
 * A thumbnail/preview is often a PNG and is never a parser fallback.
 */
export function officeRenditionPurposes(
  item: LibraryItem,
): readonly ArtifactRenditionPurpose[] {
  const kind = officePackageKindForItem(item);
  if (!kind || !item.artifact) return ["source", "full"];
  const { source, full } = item.artifact.renditions;
  const sourceFormatMatches = kindForHint(item.artifact.sourceFormat) === kind;
  if (
    (sourceFormatMatches &&
      source?.url &&
      !renditionExplicitlyConflicts(source, kind)) ||
    renditionMatchesKind(source, kind)
  ) {
    return ["source", "full"];
  }
  if (renditionMatchesKind(full, kind)) return ["full", "source"];
  if (
    source?.url &&
    renditionExplicitlyConflicts(source, kind) &&
    full?.url
  ) {
    return ["full", "source"];
  }
  return ["source", "full"];
}

export function officeViewerRenditionPurposes(
  item: LibraryItem,
): readonly ArtifactRenditionPurpose[] | undefined {
  return officePackageKindForItem(item)
    ? officeRenditionPurposes(item)
    : undefined;
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

function signature(bytes: Uint8Array): string {
  return [...bytes.slice(0, 8)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");
}

function hasImageMagic(bytes: Uint8Array): boolean {
  const ascii = String.fromCharCode(...bytes.slice(0, 12));
  return (
    (bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47) ||
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    ascii.startsWith("GIF87a") ||
    ascii.startsWith("GIF89a") ||
    (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP")
  );
}

export function validateSpreadsheetParserBytes(
  bytes: Uint8Array,
  contentType = "",
): void {
  const mediaType = normalizedMediaType(contentType);
  if (
    mediaType.startsWith("image/") ||
    mediaType === "text/html" ||
    hasImageMagic(bytes)
  ) {
    throw new OfficeFileDiagnosticError(
      "spreadsheet-preview-blocked",
      "xlsx",
      `表格源校验失败：Content-Type ${mediaType || "（空）"}，文件头 ${
        signature(bytes) || "为空"
      }。这是图片或错误页，不是工作簿；已阻止送入 XLSX 解析器。请刷新 source/full rendition 后重试。`,
    );
  }
}

function validateTransportMediaType(
  contentType: string,
  kind: OfficePackageKind,
): void {
  const mediaType = normalizedMediaType(contentType);
  const spec = OFFICE_PACKAGE_SPECS[kind];
  if (
    GENERIC_BINARY_MEDIA_TYPES.has(mediaType) ||
    spec.mediaTypes.includes(mediaType)
  ) {
    return;
  }
  const returnedKind = kindForHint(mediaType);
  const detail = returnedKind
    ? `服务器返回的是 ${OFFICE_PACKAGE_SPECS[returnedKind].label}`
    : `服务器返回 Content-Type ${mediaType || "（空）"}`;
  const blockedPreview = mediaType.startsWith("image/")
    ? "；这是渲染预览，不是可编辑源文件，已阻止送入解析器"
    : "";
  throw new OfficeFileDiagnosticError(
    "content-type-mismatch",
    kind,
    `${spec.label} 类型校验失败：${detail}${blockedPreview}。请刷新安全地址，或下载原文件检查 source/full rendition。`,
  );
}

export function validateOfficePackageBytes(
  bytes: Uint8Array,
  kind: OfficePackageKind,
  contentType = "",
): void {
  const spec = OFFICE_PACKAGE_SPECS[kind];
  validateTransportMediaType(contentType, kind);
  if (!hasZipMagic(bytes)) {
    throw new OfficeFileDiagnosticError(
      "magic-mismatch",
      kind,
      `${spec.label} 魔数校验失败（文件头 ${signature(bytes) || "为空"}）。已阻止把图片或错误页送入解析器；请刷新安全地址后重试。`,
    );
  }
  let packageParts: Record<string, Uint8Array>;
  try {
    packageParts = unzipSync(bytes, {
      filter: (file) =>
        file.name === "[Content_Types].xml" || file.name === spec.mainPart,
    });
  } catch (caught) {
    throw new OfficeFileDiagnosticError(
      "invalid-zip",
      kind,
      `${spec.label} ZIP 包损坏，无法读取 OOXML 目录（${
        caught instanceof Error ? caught.message : "未知错误"
      }）。请重新下载原文件后重试。`,
    );
  }
  if (
    !packageParts["[Content_Types].xml"] ||
    !packageParts[spec.mainPart]
  ) {
    throw new OfficeFileDiagnosticError(
      "package-kind-mismatch",
      kind,
      `${spec.label} 包缺少 ${spec.mainPart}。该地址不是可编辑的 ${spec.label} source/full；请刷新 rendition 或打开原文件诊断。`,
    );
  }
}

export async function validateOfficePackageBlob(
  blob: Blob,
  kind: OfficePackageKind,
): Promise<ArrayBuffer> {
  const buffer = await blob.arrayBuffer();
  validateOfficePackageBytes(new Uint8Array(buffer), kind, blob.type);
  return buffer;
}

export function isOfficeAccessDeniedError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return /\bHTTP\s+(?:401|403)\b/i.test(message);
}

export function notifyOfficeAccessDenied(
  reason: unknown,
  onAccessDenied?: () => void,
): void {
  if (isOfficeAccessDeniedError(reason)) onAccessDenied?.();
}

export async function fetchValidatedOfficePackage(
  url: string,
  kind: OfficePackageKind,
  options: {
    maxBytes?: number;
    signal?: AbortSignal;
    onAccessDenied?: () => void;
  } = {},
): Promise<{ blob: Blob; arrayBuffer: ArrayBuffer }> {
  try {
    const blob = await fetchMediaBlob(url, {
      cache: "no-store",
      maxBytes: options.maxBytes,
      signal: options.signal,
    });
    return {
      blob,
      arrayBuffer: await validateOfficePackageBlob(blob, kind),
    };
  } catch (caught) {
    if (isOfficeAccessDeniedError(caught)) {
      options.onAccessDenied?.();
      throw new OfficeFileDiagnosticError(
        "signed-url-expired",
        kind,
        `${OFFICE_PACKAGE_SPECS[kind].label} 安全地址已失效（HTTP 401/403），正在刷新同一 revision 的 source/full；请稍候重试。`,
      );
    }
    throw caught;
  }
}

export async function fetchValidatedSpreadsheetSource(
  url: string,
  item: LibraryItem,
  options: {
    maxBytes?: number;
    signal?: AbortSignal;
    onAccessDenied?: () => void;
  } = {},
): Promise<ArrayBuffer> {
  if (officePackageKindForItem(item) === "xlsx") {
    return (
      await fetchValidatedOfficePackage(url, "xlsx", options)
    ).arrayBuffer;
  }
  try {
    const blob = await fetchMediaBlob(url, {
      cache: "no-store",
      maxBytes: options.maxBytes,
      signal: options.signal,
    });
    const arrayBuffer = await blob.arrayBuffer();
    validateSpreadsheetParserBytes(new Uint8Array(arrayBuffer), blob.type);
    return arrayBuffer;
  } catch (caught) {
    if (isOfficeAccessDeniedError(caught)) {
      options.onAccessDenied?.();
      throw new OfficeFileDiagnosticError(
        "signed-url-expired",
        "xlsx",
        "表格安全地址已失效（HTTP 401/403），正在刷新同一 revision 的 source/full；请稍候重试。",
      );
    }
    throw caught;
  }
}
