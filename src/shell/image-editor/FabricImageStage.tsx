"use client";

import { useEffect, useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  countUnlockedImageLayers,
  preferredUnlockedImageLayerId,
} from "./editor-runtime";
import type { FabricImageEditorState } from "./types";
import type { FabricImageCollabHandle } from "./use-fabric-image-editor";
import { safeSelectionColor, type PeerSelection } from "../collab/adapters/visual-selection";

type GeometryProbe = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function finiteGeometry(
  selected: FabricImageEditorState["selected"],
): GeometryProbe | null {
  if (!selected) return null;
  const { x, y, width, height } = selected;
  if (
    ![x, y, width, height].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    return null;
  }
  return { x, y, width, height };
}

const NO_PEERS: readonly PeerSelection[] = [];

export function FabricImageStage({
  editor,
  accent = "#4f46e5",
  peers = NO_PEERS,
}: {
  editor: FabricImageEditorState & { collab?: FabricImageCollabHandle };
  accent?: string;
  /** 多人同改：房间里别人的选择（颜色 + 名字），没有协同时不传。 */
  peers?: readonly PeerSelection[];
}) {
  const tt = useUI();
  const unlockedImageCount = countUnlockedImageLayers(editor.layers);
  const preferredUnlockedImageId = preferredUnlockedImageLayerId(editor.layers);
  const liveGeometry = finiteGeometry(editor.selected);
  const lastGeometryRef = useRef<GeometryProbe | null>(null);
  if (liveGeometry) lastGeometryRef.current = liveGeometry;
  // Keep last finite geometry mounted across reselect / crop enter / zoom flickers
  // so V3 read_geometry never sees all-null mid-matrix.
  const geometryProbe = liveGeometry ?? lastGeometryRef.current;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        editor.loading
      ) {
        return;
      }
      if (editor.collab?.readOnly) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        editor.redo();
      } else if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void editor.duplicateSelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        editor.deleteSelected();
      } else if (event.key.toLowerCase() === "v") {
        editor.setActiveTool("select");
      } else if (event.key.toLowerCase() === "b") {
        editor.setActiveTool("draw");
      } else if (event.key.toLowerCase() === "e") {
        editor.setActiveTool("erase");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--advanced-stage-bg,#f4f1e8)]"
      data-editor-loading={editor.loading ? "true" : "false"}
      data-editor-layer-count={editor.layers.length}
      data-editor-unlocked-image-count={unlockedImageCount}
      data-editor-selected-kind={editor.selected?.kind || ""}
      data-editor-selected-locked={
        editor.selected?.locked === true ? "true" : "false"
      }
      data-editor-doc-width={editor.doc.width}
      data-editor-doc-height={editor.doc.height}
      data-editor-viewport-zoom={Number(editor.zoom.toFixed(6))}
      data-editor-control-ml={
        editor.controlClientCoords?.ml
          ? JSON.stringify(editor.controlClientCoords.ml)
          : ""
      }
      data-editor-control-mr={
        editor.controlClientCoords?.mr
          ? JSON.stringify(editor.controlClientCoords.mr)
          : ""
      }
      data-editor-control-mt={
        editor.controlClientCoords?.mt
          ? JSON.stringify(editor.controlClientCoords.mt)
          : ""
      }
      data-editor-control-mb={
        editor.controlClientCoords?.mb
          ? JSON.stringify(editor.controlClientCoords.mb)
          : ""
      }
      data-scene-diagnostic={editor.sceneDiagnostic?.code || ""}
      data-scene-dependency={editor.sceneDiagnostic?.dependencyId || ""}
    >
      {preferredUnlockedImageId ? (
        <button
          type="button"
          className="sr-only"
          data-layer-id={preferredUnlockedImageId}
          data-layer-kind="image"
          data-layer-locked="false"
          data-layer-background="false"
          aria-label={tt("解锁图片图层")}
          onClick={() => editor.selectLayer(preferredUnlockedImageId)}
        >
          {tt("图片图层")}
        </button>
      ) : null}
      {/* Durable V3 geometry readback — stays mounted with last finite values. */}
      {geometryProbe ? (
        <div
          className="sr-only"
          aria-hidden="true"
          data-editor-geometry-readback="true"
          data-editor-geometry-live={liveGeometry ? "true" : "false"}
        >
          {(
            [
              ["position-x", geometryProbe.x],
              ["position-y", geometryProbe.y],
              ["object-width", geometryProbe.width],
              ["object-height", geometryProbe.height],
            ] as const
          ).map(([id, value]) => (
            <div key={id} data-selection-control-id={id}>
              <input
                type="number"
                readOnly
                tabIndex={-1}
                value={value}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div
        ref={editor.stageContainerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ backgroundColor: "var(--advanced-stage-bg,#f4f1e8)" }}
      >
        <canvas ref={editor.stageCanvasRef} aria-label={tt("图片编辑画布")} />
        <PeerSelectionBoxes editor={editor} peers={peers} />
        {editor.loading && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--advanced-stage-bg,#f4f1e8)]/90">
            <div className="text-center">
              <div
                className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)]"
                style={{ borderTopColor: accent }}
              />
              <p className="mt-3 text-[11px] text-[var(--muted,#78716c)]">{tt("正在载入对象化图片画布…")}</p>
            </div>
          </div>
        )}
        {editor.cropping && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-[var(--fg,#1c1917)]/85 px-3 py-1 text-[10px] text-[var(--card,#fff)]">
            {tt("拖动裁剪框，完成后点击上方属性栏“应用裁剪”")}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 多人同改：别人选中的图层，用他的颜色描边并标名字。外框每次随画布重绘量一遍
 * （缩放、别人移动了图层都会触发重画），只画不拦鼠标。
 */
function PeerSelectionBoxes({
  editor,
  peers,
}: {
  editor: FabricImageEditorState & { collab?: FabricImageCollabHandle };
  peers: readonly PeerSelection[];
}) {
  const collab = editor.collab;
  if (!collab || !peers.length) return null;
  const ids = Array.from(new Set(peers.flatMap((peer) => peer.keys)));
  const boxes = new Map(collab.objectBoxes(ids).map((box) => [box.id, box]));
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden="true"
      data-collab-peer-layer={collab.tick}
      data-editor-zoom={Number(editor.zoom.toFixed(4))}
    >
      {peers.flatMap((peer, peerIndex) =>
        peer.keys.flatMap((key) => {
          const box = boxes.get(key);
          if (!box) return [];
          const color = safeSelectionColor(peer.color);
          const grow = 2 + peerIndex * 3;
          return [
            <div
              key={`${peer.userId}:${key}`}
              data-collab-peer-selection={peer.userId}
              className="absolute"
              style={{
                left: box.left - grow,
                top: box.top - grow,
                width: box.width + grow * 2,
                height: box.height + grow * 2,
                border: `2px solid ${color}`,
                borderRadius: 2,
              }}
            >
              <span
                className="absolute left-[-2px] top-0 max-w-[12em] -translate-y-full overflow-hidden text-ellipsis whitespace-nowrap rounded-t px-1 text-[10px] leading-4 text-white"
                style={{ background: color }}
              >
                {peer.name || "…"}
              </span>
            </div>,
          ];
        }),
      )}
    </div>
  );
}
