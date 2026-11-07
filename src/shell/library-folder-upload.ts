/**
 * Library folder upload: a picked or dropped folder is zipped in the browser and
 * sent through the existing zip import (`POST /v1/folders/import`).
 *
 * Operator ruling 2026-11-07: "direct folder upload — zip only where a folder
 * cannot be picked". The .zip/.skill picker stays for devices without a folder
 * picker (`canPickFolder()` in dropped-entries.ts); everything else goes through here.
 * Loaded on demand (fflate): the readers that pages need up front live in dropped-entries.ts.
 */

import { zipSync } from "fflate";
import type { DroppedFolder } from "./dropped-entries";
import { folderApi } from "./skills/kit/folder-api";
import type { Folder } from "./skills/kit/types";

/** The gateway's zip cap (`MAX_ARCHIVE_BYTES`); for a folder it applies to the zipped size. */
export const FOLDER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** Fired on `window` after an upload lands, so open 文件包 lists can refresh. */
export const LIBRARY_FOLDERS_CHANGE_EVENT = "oceanleo:library-folders-change";

export interface LibraryFoldersChangeDetail {
  folder: Folder;
}

export type FolderUploadPhase = "zipping" | "uploading";

export type FolderUploadResult = { ok: true; folder: Folder } | { ok: false; error: string };

/**
 * The folder as `<name>.zip` with every file under one top-level `<name>/`.
 * The gateway strips a single top-level directory and titles the 文件包 with
 * its name (`zip_safety._strip_single_top`, `service.import_zip`), so the
 * import gets the folder's name and the files at their paths inside it, even
 * when the folder itself holds just one subfolder.
 */
export async function zipDroppedFolder(folder: DroppedFolder): Promise<File> {
  const data: Record<string, Uint8Array> = {};
  for (const { path, file } of folder.entries) {
    data[`${folder.name}/${path}`] = new Uint8Array(await file.arrayBuffer());
  }
  // fflate allocates a fresh ArrayBuffer for the archive.
  const bytes = zipSync(data) as Uint8Array<ArrayBuffer>;
  return new File([bytes], `${folder.name}.zip`, { type: "application/zip" });
}

export async function uploadDroppedFolder(
  folder: DroppedFolder,
  options: { onPhase?: (phase: FolderUploadPhase) => void } = {},
): Promise<FolderUploadResult> {
  if (!folder.entries.length) return { ok: false, error: "这个文件夹是空的" };
  options.onPhase?.("zipping");
  let zip: File;
  try {
    zip = await zipDroppedFolder(folder);
  } catch (error) {
    // A file that can no longer be read (moved, permission) rejects; say what the browser said.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (zip.size > FOLDER_UPLOAD_MAX_BYTES) return { ok: false, error: "文件夹太大：压缩后超过 20 MB" };
  options.onPhase?.("uploading");
  const result = await folderApi.importFolderZip(zip);
  if (!result.ok) return { ok: false, error: result.error };
  window.dispatchEvent(
    new CustomEvent<LibraryFoldersChangeDetail>(LIBRARY_FOLDERS_CHANGE_EVENT, {
      detail: { folder: result.data },
    }),
  );
  return { ok: true, folder: result.data };
}
