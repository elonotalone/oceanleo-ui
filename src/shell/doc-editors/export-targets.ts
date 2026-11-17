/** One download/conversion table, shared by live editors and saved Library files. */
export type ExportEditor = "richdoc" | "deck" | "grid" | "pdf" | "image" | "vector_image" | "video-timeline" | "audio";
export interface ExportTarget { target: string; where: "client" | "server"; label: string }
export interface ExportCapabilities { sources: Record<string, readonly ExportTarget[]> }
const client = (...targets: string[]): ExportTarget[] => targets.map(target => ({ target, where: "client", label: exportTargetLabel(target) }));
export const CLIENT_EXPORT_TARGETS: Record<ExportEditor, readonly ExportTarget[]> = {
  richdoc: client("docx", "md", "html", "txt", "json"),
  deck: client("pptx"), grid: client("xlsx", "csv"), pdf: client("pdf"),
  image: client("png", "jpg", "webp", "pdf"), vector_image: client("png", "jpg", "webp", "pdf", "svg"),
  "video-timeline": client("mp4"), audio: client("wav"),
};
const sourceKeys: Record<ExportEditor, string[]> = {
  richdoc: ["document", "docx"], deck: ["deck", "pptx"], grid: ["grid", "sheet", "xlsx"],
  pdf: ["pdf"], image: ["image", "single_file_image", "png"], vector_image: ["vector_image", "svg"],
  "video-timeline": ["video", "mp4"], audio: ["audio", "wav"],
};
/** Server availability is never invented; a registered local generator wins duplicates. */
export function mergeExportTargets(capabilities: ExportCapabilities | null, editor: ExportEditor, localTargets = CLIENT_EXPORT_TARGETS[editor], sourceFormat?: string): ExportTarget[] {
  const sourceRows = (key: string) => Array.isArray(capabilities?.sources[key]) ? capabilities!.sources[key] : [];
  const rows = sourceFormat ? sourceRows(sourceFormat) : sourceKeys[editor].flatMap(sourceRows);
  const merged = new Map<string, ExportTarget>();
  for (const row of [...localTargets, ...rows]) {
    if (!row || !/^[a-z0-9-]+$/.test(row.target) || !["client", "server"].includes(row.where)) continue;
    if (!merged.has(row.target)) merged.set(row.target, { ...row, label: exportTargetLabel(row.target) });
  }
  return [...merged.values()];
}
export function exportTargetLabel(target: string): string {
  if (target === "png-zip") return "逐页图片 (.png.zip)";
  if (target === "jpg-zip") return "逐页图片 (.jpg.zip)";
  if (target === "png-long") return "长图 (.png)";
  return `${target.toUpperCase()} (.${exportTargetExtension(target)})`;
}
export function exportTargetExtension(target: string): string {
  return target.endsWith("-zip") ? "zip" : target === "png-long" ? "png" : target;
}
export function exportEditorForItem(item: {kind: string; artifactType?: string; artifact?: {artifactType?: string}; meta: Record<string, unknown>}): ExportEditor | null {
  const type = item.artifactType || item.artifact?.artifactType;
  const mime = String(item.meta.mime || item.meta.content_type || "").split(";")[0];
  const extension = String(item.meta.filename || item.meta.format || "").split(".").pop()?.toLowerCase();
  if (type === "pdf" || mime === "application/pdf" || extension === "pdf") return "pdf";
  if (type === "vector_image") return "vector_image";
  // Arbitrary uploads remain download-only; no fabricated conversion targets.
  if (item.kind === "file") return /^(docx?|odt|rtf|md|markdown|txt|html?)$/.test(extension || "") || mime.startsWith("text/") ? "richdoc" : null;
  return ({ document: "richdoc", ppt: "deck", sheet: "grid", image: "image", video: "video-timeline", audio: "audio" } as Record<string, ExportEditor>)[item.kind] ?? null;
}
