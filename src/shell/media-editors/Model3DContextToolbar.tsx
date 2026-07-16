"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

export function Model3DContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: Model3DWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const context = useMemo<SelectionContext>(
    () => ({
      version: 1,
      kind: "model-3d",
      id: "active-model",
      label: editor.title || tt("3D 模型"),
      controls: [
        {
          id: "azimuth",
          kind: "range",
          label: tt("水平环绕"),
          value: editor.azimuth,
          min: -180,
          max: 180,
          disabled: !editor.modelLoaded,
        },
        {
          id: "elevation",
          kind: "range",
          label: tt("垂直环绕"),
          value: editor.elevation,
          min: 0,
          max: 180,
          disabled: !editor.modelLoaded,
        },
        {
          id: "zoom",
          kind: "range",
          label: tt("镜头距离"),
          value: editor.zoom,
          min: 50,
          max: 300,
          step: 5,
          disabled: !editor.modelLoaded,
        },
        {
          id: "auto-rotate",
          kind: "toggle",
          label: tt("自动旋转"),
          value: editor.autoRotate,
          disabled: !editor.modelLoaded,
        },
        {
          id: "reset-camera",
          kind: "action",
          label: tt("重置相机"),
          disabled: !editor.modelLoaded,
          placement: "more",
        },
        {
          id: "exposure",
          kind: "range",
          label: tt("曝光"),
          value: editor.exposure,
          min: 0.1,
          max: 2,
          step: 0.1,
          disabled: !editor.modelLoaded,
          placement: "more",
        },
        {
          id: "shadow-intensity",
          kind: "range",
          label: tt("阴影强度"),
          value: editor.shadowIntensity,
          min: 0,
          max: 2,
          step: 0.1,
          disabled: !editor.modelLoaded,
          placement: "more",
        },
        {
          id: "shadow-softness",
          kind: "range",
          label: tt("阴影柔和"),
          value: editor.shadowSoftness,
          min: 0,
          max: 1,
          step: 0.05,
          disabled: !editor.modelLoaded,
          placement: "more",
        },
        {
          id: "background",
          kind: "color",
          label: tt("背景"),
          value: editor.background,
          disabled: !editor.modelLoaded,
          placement: "more",
        },
        ...(editor.animations.length > 0
          ? [
              {
                id: "animation",
                kind: "select" as const,
                label: tt("动画"),
                value: editor.animationName,
                options: editor.animations.map((name) => ({
                  value: name,
                  label: name,
                })),
                placement: "more" as const,
              },
              {
                id: "animation-playing",
                kind: "toggle" as const,
                label: tt("播放动画"),
                value: editor.animationPlaying,
                placement: "more" as const,
              },
              {
                id: "animation-speed",
                kind: "range" as const,
                label: tt("动画速度"),
                value: editor.animationSpeed,
                min: 0.1,
                max: 3,
                step: 0.1,
                placement: "more" as const,
              },
            ]
          : []),
      ],
    }),
    [editor, tt],
  );
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    const value =
      typeof message.value === "number" && Number.isFinite(message.value)
        ? message.value
        : 0;
    switch (message.controlId) {
      case "azimuth":
        editor.setOrbit(value, editor.elevation);
        break;
      case "elevation":
        editor.setOrbit(editor.azimuth, value);
        break;
      case "zoom":
        editor.setZoom(value);
        break;
      case "auto-rotate":
        editor.setAutoRotate(message.value === true);
        break;
      case "reset-camera":
        editor.resetCamera();
        break;
      case "exposure":
        editor.setExposure(value);
        break;
      case "shadow-intensity":
        editor.setShadowIntensity(value);
        break;
      case "shadow-softness":
        editor.setShadowSoftness(value);
        break;
      case "background":
        editor.setBackground(String(message.value || "#f5f5f4"));
        break;
      case "animation":
        editor.selectAnimation(String(message.value || ""));
        break;
      case "animation-playing":
        editor.toggleAnimation();
        break;
      case "animation-speed":
        editor.setAnimationSpeed(value);
        break;
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
