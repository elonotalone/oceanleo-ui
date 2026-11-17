"use client";

import { useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";
import { CodeBlock, FolderTreeViewer } from "./skills/kit/FolderTreeViewer";
import type { FileContent, TreeEntry } from "./skills/kit/types";
import { fetchMediaBlobRefreshing } from "../lib/media-proxy";

function extension(value: string): string {
  return /\.([a-z0-9]+)(?:$|[?#])/i.exec(value)?.[1]?.toLowerCase() || "";
}
function fileName(item: LibraryItem): string {
  return String(item.meta.filename || item.title || "");
}
export const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "jsonl", "csv", "tsv", "log", "xml", "yaml", "yml",
  "js", "jsx", "ts", "tsx", "css", "scss", "less", "py", "rb", "go", "rs", "java", "kt",
  "swift", "c", "h", "cpp", "hpp", "sh", "bash", "sql", "toml", "ini", "conf", "html", "htm",
  "svg", "srt", "vtt", "ass", "ssa", "lrc", "tex", "ipynb", "r", "vue", "svelte", "graphql",
]);
export function isTextAttachment(item: LibraryItem): boolean {
  const type = String(item.artifact?.renditions.source?.mediaType || item.meta.mime || item.meta.content_type || "");
  return type.startsWith("text/") || /(?:json|xml)(?:;|$)/.test(type) || TEXT_EXTENSIONS.has(extension(fileName(item)));
}
export function isAttachmentFilePreview(item: LibraryItem): boolean {
  return item.meta.attachment_preview === true && ["document", "file"].includes(item.kind) &&
    !/^(?:image|audio|video)\//.test(String(item.meta.mime || "")) &&
    !/\.(?:docx?|xlsx?|pptx?|ods|odp|pdf)$/i.test(fileName(item));
}
function DownloadLink({ item, url }: { item: LibraryItem; url: string }) {
  const tt = useUI();
  return url ? <a href={url} download={fileName(item)} target="_blank" rel="noreferrer"
    className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-stone-600">{tt("下载")}</a> : null;
}
export function DownloadOnlyFileCard({ item, url, message, onDownload }: { item: LibraryItem; url?: string; message?: string; onDownload?: () => void }) {
  const tt = useUI();
  const bytes = item.artifact?.renditions.source?.byteSize ?? item.meta.source_bytes ?? item.meta.bytes ?? item.meta.size;
  const size = typeof bytes === "number" ? bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB` : "";
  const format = item.artifact?.sourceFormat || item.meta.format || extension(fileName(item));
  return <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center" data-download-only="">
    <span className="text-4xl" aria-hidden="true">📄</span>
    <p className="max-w-md break-words text-sm font-medium">{fileName(item)}</p>
    <p className="text-xs text-stone-500">{[String(format || "").toUpperCase(), size].filter(Boolean).join(" · ")}</p>
    <p className="max-w-md text-sm text-stone-500">{tt(message || "此文件没有可直接显示的预览")}</p>
    {onDownload ? <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={onDownload}>{tt("下载")}</button> : <DownloadLink item={item} url={url || item.url || ""} />}
  </div>;
}

/** Notebook cells are read as text; outputs and HTML are never executed. */
export function previewText(value: string, name: string): string {
  if (extension(name) !== "ipynb") return value;
  try {
    const notebook = JSON.parse(value);
    if (!Array.isArray(notebook.cells)) return value;
    return notebook.cells.map((cell: { cell_type?: unknown; source?: unknown }, i: number) =>
      `# ${i + 1} [${String(cell.cell_type || "")}]\n${Array.isArray(cell.source) ? cell.source.join("") : String(cell.source || "")}`).join("\n\n");
  } catch { return value; }
}

