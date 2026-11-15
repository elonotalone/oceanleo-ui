"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import type { LibraryItem } from "../library-data";
import { useLockedEditCollab } from "../collab/adapters/use-entity-collab";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { refreshArtifactRendition } from "../artifact-client";
import { pinVideoProjectAssets } from "../workflow-carrier/video-project-material";
import { loadVideoProjectDoc } from "../workflow-carrier/workflow-graph-source";
import { parseVideoProject, type VideoProject } from "./engine/project-model";
import { useUI } from "../../i18n/ui/useUI";

const CanvasSession = dynamic(() => import("./LibraryVideoCanvasSession"), { ssr: false });

/** Every v2 source enters one editor; a failed read can never open a blank project. */
export function LibraryVideoCanvas(props: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const [externalItem, setExternalItem] = useState<LibraryItem | null>(null);
  const shownItem = externalItem || props.item;
  const lock = useLockedEditCollab({ item: props.item, editorKind: "workflow", onExternalItem: setExternalItem });
  const [loaded, setLoaded] = useState<{ project: VideoProject; key: string } | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const base = useRef(shownItem);
  const ownSaves = useRef(new Set<string>());
  const identity = `${shownItem.artifactId || shownItem.key || shownItem.id}:${shownItem.revisionId || ""}`;
  const root = String(shownItem.artifactId || shownItem.key || shownItem.id);
  const opened = useRef({ root: "", identity: "", nonce: -1 });
  useEffect(() => {
    if (opened.current.root === root && opened.current.nonce === nonce &&
      (opened.current.identity === identity || ownSaves.current.has(String(shownItem.revisionId)))) {
      base.current = shownItem;
      opened.current.identity = identity;
      return;
    }
    let cancelled = false;
    const abort = new AbortController();
    setLoaded(null); setError("");
    void (async () => {
      const read = async (url: string) => (await fetchMediaBlob(url, { cache: "no-store", maxBytes: 20_000_000, signal: abort.signal })).text();
      const source = await loadVideoProjectDoc(shownItem, async url => {
        try { return await read(url); }
        catch (error) {
          if (abort.signal.aborted) throw error;
          const fresh = await refreshArtifactRendition({ artifactId: root, revisionId: shownItem.revisionId || "" }, "source", abort.signal);
          if (!fresh.ok || !fresh.data?.url) throw error;
          return read(fresh.data.url);
        }
      });
      if (!source.ok) throw new Error(source.error);
      const project = parseVideoProject(pinVideoProjectAssets(source.doc, root, String(shownItem.revisionId)));
      if (cancelled) return;
      base.current = shownItem;
      opened.current = { root, identity, nonce };
      setLoaded({ project, key: `${identity}:${nonce}` });
    })().catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught)); });
    return () => { cancelled = true; abort.abort(); };
    // Open identity controls loading; a refreshed signed URL never replaces edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, identity, nonce]);

  if (loaded && !error) return <CanvasSession key={loaded.key} {...props} initialProject={loaded.project}
    base={base} lock={lock} onCommitted={item => {
      ownSaves.current.add(String(item.revisionId)); base.current = item;
      lock.markSaved(String(item.revisionId)); props.onSavedItem?.(item);
    }} />;
  return <AdvancedWorkbenchShell {...props} adapter={{ id: "video-canvas", label: tt("视频画布"),
    stage: error ? <EditorSourceFailurePanel message={error} onReload={() => setNonce(value => value + 1)} variant="surface" />
      : <div data-testid="video-canvas-loading" role="status">{tt("正在载入视频画布…")}</div> }} />;
}
