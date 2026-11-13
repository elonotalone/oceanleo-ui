"use client";

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";

function extension(value: string): string {
  const match = /\.([a-z0-9]+)(?:$|[?#])/i.exec(value);
  return match?.[1]?.toLowerCase() || "";
}

function mediaType(item: LibraryItem): string {
  return String(
    item.artifact?.renditions.source?.mediaType ||
      item.meta.mime ||
      item.meta.content_type ||
      "",
  ).toLowerCase().split(";", 1)[0];
}

function fileName(item: LibraryItem): string {
  return String(item.meta.filename || item.title || "附件");
}

function sourceBytes(item: LibraryItem): number | null {
  const values = [
    item.meta.source_bytes,
    item.meta.bytes,
    item.meta.size,
    item.artifact?.renditions.source?.byteSize,
  ];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function formatBytes(value: number | null): string {
  if (value === null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "jsonl", "csv", "tsv", "log", "xml", "yaml", "yml",
  "js", "jsx", "ts", "tsx", "css", "scss", "less", "py", "rb", "go", "rs", "java", "kt",
  "swift", "c", "h", "cpp", "hpp", "sh", "bash", "sql", "toml", "ini", "conf", "html", "htm",
  "svg",
]);

function isTextAttachment(item: LibraryItem): boolean {
  const type = mediaType(item);
  return type.startsWith("text/") || type === "application/json" || type.endsWith("+json") ||
    type === "application/xml" || type === "text/csv" || TEXT_EXTENSIONS.has(extension(fileName(item)));
}

function isZipAttachment(item: LibraryItem): boolean {
  const type = mediaType(item);
  return type === "application/zip" || type === "application/x-zip-compressed" || extension(fileName(item)) === "zip";
}

function isOfficeOrPdf(item: LibraryItem): boolean {
  const ext = extension(fileName(item));
  const type = mediaType(item);
  return type === "application/pdf" || ext === "pdf" ||
    ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "ods", "odp"].includes(ext) ||
    /wordprocessing|spreadsheet|presentation|msword|ms-excel|powerpoint/.test(type);
}

/** Whether the generic attachment viewer should take a document/file item. */
export function isAttachmentFilePreview(item: LibraryItem): boolean {
  if (item.meta.attachment_preview !== true) return false;
  if (isOfficeOrPdf(item)) return false;
  const type = mediaType(item);
  if (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")) return false;
  return item.kind === "document" || item.kind === "file";
}

function DownloadLink({ item, url }: { item: LibraryItem; url: string }) {
  const tt = useUI();
  if (!url) return null;
  return (
    <a
      href={url}
      download={fileName(item)}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-stone-50"
    >
      {tt("下载")}
    </a>
  );
}

function FileCard({ item, url, message }: { item: LibraryItem; url: string; message?: string }) {
  const tt = useUI();
  const size = formatBytes(sourceBytes(item));
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center" data-attachment-file-card="">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-stone-100 text-stone-400" aria-hidden="true">📄</div>
      <p className="max-w-md break-words text-[14px] font-medium text-stone-700">{fileName(item)}</p>
      {size && <p className="text-[12px] text-stone-400">{size}</p>}
      {message && <p className="max-w-md text-[13px] leading-relaxed text-stone-500">{message}</p>}
      <DownloadLink item={item} url={url} />
      {!message && <p className="text-[12px] text-stone-400">{tt("此文件没有可直接显示的预览")}</p>}
    </div>
  );
}

export function AttachmentFileViewer({ item, url }: { item: LibraryItem; url?: string }) {
  const tt = useUI();
  const sourceUrl = url || item.url || item.previewUrl || "";
  const text = isTextAttachment(item);
  const zip = isZipAttachment(item);
  const [body, setBody] = useState("");
  const [entries, setEntries] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(text || zip);
  const identity = useMemo(() => `${sourceUrl}|${fileName(item)}|${text ? "text" : zip ? "zip" : "file"}`, [item, sourceUrl, text, zip]);

  useEffect(() => {
    if (!text && !zip) {
      setLoading(false);
      return;
    }
    if (!sourceUrl) {
      setLoading(false);
      setError("没有可读取的文件地址");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setBody("");
    setEntries(null);
    void fetch(sourceUrl, { credentials: "omit", referrerPolicy: "no-referrer" })
      .then(async (response) => {
        if (!response.ok) throw new Error("文件读取失败");
        if (zip) {
          const { unzipSync } = await import("fflate");
          const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
          if (!cancelled) setEntries(Object.keys(files).sort());
        } else {
          const value = await response.text();
          if (!cancelled) setBody(value);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "文件读取失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, sourceUrl, text, zip]);

  if (!text && !zip) return <FileCard item={item} url={sourceUrl} />;
  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-[13px] text-stone-400">{tt("正在读取文件…")}</div>;
  }
  if (error) return <FileCard item={item} url={sourceUrl} message={tt(error)} />;
  if (zip) {
    return (
      <div className="min-h-[420px] p-4" data-attachment-zip-preview="">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-[13px] font-semibold text-stone-700">{tt("文件列表")}</h4>
          <DownloadLink item={item} url={sourceUrl} />
        </div>
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white text-[12px] text-stone-600">
          {(entries || []).map((entry) => <li key={entry} className="break-all px-3 py-2">{entry}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <div className="min-h-[420px] p-3" data-attachment-text-preview="">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12px] font-medium text-stone-600">{fileName(item)}</span>
        <DownloadLink item={item} url={sourceUrl} />
      </div>
      <pre className="max-h-[calc(100vh-180px)] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-950 p-4 text-[12px] leading-relaxed text-stone-100" tabIndex={0}>{body}</pre>
    </div>
  );
}
