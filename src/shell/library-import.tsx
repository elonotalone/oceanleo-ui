"use client";

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { Modal } from "../ui";
import { StorageCapacityStrip } from "./StorageCapacityStrip";
import { libraryRequest, pendingLibraryUploads, pauseLibraryUpload, resumeLibraryUpload, LIBRARY_UPLOAD_EVENT, type PendingLibraryUpload } from "../lib/library-uploads";
import { formatBytes } from "../lib/upload/progress";
import { LIBRARY_FOLDERS_CHANGE_EVENT } from "./library-folder-upload";
import type { LibraryItem } from "./library-data";

export type LibraryImportMode = "computer" | "github";
type PairedComputer = { id: string; name: string; node_online?: boolean };
type Repository = { full_name: string; html_url: string; private?: boolean };
export type BayEntitlement = { entitled: boolean; revisionId?: string; latestRevisionId?: string; updateAvailable: boolean };

export function LibraryStorageLink() {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  return <>
    <a href="/library#storage-capacity" className="underline" onClick={(event) => { event.preventDefault(); setOpen(true); }}>{tt("查看存储套餐")}</a>
    {open && <Modal onClose={() => setOpen(false)} labelledBy="library-storage-title">
      <h2 id="library-storage-title" className="mb-3 text-lg font-semibold">{tt("查看存储套餐")}</h2>
      <StorageCapacityStrip />
    </Modal>}
  </>;
}

export function LibraryPurchasedUpdates({ items, onUpdated }: { items: readonly LibraryItem[]; onUpdated: () => void }) {
  const tt = useUI();
  const [updates, setUpdates] = useState<{ id: string; title: string; updateAvailable: boolean; libraryIdentity?: { id: string; kind: string } }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const titles = JSON.stringify(items.map((item) => ({ id: item.artifactId || item.id, title: item.title })));
  useEffect(() => {
    let live = true;
    const known = JSON.parse(titles) as { id: string; title: string }[];
    void libraryRequest<{ items: (BayEntitlement & { listing_id: string; title?: string; libraryIdentity?: { id: string; kind: string } })[] }>("/v1/bay/assets/purchases").then((data) => {
      if (live) setUpdates(data.items.filter((item) => item.entitled).map((item) => ({ id: item.listing_id, title: item.title || known.find((row) => row.id === item.libraryIdentity?.id)?.title || "", updateAvailable: item.updateAvailable, libraryIdentity: item.libraryIdentity })));
    }).catch(() => { /* Library remains usable when entitlement refresh is unavailable. */ });
    return () => { live = false; };
  }, [titles]);
  if (!updates.length && !error) return null;
  return <section aria-label={tt("来自 LeoBay")} className="space-y-2 px-3 py-2" data-library-purchased-updates="">
    <h2 className="text-sm font-medium">{tt("来自 LeoBay")}</h2>
    {updates.map((item) => <div key={item.id} className="flex items-center gap-2 text-sm">
      {item.libraryIdentity ? <a className="underline" href={item.libraryIdentity.kind === "folder" ? `/library?category=folders&folder=${encodeURIComponent(item.libraryIdentity.id)}` : `/library?item=${encodeURIComponent(item.libraryIdentity.id)}`}>{item.title || tt("来自 LeoBay")}</a> : <span>{item.title || tt("来自 LeoBay")}</span>}
      {item.updateAvailable && <><span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{tt("有新版本")}</span>
        <button type="button" disabled={Boolean(busy)} onClick={() => {
          setBusy(item.id); setError("");
          void libraryRequest<BayEntitlement>(`/v1/bay/assets/${encodeURIComponent(item.id)}/update`, {}).then((entitlement) => { setUpdates((rows) => rows.map((row) => row.id === item.id ? { ...row, updateAvailable: entitlement.updateAvailable } : row)); onUpdated(); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "更新失败，请重试")).finally(() => setBusy(""));
        }} className="underline disabled:opacity-50">{tt(busy === item.id ? "正在更新…" : "更新到我的库")}</button></>}
    </div>)}
    {error && <p role="alert">{tt(error)}</p>}
  </section>;
}

