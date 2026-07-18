"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

const inspector = (
  group: string,
  label: string,
  icon: SelectionControl["inspectorIcon"],
) => ({
  slot: "inspector" as const,
  inspectorGroup: group,
  inspectorLabel: label,
  inspectorIcon: icon,
});

export function Model3DContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: Model3DWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const selection = editor.selectedNode;
  const selectedMaterial =
    editor.materials.find(
      (entry) => entry.index === editor.selectedMaterialIndex,
    ) || null;
  const selectedAnnotation =
    editor.annotations.find(
      (entry) => entry.id === editor.selectedAnnotationId,
    ) || null;

  const context = useMemo<SelectionContext>(() => {
    const controls: SelectionControl[] = [
      {
        id: "undo",
        kind: "action",
        label: tt("撤销"),
        icon: "undo",
        iconOnly: true,
        disabled: !editor.canUndo,
      },
      {
        id: "redo",
        kind: "action",
        label: tt("重做"),
        icon: "redo",
        iconOnly: true,
        disabled: !editor.canRedo,
      },
    ];
    if (selection) {
      const transformGroup = inspector(
        "model-transform",
        tt("对象变换"),
        "position",
      );
      controls.push(
        {
          id: "transform-mode",
          kind: "select",
          label: tt("变换工具"),
          value: editor.transformMode,
          options: [
            { value: "translate", label: tt("移动") },
            { value: "rotate", label: tt("旋转") },
            { value: "scale", label: tt("缩放") },
          ],
        },
        ...(["position", "rotation", "scale"] as const).flatMap((kind) =>
          (["x", "y", "z"] as const).map((axis, index) => ({
            id: `${kind}-${axis}`,
            kind: "number" as const,
            label: `${kind === "position" ? "P" : kind === "rotation" ? "R" : "S"}${axis.toUpperCase()}`,
            value: selection.transform[kind][index],
            step: kind === "rotation" ? 1 : 0.01,
            ...transformGroup,
          })),
        ),
        {
          id: "node-visible",
          kind: "toggle",
          label: tt("显示节点"),
          value: selection.visible,
          ...transformGroup,
        },
        {
          id: "node-delete",
          kind: "action",
          label: tt("删除节点"),
          danger: true,
          tone: "danger",
          ...transformGroup,
        },
      );
    }
    if (selectedMaterial) {
      const materialGroup = inspector(
        "model-material",
        tt("PBR 材质"),
        "effects",
      );
      controls.push(
        {
          id: "material-select",
          kind: "select",
          label: tt("材质"),
          value: String(editor.selectedMaterialIndex),
          options: editor.materials.map((material) => ({
            value: String(material.index),
            label: material.name,
          })),
          ...materialGroup,
        },
        {
          id: "material-color",
          kind: "color",
          label: tt("基础色"),
          value: selectedMaterial.color,
          ...materialGroup,
        },
        {
          id: "material-metallic",
          kind: "range",
          label: tt("金属度"),
          value: selectedMaterial.metalness,
          min: 0,
          max: 1,
          step: 0.01,
          ...materialGroup,
        },
        {
          id: "material-roughness",
          kind: "range",
          label: tt("粗糙度"),
          value: selectedMaterial.roughness,
          min: 0,
          max: 1,
          step: 0.01,
          ...materialGroup,
        },
      );
    }
    if (selection?.camera) {
      const cameraGroup = inspector(
        "model-authored-camera",
        tt("模型相机"),
        "position",
      );
      if (selection.camera.projection === "perspective") {
        controls.push({
          id: "camera-fov",
          kind: "range",
          label: tt("视野角"),
          value: selection.camera.fov || 45,
          min: 1,
          max: 179,
          step: 1,
          ...cameraGroup,
        });
      } else {
        controls.push({
          id: "camera-zoom",
          kind: "range",
          label: tt("正交缩放"),
          value: selection.camera.zoom || 1,
          min: 0.01,
          max: 20,
          step: 0.01,
          ...cameraGroup,
        });
      }
      controls.push(
        {
          id: "camera-near",
          kind: "number",
          label: tt("近裁剪"),
          value: selection.camera.near,
          min: 0.0001,
          ...cameraGroup,
        },
        {
          id: "camera-far",
          kind: "number",
          label: tt("远裁剪"),
          value: selection.camera.far,
          min: 0.001,
          ...cameraGroup,
        },
      );
    }
    if (selection?.light) {
      const lightGroup = inspector(
        "model-authored-light",
        tt("模型灯光"),
        "effects",
      );
      controls.push(
        {
          id: "light-color",
          kind: "color",
          label: tt("灯光颜色"),
          value: selection.light.color,
          ...lightGroup,
        },
        {
          id: "light-intensity",
          kind: "range",
          label: tt("灯光强度"),
          value: selection.light.intensity,
          min: 0,
          max: 100,
          step: 0.1,
          ...lightGroup,
        },
      );
      if (selection.light.kind === "point" || selection.light.kind === "spot") {
        controls.push(
          {
            id: "light-distance",
            kind: "number",
            label: tt("照射距离"),
            value: selection.light.distance,
            min: 0,
            ...lightGroup,
          },
          {
            id: "light-decay",
            kind: "range",
            label: tt("衰减"),
            value: selection.light.decay,
            min: 0,
            max: 4,
            step: 0.1,
            ...lightGroup,
          },
        );
      }
      if (selection.light.kind === "spot") {
        controls.push(
          {
            id: "light-angle",
            kind: "range",
            label: tt("锥角"),
            value: selection.light.angle,
            min: 1,
            max: 89,
            step: 1,
            ...lightGroup,
          },
          {
            id: "light-penumbra",
            kind: "range",
            label: tt("半影"),
            value: selection.light.penumbra,
            min: 0,
            max: 1,
            step: 0.01,
            ...lightGroup,
          },
        );
      }
    }

    const viewGroup = inspector("model-camera", tt("编辑器相机"), "position");
    controls.push(
      {
        id: "azimuth",
        kind: "range",
        label: tt("水平环绕"),
        value: editor.azimuth,
        min: -180,
        max: 180,
        ...viewGroup,
      },
      {
        id: "elevation",
        kind: "range",
        label: tt("垂直环绕"),
        value: editor.elevation,
        min: 1,
        max: 179,
        ...viewGroup,
      },
      {
        id: "zoom",
        kind: "range",
        label: tt("镜头距离"),
        value: editor.zoom,
        min: 20,
        max: 500,
        step: 5,
        ...viewGroup,
      },
      {
        id: "auto-rotate",
        kind: "toggle",
        label: tt("自动旋转"),
        value: editor.autoRotate,
      },
      {
        id: "reset-camera",
        kind: "action",
        label: tt("重置相机"),
        placement: "more",
      },
    );

    const lightingGroup = inspector(
      "model-lighting",
      tt("环境与阴影"),
      "effects",
    );
    controls.push(
      {
        id: "exposure",
        kind: "range",
        label: tt("曝光"),
        value: editor.exposure,
        min: 0.1,
        max: 4,
        step: 0.1,
        ...lightingGroup,
      },
      {
        id: "environment-url",
        kind: "text",
        label: tt("HDR 环境图地址"),
        value: editor.environmentUrl,
        ...lightingGroup,
      },
      {
        id: "environment-intensity",
        kind: "range",
        label: tt("环境强度"),
        value: editor.environmentIntensity,
        min: 0,
        max: 5,
        step: 0.05,
        ...lightingGroup,
      },
      {
        id: "shadow-enabled",
        kind: "toggle",
        label: tt("启用阴影"),
        value: editor.shadowEnabled,
        ...lightingGroup,
      },
      {
        id: "shadow-intensity",
        kind: "range",
        label: tt("阴影强度"),
        value: editor.shadowIntensity,
        min: 0,
        max: 2,
        step: 0.05,
        ...lightingGroup,
      },
      {
        id: "shadow-softness",
        kind: "range",
        label: tt("阴影柔和"),
        value: editor.shadowSoftness,
        min: 0,
        max: 1,
        step: 0.05,
        ...lightingGroup,
      },
      {
        id: "background",
        kind: "color",
        label: tt("背景"),
        value: editor.background,
        ...lightingGroup,
      },
    );

    if (editor.animations.length) {
      const animationGroup = inspector(
        "model-animation",
        tt("动画"),
        "animate",
      );
      controls.push(
        {
          id: "animation",
          kind: "select",
          label: tt("动画片段"),
          value: editor.animationName,
          options: [
            { value: "", label: tt("静止姿态") },
            ...editor.animations.map((name) => ({ value: name, label: name })),
          ],
          ...animationGroup,
        },
        {
          id: "animation-playing",
          kind: "toggle",
          label: tt("播放动画"),
          value: editor.animationPlaying,
          disabled: !editor.animationName,
          ...animationGroup,
        },
        {
          id: "animation-time",
          kind: "range",
          label: tt("播放时间"),
          value: editor.animationTime,
          min: 0,
          max: Math.max(editor.animationDuration, 0.001),
          step: 0.01,
          disabled: !editor.animationName,
          ...animationGroup,
        },
        {
          id: "animation-speed",
          kind: "range",
          label: tt("动画速度"),
          value: editor.animationSpeed,
          min: 0.1,
          max: 4,
          step: 0.1,
          ...animationGroup,
        },
      );
    }

    const annotationGroup = inspector(
      "model-annotations",
      tt("标注"),
      "note",
    );
    controls.push(
      {
        id: "annotation-new",
        kind: "text",
        label: tt("新标注"),
        value: editor.annotationDraft,
        ...annotationGroup,
      },
      {
        id: "annotation-add",
        kind: "action",
        label: tt("点击模型放置"),
        disabled: !editor.annotationDraft.trim(),
        ...annotationGroup,
      },
    );
    if (selectedAnnotation) {
      controls.push(
        {
          id: "annotation-select",
          kind: "select",
          label: tt("当前标注"),
          value: selectedAnnotation.id,
          options: editor.annotations.map((entry) => ({
            value: entry.id,
            label: entry.label,
          })),
          ...annotationGroup,
        },
        {
          id: "annotation-label",
          kind: "text",
          label: tt("标注内容"),
          value: selectedAnnotation.label,
          ...annotationGroup,
        },
        {
          id: "annotation-delete",
          kind: "action",
          label: tt("删除标注"),
          danger: true,
          ...annotationGroup,
        },
      );
    }
    return {
      version: 1,
      kind: "model-3d",
      id: selection?.id || "active-model",
      label: selection?.name || editor.title || tt("3D 模型"),
      revision: editor.editRevision,
      controls,
    };
  }, [editor, selectedAnnotation, selectedMaterial, selection, tt]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    const gesture = (mutate: () => void) => {
      if (!message.transactionId) {
        mutate();
        return;
      }
      if (message.phase === "start") {
        editor.beginGesture(message.controlId);
        return;
      }
      if (message.phase === "cancel") {
        editor.cancelGesture();
        return;
      }
      mutate();
      if (message.phase === "commit") editor.commitGesture();
    };
    const value =
      typeof message.value === "number" && Number.isFinite(message.value)
        ? message.value
        : 0;
    const patchVector = (
      kind: "position" | "rotation" | "scale",
      axis: number,
    ) => {
      if (!editor.selectedNode) return;
      const next = [...editor.selectedNode.transform[kind]];
      next[axis] = value;
      editor.patchSelectedTransform({ [kind]: next });
    };
    const vectorMatch = /^(position|rotation|scale)-([xyz])$/.exec(
      message.controlId,
    );
    if (vectorMatch) {
      gesture(() =>
        patchVector(
          vectorMatch[1] as "position" | "rotation" | "scale",
          { x: 0, y: 1, z: 2 }[vectorMatch[2] as "x" | "y" | "z"],
        ),
      );
      return;
    }
    switch (message.controlId) {
      case "undo": editor.undo(); break;
      case "redo": editor.redo(); break;
      case "transform-mode":
        editor.setTransformMode(String(message.value) as "translate" | "rotate" | "scale");
        break;
      case "node-visible": editor.setSelectedNodeVisible(message.value === true); break;
      case "node-delete": editor.deleteSelectedNode(); break;
      case "material-select": editor.selectMaterial(Number(message.value)); break;
      case "material-color": gesture(() => editor.setMaterialColor(String(message.value || "#ffffff"))); break;
      case "material-metallic": gesture(() => editor.setMaterialMetallic(value)); break;
      case "material-roughness": gesture(() => editor.setMaterialRoughness(value)); break;
      case "camera-fov": gesture(() => editor.patchSelectedCamera({ fov: value })); break;
      case "camera-zoom": gesture(() => editor.patchSelectedCamera({ zoom: value })); break;
      case "camera-near": gesture(() => editor.patchSelectedCamera({ near: value })); break;
      case "camera-far": gesture(() => editor.patchSelectedCamera({ far: value })); break;
      case "light-color": gesture(() => editor.patchSelectedLight({ color: String(message.value) })); break;
      case "light-intensity": gesture(() => editor.patchSelectedLight({ intensity: value })); break;
      case "light-distance": gesture(() => editor.patchSelectedLight({ distance: value })); break;
      case "light-decay": gesture(() => editor.patchSelectedLight({ decay: value })); break;
      case "light-angle": gesture(() => editor.patchSelectedLight({ angle: value })); break;
      case "light-penumbra": gesture(() => editor.patchSelectedLight({ penumbra: value })); break;
      case "azimuth": gesture(() => editor.setOrbit(value, editor.elevation)); break;
      case "elevation": gesture(() => editor.setOrbit(editor.azimuth, value)); break;
      case "zoom": gesture(() => editor.setZoom(value)); break;
      case "auto-rotate": editor.setAutoRotate(message.value === true); break;
      case "reset-camera": editor.resetCamera(); break;
      case "exposure": gesture(() => editor.setExposure(value)); break;
      case "environment-url":
        gesture(() => editor.setEnvironmentUrl(String(message.value || "")));
        break;
      case "environment-intensity": gesture(() => editor.setEnvironmentIntensity(value)); break;
      case "shadow-enabled": editor.setShadowEnabled(message.value === true); break;
      case "shadow-intensity": gesture(() => editor.setShadowIntensity(value)); break;
      case "shadow-softness": gesture(() => editor.setShadowSoftness(value)); break;
      case "background": gesture(() => editor.setBackground(String(message.value || "#f5f5f4"))); break;
      case "animation": editor.selectAnimation(String(message.value || "")); break;
      case "animation-playing": editor.setAnimationPlaying(message.value === true); break;
      case "animation-time": gesture(() => editor.setAnimationTime(value)); break;
      case "animation-speed": gesture(() => editor.setAnimationSpeed(value)); break;
      case "annotation-new": editor.setAnnotationDraft(String(message.value || "")); break;
      case "annotation-add": editor.beginAnnotationPlacement(); break;
      case "annotation-select": editor.selectAnnotation(String(message.value || "")); break;
      case "annotation-label":
        editor.updateSelectedAnnotation({ label: String(message.value || "") });
        break;
      case "annotation-delete": editor.deleteSelectedAnnotation(); break;
    }
  };
  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
