"use client";

import type { Canvas, FabricImage, FabricObject, Transform } from "fabric";
import {
  type BrushSettings,
  type CropRatio,
  type DocSize,
  type FilterInfo,
  type LayerEntry,
  type SelectedSnapshot,
  type ToolId,
  type TransformInfo,
} from "./types";
import {
  buildSelectedSnapshot,
  findByRole,
  kindOf,
  makeId,
  readFilterSettings,
  roleOf,
  setEditorObjectId,
  setLocked,
  tagObject,
  type EditorObject,
  type FabricNS,
} from "./editor-objects";
import { imageFitScales } from "./fabric-geometry";
import {
  captureSnapshot,
  constrainCropToDoc,
  createDocBackground,
  ensureLayerOrder,
  emptyImageEdgeSnapState,
  fitViewport,
  imageEdgeScaleAnchorCorrection,
  imageEdgeScaleMultipliers,
  imageScaleControlLocksAspectRatio,
  imageSnapEdgesForControl,
  normalizeEditorSnapshot,
  objectIsEditable,
  panViewport,
  removeEditableObjects,
  resolveImageEdgeSnap,
  restoreLockFlags,
  snapshotKey,
  type EditorSnapshot,
  type ImageCanvasEdge,
  type ImageEdgeSnapResult,
  type ImageEdgeSnapState,
} from "./editor-runtime";
import {
  imageObjectMutationAllowed,
  type ImageObjectMutationIntent,
} from "./image-mutation-policy";

export interface FabricControllerView {
  doc: DocSize;
  canvasBackground: string;
  zoom: number;
  activeTool: ToolId;
  brush: BrushSettings;
  layers: LayerEntry[];
  selected: SelectedSnapshot | null;
  transformInfo: TransformInfo | null;
  filterInfo: FilterInfo | null;
  cropping: boolean;
  cropRatio: CropRatio;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ControllerCallbacks {
  onChange: (view: FabricControllerView) => void;
  onDocumentChange?: () => void;
  onError: (message: string) => void;
}

const DEFAULT_DOC: DocSize = { width: 1080, height: 1080 };
const DEFAULT_BRUSH: BrushSettings = { color: "#1c1917", width: 12 };
const MAX_HISTORY = 80;

export function cropRatioNumber(ratio: CropRatio): number | null {
  if (ratio === "free") return null;
  const [width, height] = ratio.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : null;
}

export function clampDocument(width: number, height: number): DocSize {
  return {
    width: Math.max(16, Math.min(8192, Math.round(width) || DEFAULT_DOC.width)),
    height: Math.max(16, Math.min(8192, Math.round(height) || DEFAULT_DOC.height)),
  };
}

function normalizeAngle(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}

export class FabricEditorCore {
  readonly canvas: Canvas;
  protected doc: DocSize = { ...DEFAULT_DOC };
  protected canvasBackground = "#ffffff";
  protected zoom = 1;
  protected activeTool: ToolId = "select";
  protected brush: BrushSettings = { ...DEFAULT_BRUSH };
  protected cropping = false;
  protected cropRatio: CropRatio = "free";
  protected currentSnapshot: EditorSnapshot;
  protected undoStack: EditorSnapshot[] = [];
  protected redoStack: EditorSnapshot[] = [];
  protected restoring = false;
  protected destroyed = false;
  private gestureBase: EditorSnapshot | null = null;
  private panning = false;
  private imageEdgeSnapTarget: FabricObject | null = null;
  private imageEdgeSnapState: ImageEdgeSnapState = emptyImageEdgeSnapState();
  private restoreAbort: AbortController | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame = 0;
  private disposers: Array<() => void> = [];

  constructor(
    protected readonly fabric: FabricNS,
    canvasElement: HTMLCanvasElement,
    protected readonly container: HTMLDivElement | null,
    protected readonly callbacks: ControllerCallbacks,
  ) {
    this.canvas = new fabric.Canvas(canvasElement, {
      preserveObjectStacking: true,
      selection: false,
      selectionColor: "rgba(109,93,252,.08)",
      selectionBorderColor: "#6d5dfc",
      fireMiddleClick: true,
      stopContextMenu: true,
    });
    this.canvas.add(createDocBackground(fabric, this.doc, this.canvasBackground));
    this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    this.updateBrush();
    this.bindEvents();
    this.zoom = fitViewport(this.canvas, this.doc, this.container);
    this.currentSnapshot = captureSnapshot(
      this.canvas,
      this.doc,
      this.canvasBackground,
    );
    this.emit();
  }

