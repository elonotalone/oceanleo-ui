/**
 * Live chrome contract for the image editor (W3 2026-10-21).
 *
 * ImageRoute, the AI entry lists, and the L4 chips all read from the same
 * tables. Tests import these builders instead of grepping source strings.
 */

import { AI_CAPABILITY_ENTRIES } from "./design-mode/ai-capability-entries";
import { IMAGE_DESIGN_L4_CHIPS } from "./design-mode/l4-chips";
import { IMAGE_AI_PANEL_CAPABILITIES } from "./image-capability-engine";

export const IMAGE_EDITOR_RETIRED_AI_IDS = [
  "remove-bg",
  "upscale",
  "portrait-quality",
  "relight",
  "outpaint",
  "panorama",
] as const;

export const IMAGE_EDITOR_RETIRED_AI_LABELS = [
  "抠图",
  "Background removal",
  "放大高清",
  "人像精修",
  "重新打光",
  "扩展画面",
  "全景延展",
  "补充说明（选填）",
  "抠图（背景变透明）",
] as const;

export const imageRouteChrome = Object.freeze({
  canvasViewSwitch: false,
  aiDrawer: false,
  cutoutAction: false,
});

export function imageEditorOfferedUiAiIds(): string[] {
  const ids = new Set<string>();
  for (const entry of AI_CAPABILITY_ENTRIES) ids.add(entry.id);
  for (const entry of IMAGE_AI_PANEL_CAPABILITIES) ids.add(String(entry.id));
  for (const chip of IMAGE_DESIGN_L4_CHIPS) {
    if (chip.commandId.startsWith("image.ai.")) {
      ids.add(chip.commandId.slice("image.ai.".length));
    }
  }
  return [...ids];
}

export function imageEditorOfferedUiAiLabels(): string[] {
  const labels: string[] = [];
  for (const entry of AI_CAPABILITY_ENTRIES) labels.push(entry.label);
  for (const entry of IMAGE_AI_PANEL_CAPABILITIES) labels.push(entry.label);
  for (const chip of IMAGE_DESIGN_L4_CHIPS) {
    if (chip.commandId.startsWith("image.ai.")) labels.push(chip.label);
  }
  return labels;
}
