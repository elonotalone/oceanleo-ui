"use client";

import type { Canvas, FabricImage, FabricObject } from "fabric";
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
  fitViewport,
  objectIsEditable,
  panViewport,
  removeEditableObjects,
  restoreLockFlags,
  snapshotKey,
  type EditorSnapshot,
} from "./editor-runtime";

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

  private bindEvents(): void {
    const refresh = () => this.emit();
    this.disposers.push(
      this.canvas.on("selection:created", refresh),
      this.canvas.on("selection:updated", refresh),
      this.canvas.on("selection:cleared", refresh),
      this.canvas.on("object:modified", ({ target }) => {
        if (roleOf(target) === "crop") {
          constrainCropToDoc(target, this.doc);
          this.canvas.requestRenderAll();
          return;
        }
        this.commit();
      }),
      this.canvas.on("object:scaling", ({ target }) => {
        if (roleOf(target) !== "crop") return;
        const ratio = cropRatioNumber(this.cropRatio);
        if (ratio) {
          const width = target.getScaledWidth();
          const height = width / ratio;
          const cap = Math.min(1, this.doc.width / width, this.doc.height / height);
          target.set({
            scaleX: (target.scaleX ?? 1) * cap,
            scaleY: (height / Math.max(1, target.height)) * cap,
          });
        }
        constrainCropToDoc(target, this.doc);
      }),
      this.canvas.on("path:created", ({ path }) => {
        const erasing = this.activeTool === "erase";
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
      this.canvas.on("text:editing:exited", () => this.commit()),
      this.canvas.on("mouse:dblclick", ({ subTargets }) => {
        const editableText = [...(subTargets || [])]
          .reverse()
          .find((target) => target instanceof this.fabric.IText);
        if (!editableText || !(editableText instanceof this.fabric.IText)) return;
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
      this.canvas.on("mouse:down", ({ e }) => {
        if (!(e instanceof MouseEvent) || (e.button !== 1 && !e.altKey)) return;
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

  beginGesture(): void {
    if (!this.destroyed && !this.restoring && !this.gestureBase) {
      this.gestureBase = this.currentSnapshot;
    }
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
    background.oceanleoId = makeId();
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

  replaceWithBackground(image: FabricImage): void {
    const removals = this.canvas.getObjects().filter(objectIsEditable);
    if (removals.length) this.canvas.remove(...removals);
    removals.forEach((object) => object.dispose());
    const background = image as EditorObject;
    background.oceanleoId = makeId();
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
  }

  setTool(tool: ToolId): void {
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
    this.redoStack.push(this.currentSnapshot);
    void this.restore(previous);
  }

  redo(): void {
    if (this.restoring) return;
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.currentSnapshot);
    void this.restore(next);
  }

  private async restore(
    snapshot: EditorSnapshot,
    notifyDocumentChange = true,
    resetHistory = false,
  ): Promise<boolean> {
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
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        this.callbacks.onError(
          caught instanceof Error ? caught.message : "无法恢复画布历史",
        );
      }
    } finally {
      if (this.restoreAbort === abort) this.restoreAbort = null;
      this.restoring = false;
      if (restored && notifyDocumentChange) {
        this.callbacks.onDocumentChange?.();
      }
      this.emit();
    }
    return restored;
  }

  getSnapshot(): EditorSnapshot {
    return captureSnapshot(this.canvas, this.doc, this.canvasBackground);
  }

  async loadSnapshot(snapshot: EditorSnapshot): Promise<boolean> {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !snapshot.json ||
      typeof snapshot.json !== "object" ||
      !Number.isFinite(snapshot.doc?.width) ||
      !Number.isFinite(snapshot.doc?.height) ||
      typeof snapshot.canvasBackground !== "string"
    ) {
      return false;
    }
    return this.restore(
      {
        json: snapshot.json,
        doc: clampDocument(snapshot.doc.width, snapshot.doc.height),
        canvasBackground: snapshot.canvasBackground.slice(0, 100),
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
