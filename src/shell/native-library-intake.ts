"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ComposerAttachment } from "./LeoComposer";
import { nativeLibrarySourceOf, readNativeLibraryFile, type NativeLibrarySource } from "./native-library-source";

type NativeFile = { id: string };
type Handoff = (files: File[]) => void;
type Entry = {
  id: string; key: string; source: NativeLibrarySource; display: ComposerAttachment;
  phase: "reading" | "resolved" | "handoff" | "registered" | "failed";
  controller: AbortController; generation: number; file?: File; nativeIds: string[];
  excludedIds: Set<string>; cancelled: boolean; handoff?: Handoff;
  handoffSnapshot?: readonly NativeFile[];
  promise: Promise<boolean>; finish: (ok: boolean) => void;
};
let fileStamp = 0;

/** Register before reading, then transfer ownership to the existing inbox tiles. */
export function useNativeLibraryIntake(options: {
  scopeKey: string;
  attachments: readonly NativeFile[];
  attachmentFile: (id: string) => File | undefined;
  addFiles?: Handoff;
  removeFile: (id: string) => void;
  errorText: string;
}) {
  const latest = useRef(options); latest.current = options;
  const entries = useRef<Entry[]>([]);
  const alive = useRef(true);
  const sequence = useRef(0);
  const [version, setVersion] = useState(0);
  const publish = useCallback(() => { if (alive.current) setVersion((value) => value + 1); }, []);

  const nativeIds = useCallback((entry: Entry): string[] => {
    if (!entry.file) return [];
    const current = latest.current;
    const available = current.attachments.filter((file) => !entry.excludedIds.has(file.id));
    const identical = available.filter((file) => current.attachmentFile(file.id) === entry.file);
    if (identical.length === 1) return [identical[0].id];
    // The controller may create a renamed File for same-name picks; it retains
    // lastModified. Each Library selection gets its own monotonic stamp.
    const matching = available.filter((item) => {
      const file = current.attachmentFile(item.id);
      const original = entry.file!.name;
      const dot = original.lastIndexOf(".");
      const stem = dot > 0 ? original.slice(0, dot) : original;
      const extension = dot > 0 ? original.slice(dot) : "";
      const renamed = file?.name.startsWith(`${stem}-`) && file.name.endsWith(extension) &&
        /^\d+$/.test(file.name.slice(stem.length + 1, extension ? -extension.length : undefined));
      return file && (file.name === original || renamed) && file.lastModified === entry.file!.lastModified && file.size === entry.file!.size && file.type === entry.file!.type;
    });
    return matching.length === 1 ? [matching[0].id] : [];
  }, []);
  const settle = (entry: Entry, ok: boolean) => { entry.finish(ok); entry.finish = () => {}; };

  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const entry of entries.current) {
        entry.controller.abort(); entry.cancelled = true; settle(entry, false);
        if (entry.phase === "handoff") for (const id of nativeIds(entry)) latest.current.removeFile(id);
      }
      entries.current = [];
      if (latest.current.scopeKey !== options.scopeKey) setVersion((value) => value + 1);
    };
  }, [options.scopeKey, nativeIds]);

  useLayoutEffect(() => {
    let changed = false;
    entries.current = entries.current.filter((entry) => {
      const ids = entry.phase === "handoff" ? nativeIds(entry) : entry.nativeIds;
      if (entry.cancelled) {
        for (const id of ids) latest.current.removeFile(id);
        if (ids.length) { changed = true; return false; }
        if (entry.phase === "handoff" && latest.current.attachments !== entry.handoffSnapshot && latest.current.attachments.length >= 20) { changed = true; return false; }
        return true;
      }
      if (entry.phase === "handoff" && ids.length) {
        entry.phase = "registered"; entry.nativeIds = ids; settle(entry, true); changed = true;
      }
      // A concurrent LOCAL add may consume the last authoritative controller
      // slot before React publishes it. A fresh full snapshot with no receipt
      // proves rejection; retain a retryable error instead of waiting forever.
      if (entry.phase === "handoff" && !ids.length && latest.current.attachments !== entry.handoffSnapshot && latest.current.attachments.length >= 20) {
        entry.phase = "failed"; settle(entry, false); changed = true;
      }
      if (entry.phase === "registered" && !latest.current.attachments.some((file) => entry.nativeIds.includes(file.id))) { changed = true; return false; }
      return true;
    });
    if (changed) publish();
  }, [version, options.attachments, options.attachmentFile, nativeIds, publish]);

  const drain = useCallback(() => {
    for (const entry of entries.current) {
      if (entry.cancelled || entry.phase === "failed" || entry.phase === "registered" || entry.phase === "handoff") continue;
      if (entry.phase === "reading") break;
      if (entry.phase !== "resolved" || !entry.file) continue;
      const attach = entry.handoff ?? latest.current.addFiles;
      const reserved = entries.current.filter((item) => item !== entry && item.phase === "handoff" && !nativeIds(item).length).length;
      if (!attach || latest.current.attachments.length + reserved >= 20) {
        entry.phase = "failed"; settle(entry, false); continue;
      }
      entry.excludedIds = new Set(latest.current.attachments.map((file) => file.id));
      entry.handoffSnapshot = latest.current.attachments;
      entry.phase = "handoff";
      try { attach([entry.file]); }
      catch { entry.phase = "failed"; settle(entry, false); }
    }
    publish();
  }, [publish, nativeIds]);

  const read = useCallback((entry: Entry) => {
    const generation = ++entry.generation;
    void Promise.resolve().then(() => readNativeLibraryFile(entry.source, { signal: entry.controller.signal })).then((file) => {
      if (!alive.current || entry.cancelled || entry.controller.signal.aborted || entry.generation !== generation) return;
      if (!file) throw new Error("source unavailable");
      fileStamp = Math.max(Date.now() + 1, fileStamp + 1);
      entry.file = new File([file], file.name, { type: file.type, lastModified: fileStamp });
      entry.phase = "resolved"; drain();
    }).catch(() => {
      if (!alive.current || entry.cancelled || entry.controller.signal.aborted || entry.generation !== generation) return;
      entry.phase = "failed"; settle(entry, false); drain();
    });
  }, [drain]);

  const add = useCallback((items: ComposerAttachment[], handoff?: Handoff): Promise<boolean> => {
    const selected = items.map((item) => {
      const source = nativeLibrarySourceOf(item);
      const key = source.artifactId && source.revisionId ? `${source.artifactId}:${source.revisionId}` : `invalid:${++sequence.current}`;
      const existing = entries.current.find((entry) => !entry.cancelled && entry.key === key);
      if (existing) return existing;
      let finish!: (ok: boolean) => void;
      const promise = new Promise<boolean>((resolve) => { finish = resolve; });
      const entry: Entry = {
        id: `native-library-${++sequence.current}`, key, source, display: { id: "", name: item.name, mime: item.mime, previewUrl: item.previewUrl },
        phase: "reading", controller: new AbortController(), generation: 0, nativeIds: [], excludedIds: new Set(), cancelled: false, handoff, promise, finish,
      };
      entries.current.push(entry); return entry;
    });
    // Both the visible tile and the authoritative send/queue fence exist before
    // even the resolver's first microtask (source grant or byte request).
    publish();
    for (const entry of new Set(selected)) if (entry.phase === "reading" && !entry.generation) read(entry);
    return Promise.all(selected.map((entry) => entry.promise)).then((results) => results.every(Boolean));
  }, [publish, read]);

  const blocked = useCallback(() => entries.current.some((entry) => entry.cancelled
    ? entry.phase === "handoff"
    : entry.phase !== "registered" && !(entry.phase === "handoff" && nativeIds(entry).length)), [nativeIds]);
  const remove = useCallback((id: string): boolean => {
    const entry = entries.current.find((item) => item.id === id || item.nativeIds.includes(id) || nativeIds(item).includes(id));
    if (!entry) return false;
    entry.cancelled = true; entry.controller.abort(); settle(entry, false);
    const ids = entry.nativeIds.length ? entry.nativeIds : nativeIds(entry);
    for (const nativeId of ids) latest.current.removeFile(nativeId);
    if (entry.phase !== "handoff" || ids.length) entries.current = entries.current.filter((item) => item !== entry);
    drain(); return true;
  }, [nativeIds, drain]);
  const retry = useCallback((id: string): boolean => {
    const entry = entries.current.find((item) => item.id === id && !item.cancelled && item.phase === "failed");
    if (!entry) return false;
    entry.controller.abort(); entry.controller = new AbortController(); entry.phase = "reading"; entry.file = undefined;
    entry.promise = new Promise<boolean>((resolve) => { entry.finish = resolve; });
    publish(); read(entry); return true;
  }, [publish, read]);
  const merge = (native: ComposerAttachment[]): ComposerAttachment[] => {
    const owned = new Set(entries.current.flatMap((entry) => entry.nativeIds.length ? entry.nativeIds : nativeIds(entry)));
    const picked = entries.current.flatMap((entry): ComposerAttachment[] => {
      if (entry.cancelled) return [];
      const ids = entry.nativeIds.length ? entry.nativeIds : nativeIds(entry);
      if (entry.phase === "registered" || (entry.phase === "handoff" && ids.length)) return native.filter((item) => ids.includes(item.id));
      return [{ ...entry.display, id: entry.id, uploading: entry.phase !== "failed", ...(entry.phase === "failed" ? { failed: true, failedReason: latest.current.errorText } : {}), openingDisabled: true }];
    });
    return [...native.filter((item) => !owned.has(item.id)), ...picked];
  };
  return { add, blocked, remove, retry, merge };
}
