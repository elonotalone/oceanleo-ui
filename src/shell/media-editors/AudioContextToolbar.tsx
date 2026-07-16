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
                icon: "crop",
                disabled: editor.loading,
                group: "edit",
              },
              {
                id: "delete",
                kind: "action" as const,
                label: tt("删除选区"),
                icon: "delete",
                danger: true,
                disabled: editor.loading,
                group: "edit",
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
        },
        {
          id: "fade-in",
          kind: "action",
          label: tt("淡入"),
          disabled: editor.loading,
          placement: "more",
        },
        {
          id: "fade-out",
          kind: "action",
          label: tt("淡出"),
          disabled: editor.loading,
          placement: "more",
        },
        {
          id: "gain",
          kind: "range",
          label: tt("音量增益"),
          icon: "volume",
          value: editor.gain,
          min: 0,
          max: 200,
          placement: "more",
        },
        {
          id: "apply-gain",
          kind: "action",
          label: tt("应用增益"),
          icon: "wand",
          disabled: editor.loading,
          placement: "more",
        },
      ],
    }),
    [editor.fadeDuration, editor.gain, editor.loading, selection, tt],
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
