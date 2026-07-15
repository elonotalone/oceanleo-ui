"use client";

import type { FabricImage, Group, IText } from "fabric";
import {
  INITIAL_FILTERS,
  type CropRatio,
  type FilterSettings,
  type ShadowSettings,
  type ShapeKind,
  type TextSettings,
} from "./types";
import {
  applyFilterSettings,
  applyImageRadius,
  applyShadow,
  buildSelectedSnapshot,
  centerOrigin,
  createShape,
  createTextbox,
  findById,
  findByRole,
  kindOf,
  makeId,
  readFilterSettings,
  recolorArrow,
  roleOf,
  setArrowStrokeWidth,
  setLocked,
  type EditorObject,
} from "./editor-objects";
import {
  cropBounds,
  ensureLayerOrder,
  fitViewport,
  objectIsEditable,
  preparePlacedImage,
  updateDocBackground,
  viewportAt100,
  zoomViewport,
} from "./editor-runtime";
import {
  FabricEditorCore,
  clampDocument,
  cropRatioNumber,
} from "./fabric-controller-core";

function normalizeAngle(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}

export class FabricEditorController extends FabricEditorCore {
  addText(): void {
    const object = createTextbox(
      this.fabric,
      this.doc,
      "双击编辑文字",
      this.canvas.getObjects().length,
    );
    this.styleObject(object);
    this.canvas.add(object);
    this.canvas.setActiveObject(object);
    this.commit();
  }

  addShape(kind: ShapeKind): void {
    const object = createShape(
      this.fabric,
      kind,
      this.doc,
      this.canvas.getObjects().length,
    );
    this.styleObject(object);
    this.canvas.add(object);
    this.canvas.setActiveObject(object);
    this.commit();
  }

  addImage(image: FabricImage): void {
    const object = preparePlacedImage(
      image,
      this.doc,
      this.canvas.getObjects().length,
    );
    this.styleObject(object);
    this.canvas.add(object);
    this.canvas.setActiveObject(object);
    this.commit();
  }

  selectLayer(id: string): void {
    const object = findById(this.canvas, id);
    if (!object || object.visible === false) return;
    this.activeTool = "select";
    this.applyTool();
    this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();
    this.emit();
  }

  moveLayer(id: string, direction: "up" | "down" | "top" | "bottom"): void {
    const object = findById(this.canvas, id);
    if (!object || roleOf(object) === "background") return;
    const objects = this.canvas.getObjects();
    const index = objects.indexOf(object);
    const backgroundIndex = objects.findIndex(
      (entry) => roleOf(entry) === "background",
    );
    const cropIndex = objects.findIndex((entry) => roleOf(entry) === "crop");
    const minimum = Math.max(1, backgroundIndex + 1);
    const maximum = (cropIndex >= 0 ? cropIndex : objects.length) - 1;
    const next =
      direction === "top"
        ? maximum
        : direction === "bottom"
          ? minimum
          : direction === "up"
            ? Math.min(maximum, index + 1)
            : Math.max(minimum, index - 1);
    if (next === index) return;
    this.canvas.moveObjectTo(object, next);
    this.commit();
  }

  toggleLayerLock(id: string): void {
    const object = findById(this.canvas, id);
    if (!object) return;
    setLocked(object, !object.oceanleoLocked);
    this.commit();
  }

  toggleLayerVisible(id: string): void {
    const object = findById(this.canvas, id);
    if (!object) return;
    object.set("visible", object.visible === false);
    if (object.visible === false && this.canvas.getActiveObject() === object) {
      this.canvas.discardActiveObject();
    }
    this.commit();
  }

  removeLayer(id: string): void {
    const object = findById(this.canvas, id);
    if (!object) return;
    this.canvas.remove(object);
    object.dispose();
    this.canvas.discardActiveObject();
    this.commit();
  }

  async duplicateLayer(id: string): Promise<void> {
    const source = findById(this.canvas, id);
    if (!source || roleOf(source) === "background") return;
    const clone = (await source.clone()) as EditorObject;
    if (this.destroyed) {
      clone.dispose();
      return;
    }
    clone.oceanleoId = makeId();
    clone.oceanleoRole = undefined;
    clone.set({
      left: (source.left ?? 0) + 24,
      top: (source.top ?? 0) + 24,
      visible: true,
    });
    setLocked(clone, false);
    this.styleObject(clone);
    this.canvas.add(clone);
    this.canvas.setActiveObject(clone);
    this.commit();
  }

