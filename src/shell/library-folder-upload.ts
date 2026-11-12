/** Direct folders keep their paths and send one resumable Library session per file. */
import type { DroppedFolder } from "./dropped-entries";
import { createLibraryFolder, uploadLibraryFile, queueLibraryFile, libraryRequest } from "../lib/library-uploads";
import type { Folder } from "./skills/kit/types";

/** Only the fallback archive import has a compressed-size limit. */
export const FOLDER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const LIBRARY_FOLDERS_CHANGE_EVENT = "oceanleo:library-folders-change";
export interface LibraryFoldersChangeDetail { folder: Folder }
export type FolderUploadPhase = "creating" | "uploading";
export type FolderUploadResult = { ok: true; folder: Folder } | { ok: false; error: string };

export async function uploadDroppedFolder(
  folder: DroppedFolder,
  options: { onPhase?: (phase: FolderUploadPhase) => void; onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal; projectId?: string } = {},
): Promise<FolderUploadResult> {
  if (!folder.entries.length) return { ok: false, error: "这个文件夹是空的" };
  if (folder.entries.some(({ path }) => !path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === ".."))) {
    return { ok: false, error: "文件夹包含不安全的路径，已拒绝上传" };
  }
  try {
    options.onPhase?.("creating");
    let created = await createLibraryFolder(folder.name, options.projectId);
    options.onPhase?.("uploading");
    const total = folder.entries.reduce((sum, entry) => sum + entry.file.size, 0);
    let loaded = 0;
    for (const entry of folder.entries) await queueLibraryFile(entry.file, { folderId: created.id, path: entry.path, projectId: options.projectId });
    for (const entry of folder.entries) {
      await uploadLibraryFile(entry.file, {
        folderId: created.id, path: entry.path, projectId: options.projectId, signal: options.signal,
        onProgress: (bytes) => options.onProgress?.(loaded + bytes, total),
      });
      loaded += entry.file.size;
    }
    // Read authoritative file count/tree only after every session has completed.
    const refreshed = await libraryRequest<{ folder: Folder }>(`/v1/folders/${encodeURIComponent(created.id)}`);
    created = refreshed.folder;
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<LibraryFoldersChangeDetail>(LIBRARY_FOLDERS_CHANGE_EVENT, { detail: { folder: created } }));
    return { ok: true, folder: created };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "文件夹上传失败，请重试" };
  }
}
