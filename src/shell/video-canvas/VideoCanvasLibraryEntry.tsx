"use client";

import { useEffect, useRef, useState } from "react";
import { AdvancedContentWorkbench } from "../AdvancedContentWorkbench";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import type { LibraryItem } from "../library-data";
import { getUserId } from "../../lib/auth/client";
import { useUI } from "../../i18n/ui/useUI";
import { createVideoProject, parseVideoProject, type VideoProject } from "./engine/project-model";
import { openLibraryVideoCanvas } from "./library-entry";

const pending = new Map<string, Promise<LibraryItem>>();

/** LeoVideo's shortcut opens the same saved item as My Library. */
export function VideoCanvasLibraryEntry({ artifactId = "", onClose = () => undefined }: { artifactId?: string; onClose?: () => void }) {
  const tt = useUI();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const creation = useRef<VideoProject | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(""); setItem(null);
    void (async () => {
      const owner = await getUserId();
      if (!owner) throw new Error(tt("请先登录"));
      const storageKey = `oceanleo:video-canvas:last:${owner}`;
      const url = new URL(window.location.href);
      let remembered = "";
      try { remembered = localStorage.getItem(storageKey) || ""; } catch { /* Opening still works without local storage. */ }
      const target = artifactId || url.searchParams.get("canvas_item") || remembered;
      const key = `${owner}:${target || "new"}`;
      let promise = pending.get(key);
      if (!promise) {
        if (!target && !creation.current) {
          try { const intent = localStorage.getItem(`${storageKey}:new`); if (intent) creation.current = parseVideoProject(JSON.parse(intent)); } catch { /* An invalid unfinished intent cannot replace an existing item. */ }
          creation.current ||= createVideoProject(tt("视频画布"));
          try { localStorage.setItem(`${storageKey}:new`, JSON.stringify(creation.current)); } catch { /* In-memory retries still reuse the intent. */ }
        }
        promise = openLibraryVideoCanvas(target, tt("视频画布"), undefined, creation.current || undefined);
        pending.set(key, promise);
        void promise.then(() => { if (pending.get(key) === promise) pending.delete(key); }, () => { if (pending.get(key) === promise) pending.delete(key); });
      }
      const opened = await promise;
      if (cancelled) return;
      try { localStorage.setItem(storageKey, String(opened.artifactId)); localStorage.removeItem(`${storageKey}:new`); } catch { /* URL and Library retain the root. */ }
      url.searchParams.set("canvas_item", String(opened.artifactId));
      window.history.replaceState(window.history.state, "", url);
      setItem(opened);
      // A later entry resolves the current head rather than a cached revision.
      pending.delete(key);
    })().catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught)); });
    return () => { cancelled = true; };
  }, [artifactId, retry, tt]);
  if (error) return <EditorSourceFailurePanel message={tt(error)} variant="surface" onReload={() => setRetry(value => value + 1)} />;
  if (!item) return <div role="status" data-video-canvas-opening>{tt("正在载入视频画布…")}</div>;
  return <AdvancedContentWorkbench item={item} siteId="video" embedded onClose={onClose} onSavedItem={setItem} />;
}
