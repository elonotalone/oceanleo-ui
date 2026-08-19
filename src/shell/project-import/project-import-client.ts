/**
 * Transport for bringing a local project folder or zip onto the platform.
 *
 * The filter rules and the three size gates live on the backend only. This file
 * never decides what belongs in a project; it asks. That is why the preview call
 * sends nothing but paths and sizes — the browser gets the authoritative answer
 * for a 40,000-file folder without uploading a byte, and then uploads exactly the
 * files the answer named.
 */

import { GATEWAY_BASE } from "../../lib/auth/config";
import { accessToken } from "../../lib/auth/client";

const IMPORT_BASE = "/v1/website-projects";

/** One file the user picked, before anything is sent. */
export interface LocalProjectFile {
  /** Path relative to the picked folder, e.g. `src/app/page.tsx`. */
  path: string;
  file: File;
}

export interface ImportSkipGroup {
  reason: string;
  reason_text: string;
  count: number;
  total_bytes: number;
  examples: string[];
}

export interface ImportPlan {
  file_count: number;
  skipped_count: number;
  total_bytes: number;
  /** Ready-to-show "将导入 N 个文件，跳过 M 个". */
  summary_text: string;
  warnings: string[];
  project_kind: string;
  entry_path: string;
  root_stripped: string;
  files: string[];
  skipped: { path: string; reason: string; reason_text: string; byte_size: number }[];
  skipped_groups: ImportSkipGroup[];
  limits: { max_files: number; max_file_bytes: number; max_tree_bytes: number };
}

export interface ImportedProject {
  project_id?: string;
  display_name?: string;
  slug?: string;
  working_revision_id?: string;
  [key: string]: unknown;
}

export type ImportResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Pull the human-readable sentence out of a gateway error.
 *
 * The website routes answer with `{detail: {code, message}}` where `message` is
 * already written for the user — "这个项目有 501 个文件…" — so surfacing it beats
 * replacing it with a generic failure line.
 */
function readableError(status: number, payload: unknown): string {
  const body = payload as { detail?: unknown } | null;
  const detail = body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const message = record.message;
    if (typeof message === "string" && message.trim()) return message;
    const code = record.code;
    if (typeof code === "string" && code.trim()) return code;
  }
  if (status === 401) return "登录状态已失效，请重新登录后再导入。";
  if (status === 413) return "这次导入的内容太大了。";
  return `导入失败（HTTP ${status}）。`;
}

async function bearer(): Promise<string | null> {
  return await accessToken();
}

/**
 * Ask what an import would do, before uploading.
 *
 * Only path and size are sent, so a folder with `node_modules` in it costs one
 * small request rather than hundreds of megabytes.
 */
export async function previewProjectImport(
  entries: LocalProjectFile[],
): Promise<ImportResult<ImportPlan>> {
  const token = await bearer();
  if (!token) return { ok: false, error: "未登录" };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${IMPORT_BASE}/import/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        entries: entries.map((item) => ({
          path: item.path,
          byte_size: item.file.size,
        })),
      }),
    });
  } catch {
    return { ok: false, error: "网络错误：连不上服务器。" };
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) return { ok: false, error: readableError(res.status, payload) };
  return { ok: true, value: payload as ImportPlan };
}

export interface ImportProgress {
  /** Bytes handed to the network so far. */
  sent: number;
  total: number;
  /** 0–100, or null while the browser cannot tell. */
  percent: number | null;
}

