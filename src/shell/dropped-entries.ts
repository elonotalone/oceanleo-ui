/**
 * Read what the user dropped or picked: loose files and whole folders (no dependencies,
 * so pages import it up front; transfers live in library-folder-upload.ts).
 *
 * Lifted out of `project-import/ProjectImportPanel.tsx` (UX wave 2026-11-07) so
 * the project import and Library read a dropped folder with the same walker.
 *
 * Only the non-standard entry API (`DataTransferItem.webkitGetAsEntry`) can read
 * a dropped folder, so this stays best-effort: when it yields nothing the caller
 * says so instead of pretending the drop worked.
 *
 * The browser hands out the entries only while the drop event runs; after the
 * first `await` they are gone. Pass the `DataTransfer` inside the event handler:
 * both readers below take the entries synchronously, before their first `await`.
 */

export interface DroppedEntry {
  /** Path relative to the dropped root, `/`-separated. */
  path: string;
  file: File;
}

export interface DroppedFolder {
  /** The dropped directory's own name. */
  name: string;
  /** Every file inside it; `path` is relative to the folder (no folder name). */
  entries: DroppedEntry[];
}

export interface FileSystemEntryLike {
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

function rootEntries(transfer: DataTransfer | null): FileSystemEntryLike[] {
  const roots: FileSystemEntryLike[] = [];
  for (const item of Array.from(transfer?.items || [])) {
    const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
    if (entry) roots.push(entry);
  }
  return roots;
}

function fileOf(entry: FileSystemEntryLike): Promise<File | null> {
  return new Promise<File | null>((resolve, reject) => {
    if (!entry.file) { reject(new Error(`无法读取文件：${entry.name}`)); return; }
    entry.file(resolve, () => reject(new Error(`无法读取文件：${entry.name}`)));
  });
}

async function walk(
  entry: FileSystemEntryLike,
  prefix: string,
  output: DroppedEntry[],
): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await fileOf(entry);
    if (file) {
      output.push({ path, file });
    }
    return;
  }
  await walkChildren(entry, path, output);
}

async function walkChildren(
  directory: FileSystemEntryLike,
  path: string,
  output: DroppedEntry[],
): Promise<void> {
  if (!directory.isDirectory || !directory.createReader) return;
  const reader = directory.createReader();
  // `readEntries` returns a directory in batches; an empty batch means done.
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, () => reject(new Error(`无法读取文件夹：${directory.name}`)));
    });
    if (!batch.length) break;
    for (const child of batch) await walk(child, path, output);
  }
}

/**
 * Every dropped root walked into one flat list: a dropped file is `name`, a file
 * inside a dropped folder is `folder/sub/name`. The project import uses this.
 */
export async function readDroppedDirectories(
  transfer: DataTransfer | null,
): Promise<DroppedEntry[]> {
  if (!transfer) return [];
  const roots = rootEntries(transfer);
  const output: DroppedEntry[] = [];
  for (const root of roots) await walk(root, "", output);
  return output;
}

/**
 * The drop split by shape: loose top-level files, and one `DroppedFolder` per
 * top-level directory (an empty directory comes back with no entries).
 */
export async function readDataTransfer(
  transfer: DataTransfer | null,
): Promise<{ files: File[]; folders: DroppedFolder[] }> {
  const roots = rootEntries(transfer);
  // Plain file drops still work where the non-standard directory API is absent.
  const fallbackFiles = Array.from(transfer?.files || []);
  if (!roots.length) return { files: fallbackFiles, folders: [] };
  const files: File[] = [];
  const folders: DroppedFolder[] = [];
  for (const root of roots) {
    if (root.isFile) {
      const file = await fileOf(root);
      if (file) {
        files.push(file);
      }
    } else if (root.isDirectory) {
      const entries: DroppedEntry[] = [];
      await walkChildren(root, "", entries);
      folders.push({ name: root.name, entries });
    }
  }
  return { files, folders };
}

/**
 * Files from `<input webkitdirectory>` grouped by the picked folder (the first
 * `webkitRelativePath` segment). A browser returns no files for an empty folder,
 * so an empty pick comes back as `[]`.
 */
export function foldersFromDirectoryInput(files: FileList | readonly File[]): DroppedFolder[] {
  const byName = new Map<string, DroppedFolder>();
  for (const file of Array.from(files)) {
    const relative = file.webkitRelativePath || "";
    const slash = relative.indexOf("/");
    // A file without a folder segment did not come from a folder pick.
    if (slash <= 0) continue;
    const name = relative.slice(0, slash);
    let folder = byName.get(name);
    if (!folder) {
      folder = { name, entries: [] };
      byName.set(name, folder);
    }
    folder.entries.push({ path: relative.slice(slash + 1), file });
  }
  return Array.from(byName.values());
}

/**
 * True only where `<input webkitdirectory>` opens a real folder picker.
 * Mobile browsers expose `webkitdirectory` but open a plain file picker, so a
 * fine primary pointer (mouse / trackpad) is what marks a desktop browser here.
 */
export function canPickFolder(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!("webkitdirectory" in document.createElement("input"))) return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}
