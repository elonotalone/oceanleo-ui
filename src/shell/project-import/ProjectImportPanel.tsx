"use client";

/**
 * Bring a project you built locally onto the platform and keep working on it.
 *
 * Two ways in, because people have their work in two shapes: the folder itself,
 * or a zip of it. Both land as the same kind of website project, so what happens
 * after the import is identical.
 *
 * The panel never guesses. It asks the server what would be imported, shows that
 * answer, and only uploads once the user has seen it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collectPickedFolder,
  formatBytes,
  importProjectArchive,
  importProjectFolder,
  isZipFile,
  previewProjectImport,
  type ImportedProject,
  type ImportPlan,
  type ImportProgress,
  type LocalProjectFile,
} from "./project-import-client";

export interface ProjectImportPanelProps {
  /**
   * Called once the project exists on the platform. The host decides where to go
   * next — normally straight into the editor for the new project.
   */
  onImported: (project: ImportedProject, plan: ImportPlan) => void;
  /** Called when the user backs out. Omit to hide the cancel affordance. */
  onCancel?: () => void;
  /** Prefills the project name; the user can still change it. */
  defaultName?: string;
  className?: string;
}

type Stage = "idle" | "planning" | "ready" | "uploading" | "failed";

const MAX_LISTED_SKIP_GROUPS = 6;

export function ProjectImportPanel({
  onImported,
  onCancel,
  defaultName = "",
  className = "",
}: ProjectImportPanelProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [picked, setPicked] = useState<LocalProjectFile[]>([]);
  const [archive, setArchive] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [name, setName] = useState(defaultName);
  const [dragging, setDragging] = useState(false);

  const folderInput = useRef<HTMLInputElement | null>(null);
  const zipInput = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => () => abort.current?.abort(), []);

  // webkitdirectory is not in React's attribute types; it has to be set on the
  // live element. Chromium, Safari and Firefox all read it.
  useEffect(() => {
    const element = folderInput.current;
    if (element) element.setAttribute("webkitdirectory", "");
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setStage("idle");
    setPicked([]);
    setArchive(null);
    setPlan(null);
    setError("");
    setProgress(null);
    setDragging(false);
    dragDepth.current = 0;
    if (folderInput.current) folderInput.current.value = "";
    if (zipInput.current) zipInput.current.value = "";
  }, []);

  const planFolder = useCallback(async (entries: LocalProjectFile[]) => {
    setArchive(null);
    setPicked(entries);
    setPlan(null);
    setError("");
    if (!entries.length) {
      setStage("failed");
      setError("这个文件夹是空的。");
      return;
    }
    setStage("planning");
    const result = await previewProjectImport(entries);
    if (!result.ok) {
      setStage("failed");
      setError(result.error);
      return;
    }
    setPlan(result.value);
    setStage("ready");
    if (!name.trim() && result.value.root_stripped) {
      setName(result.value.root_stripped);
    }
  }, [name]);

  const takeArchive = useCallback((file: File) => {
    setPicked([]);
    setPlan(null);
    setError("");
    setArchive(file);
    setStage("ready");
    if (!name.trim()) setName(file.name.replace(/\.zip$/i, ""));
  }, [name]);

  const runImport = useCallback(async () => {
    const controller = new AbortController();
    abort.current = controller;
    setStage("uploading");
    setError("");
    setProgress({ sent: 0, total: 0, percent: 0 });
    const options = {
      displayName: name.trim(),
      onProgress: setProgress,
      signal: controller.signal,
    };
    const result = archive
      ? await importProjectArchive(archive, options)
      : plan
        ? await importProjectFolder(picked, plan, options)
        : { ok: false as const, error: "还没有选择要导入的内容。" };
    abort.current = null;
    if (!result.ok) {
      setStage("failed");
      setError(result.error);
      return;
    }
    setPlan(result.value.import);
    onImported(result.value.project, result.value.import);
  }, [archive, name, onImported, picked, plan]);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files || []);
      const zip = files.find(isZipFile);
      if (zip) {
        takeArchive(zip);
        return;
      }
      // A dropped folder arrives as directory entries rather than files. Reading
      // it needs the entry API; when it is unavailable, the folder button is the
      // reliable path and saying so beats failing quietly.
      const items = Array.from(event.dataTransfer?.items || []);
      const looksLikeFolder = items.some(
        (item) => item.webkitGetAsEntry?.()?.isDirectory,
      );
      if (looksLikeFolder) {
        const entries = await readDroppedDirectories(event.dataTransfer);
        if (entries.length) {
          await planFolder(entries);
          return;
        }
        setStage("failed");
        setError("这个浏览器读不出拖进来的文件夹，请点上面的「选择项目文件夹」。");
        return;
      }
      if (files.length) {
        await planFolder(files.map((file) => ({ path: file.name, file })));
        return;
      }
      setStage("failed");
      setError("没认出拖进来的东西。拖一个 zip，或者点「选择项目文件夹」。");
    },
    [planFolder, takeArchive],
  );

  const skipGroups = useMemo(
    () => (plan?.skipped_groups || []).slice(0, MAX_LISTED_SKIP_GROUPS),
    [plan],
  );
  const hiddenSkipGroups = Math.max(
    0,
    (plan?.skipped_groups.length || 0) - skipGroups.length,
  );

  const busy = stage === "planning" || stage === "uploading";
  const canImport = stage === "ready" && (archive !== null || plan !== null);

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-neutral-900 ${className}`}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">把本地做好的项目搬上来</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          选一个项目文件夹，或者把 zip 拖进来。搬上来之后就能在平台上接着改。
        </p>
      </header>

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging
            ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30"
            : "border-black/15 dark:border-white/15"
        }`}
      >
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          把项目的 zip 拖到这里
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => folderInput.current?.click()}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            选择项目文件夹
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => zipInput.current?.click()}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20"
          >
            选择 zip 文件
          </button>
        </div>
        <input
          ref={folderInput}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void planFolder(collectPickedFolder(event.target.files));
          }}
        />
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) takeArchive(file);
          }}
        />
      </div>

      {stage === "planning" && (
        <p className="text-sm text-neutral-500">正在看这个文件夹里有什么…</p>
      )}

      {archive && stage !== "uploading" && (
        <div className="rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-800/60">
          <p className="font-medium">{archive.name}</p>
          <p className="text-neutral-500">
            {formatBytes(archive.size)}
            ，压缩包会在服务器上解开；跳过了什么会在导入完成后告诉你。
          </p>
        </div>
      )}

      {plan && stage !== "uploading" && (
        <div className="flex flex-col gap-3 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/60">
          <p className="text-sm font-medium">{plan.summary_text}</p>
          {plan.root_stripped && (
            <p className="text-xs text-neutral-500">
              最外面那层「{plan.root_stripped}」文件夹会去掉，项目内容直接放在根上。
            </p>
          )}
          {skipGroups.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
              {skipGroups.map((group) => (
                <li key={group.reason} className="flex flex-col">
                  <span>
                    跳过 {group.count} 个（{formatBytes(group.total_bytes)}）：
                    {group.reason_text}
                  </span>
                  <span className="truncate text-neutral-400">
                    例如 {group.examples.join("、")}
                  </span>
                </li>
              ))}
              {hiddenSkipGroups > 0 && (
                <li className="text-neutral-400">
                  还有 {hiddenSkipGroups} 类被跳过的文件
                </li>
              )}
            </ul>
          )}
          {plan.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {warning}
            </p>
          ))}
        </div>
      )}

      {(plan || archive) && stage !== "uploading" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-300">项目名字</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="导入的项目"
            className="rounded-lg border border-black/15 px-3 py-1.5 dark:border-white/20 dark:bg-neutral-800"
          />
        </label>
      )}

      {stage === "uploading" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">正在上传…</p>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width]"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            {progress?.percent === null
              ? formatBytes(progress?.sent || 0)
              : `${progress?.percent ?? 0}%`}
            {progress?.total ? ` · 共 ${formatBytes(progress.total)}` : ""}
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canImport}
          onClick={() => void runImport()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          开始导入
        </button>
        {stage === "uploading" && (
          <button
            type="button"
            onClick={() => abort.current?.abort()}
            className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20"
          >
            取消
          </button>
        )}
        {(plan || archive || error) && stage !== "uploading" && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20"
          >
            重新选
          </button>
        )}
        {onCancel && stage !== "uploading" && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto text-sm text-neutral-500 underline"
          >
            返回
          </button>
        )}
      </footer>
    </div>
  );
}

