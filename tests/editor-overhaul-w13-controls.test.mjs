import assert from "node:assert/strict";
import test from "node:test";
import { model3dSelectionContext } from "../src/shell/media-editors/model3d-selection-controls.ts";
import { canonicalSelectionControls } from "../src/shell/edit-bar-canon.ts";
import { cloneModel3DNode, model3DCloneRegistryEntries, placeModel3DCloneBeside } from "../src/shell/media-editors/model3d-duplicate.mjs";
import * as THREE from "three";

const tt = (text) => text;
const fixture = (selected = true) => ({
  title: "Cube", editRevision: 1, transformMode: "translate", annotations: [], selectedAnnotationId: "",
  selectedMaterialIndex: 0, materials: selected ? [{ index: 0, name: "Orange", color: "#ff8800", metalness: 0, roughness: 1 }] : [],
  selectedNode: selected ? { id: "cube", name: "Cube", visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } : null,
});

test("3D selection uses canonical position, duplicate and delete, without a fake selection when empty", () => {
  assert.equal(model3dSelectionContext(fixture(false), tt, false), null);
  const context = model3dSelectionContext(fixture(), tt, false);
  assert.equal(context.bar, "object");
  for (const kind of ["position", "rotation", "scale"]) {
    for (const axis of ["x", "y", "z"]) {
      assert.ok(context.controls.some((c) => c.id === `${kind}-${axis}` && c.inspectorGroup === "position"));
    }
  }
  for (const id of ["duplicate", "delete"]) assert.ok(context.controls.some((c) => c.id === id));
  assert.ok(!context.controls.some((c) => ["node-delete", "animation", "exposure"].includes(c.id)));
  const projected = canonicalSelectionControls(context);
  const icons = projected.controls.filter((c) => c.icon && c.slot !== "inspector").map((c) => c.icon);
  assert.equal(new Set(icons).size, icons.length, "3D buttons must not repeat canonical glyphs");
});

test("read-only selection omits mutation controls instead of emitting disabled buttons", () => {
  const context = model3dSelectionContext(fixture(), tt, true);
  assert.ok(!context || context.controls.every((c) => !c.disabled));
  assert.ok(!context || !context.controls.some((c) => ["duplicate", "delete"].includes(c.id)));
});

test("annotation text remains in its inspector even when a scene node is also selected", () => {
  const editor = { ...fixture(), annotations: [{ id: "note", label: "Detail" }], selectedAnnotationId: "note" };
  const context = model3dSelectionContext(editor, tt, false);
  assert.equal(context.controls.find((c) => c.id === "annotation-label").slot, "inspector");
  assert.ok(context.controls.some((c) => c.id === "annotation-delete"));
  assert.ok(context.controls.some((c) => c.id === "delete"), "node delete must remain distinct from annotation delete");
});

test("duplicated node tree has unique stable IDs and appears beside its original", () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ color: "#ff8800" });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  cube.name = "Cube";
  cube.userData.oceanleoEditorId = "base:0";
  cube.add(new THREE.Object3D());
  scene.add(cube);
  const clone = cloneModel3DNode(cube, "copy:1");
  placeModel3DCloneBeside(clone, cube);
  assert.equal(cube.position.x, 0);
  assert.ok(clone.position.x > 1);
  assert.equal(material.color.getHexString(), "ff8800", "copying must preserve authored color");
  const ids = model3DCloneRegistryEntries(clone).map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("copy:1")));
});
