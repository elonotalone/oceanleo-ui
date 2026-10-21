import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { Rect as FabricRect } from "fabric";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const toolbarControlModuleUrl = await compileModule(
  "src/shell/SelectionToolbarControl.tsx",
  {
    "./AdvancedEditorIcon": dataModule(
      `import { jsx } from ${JSON.stringify(jsxUrl)}; export function AdvancedEditorIcon({name}) { return jsx("span", {"data-icon": name}); }`,
    ),
    "./SelectionAnimationGallery": dataModule("export function SelectionAnimationGallery() { return null; }"),
    "./SelectionToolbarNumberControl": dataModule("export function SelectionToolbarNumberControl() { return null; }"),
    "./SelectionToolbarSelectControl": dataModule("export function SelectionToolbarSelectControl() { return null; }"),
  },
);
const { SelectionToolbarControl } = await import(toolbarControlModuleUrl);
const { createRoot } = await import("react-dom/client");

const coreUrl = await compileModule(
  "src/shell/image-editor/fabric-controller-core.ts",
  {
    "./image-mutation-policy": dataModule(
      "export const IMAGE_LOCK_SERIALIZED_PROPS = ['oceanleoLocked','selectable','evented','lockMovementX','lockMovementY','lockScalingX','lockScalingY','lockRotation','lockSkewingX','lockSkewingY','hasControls','hoverCursor']; export function imageLockInteractionProps(locked) { return { selectable: true, evented: true, lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, lockSkewingX: locked, lockSkewingY: locked, hasControls: !locked, hoverCursor: locked ? 'not-allowed' : 'move' }; } export function imageObjectMutationAllowed(locked, intent) { return !locked || intent === 'unlock' || intent === 'metadata'; }",
    ),
  },
);
const [controllerModule, commandModule, toolbarModule, inspectorModule, runtimeModule] =
  await Promise.all([
    compileModule("src/shell/image-editor/fabric-controller.ts", {
      "./fabric-controller-core": coreUrl,
    }),
    compileModule("src/shell/image-editor/fabric-image-commands.ts"),
    compileModule("src/shell/image-editor/fabric-image-toolbar-controls.ts"),
    compileModule("src/shell/selection-inspector-groups.ts"),
    compileModule("src/shell/image-editor/editor-runtime.ts"),
  ]).then((urls) => Promise.all(urls.map((url) => import(url))));
const { FabricEditorController } = controllerModule;
const { dispatchFabricImageCommand } = commandModule;
const { buildFabricImageToolbarControls, primaryImageToolbarControlIds } = toolbarModule;
const { partitionSelectionInspectorControls } = inspectorModule;
const { fabricImageCropPatch } = runtimeModule;

class FakeObject {
  constructor(properties = {}) {
    Object.assign(this, {
      left: 0,
      top: 0,
      width: 100,
      height: 80,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      originX: "left",
      originY: "top",
      visible: true,
      ...properties,
    });
  }
  set(properties) { Object.assign(this, properties); return this; }
  setCoords() {}
  setControlsVisibility() {}
  setPositionByOrigin(point) { this.left = point.x; this.top = point.y; }
  rotate(angle) { this.angle = angle; }
  getBoundingRect() {
    return {
      left: this.left,
      top: this.top,
      width: this.width * this.scaleX,
      height: this.height * this.scaleY,
    };
  }
  getScaledWidth() { return this.width * this.scaleX; }
  getScaledHeight() { return this.height * this.scaleY; }
  getCenterPoint() {
    if (this.originX === "center" && this.originY === "center") {
      return { x: this.left, y: this.top };
    }
    return {
      x: this.left + this.getScaledWidth() / 2,
      y: this.top + this.getScaledHeight() / 2,
    };
  }
  clone() { return Promise.resolve(new this.constructor({ ...this })); }
  dispose() { this.disposed = true; }
  toObject() {
    return Object.fromEntries(
      Object.entries(this).filter(([, value]) => typeof value !== "function"),
    );
  }
}

class FakeImage extends FakeObject {}
class FakeText extends FakeObject {}
class FakeRect extends FakeObject {}