/**
 * Walk a dropped directory into a flat file list.
 *
 * Only the non-standard entry API can read a dropped folder, so this stays a
 * best-effort path: when it yields nothing the panel points at the folder button
 * instead of pretending the drop worked.
 */
async function readDroppedDirectories(
  transfer: DataTransfer | null,
): Promise<LocalProjectFile[]> {
  if (!transfer) return [];
  const roots: FileSystemEntryLike[] = [];
  for (const item of Array.from(transfer.items || [])) {
    const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
    if (entry) roots.push(entry);
  }
  const output: LocalProjectFile[] = [];
  const MAX_ENTRIES = 60_000;

  async function walk(entry: FileSystemEntryLike, prefix: string): Promise<void> {
    if (output.length >= MAX_ENTRIES) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        entry.file?.(resolve, () => resolve(null));
      });
      if (file) output.push({ path, file });
      return;
    }
    if (!entry.isDirectory || !entry.createReader) return;
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntryLike[]>((resolve) => {
        reader.readEntries(resolve, () => resolve([]));
      });
      if (!batch.length) break;
      for (const child of batch) await walk(child, path);
      if (output.length >= MAX_ENTRIES) return;
    }
  }

  for (const root of roots) await walk(root, "");
  return output;
}

interface FileSystemEntryLike {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (onSuccess: (file: File) => void, onError: () => void) => void;
  createReader?: () => {
    readEntries: (
      onSuccess: (entries: FileSystemEntryLike[]) => void,
      onError: () => void,
    ) => void;
  };
}