export function AttachmentFileViewer({ item, url, mode }: { item: LibraryItem; url?: string; mode?: "text" | "tree" }) {
  const tt = useUI();
  const sourceUrl = url || item.url || item.previewUrl || "";
  const text = mode === "text" || (!mode && isTextAttachment(item));
  const zip = mode === "tree" || extension(fileName(item)) === "zip";
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<Record<string, Uint8Array> | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(text || zip);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!text && !zip) return;
    const controller = new AbortController();
    let alive = true;
    setLoading(true); setError(false); setBody(""); setFiles(null); setTree([]);
    void (async () => {
      // Bounded reads prevent source-code and archive previews from exhausting memory.
      const blob = await fetchMediaBlobRefreshing(sourceUrl, { signal: controller.signal, maxBytes: zip ? 64 * 1024 * 1024 : 8 * 1024 * 1024 });
      if (zip) {
        const { unzipSync } = await import("fflate");
        let total = 0, count = 0;
        let source = blob;
        const prefix = await blob.slice(0, 1).text();
        if (prefix === "{") {
          const manifest = JSON.parse(await blob.text());
          const entries: TreeEntry[] = (Array.isArray(manifest.entries) ? manifest.entries : []).slice(0, 5000)
            .filter((e: { name?: unknown }) => typeof e.name === "string" && !e.name.startsWith("/") && !e.name.includes("\\") && !e.name.split("/").includes(".."))
            .map((e: { name: string; size?: number; directory?: boolean }) => ({ path: e.name, size: e.size, type: e.directory ? "dir" : "file" }));
          if (alive) { setTree(entries); setFiles({}); }
          const original = item.url || "";
          if (!original || original === sourceUrl) return;
          try { source = await fetchMediaBlobRefreshing(original, { signal: controller.signal, maxBytes: 64 * 1024 * 1024 }); }
          catch { return; } // Keep the useful directory index even if original bytes cannot be read.
        }
        const contents = unzipSync(new Uint8Array(await source.arrayBuffer()), { filter: (entry) => {
          total += entry.originalSize; count++;
          if (total > 64 * 1024 * 1024 || count > 5000) throw new Error("archive preview limit");
          return !entry.name.startsWith("/") && !entry.name.includes("\\") && !entry.name.split("/").some(p => p === ".." || p === ".");
        } });
        if (!alive) return;
        setFiles(contents);
        setTree(Object.entries(contents).map(([path, data]) => ({ path, type: path.endsWith("/") ? "dir" : "file", size: data.length })));
      } else {
        const value = await blob.text();
        if (alive) setBody(previewText(value, fileName(item)));
      }
    })().catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [sourceUrl, text, zip, item.key]);
  if (!text && !zip || error) return <DownloadOnlyFileCard item={item} url={sourceUrl} />;
  if (loading) return <div className="flex min-h-[420px] items-center justify-center text-sm" role="status">{tt("正在读取文件…")}</div>;
  if (zip && files) return <FolderTreeViewer tree={tree} rootLabel={fileName(item)} downloadUrl={sourceUrl} onDownloadFile={path => {
    const bytes = files[path]; if (!bytes) { if (item.url) { const link = document.createElement("a"); link.href = item.url; link.download = fileName(item); link.click(); } return; }
    const href = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
    const link = document.createElement("a"); link.href = href; link.download = path.split("/").pop() || path;
    link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }} loadFile={async path => {
    const data = files[path]; if (!data) return { path, size: tree.find(e => e.path === path)?.size || 0, kind: "binary" };
    const ext = extension(path);
    const base: FileContent = { path, size: data.length, kind: "binary" };
    if (/^(png|jpe?g|gif|webp|bmp|avif)$/.test(ext) && data.length <= 4 * 1024 * 1024) {
      const base64 = (bytes: Uint8Array) => { let value = ""; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); };
      return { ...base, kind: "image", data_url: `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${base64(data)}` };
    }
    if (TEXT_EXTENSIONS.has(ext) && data.length <= 8 * 1024 * 1024) return { ...base, kind: "code", text: previewText(new TextDecoder().decode(data), path) };
    return base;
  }} />;
  return <div className="min-h-[420px] p-3" data-attachment-text-preview="">
    <div className="mb-2 flex items-center justify-between gap-3"><span className="truncate text-xs">{fileName(item)}</span><DownloadLink item={item} url={sourceUrl} /></div>
    <CodeBlock text={body} label={extension(fileName(item)) || "text"} lineNumbers />
  </div>;
}
