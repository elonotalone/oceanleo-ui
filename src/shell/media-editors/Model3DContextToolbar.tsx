"use client";

import { useMemo, useRef } from "react";
import { isModel3DViewOnlyControl } from "./model3d-readonly";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionCommandTransaction } from "../selection-command-transaction";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
} from "../selection-context";
import { model3dSelectionContext } from "./model3d-selection-controls";
import { MODEL3D_STAGE_TOKENS } from "./model3d-framing.mjs";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

export function Model3DContextToolbar({
  editor,
  accent = "#4f46e5",
  readOnly = false,
}: {
  editor: Model3DWorkbenchState;
  accent?: string;
  /** 只能看：所有改内容的控件置灰（悬停说明原因），命令不生效。 */
  readOnly?: boolean;
}) {
  const tt = useUI();
  const transactionRef = useRef(new SelectionCommandTransaction());
  const context = useMemo(() => model3dSelectionContext(editor, tt, readOnly), [editor, tt, readOnly]);

  const command = (message: SelectionCommand) => {
    if (!context || message.selectionId !== context.id) return;
    if (readOnly && !isModel3DViewOnlyControl(message.controlId)) return;
    const continuingTransaction = transactionRef.current.continues(message);
    if (
      message.selectionRevision !== undefined &&
      message.selectionRevision !== editor.editRevision &&
      !continuingTransaction
    ) {
      return;
    }
    const gesture = (mutate: () => void) =>
      readOnly ? mutate() : transactionRef.current.run(
        message,
        {
          begin: editor.beginGesture,
          commit: editor.commitGesture,
          cancel: editor.cancelGesture,
        },
        mutate,
      );
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
      case "transform-mode":
        editor.setTransformMode(String(message.value) as "translate" | "rotate" | "scale");
        break;
      case "node-visible": editor.setSelectedNodeVisible(message.value === true); break;
      case "duplicate": editor.duplicateSelectedNode(); break;
      case "delete": editor.selectedNode ? editor.deleteSelectedNode() : editor.deleteSelectedAnnotation(); break;
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
      case "background": gesture(() => editor.setBackground(String(message.value || MODEL3D_STAGE_TOKENS["stage.bg.bottom"]))); break;
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
