"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useUI } from "../../../i18n";
import { canvasImageAppearance } from "./project-model";
import { listMyArtifacts, refreshArtifactRendition } from "../../artifact-client";
import { timelineFontStack } from "../../video-editor/timeline-model";
import { drawTimelineImageFrame } from "../../video-editor/preview-engine";
import type { TimelineClip, TimelineTextStyle } from "../../video-editor/types";
import { AnchoredPopover } from "../../anchored-popover";
import { ComposerLibraryPicker } from "../../ComposerLibraryPicker";
import type { LibraryItem } from "../../library-data";
import { videoMaterialKind } from "../../workflow-carrier/video-project-material";
import type { ComposerAttachment } from "../../LeoComposer";
import type {
  CanvasFlowNode,
  CanvasNodeViewData,
} from "./project-model";
import {
  isLegacyWorkflowSource,
  legacyParameterViews,
  legacySourceKind,
  legacyWorkflowPorts,
  type LegacyParameterView,
} from "./legacy-workflow-node";

const imageLibraryPickers = new Map<string, () => Promise<LibraryItem | null>>();

/** The command opens the existing private Library selector on its selected node. */
export function requestCanvasLibraryImage(nodeId: string): Promise<LibraryItem | null> {
  return imageLibraryPickers.get(nodeId)?.() || Promise.resolve(null);
}