interface UploadOptions {
  displayName?: string;
  slug?: string;
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Send a multipart upload and report progress.
 *
 * ``XMLHttpRequest`` rather than ``fetch`` for one reason: fetch still cannot
 * report upload progress, and an import of a few hundred files with no visible
 * movement looks broken.
 */
function uploadWithProgress(
  url: string,
  form: FormData,
  token: string,
  options: UploadOptions,
): Promise<ImportResult<{ project: ImportedProject; import: ImportPlan }>> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", url, true);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    // Content-Type is deliberately not set: the browser has to add the multipart
    // boundary, and setting it by hand produces a body the server cannot parse.
    request.upload.onprogress = (event) => {
      options.onProgress?.({
        sent: event.loaded,
        total: event.total,
        percent: event.lengthComputable
          ? Math.min(100, Math.round((event.loaded / event.total) * 100))
          : null,
      });
    };
    request.onerror = () =>
      resolve({ ok: false, error: "网络错误：上传中断了，请再试一次。" });
    request.onabort = () => resolve({ ok: false, error: "已取消导入。" });
    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        /* non-JSON */
      }
      if (request.status >= 200 && request.status < 300) {
        const body = payload as {
          project?: ImportedProject;
          import?: ImportPlan;
        } | null;
        if (!body?.import) {
          resolve({ ok: false, error: "服务器返回的内容看不懂，请再试一次。" });
          return;
        }
        resolve({
          ok: true,
          value: { project: body.project || {}, import: body.import },
        });
        return;
      }
      resolve({ ok: false, error: readableError(request.status, payload) });
    };
    if (options.signal) {
      if (options.signal.aborted) {
        request.abort();
        return;
      }
      options.signal.addEventListener("abort", () => request.abort(), {
        once: true,
      });
    }
    request.send(form);
  });
}

/**
 * Import a folder, sending only the files the plan kept.
 *
 * The relative path travels as each part's filename, which is how the folder
 * shape survives the upload. The backend re-runs the same filter on the real
 * bytes, so this list being wrong cannot widen a gate.
 */
export async function importProjectFolder(
  entries: LocalProjectFile[],
  plan: ImportPlan,
  options: UploadOptions = {},
): Promise<ImportResult<{ project: ImportedProject; import: ImportPlan }>> {
  const token = await bearer();
  if (!token) return { ok: false, error: "未登录" };
  const keep = new Set(plan.files);
  const prefix = plan.root_stripped ? `${plan.root_stripped}/` : "";
  const form = new FormData();
  let attached = 0;
  for (const entry of entries) {
    const relative = prefix && entry.path.startsWith(prefix)
      ? entry.path.slice(prefix.length)
      : entry.path;
    if (!keep.has(relative)) continue;
    form.append("files", entry.file, relative);
    attached += 1;
  }
  if (!attached) {
    return { ok: false, error: "没有可以导入的文件。" };
  }
  if (options.displayName) form.append("display_name", options.displayName);
  if (options.slug) form.append("slug", options.slug);
  return await uploadWithProgress(
    `${GATEWAY_BASE}${IMPORT_BASE}/import`,
    form,
    token,
    options,
  );
}

/**
 * Import a zip.
 *
 * There is no preview step here: the archive has to be opened to know what is in
 * it, and opening it in the browser would mean a second implementation of the
 * filter. The plan comes back with the response instead, so the user still learns
 * exactly what was skipped — just afterwards rather than before.
 */
export async function importProjectArchive(
  archive: File,
  options: UploadOptions = {},
): Promise<ImportResult<{ project: ImportedProject; import: ImportPlan }>> {
  const token = await bearer();
  if (!token) return { ok: false, error: "未登录" };
  const form = new FormData();
  form.append("archive", archive, archive.name);
  if (options.displayName) form.append("display_name", options.displayName);
  if (options.slug) form.append("slug", options.slug);
  return await uploadWithProgress(
    `${GATEWAY_BASE}${IMPORT_BASE}/import`,
    form,
    token,
    options,
  );
}

/** Read a folder pick into the shape the import calls expect. */
export function collectPickedFolder(files: FileList | null): LocalProjectFile[] {
  if (!files) return [];
  const output: LocalProjectFile[] = [];
  for (const file of Array.from(files)) {
    // webkitRelativePath is the only place the folder shape exists; a plain
    // multi-file pick has none, and the file name is then the whole path.
    const relative =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    output.push({ path: relative || file.name, file });
  }
  return output;
}

export function isZipFile(file: File): boolean {
  return (
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    /\.zip$/i.test(file.name)
  );
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
