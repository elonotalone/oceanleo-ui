"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import type { AudioWorkbenchState } from "./AudioWorkbench";

export function AudioContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: AudioWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const selection = editor.selection;
  const context = useMemo<SelectionContext>(
    () => ({
      version: 1,
      kind: selection ? "audio-region" : "audio-track",
      id: selection
        ? `region:${Math.round(selection.start * 1_000)}-${Math.round(selection.end * 1_000)}`
        : "audio-track",
      label: selection ? tt("音频选区") : tt("整段音频"),
      controls: [
        ...(selection
          ? [
              {
                id: "crop",
                kind: "action" as const,
                label: tt("裁剪保留"),
                icon: "crop" as const,
                iconOnly: true,
                disabled: editor.loading,
              },
              {
                id: "delete",
                kind: "action" as const,
                label: tt("删除选区"),
                icon: "delete" as const,
                iconOnly: true,
                danger: true,
                disabled: editor.loading,
              },
            ]
          : []),
        {
          id: "fade-duration",
          kind: "range",
          label: tt("淡变"),
          value: editor.fadeDuration,
          min: 0.1,
          max: 5,
          step: 0.1,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "audio-fades",
          inspectorLabel: tt("淡入淡出"),
          inspectorIcon: "effects",
        },
        {
          id: "fade-in",
          kind: "action",
          label: tt("淡入"),
          icon: "effects",
          iconOnly: true,
          disabled: editor.loading,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "audio-fades",
          inspectorLabel: tt("淡入淡出"),
          inspectorIcon: "effects",
        },
        {
          id: "fade-out",
          kind: "action",
          label: tt("淡出"),
          icon: "effects",
          iconOnly: true,
          disabled: editor.loading,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "audio-fades",
          inspectorLabel: tt("淡入淡出"),
          inspectorIcon: "effects",
        },
        {
          id: "gain",
          kind: "range",
          label: tt("音量增益"),
          value: editor.gain,
          min: 0,
          max: 200,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "audio-gain",
          inspectorLabel: tt("音量增益"),
          inspectorIcon: "effects",
        },
        {
          id: "apply-gain",
          kind: "action",
          label: tt("应用增益"),
          icon: "effects",
          iconOnly: true,
          disabled: editor.loading,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "audio-gain",
          inspectorLabel: tt("音量增益"),
          inspectorIcon: "effects",
        },
        {
          id: "effect-speed",
          kind: "range",
          label: tt("选区速度"),
          value: editor.effectSpeed,
          min: 0.5,
          max: 2,
          step: 0.05,
          slot: "inspector",
          inspectorGroup: "audio-effect-chain",
          inspectorLabel: tt("选区效果链"),
          inspectorIcon: "effects",
        },
        {
          id: "eq-low",
          kind: "range",
          label: tt("低频"),
          value: editor.lowEq,
          min: -24,
          max: 24,
          step: 1,
          suffix: " dB",
          slot: "inspector",
          inspectorGroup: "audio-effect-chain",
          inspectorLabel: tt("选区效果链"),
          inspectorIcon: "effects",
        },
        {
          id: "eq-mid",
          kind: "range",
          label: tt("中频"),
          value: editor.midEq,
          min: -24,
          max: 24,
          step: 1,
          suffix: " dB",
          slot: "inspector",
          inspectorGroup: "audio-effect-chain",
          inspectorLabel: tt("选区效果链"),
          inspectorIcon: "effects",
        },
        {
          id: "eq-high",
          kind: "range",
          label: tt("高频"),
          value: editor.highEq,
          min: -24,
          max: 24,
          step: 1,
          suffix: " dB",
          slot: "inspector",
          inspectorGroup: "audio-effect-chain",
          inspectorLabel: tt("选区效果链"),
          inspectorIcon: "effects",
        },
        {
          id: "apply-effects",
          kind: "action",
          label: tt("应用效果链"),
          icon: "effects",
          iconOnly: true,
          disabled: editor.loading || !selection,
          slot: "inspector",
          inspectorGroup: "audio-effect-chain",
          inspectorLabel: tt("选区效果链"),
          inspectorIcon: "effects",
        },
      ],
    }),
    [
      editor.effectSpeed,
      editor.fadeDuration,
      editor.gain,
      editor.highEq,
      editor.loading,
      editor.lowEq,
      editor.midEq,
      selection,
      tt,
    ],
  );
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    switch (message.controlId) {
      case "crop":
        editor.cropSelection();
        break;
      case "delete":
        editor.deleteSelection();
        break;
      case "fade-duration":
        if (typeof message.value === "number") editor.setFadeDuration(message.value);
        break;
      case "fade-in":
        editor.applyFade("in");
        break;
      case "fade-out":
        editor.applyFade("out");
        break;
      case "gain":
        if (typeof message.value === "number") editor.setGain(message.value);
        break;
      case "apply-gain":
        editor.applyGain();
        break;
      case "effect-speed":
        if (typeof message.value === "number") {
          editor.setEffectSpeed(message.value);
        }
        break;
      case "eq-low":
        if (typeof message.value === "number") editor.setLowEq(message.value);
        break;
      case "eq-mid":
        if (typeof message.value === "number") editor.setMidEq(message.value);
        break;
      case "eq-high":
        if (typeof message.value === "number") editor.setHighEq(message.value);
        break;
      case "apply-effects":
        editor.applyEffectChain();
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