/** Mounted by Library views; pending byte blobs and session ids survive a reload. */
export function LibraryUploadQueue({ onCompleted }: { onCompleted: () => void }) {
  const tt = useUI();
  const [rows, setRows] = useState<PendingLibraryUpload[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(() => { void pendingLibraryUploads().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => {
    refresh();
    // Progress can arrive for each network event. Coalesce database reads.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => { if (!timer) timer = setTimeout(() => { timer = undefined; refresh(); }, 150); };
    window.addEventListener(LIBRARY_UPLOAD_EVENT, changed);
    return () => { window.removeEventListener(LIBRARY_UPLOAD_EVENT, changed); if (timer) clearTimeout(timer); };
  }, [refresh]);
  const resume = useCallback(async (completedFolderId?: string) => {
    const pending = await pendingLibraryUploads().catch(() => []);
    const folders = new Set<string>(completedFolderId ? [completedFolderId] : []);
    let landed = false;
    for (const row of pending) {
      if (row.state !== "waiting" && row.state !== "uploading" && row.state !== "queued") continue;
      try {
        const result = await resumeLibraryUpload(row.key);
        if (result) {
          landed = true;
          if (row.folderId) folders.add(row.folderId);
        }
      } catch { /* row retains the precise failure */ }
    }
    // One Library read per recovered batch, not four list reads per file.
    if (landed) onCompleted();
    for (const id of folders) {
      try {
        const result = await libraryRequest<{ folder: import("./skills/kit/types").Folder }>(`/v1/folders/${encodeURIComponent(id)}`);
        window.dispatchEvent(new CustomEvent(LIBRARY_FOLDERS_CHANGE_EVENT, { detail: { folder: result.folder } }));
      } catch { /* The upload result remains valid if the folder refresh is unavailable. */ }
    }
    refresh();
  }, [onCompleted, refresh]);
  useEffect(() => {
    void resume();
    const online = () => { void resume(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [resume]);
  useEffect(() => {
    if (!rows.some((row) => row.state === "waiting")) return;
    const timer = setTimeout(() => { if (navigator.onLine !== false) void resume(); }, 10_000);
    return () => clearTimeout(timer);
  }, [rows, resume]);
  if (!rows.length) return null;
  return <section aria-label={tt("上传进度")} className="space-y-2 border-b border-neutral-200 p-3" data-library-upload-queue="">
    {rows.slice(0, 10).map((row) => <div key={row.key} className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-2"><span className="break-all">{row.name}</span><span>{formatBytes(row.loaded)} / {formatBytes(row.size)}</span>
        {row.state === "uploading" ? <button type="button" className="underline" onClick={() => pauseLibraryUpload(row.key)}>{tt("暂停")}</button> :
          <button type="button" className="underline" onClick={() => { setError(""); void resumeLibraryUpload(row.key).then(async (result) => { if (result) onCompleted(); await resume(row.folderId); refresh(); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "上传失败，请重试")); }}>{tt("继续上传")}</button>}
      </div>
      <progress className="w-full" max={row.size || 1} value={row.loaded} aria-label={row.name} />
      {row.error && <div role={row.state === "failed" ? "alert" : "status"}>{tt(row.error)} <LibraryStorageLink /></div>}
      {!row.persisted && <p>{tt("浏览器未能保留原文件，刷新后请重新选择原文件以继续上传")}</p>}
    </div>)}
    {rows.length > 10 && <p>{tt("另有 {n} 个文件等待上传", { n: rows.length - 10 })}</p>}
    {error && <p role="alert">{tt(error)}</p>}
  </section>;
}

export function LibraryImportDialog({ mode, onClose, onImported }: { mode: LibraryImportMode; onClose: () => void; onImported: () => void }) {
  const tt = useUI();
  const [computers, setComputers] = useState<PairedComputer[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [connected, setConnected] = useState(false);
  const [nextRepositoryPage, setNextRepositoryPage] = useState<number | null>(null);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [computerId, setComputerId] = useState("");
  const [path, setPath] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        if (mode === "computer") {
          const data = await libraryRequest<{ items: PairedComputer[] }>("/v1/computers");
          if (live) { setComputers(data.items); setComputerId(data.items[0]?.id || ""); }
        } else {
          const data = await libraryRequest<{ connected: boolean; repositories: Repository[]; nextPage?: number | null }>("/v1/folders/github-repositories");
          if (live) { setConnected(data.connected); setRepositories(data.repositories || []); setNextRepositoryPage(data.nextPage || null); }
        }
      } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : "加载失败，请重试"); }
      finally { if (live) setLoading(false); }
    };
    void load();
    return () => { live = false; };
  }, [mode]);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (mode === "computer") {
        const result = await libraryRequest<{ folder?: import("./skills/kit/types").Folder; file?: unknown }>("/v1/library/uploads/from-computer", { computerId, path: path.trim() });
        if (!result.folder && !result.file) throw new Error("导入未返回文件夹，请重试");
        if (result.folder) window.dispatchEvent(new CustomEvent(LIBRARY_FOLDERS_CHANGE_EVENT, { detail: { folder: result.folder } }));
      } else {
        const result = await libraryRequest<{ folder: import("./skills/kit/types").Folder }>("/v1/folders/import-github", { url: url.trim() });
        if (!result.folder) throw new Error("导入未返回文件夹，请重试");
        window.dispatchEvent(new CustomEvent(LIBRARY_FOLDERS_CHANGE_EVENT, { detail: { folder: result.folder } }));
      }
      onImported(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "导入失败，请重试"); }
    finally { setBusy(false); }
  };
  return <Modal labelledBy="library-import-title" onClose={() => { if (!busy) onClose(); }}>
    <h2 id="library-import-title" className="mb-4 text-lg font-semibold">{tt(mode === "computer" ? "从我的电脑添加" : "从 GitHub 导入")}</h2>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {loading && <p role="status">{tt("正在加载…")}</p>}
      {mode === "computer" ? <>
        <label className="block">{tt("我的电脑")}<select aria-label={tt("我的电脑")} value={computerId} onChange={(event) => setComputerId(event.target.value)} className="mt-1 block w-full rounded border p-2">
          {computers.map((computer) => <option key={computer.id} value={computer.id}>{computer.name}{computer.node_online === false ? ` · ${tt("离线")}` : ""}</option>)}
        </select></label>
        <label className="block">{tt("文件或文件夹路径")}<input aria-label={tt("文件或文件夹路径")} required value={path} onChange={(event) => setPath(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        {!loading && !computers.length && <p>{tt("请先在电脑上连接 OceanLeo")}</p>}
      </> : <>
        <label className="block">{tt("GitHub 仓库地址")}<input aria-label={tt("GitHub 仓库地址")} type="url" required value={url} onChange={(event) => setUrl(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
        {connected ? <label className="block">{tt("选择已连接 GitHub 的仓库")}<select aria-label={tt("选择已连接 GitHub 的仓库")} value={repositories.find((repo) => repo.html_url === url)?.html_url || ""} onChange={(event) => setUrl(event.target.value)} className="mt-1 block w-full rounded border p-2"><option value="">{tt("选择仓库")}</option>{repositories.map((repo) => <option key={repo.full_name} value={repo.html_url}>{repo.full_name}{repo.private ? ` · ${tt("私有")}` : ""}</option>)}</select></label> : <p>{tt("公开仓库可直接导入；私有仓库请先连接 GitHub")} <a href="/settings/connectors" className="underline">{tt("连接 GitHub")}</a></p>}
      </>}
      {mode === "github" && nextRepositoryPage && <button type="button" disabled={loadingRepositories} className="underline" onClick={() => {
        setLoadingRepositories(true);
        void libraryRequest<{ connected: boolean; repositories: Repository[]; nextPage: number | null }>(`/v1/folders/github-repositories?page=${nextRepositoryPage}`).then((data) => {
          setRepositories((current) => [...new Map([...current, ...data.repositories].map((repo) => [repo.full_name, repo])).values()]);
          setNextRepositoryPage(data.nextPage);
        }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "加载失败，请重试")).finally(() => setLoadingRepositories(false));
      }}>{tt("加载更多仓库")}</button>}
      {error && <div role="alert">{tt(error)} <LibraryStorageLink /></div>}
      {busy && <div role="status"><progress aria-label={tt("导入进度")} className="w-full" /><p>{tt(mode === "computer" ? "电脑正在上传，完成后会出现在我的库" : "正在导入…")}</p></div>}
      <button type="submit" disabled={busy || (mode === "computer" ? !computerId || !path.trim() : !url.trim())} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">{tt(busy ? "正在导入…" : "添加到我的库")}</button>
    </form>
  </Modal>;
}
