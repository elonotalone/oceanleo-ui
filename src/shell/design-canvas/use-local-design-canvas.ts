"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas } from "fabric";
import type { LibraryItem } from "../library-data";
import {
  parseDesignDocumentProject,
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

function projectFromItem(item: LibraryItem | null | undefined): DesignDocumentProject {
  const raw = item?.meta && typeof item.meta === "object" ? item.meta.designDocument : undefined;
  if (raw && typeof raw === "object") {
    try {
      return parseDesignDocumentProject(JSON.stringify(raw));
    } catch {
      /* fall through to blank */
    }
  }
  return blankDesignDocument(item?.title || "本地设计稿 W10");
}

export function useLocalDesignCanvas(item: LibraryItem | null) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricNS | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const historyRef = useRef<DesignDocumentProject[]>([]);
  const indexRef = useRef(0);
  const [revision, setRevision] = useState(0);
  const [project, setProject] = useState<DesignDocumentProject>(() => projectFromItem(item));
  const [ready, setReady] = useState(false);

  const paint = useCallback(async (next: DesignDocumentProject) => {
    const fabric = fabricRef.current;
    const canvas = canvasRef.current;
    if (!fabric || !canvas) return;
    applyDesignDocumentToCanvas(fabric, canvas, next);
  }, []);

  useEffect(() => {
    const next = projectFromItem(item);
    setProject(next);
    historyRef.current = [cloneDesignDocument(next)];
    indexRef.current = 0;
    void paint(next);
  }, [item, paint]);

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
      const cloned = cloneDesignDocument(next);
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
      historyRef.current.push(cloned);
      indexRef.current = historyRef.current.length - 1;
      setProject(cloned);
      setRevision((value) => value + 1);
      void paint(cloned);
      return cloned;
    },
    [paint],
  );

  const captureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return project;
    return mergeCanvasIntoDesignDocument(canvas, project);
  }, [project]);

  const setTitle = useCallback(
    (text: string) => {
      const current = captureCanvas();
      const elements = current.document.elements.map((element) =>
        element.id === "title1" ? { ...element, text } : element,
      );
      return commit({
        ...current,
        title: text.length >= 8 ? text : current.title,
        document: { ...current.document, elements },
      });
    },
    [captureCanvas, commit],
  );

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return project;
    indexRef.current -= 1;
    const next = cloneDesignDocument(historyRef.current[indexRef.current]);
    setProject(next);
    setRevision((value) => value + 1);
    void paint(next);
    return next;
  }, [paint, project]);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return project;
    indexRef.current += 1;
    const next = cloneDesignDocument(historyRef.current[indexRef.current]);
    setProject(next);
    setRevision((value) => value + 1);
    void paint(next);
    return next;
  }, [paint, project]);

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
    dirty: revision > 0,
    title: designDocumentTitleOf(project),
    canUndo: indexRef.current > 0,
    canRedo: indexRef.current < historyRef.current.length - 1,
    setTitle,
    undo,
    redo,
    captureCanvas,
    serialize: () => serializeDesignDocumentProject(captureCanvas()),
    exportPng,
  };
}
