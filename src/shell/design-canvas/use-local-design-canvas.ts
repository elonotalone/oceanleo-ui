"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas } from "fabric";
import type { LibraryItem } from "../library-data";
import {
  serializeDesignDocumentProject,
  type DesignDocumentProject,
} from "../image-editor/design-document-schema";
import type { FabricNS } from "../image-editor/editor-objects";
import { blankDesignDocument } from "./blank-design-document";
import {
  applyDesignDocumentToCanvas,
  cloneDesignDocument,
  designDocumentTitleOf,
  mergeCanvasIntoDesignDocument,
} from "./design-document-fabric";
import {
  hydrateDesignCanvasSource,
  planDesignCanvasSource,
} from "./design-canvas-source";
import { applyDesignDocumentTitle } from "./design-command-surface";
import { fetchMediaBlob } from "../../lib/media-proxy";
import {
  recordUserMutation,
  userEditItemKey,
  userMutationGeneration,
} from "../user-edit-session";

export type DesignCanvasUserEditKind = "commit" | "undo" | "redo" | "load";

/**
 * Design-canvas person-write choke. `commit` (applyProject) and person
 * undo/redo bump revision; the load identity effect that zeros revision
 * must not open autosave.
 */
export function applyDesignCanvasUserEditSession(
  item: { key?: string; id?: string } | null | undefined,
  kind: DesignCanvasUserEditKind,
): number {
  const key = userEditItemKey(item);
  if (kind === "load") return userMutationGeneration(key);
  return recordUserMutation(key);
}

export function useLocalDesignCanvas(
  item: LibraryItem | null,
  options: { reloadNonce?: number } = {},
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricNS | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const historyRef = useRef<DesignDocumentProject[]>([]);
  const indexRef = useRef(0);
  const loadedIdentityRef = useRef("");
  const dirtyRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const [project, setProject] = useState<DesignDocumentProject>(() =>
    blankDesignDocument(item?.title || "本地设计稿 W10"),
  );
  const [ready, setReady] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const identity = `${item?.key || item?.id || ""}:${item?.revisionId || ""}:${options.reloadNonce || 0}`;

  const paint = useCallback(async (next: DesignDocumentProject) => {
    const fabric = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabric || !canvas) return;
    applyDesignDocumentToCanvas(fabric, canvas, next);
  }, []);

  useEffect(() => {
    if (dirtyRef.current && loadedIdentityRef.current.split(":")[0] === String(item?.key || item?.id || "") && !options.reloadNonce) {
      return;
    }
    const plan = planDesignCanvasSource(item || { title: "本地设计稿 W10" });
    let cancelled = false;
    const abort = new AbortController();
    setSourceReady(false);
    setSourceError("");
    void hydrateDesignCanvasSource(plan, async (url) => {
      const blob = await fetchMediaBlob(url, {
        cache: "no-store",
        maxBytes: 20_000_000,
        signal: abort.signal,
      });
      return blob.text();
    }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setSourceError(result.error);
        setSourceReady(false);
        return;
      }
      loadedIdentityRef.current = identity;
      dirtyRef.current = false;
      setProject(result.project);
      historyRef.current = [cloneDesignDocument(result.project)];
      indexRef.current = 0;
      setRevision(0);
      applyDesignCanvasUserEditSession(item, "load");
      setSourceReady(true);
      void paint(result.project);
    });
    return () => {
      cancelled = true;
      abort.abort();
    };
    // identity already pins key/revision/retry; do not also depend on `item`
    // object identity or a parent re-render would refetch and wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, options.reloadNonce, paint]);

  useEffect(() => {
    let cancelled = false;
    const element = canvasElRef.current;
    if (!element) return undefined;
    void (async () => {
      const fabric = (await import("fabric")) as FabricNS;
      if (cancelled) return;
      fabricRef.current = fabric;
      const canvas = new fabric.Canvas(element, {
        preserveObjectStacking: true,
      });
      canvasRef.current = canvas;
      applyDesignDocumentToCanvas(fabric, canvas, project);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      canvasRef.current?.dispose();
      canvasRef.current = null;
      setReady(false);
    };
    // Mount once for this canvas element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback(
    (next: DesignDocumentProject) => {
      if (!sourceReady) return next;
      const cloned = cloneDesignDocument(next);
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
      historyRef.current.push(cloned);
      indexRef.current = historyRef.current.length - 1;
      dirtyRef.current = true;
      applyDesignCanvasUserEditSession(item, "commit");
      setProject(cloned);
      setRevision((value) => value + 1);
      void paint(cloned);
      return cloned;
    },
    [item, paint, sourceReady],
  );

  const captureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return project;
    return mergeCanvasIntoDesignDocument(canvas, project);
  }, [project]);

  const setTitle = useCallback(
    (text: string) => {
      return commit(applyDesignDocumentTitle(captureCanvas(), text));
    },
    [captureCanvas, commit],
  );

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return project;
    indexRef.current -= 1;
    const next = cloneDesignDocument(historyRef.current[indexRef.current]);
    applyDesignCanvasUserEditSession(item, "undo");
    setProject(next);
    setRevision((value) => value + 1);
    void paint(next);
    return next;
  }, [item, paint, project]);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return project;
    indexRef.current += 1;
    const next = cloneDesignDocument(historyRef.current[indexRef.current]);
    applyDesignCanvasUserEditSession(item, "redo");
    setProject(next);
    setRevision((value) => value + 1);
    void paint(next);
    return next;
  }, [item, paint, project]);

  const exportPng = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL({
      format: "png",
      multiplier: 1,
    });
    const response = await fetch(dataUrl);
    return response.blob();
  }, []);

  return {
    canvasElRef,
    ready,
    project,
    revision,
    dirty: sourceReady && revision > 0,
    sourceReady,
    sourceFailed: Boolean(sourceError),
    sourceError,
    title: designDocumentTitleOf(project),
    canUndo: indexRef.current > 0,
    canRedo: indexRef.current < historyRef.current.length - 1,
    setTitle,
    undo,
    redo,
    captureCanvas,
    applyProject: commit,
    serialize: () => serializeDesignDocumentProject(captureCanvas()),
    exportPng,
  };
}
