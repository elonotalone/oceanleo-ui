import type { UITranslate } from "../../i18n/ui/useUI";
import type { SelectionControl } from "../selection-context";
import type { DeckElement } from "./deck-schema";

export function deckElementAnimationControls(
  element: DeckElement,
  tt: UITranslate,
): SelectionControl[] {
  const group = {
    slot: "inspector" as const,
    inspectorGroup: "deck-object-animation",
    inspectorLabel: tt("进入动画"),
    inspectorIcon: "animate" as const,
  };
  return [
    {
      id: "animation",
      kind: "select",
      label: tt("进入动画"),
      value: element.animation?.type || "none",
      options: [
        { value: "none", label: tt("无") },
        { value: "fade", label: tt("淡入") },
        { value: "fly-up", label: tt("向上飞入") },
        { value: "wipe", label: tt("擦除") },
        { value: "zoom", label: tt("缩放") },
      ],
      ...group,
    },
    ...(element.animation
      ? [
          {
            id: "animation-duration",
            kind: "range" as const,
            label: tt("动画时长"),
            value: element.animation.durationMs,
            min: 100,
            max: 3_000,
            step: 50,
            ...group,
          },
          {
            id: "animation-delay",
            kind: "range" as const,
            label: tt("延迟"),
            value: element.animation.delayMs,
            min: 0,
            max: 10_000,
            step: 50,
            ...group,
          },
        ]
      : []),
  ];
}
