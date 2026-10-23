import type { UITranslate } from "../../i18n/ui/useUI";
import type { SelectionContext, SelectionControl } from "../selection-context";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";

/** Selection chrome is not a scene-settings panel and never invents a target. */
export function model3dSelectionContext(editor: Model3DWorkbenchState, tt: UITranslate, readOnly: boolean): SelectionContext | null {
  const node = editor.selectedNode;
  const annotation = editor.annotations.find((entry) => entry.id === editor.selectedAnnotationId);
  if ((!node && !annotation) || readOnly) return null;
  const controls: SelectionControl[] = [];
  if (node) {
    controls.push({ id: "transform-mode", kind: "select", label: tt("变换工具"), icon: "select", iconOnly: true,
      value: editor.transformMode, options: [{ value: "translate", label: tt("移动") }, { value: "rotate", label: tt("旋转") }, { value: "scale", label: tt("缩放") }] });
    for (const kind of ["position", "rotation", "scale"] as const) {
      for (const [index, axis] of ["x", "y", "z"].entries()) controls.push({
        id: `${kind}-${axis}`, kind: "number", label: `${kind === "position" ? "P" : kind === "rotation" ? "R" : "S"}${axis.toUpperCase()}`,
        value: node.transform[kind][index], step: kind === "rotation" ? 1 : 0.01,
        slot: "inspector", inspectorGroup: "position", inspectorLabel: tt("对象变换"), inspectorIcon: "position",
      });
    }
    controls.push({ id: "node-visible", kind: "toggle", label: tt("显示节点"), icon: "layers", iconOnly: true, value: node.visible },
      { id: "duplicate", kind: "action", label: tt("复制"), icon: "duplicate", iconOnly: true },
      { id: "delete", kind: "action", label: tt("删除"), icon: "delete", iconOnly: true, danger: true });
    const material = editor.materials.find((entry) => entry.index === editor.selectedMaterialIndex);
    if (material) {
      const group = { slot: "inspector" as const, inspectorGroup: "model-material", inspectorLabel: tt("PBR 材质"), inspectorIcon: "effects" as const };
      controls.push({ id: "material-select", kind: "select", label: tt("材质"), value: String(material.index), options: editor.materials.map((entry) => ({ value: String(entry.index), label: entry.name })), ...group },
        { id: "material-color", kind: "color", label: tt("基础色"), value: material.color, ...group },
        { id: "material-metallic", kind: "range", label: tt("金属度"), value: material.metalness, min: 0, max: 1, step: 0.01, ...group },
        { id: "material-roughness", kind: "range", label: tt("粗糙度"), value: material.roughness, min: 0, max: 1, step: 0.01, ...group });
    }
    if (node.camera) for (const key of ["fov", "zoom", "near", "far"] as const) {
      const value = node.camera[key];
      if (key === "fov" && node.camera.projection !== "perspective") continue;
      if (key === "zoom" && node.camera.projection !== "orthographic") continue;
      if (typeof value === "number") controls.push({ id: `camera-${key}`, kind: "number", label: tt({ fov: "视野角", zoom: "正交缩放", near: "近裁剪", far: "远裁剪" }[key]), value, step: 0.1,
        slot: "inspector", inspectorGroup: "model-camera", inspectorLabel: tt("模型相机"), inspectorIcon: "background" });
    }
    if (node.light) {
      const group = { slot: "inspector" as const, inspectorGroup: "model-light", inspectorLabel: tt("模型灯光"), inspectorIcon: "effects" as const };
      controls.push({ id: "light-color", kind: "color", label: tt("灯光颜色"), value: node.light.color, ...group });
      for (const key of ["intensity", "distance", "decay", "angle", "penumbra"] as const) {
        const value = node.light[key];
        if (["distance", "decay"].includes(key) && node.light.kind === "directional") continue;
        if (["angle", "penumbra"].includes(key) && node.light.kind !== "spot") continue;
        if (typeof value === "number") controls.push({ id: `light-${key}`, kind: "number", label: tt({ intensity: "灯光强度", distance: "照射距离", decay: "衰减", angle: "锥角", penumbra: "半影" }[key]), value, min: 0, step: 0.1, ...group });
      }
    }
  }
  if (annotation) {
    const group = { slot: "inspector" as const, inspectorGroup: "model-annotations", inspectorLabel: tt("标注"), inspectorIcon: "note" as const };
    controls.push({ id: "annotation-label", kind: "text", label: tt("标注内容"), value: annotation.label, ...group },
      node ? { id: "annotation-delete", kind: "action", label: tt("删除标注"), danger: true, ...group }
        : { id: "delete", kind: "action", label: tt("删除标注"), icon: "delete", iconOnly: true, danger: true });
  }
  return { version: 1, kind: "model-3d", bar: "object", id: node?.id || annotation!.id,
    label: node?.name || annotation!.label, revision: editor.editRevision, controls };
}
