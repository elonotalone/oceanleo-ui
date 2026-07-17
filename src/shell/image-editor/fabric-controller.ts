"use client";

import type { FabricImage, Group, IText } from "fabric";
import {
  INITIAL_FILTERS,
  type CropRatio,
  type CanvasClientPoint,
  type FilterSettings,
  type ShadowSettings,
  type ShapeKind,
  type TableSettings,
  type TextPreset,
  type TextSettings,
} from "./types";
import {
  applyFilterSettings,
  applyImageRadius,
  applyShadow,
  buildSelectedSnapshot,
  centerOrigin,
  createSignatureText,
  createShape,
  createStickyNote,
  createTable,
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
  type EditorObjectProps,
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
  private commitAndSelect(object: EditorObject): void {
    this.commit();
    this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();
    this.emit();
  }

  private addAndSelect(object: EditorObject): void {
    this.activeTool = "select";
    this.applyTool();
    this.styleObject(object);
    this.canvas.add(object);
    this.commitAndSelect(object);
  }

  addText(preset: TextPreset = "body"): void {
    const labels: Record<TextPreset, string> = {
      heading: "添加标题",
      subheading: "添加副标题",
      body: "双击编辑正文",
    };
    const object = createTextbox(
      this.fabric,
      this.doc,
      labels[preset],
      this.canvas.getObjects().length,
      preset,
    );
    this.addAndSelect(object);
  }

  addShape(kind: ShapeKind): void {
    const object = createShape(
      this.fabric,
      kind,
      this.doc,
      this.canvas.getObjects().length,
    );
    this.addAndSelect(object);
  }

  addStickyNote(color = "#ffe36e"): void {
    const object = createStickyNote(
      this.fabric,
      this.doc,
      this.canvas.getObjects().length,
      color,
    );
    this.addAndSelect(object);
  }

  addSignature(text = "签名", color = "#18212f"): void {
    const object = createSignatureText(
      this.fabric,
      this.doc,
      this.canvas.getObjects().length,
      text,
      color,
    );
    this.addAndSelect(object);
  }

  addTable(rows = 3, columns = 3): void {
    const object = createTable(
      this.fabric,
      this.doc,
      this.canvas.getObjects().length,
      rows,
      columns,
    );
    this.addAndSelect(object);
  }

  addSignatureImage(image: FabricImage): void {
    const object = preparePlacedImage(
      image,
      this.doc,
      this.canvas.getObjects().length,
    );
    object.oceanleoKind = "signature";
    this.addAndSelect(object);
  }

  resizeSelectedTable(rows: number, columns: number): void {
    const active = this.canvas.getActiveObject();
    if (
      !(active instanceof this.fabric.Group) ||
      kindOf(this.fabric, active) !== "table"
    ) {
      return;
    }
    const table = active as Group & EditorObjectProps;
    const tableStyle = buildSelectedSnapshot(this.fabric, table).table?.style;
    const previousRows = Math.max(1, table.oceanleoTableRows || 1);
    const previousColumns = Math.max(1, table.oceanleoTableColumns || 1);
    const values = Array.from({ length: previousRows }, () =>
      Array.from({ length: previousColumns }, () => ""),
    );
    table.getObjects().forEach((child) => {
      const tagged = child as IText & EditorObjectProps;
      const row = tagged.oceanleoTableRow;
      const column = tagged.oceanleoTableColumn;
      if (
        child instanceof this.fabric.IText &&
        Number.isInteger(row) &&
        Number.isInteger(column) &&
        row! >= 0 &&
        row! < previousRows &&
        column! >= 0 &&
        column! < previousColumns
      ) {
        values[row!][column!] = String(tagged.text || "");
      }
    });
    const replacement = createTable(
      this.fabric,
      this.doc,
      this.canvas.getObjects().length,
      rows,
      columns,
      values,
      tableStyle,
    );
    replacement.set({
      left: table.left,
      top: table.top,
      originX: table.originX,
      originY: table.originY,
      scaleX: table.scaleX,
      scaleY: table.scaleY,
      angle: table.angle,
      flipX: table.flipX,
      flipY: table.flipY,
      opacity: table.opacity,
    });
    const index = this.canvas.getObjects().indexOf(table);
    this.styleObject(replacement);
    this.canvas.remove(table);
    this.canvas.add(replacement);
    this.canvas.moveObjectTo(replacement, Math.max(0, index));
    replacement.setCoords();
    table.dispose();
    this.commitAndSelect(replacement);
  }

  setSelectedTableStyle(patch: Partial<TableSettings>): void {
    this.mutateSelected((object) => {
      if (
        !(object instanceof this.fabric.Group) ||
        kindOf(this.fabric, object) !== "table"
      ) {
        return;
      }
      const current = buildSelectedSnapshot(this.fabric, object).table?.style;
      if (!current) return;
      const next = { ...current, ...patch };
      object.getObjects().forEach((child) => {
        const tagged = child as EditorObject;
        if (tagged.oceanleoTablePart === "cell") {
          child.set({
            fill:
              tagged.oceanleoTableRow === 0
                ? next.headerFill
                : next.bodyFill,
            stroke: next.borderColor,
            strokeWidth: Math.max(0, Math.min(20, next.borderWidth)),
          });
        } else if (tagged.oceanleoTablePart === "text") {
          child.set({ fill: next.textColor });
        }
      });
      object.set("dirty", true);
    });
  }

  addImage(image: FabricImage, point?: CanvasClientPoint): void {
    const object = preparePlacedImage(
      image,
      this.doc,
      this.canvas.getObjects().length,
    );
    if (point) {
      const rect = this.canvas.upperCanvasEl.getBoundingClientRect();
      const viewport = this.canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const viewportX =
        ((point.clientX - rect.left) / Math.max(1, rect.width)) *
        this.canvas.getWidth();
      const viewportY =
        ((point.clientY - rect.top) / Math.max(1, rect.height)) *
        this.canvas.getHeight();
      const halfWidth = object.getScaledWidth() / 2;
      const halfHeight = object.getScaledHeight() / 2;
      const canvasX = (viewportX - viewport[4]) / viewport[0];
      const canvasY = (viewportY - viewport[5]) / viewport[3];
      object.set({
        left: Math.max(
          halfWidth,
          Math.min(this.doc.width - halfWidth, canvasX),
        ),
        top: Math.max(
          halfHeight,
          Math.min(this.doc.height - halfHeight, canvasY),
        ),
      });
      object.setCoords();
    }
    this.addAndSelect(object);
  }

  replaceActiveImage(image: FabricImage): boolean {
    const active = this.canvas.getActiveObject();
    if (
      !active ||
      !(active instanceof this.fabric.FabricImage) ||
      roleOf(active) === "background"
    ) {
      image.dispose();
      return false;
    }
    const current = active as FabricImage & EditorObjectProps;
    const index = this.canvas.getObjects().indexOf(current);
    const replacement = image as FabricImage & EditorObjectProps;
    replacement.oceanleoId = current.oceanleoId || makeId();
    replacement.oceanleoKind = "image";
    replacement.oceanleoRole = undefined;
    replacement.oceanleoLocked = false;
    replacement.set({
      left: current.left,
      top: current.top,
      originX: current.originX,
      originY: current.originY,
      scaleX:
        current.getScaledWidth() / Math.max(1, replacement.width || 1),
      scaleY:
        current.getScaledHeight() / Math.max(1, replacement.height || 1),
      angle: current.angle,
      flipX: current.flipX,
      flipY: current.flipY,
      opacity: current.opacity,
      shadow: current.shadow,
      selectable: true,
      evented: true,
    });
    applyImageRadius(
      this.fabric,
      replacement,
      current.oceanleoRadius || 0,
    );
    applyFilterSettings(
      this.fabric,
      replacement,
      readFilterSettings(current),
    );
    this.styleObject(replacement);
    this.canvas.remove(current);
    this.canvas.add(replacement);
    this.canvas.moveObjectTo(replacement, Math.max(0, index));
    replacement.setCoords();
    current.dispose();
    this.commitAndSelect(replacement);
    return true;
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
    this.commitAndSelect(clone);
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
      if (
        (snapshot.kind === "arrow" ||
          snapshot.kind === "elbow-arrow" ||
          snapshot.kind === "double-arrow") &&
        object instanceof this.fabric.Group
      ) {
        recolorArrow(this.fabric, object as Group, color);
        setArrowStrokeWidth(this.fabric, object as Group, width);
      } else if (
        snapshot.kind === "line" ||
        snapshot.kind === "dashed-line" ||
        snapshot.kind === "curve"
      ) {
        object.set({ stroke: color, strokeWidth: width });
      } else {
        object.set({ stroke: color || undefined, strokeWidth: width });
      }
    });
  }

  setSelectedFill(color: string): void {
    this.mutateSelected((object) => {
      const kind = kindOf(this.fabric, object);
      if (
        (kind === "arrow" ||
          kind === "elbow-arrow" ||
          kind === "double-arrow") &&
        object instanceof this.fabric.Group
      ) {
        recolorArrow(this.fabric, object as Group, color);
      } else if (
        kind === "line" ||
        kind === "dashed-line" ||
        kind === "curve"
      ) {
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
      if (patch.fontFamily != null) props.fontFamily = patch.fontFamily;
      if (patch.fontSize != null) props.fontSize = Math.max(6, patch.fontSize);
      if (patch.fill != null) props.fill = patch.fill;
      if (patch.backgroundColor != null) {
        props.backgroundColor = patch.backgroundColor;
      }
      if (patch.bold != null) props.fontWeight = patch.bold ? "bold" : "normal";
      if (patch.italic != null) {
        props.fontStyle = patch.italic ? "italic" : "normal";
      }
      if (patch.underline != null) props.underline = patch.underline;
      if (patch.linethrough != null) props.linethrough = patch.linethrough;
      if (patch.lineHeight != null) {
        props.lineHeight = Math.max(0.5, patch.lineHeight);
      }
      if (patch.charSpacing != null) props.charSpacing = patch.charSpacing;
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
      stroke: "#6d5dfc",
      strokeWidth: Math.max(2, 2 / this.zoom),
      strokeDashArray: [10, 6],
      lockRotation: true,
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerStrokeColor: "#6d5dfc",
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

  setZoom(value: number): void {
    this.zoom = zoomViewport(
      this.fabric,
      this.canvas,
      this.doc,
      value,
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