function canvasLibraryAnchor(nodeId: string, fallback: HTMLElement | null): HTMLElement | null {
  const buttonIn = (element: Element | null) => element?.matches('button:not(:disabled), [role="button"]:not([aria-disabled="true"])')
    ? element as HTMLElement : element?.querySelector<HTMLElement>('button:not(:disabled), [role="button"]:not([aria-disabled="true"])') || null;
  const directSelector = '[data-selection-control-id="canvas.selection.library.replace"]';
  const active = document.activeElement?.closest(directSelector);
  if (active && !active.closest('[hidden], [inert], [aria-hidden="true"]')) return buttonIn(active) || fallback;
  const direct = [...document.querySelectorAll(directSelector)].filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'));
  const matching = direct.find((element) => element.closest('[data-selection-id]')?.getAttribute("data-selection-id") === nodeId);
  const directButton = buttonIn(matching || direct.find((element) => !element.closest('[data-selection-id]')) || null);
  if (directButton) return directButton;
  const toolbar = [...document.querySelectorAll('[data-selection-id]')].find((element) => element.getAttribute("data-selection-id") === nodeId && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
  return buttonIn(toolbar?.querySelector('[data-selection-control-id="replace"]') || null) || fallback;
}

async function loadCanvasLibraryImages(signal: AbortSignal) {
  const result = await listMyArtifacts({ limit: 100, signal });
  return result.ok && result.data ? { ...result, data: { ...result.data, items: result.data.items.filter((item) => videoMaterialKind(item) === "image") } } : result;
}

type MediaLoadState = "idle" | "loading" | "ready" | "error" | "timeout";

function useBoundedMedia(src: string | undefined, budgetMs = 8_000) {
  const [state, setState] = useState<MediaLoadState>(src ? "loading" : "idle");
  useEffect(() => {
    setState(src ? "loading" : "idle");
    if (!src) return;
    const timeout = window.setTimeout(() => setState("timeout"), budgetMs);
    return () => window.clearTimeout(timeout);
  }, [budgetMs, src]);
  return {
    state,
    ready: () => setState("ready"),
    failed: () => setState("error"),
  };
}

function MediaState({
  state,
  empty,
}: {
  state: MediaLoadState;
  empty: string;
}) {
  if (state === "ready") return null;
  const message =
    state === "idle"
      ? empty
      : state === "loading"
        ? "Loading verified Asset…"
        : state === "timeout"
          ? "Asset exceeded the 8 s preview budget."
          : "Asset preview failed to load.";
  return (
    <div
      role={state === "error" || state === "timeout" ? "alert" : "status"}
      className="absolute inset-0 z-10 grid place-items-center bg-[var(--vc-media)] px-8 text-center text-xs leading-relaxed text-[var(--vc-text-2)]"
    >
      {message}
    </div>
  );
}

/** 宿主已经出了编辑栏时，节点自己不许再挂常驻命令条。 */
function hostHasNoEditBar(data: Pick<CanvasNodeViewData, "hostProvidesEditBar">) {
  return !data.hostProvidesEditBar;
}

function Ports({ kind }: { kind: CanvasNodeViewData["kind"] }) {
  const hasInput = !["text", "model"].includes(kind);
  const hasOutput = kind !== "delivery";
  return (
    <>
      {hasInput && (
        <Handle
          id="in-media"
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-[var(--vc-canvas)] !bg-[var(--vc-text-3)]"
          aria-label="Media input"
        />
      )}
      {hasOutput && (
        <Handle
          id="out-media"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-[var(--vc-canvas)] !bg-[var(--vc-accent)]"
          aria-label="Media output"
        />
      )}
    </>
  );
}

function ImageCompactBar({ data }: { data: CanvasNodeViewData }) {
  const tt = useUI();
  const [prompt, setPrompt] = useState(data.prompt || "");
  const [model, setModel] = useState(data.model || "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [maskUrl, setMaskUrl] = useState("");
  const [adjustments, setAdjustments] = useState({
    brightness: 1,
    contrast: 1,
    saturation: 1,
    exposure: 0,
  });
  const [toolbarOffset, setToolbarOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  useEffect(() => setPrompt(data.prompt || ""), [data.prompt]);
  useEffect(() => setModel(data.model || ""), [data.model]);
  const localAvailability = (commandId: string) =>
    data.commandAvailability[commandId] || {
      enabled: false,
      reason: "Command is unavailable.",
    };
  const disclosures = data.commandDisclosures || {};
  const commandTitle = (commandId: string, fallback: string) => {
    const availability = localAvailability(commandId);
    const disclosure = disclosures[commandId];
    return [
      availability.reason,
      availability.reasonCode,
      availability.missingContract,
      disclosure?.provider,
      disclosure?.model,
      disclosure?.input,
      disclosure?.cost,
    ]
      .filter(Boolean)
      .join(" · ") || fallback;
  };
  const invoke = (
    commandId: string,
    extra: Record<string, unknown> = {},
  ) =>
    data.onCommand(commandId, {
      prompt,
      model,
      maskUrl,
      direction: "ambient",
      intensity: 1,
      count: 4,
      fieldOfView: 180,
      scale: 2,
      top: 0,
      right: 256,
      bottom: 0,
      left: 256,
      strength: 0.5,
      ...extra,
    });
  const primaryTools =
    data.imageMode === "retouch"
      ? [
          ["canvas.node.update.local.crop", "Crop"],
          ["canvas.node.update.local.rotate", "Rotate"],
          ["canvas.node.update.local.adjust", "Adjust"],
        ]
      : [
          ["canvas.node.generate.image", "Generate"],
          ["canvas.node.generate.relight", "Relight"],
          ["canvas.node.generate.multi-angle", "Angles"],
          ["canvas.node.generate.grid-4", "4-grid"],
        ];
  const moreTools =
    data.imageMode === "retouch"
      ? [
          ["canvas.node.update.local.flip-horizontal", "Flip horizontal"],
          ["canvas.node.update.local.flip-vertical", "Flip vertical"],
          ["canvas.node.update.local.brightness", "Brightness +10%"],
          ["canvas.node.update.local.contrast", "Contrast +10%"],
          ["canvas.node.update.local.saturation", "Saturation +10%"],
          ["canvas.node.update.local.grayscale", "Grayscale"],
          ["canvas.node.update.local.grid-split-4", "Split 4-grid"],
          ["canvas.node.update.local.grid-split-9", "Split 9-grid"],
          ["canvas.node.update.local.grid-split-25", "Split 25-grid"],
        ]
      : [
          ["canvas.node.generate.panorama", "Panorama"],
          ["canvas.node.generate.grid-9", "Generate 9-grid"],
          ["canvas.node.generate.grid-25", "Generate 25-grid"],
          ["canvas.node.generate.upscale", "Upscale"],
          ["canvas.node.generate.inpaint", "Inpaint"],
          ["canvas.node.generate.outpaint", "Outpaint"],
          ["canvas.node.generate.portrait-quality", "Portrait quality"],
        ];
  const genericDisclosure = disclosures["canvas.node.generate.image"];

  return (
    <div
      role="toolbar"
      aria-label="Selected image tools"
      data-floating-toolbar-offset={`${toolbarOffset.x},${toolbarOffset.y}`}
      className="nodrag nowheel absolute -top-14 left-0 z-30 flex min-h-11 min-w-max items-center gap-1.5 rounded-xl border border-[var(--vc-border-strong)] bg-[var(--vc-surface-glass)] p-1.5 shadow-2xl backdrop-blur-xl"
      style={{
        transform: `translate(${toolbarOffset.x}px, ${toolbarOffset.y}px)`,
      }}
    >
      <button
        type="button"
        className="canvas-floating-toolbar-drag-handle nodrag grid h-8 w-8 cursor-grab place-items-center rounded-lg text-lg text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)] hover:text-[var(--vc-text)] active:cursor-grabbing"
        aria-label="Drag image toolbar"
        title="Drag image toolbar independently"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            offsetX: toolbarOffset.x,
            offsetY: toolbarOffset.y,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.stopPropagation();
          setToolbarOffset({
            x: drag.offsetX + event.clientX - drag.clientX,
            y: drag.offsetY + event.clientY - drag.clientY,
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.stopPropagation();
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        ⠿
      </button>
      <div
        role="radiogroup"
        aria-label="Image mode"
        className="flex rounded-lg bg-[var(--vc-surface-2)] p-0.5"
      >
        {(["retouch", "generate"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={data.imageMode === mode}
            onClick={() =>
              void data.onCommand("canvas.session.image-mode.set", { mode })
            }
            className={`h-8 rounded-md px-3 text-[11px] font-semibold transition ${
              data.imageMode === mode
                ? "bg-[var(--vc-accent-strong)] text-[var(--vc-on-accent)]"
                : "text-[var(--vc-text-2)] hover:text-[var(--vc-text)]"
            }`}
          >
            {/* Retouch 在 en.ts 里没有对应中文 key，接不上就保持原样留在预算锁里。 */}
            {mode === "retouch" ? "Retouch" : tt("开始生成")}
          </button>
        ))}
      </div>
      {data.imageMode === "retouch" ? (
        <div className="relative flex items-center gap-1">
          {primaryTools.map(([commandId, label]) => {
            const availability = localAvailability(commandId);
            return (
              <button
                key={commandId}
                type="button"
                data-command-id={commandId}
                disabled={!availability.enabled}
                title={commandTitle(
                  commandId,
                  `${label} locally — no AI charge`,
                )}
                onClick={() => {
                  if (commandId === "canvas.node.update.local.adjust") {
                    setAdjustOpen((value) => !value);
                  } else {
                    void invoke(commandId);
                  }
                }}
                className="h-8 rounded-lg px-2.5 text-[10px] text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {label}
              </button>
            );
          })}
          <span className="px-2 text-[9px] text-[var(--vc-accent-text)]">
            Local · non-destructive · $0
          </span>
          {adjustOpen && (
            <div
              role="dialog"
              aria-label="Retouch adjust controls"
              className="absolute left-0 top-11 z-50 grid w-72 gap-2 rounded-xl border border-[var(--vc-border-strong)] bg-[var(--vc-surface)] p-3 shadow-2xl"
            >
              {(
                [
                  ["brightness", "Brightness", 0.25, 2, 0.05],
                  ["contrast", "Contrast", 0.25, 2, 0.05],
                  ["saturation", "Saturation", 0, 2, 0.05],
                  ["exposure", "Exposure", -2, 2, 0.1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label
                  key={key}
                  className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-[9px] text-[var(--vc-text-2)]"
                >
                  <span>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={adjustments[key]}
                    onChange={(event) =>
                      setAdjustments((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                    className="nodrag w-full accent-[var(--vc-accent)]"
                  />
                  <output className="text-right font-mono text-[var(--vc-text-2)]">
                    {adjustments[key].toFixed(1)}
                  </output>
                </label>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setAdjustments({
                      brightness: 1,
                      contrast: 1,
                      saturation: 1,
                      exposure: 0,
                    })
                  }
                  className="rounded-md border border-[var(--vc-border)] px-2 py-1 text-[9px] text-[var(--vc-text-2)]"
                >
                  Reset
                </button>
                <button
                  type="button"
                  data-command-id="canvas.node.update.local.adjust"
                  onClick={() => {
                    void invoke(
                      "canvas.node.update.local.adjust",
                      adjustments,
                    );
                    setAdjustOpen(false);
                  }}
                  className="rounded-md bg-[var(--vc-accent-strong)] px-2 py-1 text-[9px] font-semibold text-[var(--vc-on-accent)]"
                >
                  Apply locally
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex items-center gap-2">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onBlur={() =>
              void data.onCommand("canvas.node.field.update", {
                field: "prompt",
                value: prompt,
              })
            }
            aria-label="Image generation prompt"
            placeholder="Describe the image"
            className="h-8 w-48 rounded-lg border border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-2 text-[10px] text-[var(--vc-text)] outline-none focus:border-[var(--vc-accent)]"
          />
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            onBlur={() =>
              void data.onCommand("canvas.node.field.update", {
                field: "model",
                value: model,
              })
            }
            aria-label="Image model"
            placeholder="Platform default"
            className="h-8 w-28 rounded-lg border border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-2 text-[10px] text-[var(--vc-text)] outline-none focus:border-[var(--vc-accent)]"
          />
          <span
            className="max-w-40 text-[8px] leading-tight text-[var(--vc-text-2)]"
            title={[
              `Provider: ${genericDisclosure?.provider || data.generateSummary?.provider}`,
              `Model: ${model || genericDisclosure?.model || data.generateSummary?.model}`,
              `Input: ${genericDisclosure?.input || data.generateSummary?.input}`,
              `Cost: ${genericDisclosure?.cost || data.generateSummary?.estimatedCost}`,
            ].join("\n")}
          >
            {genericDisclosure?.provider || data.generateSummary?.provider} ·{" "}
            {model || genericDisclosure?.model || data.generateSummary?.model} ·{" "}
            {genericDisclosure?.cost || data.generateSummary?.estimatedCost}
          </span>
          {primaryTools.map(([commandId, label]) => {
            const availability = localAvailability(commandId);
            return (
              <button
                key={commandId}
                type="button"
                data-command-id={commandId}
                disabled={
                  !availability.enabled ||
                  (commandId === "canvas.node.generate.image" &&
                    !prompt.trim())
                }
                title={commandTitle(commandId, label)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void invoke(commandId)}
                className="h-8 rounded-lg bg-[var(--vc-accent-strong)] px-2.5 text-[10px] font-semibold text-[var(--vc-on-accent)] hover:bg-[var(--vc-accent-strong-hover)] disabled:cursor-not-allowed disabled:bg-[var(--vc-surface-2)] disabled:text-[var(--vc-text-3)]"
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((value) => !value)}
          className="h-8 rounded-lg px-2.5 text-[10px] font-semibold text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)]"
        >
          {tt("更多")}
        </button>
        {moreOpen && (
          <div
            role="menu"
            aria-label={`${data.imageMode} image tools`}
            className="absolute right-0 top-10 z-50 grid w-72 gap-1 rounded-xl border border-[var(--vc-border-strong)] bg-[var(--vc-surface)] p-2 shadow-2xl"
          >
            {data.imageMode === "generate" && (
              <label className="mb-1 grid gap-1 px-1 text-[8px] text-[var(--vc-text-3)]">
                Durable mask URL for Inpaint
                <input
                  type="url"
                  value={maskUrl}
                  onChange={(event) => setMaskUrl(event.target.value)}
                  placeholder="https://…/mask.png"
                  aria-label="Inpaint durable mask URL"
                  className="h-8 rounded-lg border border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-2 text-[9px] text-[var(--vc-text-2)] outline-none focus:border-[var(--vc-accent)]"
                />
              </label>
            )}
            {moreTools.map(([commandId, label]) => {
              const availability = localAvailability(commandId);
              const disclosure = disclosures[commandId];
              const missingMask =
                commandId === "canvas.node.generate.inpaint" &&
                !maskUrl.trim();
              return (
                <button
                  key={commandId}
                  type="button"
                  role="menuitem"
                  data-command-id={commandId}
                  disabled={!availability.enabled || missingMask}
                  title={
                    missingMask
                      ? "Inpaint requires a durable mask Asset URL."
                      : commandTitle(commandId, label)
                  }
                  onClick={() => {
                    void invoke(commandId);
                    setMoreOpen(false);
                  }}
                  className="rounded-lg border border-[var(--vc-border)] px-3 py-2 text-left text-[10px] text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)] disabled:cursor-not-allowed disabled:text-[var(--vc-text-3)]"
                >
                  <span className="block font-semibold">{label}</span>
                  <span className="mt-0.5 block text-[8px] leading-relaxed text-[var(--vc-text-3)]">
                    {availability.enabled
                      ? data.imageMode === "retouch"
                        ? "Local immutable derivative · $0"
                        : `${disclosure?.provider} · ${disclosure?.model} · ${disclosure?.cost}`
                      : `${availability.reasonCode || "CAPABILITY_DISABLED"} · ${availability.reason}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ImageNode({
  data,
  selected,
}: {
  data: CanvasNodeViewData;
  selected: boolean;
}) {
  const tt = useUI();
  const source = data.asset?.sourceDependency ? undefined : data.asset?.librarySource;
  const identity = source ? `${source.artifactId}:${source.revisionId}` : "";
  const [libraryMedia, setLibraryMedia] = useState({ identity: "", url: "", failed: false });
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setLibraryMedia({ identity, url: "", failed: true }); controller.abort(); }, 8_000);
    void refreshArtifactRendition(source, "full", controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const valid = result.ok && result.data?.url && result.data.mediaType?.startsWith("image/");
      setLibraryMedia({ identity, url: valid ? result.data!.url : "", failed: !valid });
    }).catch(() => { if (!controller.signal.aborted) setLibraryMedia({ identity, url: "", failed: true }); }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [identity, source?.artifactId, source?.revisionId]);
  const src = source ? (libraryMedia.identity === identity ? libraryMedia.url || undefined : undefined) : data.asset?.previewUrl || data.asset?.url;
  const media = useBoundedMedia(src);
  const libraryState: MediaLoadState = source && !src ? (libraryMedia.identity === identity && libraryMedia.failed ? "error" : "loading") : media.state;
  const appearance = canvasImageAppearance(data);
  const [pickerOpen, setPickerOpen] = useState(false);
  const nodeAnchorRef = useRef<HTMLDivElement>(null);
  const libraryAnchorRef = useRef<HTMLElement | null>(null);
  const libraryResolve = useRef<((item: LibraryItem | null) => void) | null>(null);
  const closePicker = (item: LibraryItem | null = null) => {
    libraryResolve.current?.(item);
    libraryResolve.current = null;
    setPickerOpen(false);
  };
  useEffect(() => {
    if (!selected) return;
    const open = () => new Promise<LibraryItem | null>((resolve) => {
      libraryResolve.current?.(null);
      libraryResolve.current = resolve;
      libraryAnchorRef.current = canvasLibraryAnchor(data.nodeId, nodeAnchorRef.current);
      setPickerOpen(true);
    });
    imageLibraryPickers.set(data.nodeId, open);
    return () => {
      if (imageLibraryPickers.get(data.nodeId) === open) imageLibraryPickers.delete(data.nodeId);
      libraryResolve.current?.(null);
      libraryResolve.current = null;
      setPickerOpen(false);
    };
  }, [data.nodeId, data.selectionEpoch, data.asset?.assetId, selected]);
  const chooseImage = (file: ComposerAttachment) => {
    if (!file.libraryItem || !file.artifactId || !file.revisionId) return;
    closePicker({ ...file.libraryItem, artifactId: file.artifactId, revisionId: file.revisionId });
  };
  const imageElement = useRef<HTMLImageElement>(null);
  const canvasElement = useRef<HTMLCanvasElement>(null);
  const signature = JSON.stringify(appearance);
  const frame = data.imagePreviewFrame || { width: 1920, height: 1080, scale: 0.3 };
  const paint = () => {
    const image = imageElement.current, canvas = canvasElement.current;
    if (!image?.naturalWidth || !canvas) return;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image preview is unavailable.");
      const ratio = Math.min(canvas.width / (frame.width * frame.scale), canvas.height / (frame.height * frame.scale));
      const width = frame.width * frame.scale * ratio, height = frame.height * frame.scale * ratio;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate((canvas.width - width) / 2, (canvas.height - height) / 2);
      try {
        drawTimelineImageFrame(ctx, image, { id: data.nodeId, start_ms: 0, duration_ms: 1, ...appearance, x: 0.5, y: 0.5, scale: 1 } as TimelineClip, width, height, ratio);
      } finally { ctx.restore(); }
      media.ready();
    } catch { media.failed(); }
  };
  useEffect(() => { paint(); }, [signature, src, frame.width, frame.height, frame.scale]);
  return (
    <div
      ref={nodeAnchorRef}
      data-node-id={data.nodeId}
      data-asset-id={data.asset?.assetId}
      data-derived-from-asset-id={data.derivative?.derivedFromAssetId}
      className={`relative h-full w-full rounded-2xl bg-[var(--vc-media)] shadow-2xl ${
        selected ? "ring-2 ring-[var(--vc-accent)] ring-offset-2 ring-offset-[var(--vc-canvas)]" : ""
      }`}
    >
      <Ports kind={data.kind} />
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {src && <>
          <canvas ref={canvasElement} width={432} height={270} role="img" aria-label={appearance.alt || data.title} className="block h-full w-full" />
          {/* The same decoded source feeds the timeline pixel painter; grants remain runtime-only. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imageElement} src={src} crossOrigin="anonymous" alt="" draggable={false} onLoad={paint} onError={media.failed} className="hidden" />
        </>}
        <MediaState
          state={libraryState}
          empty="No immutable image Asset yet. Use Generate or insert a verified library Asset."
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-[var(--vc-media-scrim)] to-transparent p-3 pt-10">
          <span className="truncate text-xs font-semibold text-[var(--vc-on-media)]">
            {data.title}
          </span>
          {data.asset && (
            <span className="rounded bg-[var(--vc-media-scrim)] px-1.5 py-0.5 font-mono text-[8px] text-[var(--vc-on-media)]">
              {data.asset.assetId.slice(0, 18)}
            </span>
          )}
        </div>
      </div>
      {selected && hostHasNoEditBar(data) && <ImageCompactBar data={data} />}
      {pickerOpen && (
        <AnchoredPopover open anchorRef={libraryAnchorRef} onClose={() => closePicker()} role="dialog" ariaLabel={tt("从资料库添加文件")}
          maxHeight={512} lockScroll={false} className="nodrag nowheel z-50 flex w-80 flex-col overflow-auto rounded-xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-2 shadow-2xl">
          <ComposerLibraryPicker onBack={() => closePicker()} onPick={chooseImage} load={loadCanvasLibraryImages} />
        </AnchoredPopover>
      )}
    </div>
  );
}

function VideoNode({
  data,
  selected,
}: {
  data: CanvasNodeViewData;
  selected: boolean;
}) {
  const tt = useUI();
  const src = data.asset?.url;
  const media = useBoundedMedia(src);
  const [prompt, setPrompt] = useState(data.prompt || "");
  const generate = data.commandAvailability["canvas.node.generate.video"];
  return (
    <div
      data-node-id={data.nodeId}
      data-asset-id={data.asset?.assetId}
      className={`relative h-full w-full overflow-visible rounded-2xl bg-[var(--vc-media)] shadow-2xl ${
        selected ? "ring-2 ring-[var(--vc-video)] ring-offset-2 ring-offset-[var(--vc-canvas)]" : ""
      }`}
    >
      <Ports kind={data.kind} />
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {src && (
          <video
            src={src}
            poster={data.asset?.previewUrl}
            preload="metadata"
            controls={selected}
            playsInline
            onLoadedMetadata={media.ready}
            onError={media.failed}
            className="block h-full w-full bg-[var(--vc-letterbox)] object-cover"
          />
        )}
        <MediaState
          state={media.state}
          empty="No video Asset yet. Generate creates a durable Run receipt."
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--vc-media-scrim)] to-transparent p-3 pt-10 text-xs font-semibold text-[var(--vc-on-media)]">
          {data.title}
          {selected && data.generateSummary?.estimatedCost && <span title={tt("价格")} className="ml-2 text-[10px] font-normal">{tt(data.generateSummary.estimatedCost)}</span>}
        </div>
      </div>
      {selected && hostHasNoEditBar(data) && (
        <div className="nodrag nowheel absolute -top-14 left-0 z-30 flex h-11 items-center gap-2 rounded-xl border border-[var(--vc-border-strong)] bg-[var(--vc-surface-glass)] p-1.5 shadow-2xl">
          <button
            type="button"
            className="leo-node-drag-handle grid h-8 w-8 cursor-grab place-items-center rounded-lg text-lg text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)]"
            aria-label="Drag selected video"
          >
            ⠿
          </button>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onBlur={() =>
              void data.onCommand("canvas.node.field.update", {
                field: "prompt",
                value: prompt,
              })
            }
            aria-label="Video generation prompt"
            placeholder="Describe the take"
            className="h-8 w-56 rounded-lg border border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-2 text-[10px] text-[var(--vc-text)] outline-none"
          />
          <span className="max-w-48 text-[9px] leading-tight text-[var(--vc-text-2)]">
            OceanLeo gateway · {data.model || "platform default"} ·{" "}
            {data.durationSeconds || 5}s · provider-priced
          </span>
          {!generate?.hidden && (
            <button
              type="button"
              disabled={!generate?.enabled}
              title={generate?.reason}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() =>
                void data.onCommand("canvas.node.generate.video", { prompt })
              }
              className="h-8 rounded-lg bg-[var(--vc-video-strong)] px-3 text-[10px] font-semibold text-[var(--vc-on-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tt("开始生成")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AudioNode({
  data,
  selected,
}: {
  data: CanvasNodeViewData;
  selected: boolean;
}) {
  const tt = useUI();
  const src = data.asset?.url;
  const media = useBoundedMedia(src);
  return (
    <div
      data-node-id={data.nodeId}
      data-asset-id={data.asset?.assetId}
      className={`relative h-full w-full overflow-hidden rounded-2xl bg-[var(--vc-media)] shadow-2xl ${
        selected ? "ring-2 ring-[var(--vc-accent)] ring-offset-2 ring-offset-[var(--vc-canvas)]" : ""
      }`}
    >
      <Ports kind={data.kind} />
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div>
          <p className="text-xs font-semibold text-[var(--vc-text)]">{data.title}</p>
          <p className="mt-2 text-[10px] text-[var(--vc-text-2)]">{data.prompt || tt("添加文本或连接脚本。")}</p>
          {selected && hostHasNoEditBar(data) && <div className="nodrag mt-2 flex gap-2">{(["voice", "music"] as const).map((mode) => <button key={mode} type="button" disabled={!data.commandAvailability[`canvas.node.generate.${mode}`]?.enabled} onClick={() => void data.onCommand(`canvas.node.generate.${mode}`)}>{tt(mode === "voice" ? "生成配音" : "生成音乐")}</button>)}</div>}
        </div>
        {src ? (
          <audio
            src={src}
            controls
            preload="metadata"
            onLoadedMetadata={media.ready}
            onError={media.failed}
            className="nodrag nowheel h-9 w-full"
          />
        ) : (
          <p className="text-[10px] text-[var(--vc-text-3)]">No verified Audio Asset.</p>
        )}
      </div>
    </div>
  );
}

function TextualNode({
  data,
  selected,
}: {
  data: CanvasNodeViewData;
  selected: boolean;
}) {
  const [value, setValue] = useState(data.text || data.prompt || "");
  useEffect(() => setValue(data.text || data.prompt || ""), [data.prompt, data.text]);
  const textStyle = (data.params?.textStyle || {}) as TimelineTextStyle;
  const previewText = textStyle.vertical_text ? value.split("\n").map((line) => Array.from(line).join("\n")).join("\n") : value;
  const canGenerate =
    data.commandAvailability["canvas.node.generate.script"];
  const canStructure = data.commandAvailability["canvas.script.structure"];
  return (
    <div
      data-node-id={data.nodeId}
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-[var(--vc-surface)] shadow-2xl ${
        selected ? "border-[var(--vc-info)]" : "border-[var(--vc-border)]"
      }`}
    >
      <Ports kind={data.kind} />
      <div className="leo-node-drag-handle flex cursor-grab items-center justify-between border-b border-[var(--vc-border)] px-4 py-3">
        <span className="text-xs font-semibold text-[var(--vc-text)]">{data.title}</span>
        <span className="text-[9px] uppercase tracking-widest text-[var(--vc-text-3)]">
          {data.kind}
        </span>
      </div>
      <div data-canvas-text-preview="" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3"
        style={{ fontFamily: timelineFontStack(textStyle.font_family), fontSize: textStyle.font_size || 48,
          fontWeight: textStyle.bold ? 700 : 400, fontStyle: textStyle.italic ? "italic" : "normal",
          textDecoration: [textStyle.underline ? "underline" : "", textStyle.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
          lineHeight: textStyle.line_height ?? 1.3, letterSpacing: textStyle.letter_spacing || 0,
          textAlign: textStyle.align || "center", color: textStyle.color || "#ffffff", backgroundColor: textStyle.background || "transparent" }}>
        {previewText}
      </div>
      {selected && <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() =>
          void data.onCommand("canvas.node.field.update", {
            field: data.text ? "text" : "prompt",
            value,
          })
        }
        aria-label={`${data.title} content`}
        className="nodrag nowheel min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-[11px] leading-relaxed text-[var(--vc-text-2)] outline-none"
        placeholder="Write the content or generation prompt…"
      />}
      {(data.kind === "script" || data.kind === "text") &&
        selected &&
        hostHasNoEditBar(data) && (
        <div className="flex items-center justify-between border-t border-[var(--vc-border)] px-3 py-2">
          <span className="text-[9px] text-[var(--vc-text-3)]">
            Script → Scene → Shot → Storyboard
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!canStructure?.enabled || !value.trim()}
              title={canStructure?.reason}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void data.onCommand("canvas.script.structure")}
              className="nodrag rounded-lg border border-[var(--vc-info-border)] px-3 py-1.5 text-[10px] font-semibold text-[var(--vc-info)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Structure shots
            </button>
            <button
              type="button"
              disabled={!canGenerate?.enabled || !value.trim()}
              title={canGenerate?.reason}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() =>
                void data.onCommand("canvas.node.generate.script", {
                  prompt: value,
                })
              }
              className="nodrag rounded-lg bg-[var(--vc-info-strong)] px-3 py-1.5 text-[10px] font-semibold text-[var(--vc-on-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompositeNode({
  data,
  selected,
}: {
  data: CanvasNodeViewData;
  selected: boolean;
}) {
  return (
    <div
      data-node-id={data.nodeId}
      data-asset-id={data.asset?.assetId}
      className={`relative h-full w-full overflow-hidden rounded-2xl border bg-[var(--vc-surface)] shadow-2xl ${
        selected ? "border-[var(--vc-accent)]" : "border-[var(--vc-border)]"
      }`}
    >
      <Ports kind={data.kind} />
      {data.asset?.url ? (
        <video
          src={data.asset.url}
          controls={selected}
          preload="metadata"
          className="h-full w-full bg-[var(--vc-letterbox)] object-cover"
        />
      ) : (
        <div className="grid h-full place-items-center px-8 text-center">
          <div>
            <p className="text-sm font-semibold text-[var(--vc-text)]">{data.title}</p>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--vc-text-3)]">
              Composite and Delivery surfaces only show real clip Assets and
              persisted renders. No placeholder output is fabricated.
            </p>
          </div>
        </div>
      )}
      {selected && hostHasNoEditBar(data) && (
        <div className="nodrag absolute -top-12 left-0 z-30 flex h-10 items-center gap-1.5 rounded-xl border border-[var(--vc-border-strong)] bg-[var(--vc-surface-glass)] p-1.5 shadow-2xl">
          <button
            type="button"
            onClick={() =>
              void data.onCommand("canvas.session.view.set", {
                view: "timeline",
              })
            }
            className="h-7 rounded-lg px-2.5 text-[10px] text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)]"
          >
            Open timeline
          </button>
          <button
            type="button"
            disabled={
              !data.commandAvailability["canvas.timeline.build-approved"]
                ?.enabled
            }
            title={
              data.commandAvailability["canvas.timeline.build-approved"]?.reason
            }
            onClick={() =>
              void data.onCommand("canvas.timeline.build-approved")
            }
            className="h-7 rounded-lg bg-[var(--vc-accent-strong)] px-2.5 text-[10px] font-semibold text-[var(--vc-on-accent)] disabled:bg-[var(--vc-surface-2)] disabled:text-[var(--vc-text-3)]"
          >
            Build approved takes
          </button>
        </div>
      )}
    </div>
  );
}

function ProductionNode({
  data,
  selected,
}: {
  data: CanvasNodeViewData;
  selected: boolean;
}) {
  const tt = useUI();
  // label 接词典，description / action 那几句 en.ts 里没有 key，留在预算锁里。
  const configuration =
    data.kind === "director"
      ? {
          label: "Director / Previs",
          description:
            "Lens, safe-area, framing, focus target, and camera-path plan.",
          commandId: "canvas.director.camera-plan.create",
          action: "Create camera plan",
          view: "director",
        }
      : data.kind === "timeline"
        ? {
            label: tt("时间线"),
            description:
              "Approved Takes become immutable clips on the Project timeline.",
            commandId: "canvas.timeline.build-approved",
            action: "Build approved takes",
            view: "timeline",
          }
        : {
            label: tt("分镜"),
            description:
              "Scenes, Shots, frames, candidate Takes, and review decisions.",
            commandId: "canvas.session.view.set",
            action: "Open storyboard",
            view: "storyboard",
          };
  const availability =
    data.commandAvailability[configuration.commandId] || { enabled: true };
  return (
    <div
      data-node-id={data.nodeId}
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-[var(--vc-surface)] shadow-2xl ${
        selected ? "border-[var(--vc-plan)]" : "border-[var(--vc-border)]"
      }`}
    >
      <Ports kind={data.kind} />
      <div className="leo-node-drag-handle flex cursor-grab items-center justify-between border-b border-[var(--vc-border)] px-4 py-3">
        <span className="text-xs font-semibold text-[var(--vc-text)]">
          {configuration.label}
        </span>
        <span className="font-mono text-[8px] text-[var(--vc-text-3)]">
          {data.shotId?.slice(0, 16) || "project head"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-between p-4">
        <p className="text-[11px] leading-relaxed text-[var(--vc-text-2)]">
          {configuration.description}
        </p>
        <button
          type="button"
          disabled={!availability.enabled}
          title={availability.reason}
          onClick={() =>
            void data.onCommand(
              configuration.commandId,
              configuration.commandId === "canvas.session.view.set"
                ? { view: configuration.view }
                : { shotId: data.shotId },
            )
          }
          className="nodrag mt-3 rounded-lg bg-[var(--vc-plan-strong)] px-3 py-2 text-[10px] font-semibold text-[var(--vc-on-accent)] disabled:cursor-not-allowed disabled:bg-[var(--vc-surface-2)] disabled:text-[var(--vc-text-3)]"
        >
          {configuration.action}
        </button>
      </div>
    </div>
  );
}

function LegacyPorts({ source }: { source: Record<string, unknown> }) {
  return (
    <>
      {legacyWorkflowPorts(source).map((port, index) => (
        <Handle
          key={`${port.direction}:${port.id}:${index}`}
          id={port.id}
          type={port.handleType}
          position={port.position === "left" ? Position.Left : Position.Right}
          style={{ top: port.top }}
          className={`!h-3 !w-3 !border-2 !border-[var(--vc-canvas)] ${
            port.direction === "input"
              ? "!bg-[var(--vc-text-3)]"
              : "!bg-[var(--vc-accent)]"
          }`}
          aria-label={port.ariaLabel}
          title={port.ariaLabel}
        />
      ))}
    </>
  );
}

function LegacyWorkflowNode({
  data,
  selected,
  source,
}: {
  data: CanvasNodeViewData;
  selected: boolean;
  source: Record<string, unknown>;
}) {
  const parameters = legacyParameterViews(source);
  const [title, setTitle] = useState(data.title);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(parameters.map((parameter) => [parameter.key, parameter.displayValue])),
  );
  const [error, setError] = useState("");
  const titleAvailability =
    data.commandAvailability["canvas.node.field.update"] || { enabled: false };
  const parameterAvailability =
    data.commandAvailability["canvas.node.legacy-param.update"] || {
      enabled: false,
      reason: "Legacy parameter editing is unavailable.",
    };

  useEffect(() => {
    setTitle(data.title);
    setValues(
      Object.fromEntries(
        legacyParameterViews(source).map((parameter) => [
          parameter.key,
          parameter.displayValue,
        ]),
      ),
    );
  }, [data.title, source]);

  const commit = async (
    commandId: string,
    args: Record<string, unknown>,
    onFailure: () => void,
  ) => {
    try {
      const result = await data.onCommand(commandId, args);
      const status =
        result && typeof result === "object" && "status" in result
          ? String((result as { status: unknown }).status)
          : "succeeded";
      if (status !== "succeeded" && status !== "accepted") {
        const message =
          result && typeof result === "object" && "message" in result
            ? String((result as { message: unknown }).message)
            : "The edit was not saved.";
        setError(message);
        onFailure();
        return;
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The edit was not saved.");
      onFailure();
    }
  };

  const commitParameter = (parameter: LegacyParameterView) => {
    const rawValue = values[parameter.key] ?? parameter.displayValue;
    const value =
      parameter.editRule?.input === "number"
        ? rawValue.trim() === ""
          ? Number.NaN
          : Number(rawValue)
        : rawValue;
    void commit(
      "canvas.node.legacy-param.update",
      { path: `params.${parameter.key}`, value },
      () =>
        setValues((current) => ({
          ...current,
          [parameter.key]: parameter.displayValue,
        })),
    );
  };

  return (
    <div
      data-node-id={data.nodeId}
      data-legacy-kind={legacySourceKind(source)}
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-[var(--vc-surface)] shadow-2xl ${
        selected ? "border-[var(--vc-info)] ring-2 ring-[var(--vc-info)]" : "border-[var(--vc-border)]"
      }`}
    >
      <LegacyPorts source={source} />
      <div className="leo-node-drag-handle flex cursor-grab items-center gap-2 border-b border-[var(--vc-border)] px-3 py-2">
        <input
          value={title}
          maxLength={200}
          disabled={!titleAvailability.enabled}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() =>
            void commit(
              "canvas.node.field.update",
              { field: "title", value: title },
              () => setTitle(data.title),
            )
          }
          aria-label="Legacy node title"
          title={titleAvailability.reason}
          className="nodrag min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-[var(--vc-text)] outline-none focus:border-[var(--vc-border-strong)]"
        />
        <span className="rounded bg-[var(--vc-surface-2)] px-1.5 py-1 text-[9px] uppercase tracking-wider text-[var(--vc-text-2)]">
          Legacy · {legacySourceKind(source)}
        </span>
      </div>
      <div className="nodrag nowheel min-h-0 flex-1 overflow-auto p-3">
        <p className="mb-2 text-[9px] leading-relaxed text-[var(--vc-text-3)]">
          Original workflow parameters are preserved. Only the bounded scalar values shown as inputs can be edited here; other source values remain read-only.
        </p>
        <div className="space-y-2" role="group" aria-label="Legacy workflow parameters">
          {parameters.map((parameter) => {
            const rule = parameter.editRule;
            return (
              <div
                key={parameter.key}
                data-legacy-param={parameter.key}
                className="grid grid-cols-[minmax(5rem,0.7fr)_minmax(0,1fr)] items-start gap-2"
              >
                <label
                  htmlFor={`${data.nodeId}-legacy-${parameter.key}`}
                  className="pt-1 text-[10px] text-[var(--vc-text-2)]"
                >
                  {parameter.key}
                </label>
                {rule?.input === "number" && typeof parameter.value === "number" ? (
                  <input
                    id={`${data.nodeId}-legacy-${parameter.key}`}
                    type="number"
                    min={rule.min}
                    max={rule.max}
                    step={rule.step}
                    value={values[parameter.key] ?? parameter.displayValue}
                    disabled={!parameterAvailability.enabled}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [parameter.key]: event.target.value,
                      }))
                    }
                    onBlur={() => commitParameter(parameter)}
                    aria-label={`Legacy parameter ${parameter.key}`}
                    title={parameterAvailability.reason}
                    className="nodrag min-w-0 rounded border border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-2 py-1 text-[10px] text-[var(--vc-text)] outline-none focus:border-[var(--vc-info)] disabled:opacity-60"
                  />
                ) : rule?.input === "text" && typeof parameter.value === "string" ? (
                  <textarea
                    id={`${data.nodeId}-legacy-${parameter.key}`}
                    rows={3}
                    maxLength={rule.maxLength}
                    value={values[parameter.key] ?? parameter.displayValue}
                    disabled={!parameterAvailability.enabled}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [parameter.key]: event.target.value,
                      }))
                    }
                    onBlur={() => commitParameter(parameter)}
                    aria-label={`Legacy parameter ${parameter.key}`}
                    title={parameterAvailability.reason}
                    className="nodrag min-w-0 resize-y rounded border border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-2 py-1 text-[10px] leading-relaxed text-[var(--vc-text)] outline-none focus:border-[var(--vc-info)] disabled:opacity-60"
                  />
                ) : (
                  <output
                    aria-label={`Read-only legacy parameter ${parameter.key}`}
                    className="min-w-0 break-words rounded bg-[var(--vc-surface-2)] px-2 py-1 font-mono text-[9px] leading-relaxed text-[var(--vc-text-2)]"
                  >
                    {parameter.displayValue || "(empty)"}
                    <span className="ml-1 text-[8px] text-[var(--vc-text-3)]">read-only</span>
                  </output>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <p className="mt-2 text-[10px] text-[var(--vc-danger)]" role="alert">
            {error}
          </p>
        )}
        <details className="mt-3 border-t border-[var(--vc-border)] pt-2">
          <summary className="cursor-pointer text-[9px] text-[var(--vc-text-3)]">
            Full original source data · read-only
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--vc-surface-2)] p-2 font-mono text-[8px] leading-relaxed text-[var(--vc-text-2)]">
            {JSON.stringify(source, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function LeoNodeContent({
  data,
  selected,
}: NodeProps<CanvasFlowNode>) {
  const legacySource = (
    data as CanvasNodeViewData & { legacySourceNode?: unknown }
  ).legacySourceNode;
  if (isLegacyWorkflowSource(legacySource)) {
    return (
      <LegacyWorkflowNode
        data={data}
        selected={selected}
        source={legacySource}
      />
    );
  }
  if (data.kind === "image") {
    return <ImageNode data={data} selected={selected} />;
  }
  if (data.kind === "video") {
    return <VideoNode data={data} selected={selected} />;
  }
  if (data.kind === "audio") {
    return <AudioNode data={data} selected={selected} />;
  }
  if (data.kind === "composite" || data.kind === "delivery") {
    return <CompositeNode data={data} selected={selected} />;
  }
  if (
    data.kind === "director" ||
    data.kind === "storyboard" ||
    data.kind === "timeline"
  ) {
    return <ProductionNode data={data} selected={selected} />;
  }
  return <TextualNode data={data} selected={selected} />;
}

function LeoNodeBase(props: NodeProps<CanvasFlowNode>) {
  const tt = useUI();
  const state = props.data.commandState;
  const availability = props.data.commandAvailability;
  const command = props.data.kind === "video" ? "video" : props.data.kind === "image" ? "image" : ["text", "script"].includes(props.data.kind) ? "script" : "voice";
  const issue = availability[`canvas.node.generate.${command}`];
  const message = state?.message || (state?.status === "running" ? "正在运行…" : undefined) || (props.selected && issue?.reasonCode === "MISSING_REQUIRED_INPUT" ? issue.reason : undefined);
  return <div className="relative h-full w-full"><LeoNodeContent {...props} />{message && <div role={state?.status === "failed" ? "alert" : "status"} className="pointer-events-none absolute bottom-0 left-0 right-0 rounded-b-xl bg-[var(--vc-surface)] px-3 py-1 text-[10px] text-[var(--vc-text)]">{message.split("\n").map((part) => tt(part)).join(" ")}</div>}</div>;
}
export const LeoNode = memo(LeoNodeBase);
