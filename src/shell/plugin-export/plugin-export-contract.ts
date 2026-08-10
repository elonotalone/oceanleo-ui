/**
 * Transitional leaf kept only because `GridStage.tsx` and `MyLibrary.tsx` are
 * outside this task's ownership. The plugin catalog, runtime, audit, rendering,
 * wiring and public barrel have been removed.
 */

import type { ArtifactType } from "../artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";

export type PluginExportFormId =
  | "xlsx"
  | "csv"
  | "pdf"
  | "long-image"
  | "html"
  | "docx";

export interface PluginExportForm {
  id: PluginExportFormId;
  label: string;
}

const FORM_BY_ID = new Map<PluginExportFormId, PluginExportForm>([
  ["xlsx", { id: "xlsx", label: "Excel 表格" }],
  ["csv", { id: "csv", label: "CSV 表格" }],
  ["pdf", { id: "pdf", label: "PDF" }],
  ["long-image", { id: "long-image", label: "图文长图" }],
  ["html", { id: "html", label: "网页" }],
  ["docx", { id: "docx", label: "Word 文档" }],
]);

/** Legacy label lookup required by the out-of-scope, now-unreachable ledger bar. */
export function pluginExportForm(id: PluginExportFormId): PluginExportForm | null {
  return FORM_BY_ID.get(id) || null;
}

const DOWNLOADABLE_ARTIFACT_TYPES = new Set<ArtifactType>([
  "single_file_image",
  "vector_image",
  "video",
  "audio",
  "model_3d",
  "document",
  "deck",
  "composite_image",
  "pdf",
  "chart",
  "workflow",
  "website",
  "game",
  "grid",
]);

/** Keep runtime-only entries out of My Library; no plugin registry is consulted. */
export function libraryEntryIsDownloadableMaterial(item: LibraryItem): boolean {
  if (!isDurableLibraryItem(item)) return false;
  const meta = (item.meta || {}) as Record<string, unknown>;
  if (meta.oceanleo_surface === "runtime") return false;
  if (meta.library_source === "runtime") return false;
  if (meta.downloadable === false) return false;
  const artifactType = item.artifactType || item.artifact?.artifactType;
  return DOWNLOADABLE_ARTIFACT_TYPES.has(artifactType as ArtifactType);
}