class FakeCanvas {
  constructor() {
    this.objects = [];
    this.uniformScaling = true;
    this.width = 1080;
    this.height = 1080;
  }
  add(object) { this.objects.push(object); }
  remove(object) { this.objects = this.objects.filter((entry) => entry !== object); }
  getObjects() { return this.objects; }
  getActiveObject() { return this.active || undefined; }
  setActiveObject(object) { this.active = object; }
  discardActiveObject() { this.active = undefined; }
  requestRenderAll() {}
  setViewportTransform() {}
  setDimensions() {}
  on() { return () => {}; }
  getElement() { return null; }
  getWidth() { return this.width; }
  getHeight() { return this.height; }
  toObject() { return { objects: this.objects.map((object) => object.toObject()) }; }
  moveObjectTo(object, index) {
    this.remove(object);
    this.objects.splice(index, 0, object);
  }
  bringObjectToFront(object) { this.moveObjectTo(object, this.objects.length); }
}

function controllerWith(objects = []) {
  const controller = Object.create(FabricEditorController.prototype);
  const canvas = new FakeCanvas();
  canvas.objects = [...objects];
  controller.canvas = canvas;
  controller.layers = objects.map((object) => ({
    id: object.oceanleoId,
    kind: object.oceanleoKind || (object instanceof FakeText ? "text" : "image"),
    locked: object.oceanleoLocked === true,
    visible: true,
    isBackground: false,
    selected: false,
  }));
  controller.fabric = {
    FabricImage: FakeImage,
    IText: FakeText,
    Group: class FakeGroup extends FakeObject {},
    Rect: FakeRect,
  };
  controller.doc = { width: 1080, height: 1080 };
  controller.canvasBackground = "#ffffff";
  controller.zoom = 1;
  controller.activeTool = "select";
  controller.brush = { color: "#000000", width: 12 };
  controller.cropping = false;
  controller.cropUniformScalingRestore = null;
  controller.cropRatio = "free";
  controller.cropTargetId = "";
  controller.destroyed = false;
  controller.readOnly = false;
  controller.currentSnapshot = {};
  controller.undoStack = [];
  controller.redoStack = [];
  controller.restoring = false;
  controller.callbacks = { onError: (message) => controller.errors.push(message) };
  controller.errors = [];
  controller.commits = 0;
  controller.textCaseRestore = new Map();
  controller.commit = () => { controller.commits += 1; };
  controller.emit = () => {};
  controller.beginGesture = () => false;
  controller.endGesture = () => {};
  Object.defineProperty(controller, "selected", {
    get() {
      const active = canvas.getActiveObject();
      if (!active) return null;
      return {
        id: active.oceanleoId,
        kind: active instanceof FakeText ? "text" : "image",
        locked: active.oceanleoLocked === true,
        text: active instanceof FakeText
          ? { value: active.text, align: active.textAlign }
          : null,
      };
    },
  });
  canvas.freeDrawingBrush = { color: "#000000", width: 12 };
  return controller;
}

const tt = (value) => value;

function selectedText(overrides = {}) {
  return {
    id: "text-1",
    kind: "text",
    isBackground: false,
    opacity: 100,
    angle: 0,
    locked: false,
    fill: "#000000",
    stroke: "#000000",
    strokeWidth: 0,
    radius: null,
    shadow: { enabled: false, color: "#000000", blur: 0, offsetX: 0, offsetY: 0 },
    text: {
      value: "Mixed Case\nsecond line",
      fontFamily: "Inter",
      fontSize: 23.3,
      fill: "#111111",
      backgroundColor: "",
      bold: false,
      italic: false,
      underline: false,
      linethrough: false,
      lineHeight: 1.16,
      charSpacing: 0,
      align: "left",
      stroke: "",
      strokeWidth: 0,
    },
    ...overrides,
  };
}

function command(controlId, selectionId, value) {
  return {
    requestId: `test-${controlId}`,
    controlId,
    selectionId,
    ...(value !== undefined ? { value } : {}),
  };
}

function toolbar(selected) {
  return buildFabricImageToolbarControls({
    selected,
    cropping: false,
    cropRatio: "free",
    loading: false,
    sourceReady: true,
    saving: false,
    transformInfo: null,
    filters: null,
    layers: [{ locked: selected.locked }],
    tt,
  });
}

