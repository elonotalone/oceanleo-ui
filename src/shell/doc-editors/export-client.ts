"use client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { accessToken } from "../../lib/auth/client";
import { payerRequestFields } from "../../lib/payer";
import type { LibraryItem } from "../library-data";
import type { ExportCapabilities } from "./export-targets";
export interface ExportFile { blob: Blob; filename: string; generated?: boolean }
let cached: { at: number; value: ExportCapabilities } | undefined;
let inflight: Promise<ExportCapabilities> | undefined;
export function loadExportCapabilities(): Promise<ExportCapabilities> {
  if (cached && Date.now() - cached.at < 300_000) return Promise.resolve(cached.value);
  return inflight ??= fetch(`${GATEWAY_BASE}/v1/convert/capabilities`, { credentials: "omit" })
    .then(async response => {
      if (!response.ok) throw new Error("格式列表暂时无法载入");
      const data = await response.json();
      if (!data.sources || typeof data.sources !== "object" || Array.isArray(data.sources)) throw new Error("格式列表暂时无法载入");
      cached = { at: Date.now(), value: data };
      return data as ExportCapabilities;
    }).finally(() => { inflight = undefined; });
}
export function exportSourceFormat(filename: string): string { return filename.split(".").pop()?.toLowerCase() || ""; }
async function postFile(path: string, file: ExportFile, target: string, extra: Record<string, string> = {}): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new Error("请先登录");
  const body = new FormData();
  body.append("file", file.blob, file.filename);
  body.append("target", target);
  body.append("org_id", payerRequestFields().org_id);
  for (const [key, value] of Object.entries(extra)) if (value) body.append(key, value);
  const response = await fetch(`${GATEWAY_BASE}${path}`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${token}` }, body });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detail = typeof data?.detail === "string" ? data.detail : data?.detail?.message;
    throw new Error(detail || "导出失败，请重试");
  }
  return response;
}
export async function convertExportFile(file: ExportFile, target: string): Promise<Blob> {
  if (exportSourceFormat(file.filename) === target) return file.blob;
  const source = exportSourceFormat(file.filename);
  const kind = /^(mp4|webm|mov|mkv|avi|mp3|wav|m4a|ogg|flac|aac)$/.test(source) ? "media"
    : /^(png|jpg|jpeg|webp|svg|gif|tiff|avif)$/.test(source) ? "image" : "office";
  const blob = await (await postFile(`/v1/convert/${kind}`, file, target)).blob();
  if (!blob.size) throw new Error("导出失败，请重试");
  return target === "pdf" && file.generated
    ? (await import("./generated-pdf-metadata")).labelGeneratedPdf(blob, true) : blob;
}
export function libraryExportIdentity(item: LibraryItem): Record<string, string> {
  return { parent_artifact_id: String(item.artifactId || item.artifact?.artifactId || ""), parent_revision_id: String(item.revisionId || item.artifact?.revisionId || "") };
}
export async function saveExportToLibrary(file: ExportFile, target: string, item: LibraryItem): Promise<{artifactId: string; revisionId?: string}> {
  const response = await postFile("/v1/convert/save", file, target, { title: item.title, ...libraryExportIdentity(item) });
  const saved = await response.json();
  if (typeof saved.artifactId !== "string" || !saved.artifactId) throw new Error("导出失败，请重试");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("oceanleo:library-upload"));
  return saved;
}
export function libraryExportHref(saved: {artifactId: string; revisionId?: string}): string {
  return `/library?item=${encodeURIComponent(saved.artifactId)}${saved.revisionId ? `&revisionId=${encodeURIComponent(saved.revisionId)}` : ""}`;
}
