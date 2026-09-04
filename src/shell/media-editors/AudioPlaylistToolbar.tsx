"use client";

import { useMemo } from "react";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import {
  AUDIO_SELECTION_KIND_REGION,
  AUDIO_SELECTION_KIND_TRACK,
} from "./audio-next-l4-chips";
import type { AudioPlaylistSelection } from "./audio-playlist-engine";

export function AudioPlaylistToolbar({
  selection,
  fadeDuration,
  gain,
  loading,
  accent = "#4f46e5",
  disabled = false,
  onCommand,
}: {
  selection: AudioPlaylistSelection | null;
  fadeDuration: number;
  gain: number;
  loading: boolean;
  accent?: string;
  disabled?: boolean;
  onCommand: (id: string, value?: number) => void;
}) {
  const hasSelection = Boolean(
    selection && selection.end > selection.start,
  );
  const busy = loading || disabled;
  const context = useMemo<SelectionContext>(
    () => ({
      version: 1,
      kind: hasSelection
        ? AUDIO_SELECTION_KIND_REGION
        : AUDIO_SELECTION_KIND_TRACK,
      id: hasSelection
        ? `region:${Math.round((selection?.start || 0) * 1_000)}-${Math.round((selection?.end || 0) * 1_000)}`
        : "audio-track",
      label: hasSelection ? "音频选区" : "整段音频",
      controls: [
        {
          id: "split",
          kind: "action" as const,
          label: "分割（选区）",
          icon: "crop" as const,
          iconOnly: true,
          disabled: busy,
        },
        ...(hasSelection
          ? [
              {
                id: "crop",
                kind: "action" as const,
                label: "裁剪保留",
                icon: "crop" as const,
                iconOnly: true,
                disabled: busy,
              },
              {
                id: "delete",
                kind: "action" as const,
                label: "删除选区",
                icon: "delete" as const,
                iconOnly: true,
                danger: true,
                disabled: busy,
              },
            ]
          : []),
        {
          id: "fade-duration",
          kind: "range" as const,
          label: "淡变",
          value: fadeDuration,
          min: 0.1,
          max: 5,
          step: 0.1,
          placement: "more" as const,
          slot: "inspector" as const,
          inspectorGroup: "audio-fades",
          inspectorLabel: "淡入淡出",
          inspectorIcon: "effects" as const,
        },
        {
          id: "fade-in",
          kind: "action" as const,
          label: "淡入",
          icon: "effects" as const,
          iconOnly: true,
          disabled: busy,
          placement: "more" as const,
          slot: "inspector" as const,
          inspectorGroup: "audio-fades",
          inspectorLabel: "淡入淡出",
          inspectorIcon: "effects" as const,
        },
        {
          id: "fade-out",
          kind: "action" as const,
          label: "淡出",
          icon: "effects" as const,
          iconOnly: true,
          disabled: busy,
          placement: "more" as const,
          slot: "inspector" as const,
          inspectorGroup: "audio-fades",
          inspectorLabel: "淡入淡出",
          inspectorIcon: "effects" as const,
        },
        {
          id: "gain",
          kind: "range" as const,
          label: "音量增益",
          value: gain,
          min: 0,
          max: 200,
          placement: "more" as const,
          slot: "inspector" as const,
          inspectorGroup: "audio-gain",
          inspectorLabel: "音量增益",
          inspectorIcon: "effects" as const,
        },
        {
          id: "apply-gain",
          kind: "action" as const,
          label: "应用增益",
          icon: "effects" as const,
          iconOnly: true,
          disabled: busy,
          placement: "more" as const,
          slot: "inspector" as const,
          inspectorGroup: "audio-gain",
          inspectorLabel: "音量增益",
          inspectorIcon: "effects" as const,
        },
        {
          id: "mute",
          kind: "action" as const,
          label: "静音",
          icon: "effects" as const,
          iconOnly: true,
          disabled: busy,
          slot: "inspector" as const,
          inspectorGroup: "audio-gain",
          inspectorLabel: "音量增益",
          inspectorIcon: "effects" as const,
        },
      ],
    }),
    [busy, fadeDuration, gain, hasSelection, selection],
  );

  const command = (message: SelectionCommand) => {
    if (message.phase && message.phase !== "commit") return;
    if (message.controlId === "gain" || message.controlId === "fade-duration") {
      if (typeof message.value === "number") {
        onCommand(message.controlId, message.value);
      }
      return;
    }
    onCommand(message.controlId);
  };

  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