test("text bar follows the supplied order and maps visible controls to real inspectors", () => {
  const controls = toolbar(selectedText());
  const ids = primaryImageToolbarControlIds(controls);
  assert.deepEqual(ids.slice(0, 12), [
    "font-panel", "font-size", "text-color", "bold", "italic", "underline",
    "linethrough", "text-case", "align", "list", "line-height", "opacity",
  ]);
  assert.equal(ids.includes("animate"), false, "image text has no animation adapter");
  assert.equal(controls.find((control) => control.id === "font-size")?.step, 0.1);
  assert.ok(ids.includes("shadow"), "Effects maps to the supported shadow toggle");

  const { compact, groups } = partitionSelectionInspectorControls(controls);
  const spacing = compact.find((control) => control.label === "间距");
  assert.equal(spacing?.kind, "panel", "spacing opens a compact inspector launcher");
  assert.equal(compact.some((control) => control.id === "line-height"), false);
  const spacingGroup = groups.find((group) => group.panelId === spacing?.panelId);
  assert.ok(spacingGroup?.controls.some((control) => control.id === "line-height"));
  assert.ok(spacingGroup?.controls.some((control) => control.id === "char-spacing"));

  const position = compact.find((control) => control.semantic === "position");
  assert.equal(position?.kind, "panel");
  assert.equal(position?.label, "位置");
  const geometry = groups.find((group) => group.semantic === "position");
  assert.ok(geometry?.controls.some((control) => control.id === "position-x"));
  assert.ok(geometry?.controls.some((control) => control.id === "object-width"));
  assert.ok(compact.some((control) => control.icon === "transparency"));
});

test("actual controller text commands align, apply reversible case and list edits, and commit", () => {
  const text = new FakeText({ oceanleoId: "text-1", text: "Mixed Case\nsecond line" });
  const controller = controllerWith([text]);
  controller.canvas.setActiveObject(text);

  dispatchFabricImageCommand(controller, command("align", "text-1", "center"));
  assert.equal(text.textAlign, "center");
  assert.equal(controller.commits, 1);

  dispatchFabricImageCommand(controller, command("text-case", "text-1"));
  assert.equal(text.text, "MIXED CASE\nSECOND LINE");
  dispatchFabricImageCommand(controller, command("text-case", "text-1"));
  assert.equal(text.text, "Mixed Case\nsecond line", "second toggle restores original capitalization");

  dispatchFabricImageCommand(controller, command("list", "text-1", true));
  assert.equal(text.text, "• Mixed Case\n• second line");
  dispatchFabricImageCommand(controller, command("list", "text-1", false));
  assert.equal(text.text, "Mixed Case\nsecond line", "toggle removes only its own bullet prefix");
  assert.ok(controller.commits >= 5);
});

test("actual free crop is editable, cancel preserves selection, and confirm changes crop metadata", async () => {
  const image = new FakeImage({
    oceanleoId: "image-1",
    oceanleoKind: "image",
    left: 100,
    top: 80,
    width: 300,
    height: 200,
    cropX: 0,
    cropY: 0,
  });
  const controller = controllerWith([image]);
  controller.canvas.setActiveObject(image);

  dispatchFabricImageCommand(controller, command("crop-start", "image-1"));
  assert.equal(controller.cropping, true);
  const crop = controller.canvas.getActiveObject();
  assert.ok(crop instanceof FakeRect);
  controller.setCropRatio("16:9");
  assert.equal(crop.angle, image.angle, "ratio crop follows the host's local rotation");
  assert.ok(Math.abs(crop.width / crop.height - 16 / 9) < 1e-8);
  const cropView = controller.readView();
  assert.equal(cropView.selected.kind, "rect", "the real core selects its crop rectangle");
  const cropControls = buildFabricImageToolbarControls({
    selected: cropView.selected,
    cropping: cropView.cropping,
    cropRatio: cropView.cropRatio,
    loading: false,
    sourceReady: true,
    transformInfo: cropView.transformInfo,
    filters: cropView.filterInfo?.settings,
    layers: cropView.layers,
    tt,
  });
  assert.deepEqual(primaryImageToolbarControlIds(cropControls), ["crop-apply"]);
  assert.ok(cropControls.some((control) => control.id === "crop-cancel"));
  assert.ok(cropControls.some((control) => control.id === "crop-ratio"));
  crop.set({ left: 250, top: 180, width: 140, height: 100 });
  dispatchFabricImageCommand(controller, command("crop-cancel", crop.oceanleoId));
  assert.equal(controller.cropping, false);
  assert.equal(controller.canvas.getActiveObject(), image);
  assert.equal(image.cropX, 0, "cancel leaves the source image untouched");

  dispatchFabricImageCommand(controller, command("crop-start", "image-1"));
  const nextCrop = controller.canvas.getActiveObject();
  nextCrop.set({ left: 250, top: 180, width: 140, height: 100 });
  await dispatchFabricImageCommand(controller, command("crop-apply", nextCrop.oceanleoId));
  assert.equal(controller.cropping, false);
  assert.equal(controller.canvas.getActiveObject(), image);
  assert.notEqual(image.cropX, 0);
  assert.notEqual(image.width, 300, "crop keeps a Fabric image and adjusts its crop window");
  assert.equal(controller.commits, 1, "confirmed crop creates an undoable document commit");
});