  private resetImageEdgeSnap(target: FabricObject | null = null): void {
    this.imageEdgeSnapTarget = target;
    this.imageEdgeSnapState = emptyImageEdgeSnapState();
  }

  private canSnapImageEdges(target: FabricObject): boolean {
    if (roleOf(target) === "crop") return true;
    return (
      target instanceof this.fabric.FabricImage &&
      objectIsEditable(target) &&
      this.canMutateObject(target, "geometry")
    );
  }

  private resolveImageEdgeSnapForTarget(
    target: FabricObject,
    event: Event,
    edges?: readonly ImageCanvasEdge[],
  ): {
    bounds: ReturnType<FabricObject["getBoundingRect"]>;
    snapped: ImageEdgeSnapResult;
  } | null {
    if (!this.canSnapImageEdges(target)) {
      if (this.imageEdgeSnapTarget === target) this.resetImageEdgeSnap();
      return null;
    }
    if (this.imageEdgeSnapTarget !== target) this.resetImageEdgeSnap(target);
    target.setCoords();
    const bounds = target.getBoundingRect();
    const snapped = resolveImageEdgeSnap({
      bounds,
      doc: this.doc,
      viewport: this.canvas.viewportTransform,
      previous: this.imageEdgeSnapState,
      edges,
      bypass: "altKey" in event && event.altKey === true,
    });
    this.imageEdgeSnapState = snapped.state;
    return { bounds, snapped };
  }

  private snapImageMoveEdges(
    target: FabricObject,
    event: Event,
  ): void {
    const resolution = this.resolveImageEdgeSnapForTarget(target, event);
    if (!resolution) return;
    const { snapped } = resolution;
    if (snapped.dx || snapped.dy) {
      target.set({
        left: (target.left ?? 0) + snapped.dx,
        top: (target.top ?? 0) + snapped.dy,
      });
      target.setCoords();
    }
  }

  private snapImageScaleEdges(
    target: FabricObject,
    event: Event,
    transform: Transform,
  ): void {
    const resolution = this.resolveImageEdgeSnapForTarget(
      target,
      event,
      imageSnapEdgesForControl(transform.corner),
    );
    if (!resolution) return;
    const { bounds, snapped } = resolution;
    const multipliers = imageEdgeScaleMultipliers(
      bounds,
      snapped,
      (roleOf(target) === "crop" &&
        cropRatioNumber(this.cropRatio) != null) ||
        imageScaleControlLocksAspectRatio(
          transform.corner,
          transform.shiftKey,
        ),
    );
    if (multipliers.x === 1 && multipliers.y === 1) return;

    const fixedPoint = target.getPointByOrigin(
      transform.originX,
      transform.originY,
    );
    target.set({
      scaleX: (target.scaleX ?? 1) * multipliers.x,
      scaleY: (target.scaleY ?? 1) * multipliers.y,
    });
    target.setPositionByOrigin(
      fixedPoint,
      transform.originX,
      transform.originY,
    );
    target.setCoords();

    // Preserve the opposite rendered edge, including Fabric stroke geometry.
    const resized = target.getBoundingRect();
    const { dx: fixedDx, dy: fixedDy } =
      imageEdgeScaleAnchorCorrection(bounds, resized, snapped.state);
    if (fixedDx || fixedDy) {
      target.set({
        left: (target.left ?? 0) + fixedDx,
        top: (target.top ?? 0) + fixedDy,
      });
      target.setCoords();
    }
  }