  private mutateSelected(run: (object: EditorObject) => void): void {
    const object = this.canvas.getActiveObject();
    if (!objectIsEditable(object)) return;
    run(object);
    object.setCoords();
    this.commit();
  }

  setSelectedOpacity(value: number): void {
    this.mutateSelected((object) =>
      object.set("opacity", Math.max(0, Math.min(100, value)) / 100),
    );
  }

  setSelectedShadow(patch: Partial<ShadowSettings>): void {
    this.mutateSelected((object) => {
      const current = buildSelectedSnapshot(this.fabric, object).shadow;
      applyShadow(this.fabric, object, { ...current, ...patch });
    });
  }

  setSelectedStroke(patch: { color?: string; width?: number }): void {
    this.mutateSelected((object) => {
      const snapshot = buildSelectedSnapshot(this.fabric, object);
      const color = patch.color ?? snapshot.stroke;
      const width = Math.max(0, patch.width ?? snapshot.strokeWidth);
      if (snapshot.kind === "arrow" && object instanceof this.fabric.Group) {
        recolorArrow(this.fabric, object as Group, color);
        setArrowStrokeWidth(this.fabric, object as Group, width);
      } else if (snapshot.kind === "line") {
        object.set({ stroke: color, strokeWidth: width });
      } else {
        object.set({ stroke: color || undefined, strokeWidth: width });
      }
    });
  }

  setSelectedFill(color: string): void {
    this.mutateSelected((object) => {
      const kind = kindOf(this.fabric, object);
      if (kind === "arrow" && object instanceof this.fabric.Group) {
        recolorArrow(this.fabric, object as Group, color);
      } else if (kind === "line") {
        object.set("stroke", color);
      } else {
        object.set("fill", color);
      }
    });
  }

  setSelectedRadius(px: number): void {
    this.mutateSelected((object) => {
      if (object instanceof this.fabric.FabricImage) {
        applyImageRadius(this.fabric, object, Math.max(0, px));
      }
    });
  }

  setSelectedText(patch: Partial<TextSettings>): void {
    this.mutateSelected((object) => {
      if (!(object instanceof this.fabric.IText)) return;
      const text = object as IText;
      const props: Record<string, unknown> = {};
      if (patch.value != null) props.text = patch.value.slice(0, 2_000);
      if (patch.fontSize != null) props.fontSize = Math.max(6, patch.fontSize);
      if (patch.fill != null) props.fill = patch.fill;
      if (patch.backgroundColor != null) {
        props.backgroundColor = patch.backgroundColor;
      }
      if (patch.bold != null) props.fontWeight = patch.bold ? "bold" : "normal";
      if (patch.italic != null) {
        props.fontStyle = patch.italic ? "italic" : "normal";
      }
      if (patch.align != null) props.textAlign = patch.align;
      if (patch.stroke != null) props.stroke = patch.stroke || undefined;
      if (patch.strokeWidth != null) {
        props.strokeWidth = Math.max(0, patch.strokeWidth);
      }
      text.set(props);
    });
  }

  deleteSelected(): void {
    const object = this.canvas.getActiveObject();
    if (!objectIsEditable(object)) return;
    this.removeLayer(object.oceanleoId ?? "");
  }

  async duplicateSelected(): Promise<void> {
    const object = this.canvas.getActiveObject();
    if (!objectIsEditable(object)) return;
    await this.duplicateLayer(object.oceanleoId ?? "");
  }

  rotateTarget(delta: 90 | -90): void {
    const target = this.target();
    if (!target) return;
    centerOrigin(target);
    target.rotate(normalizeAngle((target.angle ?? 0) + delta));
    this.commit();
  }

  setTargetAngle(angle: number): void {
    const target = this.target();
    if (!target) return;
    centerOrigin(target);
    target.rotate(normalizeAngle(angle));
    this.commit();
  }

  flipTarget(axis: "x" | "y"): void {
    const target = this.target();
    if (!target) return;
    if (axis === "x") target.set("flipX", !target.flipX);
    else target.set("flipY", !target.flipY);
    this.commit();
  }