test("crop helper uses Fabric's centered origin and starts inside the selected image bounds", () => {
  const image = new FakeImage({
    oceanleoId: "image-1",
    oceanleoKind: "image",
    left: 100,
    top: 100,
    width: 300,
    height: 200,
    scaleX: 2,
    scaleY: 2,
  });
  const controller = controllerWith([image]);
  controller.fabric.Rect = FabricRect;
  controller.canvas.setActiveObject(image);
  const imageCenter = image.getCenterPoint();
  controller.startCrop();
  const crop = controller.canvas.getActiveObject();
  assert.ok(crop instanceof FabricRect);
  const cropCenter = crop.getCenterPoint();
  assert.ok(Math.abs(cropCenter.x - imageCenter.x) < 1e-8);
  assert.ok(Math.abs(cropCenter.y - imageCenter.y) < 1e-8);
  const imageBounds = image.getBoundingRect();
  const cropBounds = crop.getBoundingRect();
  assert.ok(cropBounds.left >= imageBounds.left);
  assert.ok(cropBounds.top >= imageBounds.top);
  assert.ok(cropBounds.left + cropBounds.width <= imageBounds.left + imageBounds.width);
  assert.ok(cropBounds.top + cropBounds.height <= imageBounds.top + imageBounds.height);
});

test("crop patch inverse-transforms a rotated and flipped image selection", () => {
  const image = new FakeImage({
    left: 250,
    top: 180,
    width: 300,
    height: 200,
    scaleX: 2,
    scaleY: 2,
    angle: 90,
    flipX: true,
    flipY: true,
    cropX: 10,
    cropY: 4,
  });
  const crop = new FakeRect({
    left: 530,
    top: 390,
    width: 100,
    height: 50,
    scaleX: 2,
    scaleY: 2,
    angle: 90,
    originX: "center",
    originY: "center",
  });
  const patch = fabricImageCropPatch(image, crop);
  assert.ok(patch);
  assert.ok(Math.abs(patch.width - 100) < 1e-8);
  assert.ok(Math.abs(patch.height - 50) < 1e-8);
  assert.ok(Math.abs(patch.cropX - (10 + 95)) < 1e-8);
  assert.ok(Math.abs(patch.cropY - (4 + 65)) < 1e-8);
  assert.equal(patch.left, 530);
  assert.equal(patch.top, 390);
});

test("locked and stale image toolbar commands fail closed", () => {
  const image = new FakeImage({ oceanleoId: "image-1", oceanleoKind: "image", oceanleoLocked: true });
  const controller = controllerWith([image]);
  controller.canvas.setActiveObject(image);
  dispatchFabricImageCommand(controller, command("rotate-right", "image-1"));
  assert.equal(image.angle, 0);
  assert.equal(controller.commits, 0);

  image.oceanleoLocked = false;
  dispatchFabricImageCommand(controller, command("rotate-right", "old-selection"));
  assert.equal(image.angle, 0, "stale toolbar command does not retarget another layer");
  assert.equal(controller.commits, 0);
});

