"use client";

// Compatibility for the former home-only draft API. All bytes and lifecycle
// handling now use composer-draft's shared store and hook.
import { useComposerDraft, readComposerDraftFiles, writeComposerDraftFiles, clearComposerDraftFiles, composerDraftFileToFile } from "./composer-draft";
export { libraryAttachmentFile } from "./composer-draft";

export async function readNativeDraftFiles(key: string): Promise<File[]> {
  return (await readComposerDraftFiles(key)).map(composerDraftFileToFile);
}
export function writeNativeDraftFiles(key: string, files: readonly File[]): Promise<unknown> {
  return writeComposerDraftFiles(key, files.map((file, index) => ({
    draftFileId: `legacy-${index}`, name: file.name, type: file.type, size: file.size,
    lastModified: file.lastModified, blob: file,
  })));
}
export const clearNativeDraftFiles = clearComposerDraftFiles;

export interface UseNativeDraftFilesOptions {
  /** e.g. `home:<userId>`; undefined = off. */
  key?: string;
  /** False while the conversation already has its task session (files upload under it). */
  enabled: boolean;
  /** The thread's composer tiles (names only are compared). */
  attachments: readonly { name?: string }[];
  /** thread.onAttachFiles; undefined while the computer link is down. */
  attach: ((files: File[]) => void) | undefined;
}

export interface NativeDraftFilesHandle {
  /** Use in place of `attach` for files the user picks: they are remembered too. */
  attachFiles: (files: File[]) => void;
  /** The prompt went out (or the draft was dropped): forget the files. */
  clear: () => void;
}

export function useNativeDraftFiles({ key, enabled, attachments, attach }: UseNativeDraftFilesOptions): NativeDraftFilesHandle {
  const draft = useComposerDraft({
    draftKey: enabled ? key : undefined, value: "", onChange: () => {},
    attachments: attachments.map((item, index) => ({ ...item, id: `legacy-${index}` })), onAttachFiles: attach,
  });
  return { attachFiles: draft.attachFiles, clear: () => { if (key) void clearComposerDraftFiles(key); } };
}