  setFilter<K extends keyof FilterSettings>(
    key: K,
    value: FilterSettings[K],
  ): void {
    const image = this.imageTarget();
    if (!image) return;
    applyFilterSettings(this.fabric, image, {
      ...readFilterSettings(image),
      [key]: value,
    });
    this.commit();
  }

  resetFilters(): void {
    const image = this.imageTarget();
    if (!image) return;
    applyFilterSettings(this.fabric, image, { ...INITIAL_FILTERS });
    this.commit();
  }

  startCrop(): void {
    if (this.cropping) return;
    const inset = 0.1;
    const crop = new this.fabric.Rect({
      left: this.doc.width * inset,
      top: this.doc.height * inset,
      width: this.doc.width * (1 - inset * 2),
      height: this.doc.height * (1 - inset * 2),
      fill: "rgba(255,255,255,.08)",
      stroke: "#4f46e5",
      strokeWidth: Math.max(2, 2 / this.zoom),
      strokeDashArray: [10, 6],
      lockRotation: true,
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerStrokeColor: "#4f46e5",
      cornerStyle: "circle",
    }) as EditorObject;
    crop.oceanleoId = makeId();
    crop.oceanleoRole = "crop";
    crop.oceanleoKind = "rect";
    this.cropping = true;
    this.cropRatio = "free";
    this.activeTool = "select";
    this.applyTool();
    this.canvas.add(crop);
    this.canvas.setActiveObject(crop);
    ensureLayerOrder(this.canvas);
    this.emit();
  }

  setCropRatio(ratio: CropRatio): void {
    this.cropRatio = ratio;
    const crop = findByRole(this.canvas, "crop");
    const targetRatio = cropRatioNumber(ratio);
    if (crop && targetRatio) {
      const width = this.doc.width * 0.8;
      const height = width / targetRatio;
      const scale = Math.min(1, (this.doc.height * 0.8) / height);
      crop.set({
        left: this.doc.width / 2,
        top: this.doc.height / 2,
        originX: "center",
        originY: "center",
        width: width * scale,
        height: height * scale,
        scaleX: 1,
        scaleY: 1,
      });
      crop.setCoords();
      this.canvas.requestRenderAll();
    }
    this.emit();
  }

  async confirmCrop(): Promise<void> {
    const crop = findByRole(this.canvas, "crop");
    const bounds = crop ? cropBounds(crop, this.doc) : null;
    if (!crop || !bounds) {
      this.callbacks.onError("裁剪区域无效");
      return;
    }
    this.canvas.remove(crop);
    crop.dispose();
    this.canvas.getObjects().forEach((object) => {
      if (roleOf(object) === "docbg") return;
      object.set({
        left: (object.left ?? 0) - bounds.left,
        top: (object.top ?? 0) - bounds.top,
      });
      object.setCoords();
    });
    this.doc = { width: bounds.width, height: bounds.height };
    updateDocBackground(this.canvas, this.doc, this.canvasBackground);
    this.cropping = false;
    this.cropRatio = "free";
    this.canvas.discardActiveObject();
    this.zoom = fitViewport(this.canvas, this.doc, this.container);
    this.commit();
  }

  cancelCrop(): void {
    const crop = findByRole(this.canvas, "crop");
    if (crop) {
      this.canvas.remove(crop);
      crop.dispose();
    }
    this.cropping = false;
    this.cropRatio = "free";
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.emit();
  }

  setCanvasBackground(color: string): void {
    this.canvasBackground = color || "#ffffff";
    updateDocBackground(this.canvas, this.doc, this.canvasBackground);
    this.commit();
  }

  resizeDoc(width: number, height: number): void {
    this.doc = clampDocument(width, height);
    updateDocBackground(this.canvas, this.doc, this.canvasBackground);
    this.zoom = fitViewport(this.canvas, this.doc, this.container);
    this.commit();
  }

  zoomBy(factor: number): void {
    this.zoom = zoomViewport(
      this.fabric,
      this.canvas,
      this.doc,
      this.zoom * factor,
    );
    this.emit();
  }

  zoomFit(): void {
    this.zoom = fitViewport(this.canvas, this.doc, this.container);
    this.emit();
  }

  zoomTo100(): void {
    this.zoom = viewportAt100(this.canvas, this.doc);
    this.emit();
  }
}