test("a cleared canvas selection is restored from the toolbar identity before action", () => {
  const image = new FakeImage({ oceanleoId: "image-1", oceanleoKind: "image" });
  const controller = controllerWith([image]);
  controller.canvas.setActiveObject(image);
  controller.canvas.discardActiveObject();
  dispatchFabricImageCommand(controller, command("rotate-right", "image-1"));
  assert.equal(controller.canvas.getActiveObject(), image);
  assert.equal(image.angle, 90);
  assert.equal(controller.commits, 1);
});

test("toolbar command restores its rendered target even while React selection snapshot is stale", () => {
  const image = new FakeImage({ oceanleoId: "image-1", oceanleoKind: "image" });
  const controller = controllerWith([image]);
  const staleView = Object.create(controller);
  Object.defineProperty(staleView, "selected", {
    value: { id: "image-1", kind: "image", locked: false },
  });
  controller.canvas.discardActiveObject();
  dispatchFabricImageCommand(staleView, command("rotate-right", "image-1"));
  assert.equal(controller.canvas.getActiveObject(), image);
  assert.equal(image.angle, 90);
});

test("mounted image action preserves pointer selection and invokes the controller target", async () => {
  class TestPointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = 1;
      this.pointerType = "mouse";
    }
  }
  window.PointerEvent = TestPointerEvent;
  globalThis.PointerEvent = TestPointerEvent;
  const image = new FakeImage({ oceanleoId: "image-1", oceanleoKind: "image" });
  const controller = controllerWith([image]);
  controller.canvas.setActiveObject(image);
  const control = buildFabricImageToolbarControls({
    selected: {
      id: "image-1",
      kind: "image",
      isBackground: false,
      locked: false,
      opacity: 100,
      angle: 0,
      text: null,
      shadow: { enabled: false, color: "#000000", blur: 0, offsetX: 0, offsetY: 0 },
    },
    cropping: false,
    cropRatio: "free",
    loading: false,
    sourceReady: true,
    transformInfo: null,
    filters: null,
    layers: controller.layers,
    tt,
  }).find((item) => item.id === "rotate-right");
  assert.ok(control);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(SelectionToolbarControl, {
      control,
      selectionId: "image-1",
      onCommand: (message) => dispatchFabricImageCommand(controller, message),
      accent: "#4f46e5",
    })));
    const button = container.querySelector("button");
    assert.ok(button);
    const pointer = new TestPointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    await act(async () => button.dispatchEvent(pointer));
    assert.equal(pointer.defaultPrevented, true);
    controller.canvas.discardActiveObject();
    await act(async () => button.click());
    assert.equal(controller.canvas.getActiveObject(), image);
    assert.equal(image.angle, 90);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("cleared selections cannot retarget missing objects, and crop undo restores canvas scaling", () => {
  const image = new FakeImage({ oceanleoId: "image-1", oceanleoKind: "image" });
  const controller = controllerWith([image]);
  controller.canvas.setActiveObject(image);
  controller.canvas.discardActiveObject();
  dispatchFabricImageCommand(controller, command("rotate-right", "removed-object"));
  assert.equal(image.angle, 0, "a missing stale ID is not redirected to another image");

  controller.canvas.setActiveObject(image);
  controller.startCrop();
  assert.equal(controller.canvas.uniformScaling, false);
  controller.undo();
  assert.equal(controller.cropping, false);
  assert.equal(controller.canvas.uniformScaling, true);
});

test("overflow stacking targets the command ID after blur and respects locked-layer policy", () => {
  const lower = new FakeImage({ oceanleoId: "lower", oceanleoKind: "image" });
  const upper = new FakeImage({ oceanleoId: "upper", oceanleoKind: "image" });
  const controller = controllerWith([lower, upper]);
  controller.canvas.discardActiveObject();
  dispatchFabricImageCommand(controller, command("layer-up", "lower"));
  assert.equal(controller.canvas.getObjects().at(-1), lower);

  controller.layers[0].locked = true;
  const angle = upper.angle;
  dispatchFabricImageCommand(controller, command("rotate-right", "upper"));
  assert.equal(upper.angle, angle, "layer snapshot lock state blocks stale toolbar commands");
});
