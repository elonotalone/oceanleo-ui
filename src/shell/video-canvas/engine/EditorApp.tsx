"use client";

import { useLayoutEffect } from "react";
import { bindCanvasFetchJson } from "./canvas-gateway";
import CanvasWorkflow from "./CanvasWorkflow";
import { GalleryHostProvider } from "./gallery-host-context";
import { hostExtras, type GalleryEditorProps } from "./types";

export default function EditorApp({ docPath, host }: GalleryEditorProps) {
  const extras = hostExtras(host);
  useLayoutEffect(() => {
    bindCanvasFetchJson(host.fetchJson);
    return () => bindCanvasFetchJson(undefined);
  }, [host]);

  return (
    <GalleryHostProvider docPath={docPath} host={host}>
      <CanvasWorkflow materialAppId={extras.materialAppId || "canvas-flow"} />
    </GalleryHostProvider>
  );
}
