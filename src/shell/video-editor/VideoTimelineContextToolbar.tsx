"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import type { VideoTimelineState } from "./use-video-timeline";
import type { TimelineClip, TimelineTextStyle, TransitionType } from "./types";

function number(value: SelectionCommand["value"], fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function VideoTimelineContextToolbar({
  state,
  accent = "#4f46e5",
}: {
  state: VideoTimelineState;
  accent?: string;
}) {
  const tt = useUI();
  const located = state.selected;
  const context = useMemo<SelectionContext | null>(() => {
    if (!located) return null;
    const { clip, track } = located;
    const style = clip.style || {};
    const controls: SelectionControl[] = [];
    if (track.kind === "text") {
      controls.push(
        {
          id: "text",
          kind: "text",
          label: tt("文字"),
          value: clip.text || "",
          group: "text",
        },
        {
          id: "font-size",
          kind: "number",
          label: tt("字号"),
          icon: "font-size",
          value: style.font_size ?? 64,
          min: 16,
          max: 240,
          group: "text",
        },
        {
          id: "color",
          kind: "color",
          label: tt("颜色"),
          value: style.color || "#ffffff",
          group: "color",
        },
        {
          id: "bold",
          kind: "toggle",
          label: tt("加粗"),
          icon: "bold",
          iconOnly: true,
          value: style.bold === true,
          group: "style",
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          icon: "align-left",
          value: style.align || "center",
          options: [
            { value: "left", label: tt("左") },
            { value: "center", label: tt("中") },
            { value: "right", label: tt("右") },
          ],
          group: "align",
        },
      );
    }
    if (track.kind === "video" || track.kind === "audio") {
      controls.push(
        {
          id: "volume",
          kind: "range",
          label: tt("音量"),
          value: Math.round((clip.volume ?? 1) * 100),
          min: 0,
          max: 200,
          group: "audio",
        },
        {
          id: "muted",
          kind: "toggle",
          label: tt("静音"),
          icon: "volume",
          iconOnly: true,
          value: clip.muted === true,
          group: "audio",
        },
        {
          id: "speed",
          kind: "select",
          label: tt("速度"),
          icon: "speed",
          value: String(clip.speed ?? 1),
          options: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((value) => ({
            value: String(value),
            label: `${value}x`,
          })),
          group: "playback",
        },
      );
    }
    if (track.kind === "video" || track.kind === "image") {
      controls.push(
        ...(track.kind === "video"
          ? [
              {
                id: "fit",
                kind: "select" as const,
                label: tt("适配"),
                icon: "crop",
                value: clip.fit || "contain",
                options: [
                  { value: "contain", label: tt("完整") },
                  { value: "cover", label: tt("铺满") },
                  { value: "stretch", label: tt("拉伸") },
                ],
                group: "layout",
              },
            ]
          : []),
        {
          id: "scale",
          kind: "range",
          label: tt("缩放"),
          value: Math.round(
            (clip.scale ?? (track.kind === "video" ? 1 : 0.35)) * 100,
          ),
          min: 5,
          max: 200,
          group: "transform",
        },
        {
          id: "opacity",
          kind: "range",
          label: tt("透明度"),
          value: Math.round((clip.opacity ?? 1) * 100),
          min: 0,
          max: 100,
          placement: "more",
        },
        {
          id: "rotation",
          kind: "range",
          label: tt("旋转"),
          icon: "rotate",
          value: clip.rotation ?? 0,
          min: -180,
          max: 180,
          placement: "more",
        },
        {
          id: "x",
          kind: "range",
          label: tt("横向"),
          value: Math.round((clip.x ?? 0.5) * 100),
          min: 0,
          max: 100,
          placement: "more",
        },
        {
          id: "y",
          kind: "range",
          label: tt("纵向"),
          value: Math.round((clip.y ?? 0.5) * 100),
          min: 0,
          max: 100,
          placement: "more",
        },
      );
      if (track.kind === "video") {
        controls.push(
          {
            id: "brightness",
            kind: "range",
            label: tt("亮度"),
            value: Math.round((clip.brightness ?? 0) * 100),
            min: -100,
            max: 100,
            placement: "more",
          },
          {
            id: "contrast",
            kind: "range",
            label: tt("对比度"),
            value: Math.round((clip.contrast ?? 1) * 100),
            min: 0,
            max: 200,
            placement: "more",
          },
          {
            id: "saturation",
            kind: "range",
            label: tt("饱和度"),
            value: Math.round((clip.saturation ?? 1) * 100),
            min: 0,
            max: 300,
            placement: "more",
          },
        );
      }
    }
    controls.push(
      {
        id: "transition",
        kind: "select",
        label: tt("转场"),
        value: clip.transition_in?.type || "",
        options: [
          { value: "", label: tt("无") },
          { value: "fade", label: tt("淡入") },
          { value: "crossfade", label: tt("交叉溶解") },
          { value: "black", label: tt("黑场") },
        ],
        placement: "more",
      },
      ...(clip.transition_in
        ? [
            {
              id: "transition-duration",
              kind: "range" as const,
              label: tt("转场时长"),
              value: clip.transition_in.duration_ms,
              min: 100,
              max: 3_000,
              step: 50,
              placement: "more" as const,
            },
          ]
        : []),
      {
        id: "duplicate",
        kind: "action",
        label: tt("复制"),
        icon: "duplicate",
        placement: "more",
      },
      {
        id: "delete",
        kind: "action",
        label: tt("删除"),
        icon: "delete",
        danger: true,
        placement: "more",
      },
    );
    return {
      version: 1,
      kind: `${track.kind}-clip`,
      id: clip.id,
      label: tt("{kind} 片段", { kind: track.kind }),
      controls,
    };
  }, [located, tt]);

  if (!context || !located) return null;
  const { clip } = located;
  const patch = (next: Partial<TimelineClip>) => state.patchClip(clip.id, next);
  const patchStyle = (next: Partial<TimelineTextStyle>) =>
    patch({ style: { ...(clip.style || {}), ...next } });
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== clip.id) return;
    switch (message.controlId) {
      case "text":
        patch({ text: String(message.value ?? "") });
        break;
      case "font-size":
        patchStyle({ font_size: number(message.value, 64) });
        break;
      case "color":
        patchStyle({ color: String(message.value || "#ffffff") });
        break;
      case "bold":
        patchStyle({ bold: message.value === true });
        break;
      case "align":
        if (["left", "center", "right"].includes(String(message.value))) {
          patchStyle({ align: message.value as TimelineTextStyle["align"] });
        }
        break;
      case "volume":
        patch({ volume: number(message.value, 100) / 100 });
        break;
      case "muted":
        patch({ muted: message.value === true });
        break;
      case "speed":
        state.setClipSpeed(clip.id, Number(message.value) || 1);
        break;
      case "fit":
        if (["contain", "cover", "stretch"].includes(String(message.value))) {
          patch({ fit: message.value as TimelineClip["fit"] });
        }
        break;
      case "scale":
      case "opacity":
      case "x":
      case "y":
        patch({ [message.controlId]: number(message.value) / 100 });
        break;
      case "rotation":
        patch({ rotation: number(message.value) });
        break;
      case "brightness":
      case "contrast":
      case "saturation":
        patch({ [message.controlId]: number(message.value) / 100 });
        break;
      case "transition": {
        const type = String(message.value) as TransitionType | "";
        patch({
          transition_in: type
            ? {
                type,
                duration_ms: clip.transition_in?.duration_ms || 500,
              }
            : undefined,
        });
        break;
      }
      case "transition-duration":
        if (clip.transition_in) {
          patch({
            transition_in: {
              ...clip.transition_in,
              duration_ms: number(message.value, 500),
            },
          });
        }
        break;
      case "duplicate":
        state.duplicateSelectedClip();
        break;
      case "delete":
        state.deleteSelectedClip();
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
