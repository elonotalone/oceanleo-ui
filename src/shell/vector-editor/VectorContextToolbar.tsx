"use client";

/**
 * `vector-editor` context toolbar.
 *
 * Spec: vector.md §5.1 — the toolbar exposes exactly the three capabilities the
 * bitmap adapter used to swallow (anchor editing, palette recolouring, shape
 * swapping) plus the §8/§1.3 readouts a reviewer needs: shape count, anchor
 * total, token coverage, byte floors and the licence tier.
 *
 * Toolbar ownership is `shared`, so this component renders controls only and
 * never owns layout chrome.
 */

import { useUI } from "../../i18n/ui/useUI";
import {
  VECTOR_CONSTANTS,
  VECTOR_PALETTE,
  vectorSourceByteFloor,
  type VectorProject,
  type VectorShape,
} from "./vector-schema";
import { vectorLicenseManifest } from "./vector-source";
import type { VectorEditorHandle } from "./use-vector-editor";

const REPLACEMENT_SHAPES: { id: string; label: string; shape: Omit<VectorShape, "id" | "z"> }[] = [
  {
    id: "circle",
    label: "换成圆形",
    shape: { type: "circle", cx: 12, cy: 12, r: 8, strokeToken: "vec-ink" },
  },
  {
    id: "square",
    label: "换成方形",
    shape: {
      type: "rect",
      x: 4,
      y: 4,
      width: 16,
      height: 16,
      rx: 2,
      strokeToken: "vec-ink",
    },
  },
];

function Readout({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1 text-[11px]">
      <span className="text-stone-500">{label}</span>
      <span
        className="tabular-nums font-semibold"
        style={{ color: ok ? VECTOR_PALETTE["vec.accent"] : "#E5484D" }}
      >
        {value}
      </span>
    </span>
  );
}

export function VectorContextToolbar({
  editor,
  svgByteSize,
}: {
  editor: VectorEditorHandle;
  svgByteSize: number;
}) {
  const tt = useUI();
  const project: VectorProject | null = editor.project;
  if (!project) return null;
  const capability = editor.capability;
  const license = vectorLicenseManifest(project);
  const byteFloor = vectorSourceByteFloor(project.canvas.kind);
  const selectedShape = project.shapes.find(
    (shape) => shape.id === editor.selectedShapeId,
  );

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-3 py-2">
      <span className="text-[11px] font-semibold text-stone-800">
        {tt("矢量")} · {project.canvas.kind}
      </span>

      <Readout
        label={tt("形状")}
        value={String(project.shapes.length)}
        ok={Boolean(capability?.shapeSwapping.ok)}
      />
      <Readout
        label={tt("锚点")}
        value={`${capability?.anchorEditing.totalAnchors ?? 0}/${VECTOR_CONSTANTS.C22_minimumTotalAnchors}`}
        ok={Boolean(capability?.anchorEditing.ok)}
      />
      <Readout
        label={tt("token 覆盖")}
        value={`${Math.round((capability?.recoloring.tokenReferenceRatio ?? 0) * 100)}%`}
        ok={Boolean(capability?.recoloring.ok)}
      />
      <Readout
        label={tt("源字节")}
        value={`${svgByteSize}/${byteFloor}`}
        ok={svgByteSize >= byteFloor}
      />
      <Readout
        label={tt("IR 字节")}
        value={`${editor.irBytes}/${VECTOR_CONSTANTS.C32_irByteFloor}`}
        ok={editor.irBytes >= VECTOR_CONSTANTS.C32_irByteFloor}
      />

      <span className="flex items-center gap-1.5 border-l border-stone-200 pl-3">
        {project.palette.map((entry) => (
          <label
            key={entry.token}
            title={`${entry.token} = ${entry.value}`}
            className="flex items-center gap-1"
          >
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(entry.value) ? entry.value : "#1F2328"}
              onChange={(event) => editor.recolor(entry.token, event.target.value)}
              className="h-5 w-5 cursor-pointer rounded border border-stone-200 p-0"
              aria-label={`${tt("配色")} ${entry.token}`}
            />
            <span className="text-[10px] text-stone-400">{entry.token}</span>
          </label>
        ))}
      </span>

      <span className="flex items-center gap-1.5 border-l border-stone-200 pl-3">
        <button
          type="button"
          disabled={!selectedShape || selectedShape.type !== "path"}
          onClick={() =>
            editor.insertAnchor({
              x: project.canvas.viewBoxWidth / 2,
              y: project.canvas.viewBoxHeight / 2,
            })
          }
          className="rounded-lg border border-stone-200 px-2 py-1 text-[11px] text-stone-600 disabled:opacity-40"
        >
          {tt("加锚点")}
        </button>
        <button
          type="button"
          disabled={editor.selectedAnchorIndex === null}
          onClick={() => editor.removeAnchor()}
          className="rounded-lg border border-stone-200 px-2 py-1 text-[11px] text-stone-600 disabled:opacity-40"
        >
          {tt("删锚点")}
        </button>
        {REPLACEMENT_SHAPES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            disabled={!selectedShape}
            onClick={() => editor.replaceShape(candidate.shape)}
            className="rounded-lg border border-stone-200 px-2 py-1 text-[11px] text-stone-600 disabled:opacity-40"
          >
            {tt(candidate.label)}
          </button>
        ))}
      </span>

      <span
        className="border-l border-stone-200 pl-3 text-[11px]"
        title={license.entries[0]?.decision.reason || ""}
      >
        <span className="text-stone-500">{tt("许可")} </span>
        <span
          className="font-semibold"
          style={{
            color: license.ok ? VECTOR_PALETTE["vec.accent"] : "#E5484D",
          }}
        >
          {license.entries.map((entry) => entry.licenseCode).join(" / ") || "—"}
        </span>
        <span className="ml-1 text-stone-400">
          {license.standaloneDownloadAllowed
            ? tt("可独立下载")
            : tt("仅可作组合成分")}
        </span>
      </span>

      <span className="min-w-0 flex-1 truncate text-[11px] text-stone-400">
        {editor.error || editor.reason || `${tt("状态")}: ${editor.state}`}
      </span>
    </div>
  );
}
