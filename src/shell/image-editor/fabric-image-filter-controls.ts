import type { UITranslate } from "../../i18n/ui/useUI";
import type { SelectionControl } from "../selection-context";
import type { FilterSettings } from "./types";

export function fabricImageFilterControls(
  filters: FilterSettings,
  tt: UITranslate,
): SelectionControl[] {
  const group = {
    placement: "more" as const,
    slot: "inspector" as const,
    inspectorGroup: "image-filters",
    inspectorLabel: tt("滤镜调整"),
    inspectorIcon: "filter" as const,
  };
  return [
    {
      id: "brightness",
      kind: "range",
      label: tt("亮度"),
      value: filters.brightness,
      min: -100,
      max: 100,
      ...group,
    },
    {
      id: "contrast",
      kind: "range",
      label: tt("对比度"),
      value: filters.contrast,
      min: -100,
      max: 100,
      ...group,
    },
    {
      id: "saturation",
      kind: "range",
      label: tt("饱和度"),
      value: filters.saturation,
      min: -100,
      max: 100,
      ...group,
    },
    {
      id: "grayscale",
      kind: "toggle",
      label: tt("黑白"),
      value: filters.grayscale,
      ...group,
    },
    {
      id: "filter-reset",
      kind: "action",
      label: tt("重置滤镜"),
      ...group,
    },
  ];
}
