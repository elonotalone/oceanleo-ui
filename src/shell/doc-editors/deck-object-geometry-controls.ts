import type { UITranslate } from "../../i18n/ui/useUI";
import type { SelectionControl } from "../selection-context";
import type { DeckElement } from "./deck-schema";

/**
 * Deck object X/Y/W/H/rotation. Inspector-only: these must not appear as
 * compact number fields on the primary edit bar.
 */
export function deckObjectGeometryControls(
  element: Pick<DeckElement, "x" | "y" | "width" | "height" | "rotation">,
  tt: UITranslate,
): SelectionControl[] {
  const inspector = {
    placement: "more" as const,
    slot: "inspector" as const,
    inspectorGroup: "deck-object-geometry",
    inspectorLabel: tt("位置与尺寸"),
    inspectorIcon: "position" as const,
  };
  return [
    {
      id: "x",
      kind: "number",
      label: "X",
      suffix: "%",
      value: element.x,
      ...inspector,
    },
    {
      id: "y",
      kind: "number",
      label: "Y",
      suffix: "%",
      value: element.y,
      ...inspector,
    },
    {
      id: "width",
      kind: "number",
      label: tt("宽") + " %",
      value: element.width,
      suffix: "%",
      ...inspector,
    },
    {
      id: "height",
      kind: "number",
      label: tt("高") + " %",
      value: element.height,
      suffix: "%",
      ...inspector,
    },
    {
      id: "rotation",
      kind: "number",
      label: tt("旋转"),
      value: element.rotation,
      ...inspector,
    },
  ];
}