  private bindEvents(): void {
    const refresh = () => this.emit();
    this.disposers.push(
      this.canvas.on("selection:created", refresh),
      this.canvas.on("selection:updated", refresh),
      this.canvas.on("selection:cleared", refresh),
      this.canvas.on("before:transform", ({ transform }) => {
        this.resetImageEdgeSnap(transform.target);
      }),
      this.canvas.on("object:modified", ({ target }) => {
        this.resetImageEdgeSnap();
        if (roleOf(target) === "crop") {
          constrainCropToDoc(target, this.doc);
          this.canvas.requestRenderAll();
          return;
        }
        if (
          objectIsEditable(target) &&
          !this.canMutateObject(target, "geometry")
        ) {
          void this.restore(this.currentSnapshot, false);
          return;
        }
        this.commit();
      }),
      this.canvas.on("object:moving", ({ target, e }) => {
        target.setCoords();
        if (roleOf(target) === "crop") {
          constrainCropToDoc(target, this.doc);
        }
        this.snapImageMoveEdges(target, e);
      }),
      this.canvas.on("object:scaling", ({ target, transform, e }) => {
        if (roleOf(target) === "crop") {
          const ratio = cropRatioNumber(this.cropRatio);
          if (ratio) {
            const width = target.getScaledWidth();
            const height = width / ratio;
            const cap = Math.min(
              1,
              this.doc.width / width,
              this.doc.height / height,
            );
            target.set({
              scaleX: (target.scaleX ?? 1) * cap,
              scaleY: (height / Math.max(1, target.height)) * cap,
            });
          }
          target.setCoords();
          constrainCropToDoc(target, this.doc);
        }
        this.snapImageScaleEdges(target, e, transform);
      }),
      this.canvas.on("path:created", ({ path }) => {
        const erasing = this.activeTool === "erase";
        if (erasing && this.hasLockedEditableObjects()) {
          this.canvas.remove(path);
          path.dispose();
          this.activeTool = "select";
          this.applyTool();
          this.callbacks.onError("请先解锁图层，再使用橡皮擦");
          this.emit();
          return;
        }
        tagObject(path, erasing ? "eraser" : "path");
        if (erasing) {
          path.set({
            globalCompositeOperation: "destination-out",
            stroke: "#000000",
          });
        }
        this.styleObject(path);
        this.commit();
      }),
      this.canvas.on("text:editing:entered", ({ target }) => {
        const active = this.canvas.getActiveObject();
        const locked =
          (objectIsEditable(active) &&
            !this.canMutateObject(active, "content")) ||
          (objectIsEditable(target) &&
            !this.canMutateObject(target, "content"));
        if (!locked) return;
        const editable = target as FabricObject & {
          exitEditing?: () => void;
        };
        editable.exitEditing?.();
        this.canvas.requestRenderAll();
      }),
      this.canvas.on("text:editing:exited", () => this.commit()),
      this.canvas.on("mouse:dblclick", ({ subTargets }) => {
        const editableText = [...(subTargets || [])]
          .reverse()
          .find((target) => target instanceof this.fabric.IText);
        if (!editableText || !(editableText instanceof this.fabric.IText)) return;
        const active = this.canvas.getActiveObject();
        if (
          (objectIsEditable(active) &&
            !this.canMutateObject(active, "content")) ||
          (objectIsEditable(editableText) &&
            !this.canMutateObject(editableText, "content"))
        ) {
          return;
        }
        editableText.enterEditing();
        editableText.selectAll();
        this.canvas.requestRenderAll();
      }),
      this.canvas.on("mouse:wheel", (event) => {
        event.e.preventDefault();
        event.e.stopPropagation();
        if (event.e.ctrlKey || event.e.metaKey) {
          const next = Math.max(
            0.05,
            Math.min(8, this.zoom * Math.pow(0.999, event.e.deltaY)),
          );
          this.canvas.zoomToPoint(event.viewportPoint, next);
          this.zoom = next;
        } else {
          panViewport(this.canvas, -event.e.deltaX, -event.e.deltaY);
        }
        this.canvas.requestRenderAll();
        this.emit();
      }),
      this.canvas.on("mouse:down", ({ e, target }) => {
        if (!(e instanceof MouseEvent)) return;
        const snapBypassTarget =
          target && this.canSnapImageEdges(target);
        const altPan = e.altKey && !snapBypassTarget;
        if (e.button !== 1 && !altPan) return;
        this.panning = true;
        this.canvas.isDrawingMode = false;
        this.canvas.selection = false;
        this.canvas.defaultCursor = "grabbing";
      }),
      this.canvas.on("mouse:move", ({ e }) => {
        if (!this.panning || !(e instanceof MouseEvent)) return;
        panViewport(this.canvas, e.movementX, e.movementY);
      }),
      this.canvas.on("mouse:up", () => {
        this.resetImageEdgeSnap();
        if (!this.panning) return;
        this.panning = false;
        this.canvas.defaultCursor = "default";
        this.applyTool();
      }),
    );
    if (typeof ResizeObserver !== "undefined" && this.container) {
      this.resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = requestAnimationFrame(() => {
          if (this.destroyed) return;
          this.zoom = fitViewport(this.canvas, this.doc, this.container);
          this.emit();
        });
      });
      this.resizeObserver.observe(this.container);
    }
  }

  protected styleObject(object: FabricObject): void {
    object.set({
      borderColor: "#6d5dfc",
      cornerColor: "#ffffff",
      cornerStrokeColor: "#6d5dfc",
      cornerStyle: "circle",
      cornerSize: 10,
      transparentCorners: false,
      padding: 2,
    });
  }

  private updateBrush(): void {
    const brush = this.canvas.freeDrawingBrush;
    if (!brush) return;
    brush.color = this.brush.color;
    brush.width = this.brush.width;
  }

  protected applyTool(): void {
    this.canvas.isDrawingMode =
      this.activeTool === "draw" || this.activeTool === "erase";
    this.canvas.selection = false;
    this.updateBrush();
    if (this.activeTool !== "select") this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  protected target(): EditorObject | null {
    const active = this.canvas.getActiveObject();
    if (objectIsEditable(active)) return active;
    return findByRole(this.canvas, "background");
  }

  protected imageTarget(): FabricImage | null {
    const active = this.canvas.getActiveObject();
    if (active instanceof this.fabric.FabricImage && objectIsEditable(active)) {
      return active;
    }
    const background = findByRole(this.canvas, "background");
    return background instanceof this.fabric.FabricImage ? background : null;
  }

  private readView(): FabricControllerView {
    const active = this.canvas.getActiveObject();
    const selected = objectIsEditable(active)
      ? buildSelectedSnapshot(this.fabric, active)
      : null;
    const selectedId = selected?.id ?? "";
    const layers = this.canvas
      .getObjects()
      .filter(objectIsEditable)
      .reverse()
      .map((object) => {
        const editorObject = object as EditorObject;
        return {
          id: editorObject.oceanleoId ?? "",
          kind: kindOf(this.fabric, object),
          locked: !!editorObject.oceanleoLocked,
          visible: object.visible !== false,
          isBackground: roleOf(object) === "background",
          selected: editorObject.oceanleoId === selectedId,
        };
      });
    const target = this.target();
    const image = this.imageTarget();
    return {
      doc: { ...this.doc },
      canvasBackground: this.canvasBackground,
      zoom: this.zoom,
      activeTool: this.activeTool,
      brush: { ...this.brush },
      layers,
      selected,
      transformInfo: target
        ? {
            scope: roleOf(target) === "background" ? "background" : "selected",
            angle: normalizeAngle(target.angle ?? 0),
            flipX: !!target.flipX,
            flipY: !!target.flipY,
          }
        : null,
      filterInfo: image
        ? {
            scope: roleOf(image) === "background" ? "background" : "selected",
            settings: readFilterSettings(image),
          }
        : null,
      cropping: this.cropping,
      cropRatio: this.cropRatio,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  protected emit(): void {
    if (!this.destroyed) this.callbacks.onChange(this.readView());
  }

  protected canMutateObject(
    object: EditorObject,
    intent: ImageObjectMutationIntent,
  ): boolean {
    return imageObjectMutationAllowed(
      object.oceanleoLocked === true,
      intent,
    );
  }

  protected hasLockedEditableObjects(): boolean {
    return this.canvas
      .getObjects()
      .some(
        (object) =>
          objectIsEditable(object) &&
          !this.canMutateObject(object, "geometry"),
      );
  }

  protected commit(): void {
    if (this.destroyed || this.restoring) return;
    ensureLayerOrder(this.canvas);
    const next = captureSnapshot(this.canvas, this.doc, this.canvasBackground);
    if (snapshotKey(next) === snapshotKey(this.currentSnapshot)) {
      this.emit();
      return;
    }
    if (this.gestureBase) {
      this.currentSnapshot = next;
      this.canvas.requestRenderAll();
      this.emit();
      return;
    }
    this.undoStack.push(this.currentSnapshot);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.currentSnapshot = next;
    this.redoStack = [];
    this.canvas.requestRenderAll();
    this.callbacks.onDocumentChange?.();
    this.emit();
  }

  protected resetHistory(): void {
    this.currentSnapshot = captureSnapshot(
      this.canvas,
      this.doc,
      this.canvasBackground,
    );
    this.undoStack = [];
    this.redoStack = [];
    this.gestureBase = null;
  }

  beginGesture(): boolean {
    if (!this.destroyed && !this.restoring && !this.gestureBase) {
      this.gestureBase = this.currentSnapshot;
      return true;
    }
    return false;
  }

  endGesture(): void {
    const base = this.gestureBase;
    if (!base || this.destroyed || this.restoring) return;
    this.gestureBase = null;
    ensureLayerOrder(this.canvas);
    const next = captureSnapshot(this.canvas, this.doc, this.canvasBackground);
    this.currentSnapshot = next;
    if (snapshotKey(next) !== snapshotKey(base)) {
      this.undoStack.push(base);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack = [];
      this.callbacks.onDocumentChange?.();
    }
    this.canvas.requestRenderAll();
    this.emit();
  }

  cancelGesture(): void {
    const base = this.gestureBase;
    if (!base || this.destroyed || this.restoring) return;
    this.gestureBase = null;
    void this.restore(base, false);
  }

  setInitialBackground(image: FabricImage, size: DocSize): void {
    if (this.destroyed) return;
    removeEditableObjects(this.canvas);
    this.doc = clampDocument(size.width, size.height);
    const docBackground = createDocBackground(
      this.fabric,
      this.doc,
      this.canvasBackground,
    );
    const background = image as EditorObject;
    setEditorObjectId(background, background.oceanleoId || makeId());
    background.oceanleoRole = undefined;
    background.oceanleoKind = "image";
    background.oceanleoImageFit = "fill";
    const scales = imageFitScales(image, this.doc, "fill");
    background.set({
      left: this.doc.width / 2,
      top: this.doc.height / 2,
      originX: "center",
      originY: "center",
      ...scales,
    });
    setLocked(background, false);
    this.styleObject(background);
    this.canvas.add(docBackground, background);
    this.canvas.setActiveObject(background);
    ensureLayerOrder(this.canvas);
    this.resetHistory();
    this.zoom = fitViewport(this.canvas, this.doc, this.container);
    this.emit();
  }

  replaceWithBackground(image: FabricImage): boolean {
    if (this.hasLockedEditableObjects()) {
      image.dispose();
      this.callbacks.onError("请先解锁图层，再替换整个画布");
      return false;
    }
    const removals = this.canvas.getObjects().filter(objectIsEditable);
    if (removals.length) this.canvas.remove(...removals);
    removals.forEach((object) => object.dispose());
    const background = image as EditorObject;
    setEditorObjectId(background, background.oceanleoId || makeId());
    background.oceanleoRole = undefined;
    background.oceanleoKind = "image";
    background.oceanleoImageFit = "fill";
    const scales = imageFitScales(image, this.doc, "fill");
    background.set({
      left: this.doc.width / 2,
      top: this.doc.height / 2,
      originX: "center",
      originY: "center",
      ...scales,
    });
    setLocked(background, false);
    this.styleObject(background);
    this.canvas.add(background);
    this.canvas.setActiveObject(background);
    this.commit();
    return true;
  }

  setTool(tool: ToolId): void {
    if (tool === "erase" && this.hasLockedEditableObjects()) {
      this.callbacks.onError("请先解锁图层，再使用橡皮擦");
      return;
    }
    this.activeTool = tool;
    this.applyTool();
    this.emit();
  }

  setBrush(patch: Partial<BrushSettings>): void {
    this.brush = {
      color: patch.color ?? this.brush.color,
      width: Math.max(1, Math.min(200, patch.width ?? this.brush.width)),
    };
    this.updateBrush();
    this.emit();
  }

  undo(): void {
    if (this.restoring) return;
    const previous = this.undoStack.pop();
    if (!previous) return;
    const current = this.currentSnapshot;
    this.redoStack.push(current);
    void this.restore(previous).then((restored) => {
      if (restored || this.destroyed) return;
      if (this.redoStack.at(-1) === current) this.redoStack.pop();
      this.undoStack.push(previous);
      this.emit();
    });
  }

  redo(): void {
    if (this.restoring) return;
    const next = this.redoStack.pop();
    if (!next) return;
    const current = this.currentSnapshot;
    this.undoStack.push(current);
    void this.restore(next).then((restored) => {
      if (restored || this.destroyed) return;
      if (this.undoStack.at(-1) === current) this.undoStack.pop();
      this.redoStack.push(next);
      this.emit();
    });
  }

  private async restore(
    snapshot: EditorSnapshot,
    notifyDocumentChange = true,
    resetHistory = false,
  ): Promise<boolean> {
    const fallback = this.currentSnapshot;
    this.restoring = true;
    let restored = false;
    this.restoreAbort?.abort();
    const abort = new AbortController();
    this.restoreAbort = abort;
    try {
      await this.canvas.loadFromJSON(snapshot.json, undefined, {
        signal: abort.signal,
      });
      if (this.destroyed || abort.signal.aborted) return false;
      this.doc = { ...snapshot.doc };
      this.canvasBackground = snapshot.canvasBackground;
      restoreLockFlags(this.canvas);
      this.canvas.getObjects().forEach((object) => this.styleObject(object));
      ensureLayerOrder(this.canvas);
      this.currentSnapshot = snapshot;
      if (resetHistory) {
        this.undoStack = [];
        this.redoStack = [];
      }
      this.cropping = false;
      this.cropRatio = "free";
      this.zoom = fitViewport(this.canvas, this.doc, this.container);
      this.canvas.requestRenderAll();
      restored = true;
    } catch (caught) {
      const aborted =
        abort.signal.aborted ||
        (caught instanceof DOMException && caught.name === "AbortError");
      if (!aborted) {
        try {
          await this.canvas.loadFromJSON(fallback.json, undefined, {
            signal: abort.signal,
          });
          if (!this.destroyed && !abort.signal.aborted) {
            this.doc = { ...fallback.doc };
            this.canvasBackground = fallback.canvasBackground;
            restoreLockFlags(this.canvas);
            this.canvas
              .getObjects()
              .forEach((object) => this.styleObject(object));
            ensureLayerOrder(this.canvas);
            this.currentSnapshot = fallback;
            this.cropping = false;
            this.cropRatio = "free";
            this.zoom = fitViewport(this.canvas, this.doc, this.container);
            this.canvas.requestRenderAll();
          }
        } catch {
          // The prior in-memory snapshot is known-good in normal operation.
          // If Fabric cannot reload it either, keep the original error below.
        }
        if (!abort.signal.aborted && this.restoreAbort === abort) {
          this.callbacks.onError(
            caught instanceof Error ? caught.message : "无法恢复画布历史",
          );
        }
      }
    } finally {
      if (this.restoreAbort === abort) {
        this.restoreAbort = null;
        this.restoring = false;
        if (restored && notifyDocumentChange) {
          this.callbacks.onDocumentChange?.();
        }
        this.emit();
      }
    }
    return restored;
  }

  getSnapshot(): EditorSnapshot {
    return captureSnapshot(this.canvas, this.doc, this.canvasBackground);
  }

  async loadSnapshot(snapshot: EditorSnapshot): Promise<boolean> {
    const normalized = normalizeEditorSnapshot(snapshot);
    if (!normalized) return false;
    return this.restore(
      {
        json: normalized.json,
        doc: clampDocument(normalized.doc.width, normalized.doc.height),
        canvasBackground: normalized.canvasBackground,
      },
      false,
      true,
    );
  }

  getDocument(): { canvas: Canvas; doc: DocSize } {
    return { canvas: this.canvas, doc: { ...this.doc } };
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.restoreAbort?.abort();
    this.restoreAbort = null;
    this.disposers.splice(0).forEach((dispose) => dispose());
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    cancelAnimationFrame(this.resizeFrame);
    void this.canvas.dispose().catch(() => undefined);
  }
}
