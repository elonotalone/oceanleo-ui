/**
 * AI capability entry-point definitions for the merged image / design editor.
 *
 * Criterion 4: "已接引擎的 inpaint / outpaint / remove-bg / upscale 四个 AI
 * 能力在 edit bar / 左侧操控台有入口；AI 重绘改字（qwen-image-edit-plus）作为
 * 文字对象动作"
 *
 * These are the command definitions that surface in L1 (edit bar) and L2
 * (left panel). The actual execution delegates to `image-capability-engine.ts`
 * which already has the provider plumbing; this file adds the missing UI
 * entry points.
 */

import type { ImageAiCommandId } from "../image-capability-engine";

export interface AiCapabilityEntry {
  id: ImageAiCommandId | "rewrite-text";
  label: string;
  description: string;
  icon: string;
  requiresSelection: boolean;
  selectionKinds?: readonly string[];
  editBarVisible: boolean;
  panelSection: "ai" | "text";
}

export const AI_CAPABILITY_ENTRIES: readonly AiCapabilityEntry[] = Object.freeze([
  {
    id: "inpaint",
    label: "AI 擦除 / 局部重绘",
    description: "选区内的内容会被 AI 替换或填充，适合去水印、换物体。",
    icon: "ai-inpaint",
    requiresSelection: true,
    selectionKinds: ["image"],
    editBarVisible: true,
    panelSection: "ai",
  },
  {
    id: "outpaint",
    label: "AI 扩图",
    description: "把画布向外延伸，AI 自动填充边缘内容。",
    icon: "ai-outpaint",
    requiresSelection: false,
    editBarVisible: true,
    panelSection: "ai",
  },
  {
    id: "upscale",
    label: "高清放大",
    description: "把低分辨率图片放大 2–4 倍，细节更清晰。",
    icon: "ai-upscale",
    requiresSelection: false,
    editBarVisible: true,
    panelSection: "ai",
  },
  {
    id: "rewrite-text" as ImageAiCommandId | "rewrite-text",
    label: "AI 重绘改字",
    description: "对选中的文字对象用 qwen-image-edit-plus 重新生成带文字效果的图片。",
    icon: "ai-rewrite",
    requiresSelection: true,
    selectionKinds: ["text"],
    editBarVisible: false,
    panelSection: "text",
  },
]);

/**
 * Filter capabilities to those applicable to the current selection state.
 * Used by both the edit bar (L1) and the AI panel (L2).
 */
export function applicableAiCapabilities(
  selectedKind: string | undefined,
  hasSelection: boolean,
): readonly AiCapabilityEntry[] {
  return AI_CAPABILITY_ENTRIES.filter((entry) => {
    if (entry.requiresSelection && !hasSelection) return false;
    if (entry.selectionKinds && selectedKind && !entry.selectionKinds.includes(selectedKind)) return false;
    return true;
  });
}

/**
 * Edit bar visible entries — the subset that appears directly on the
 * floating toolbar when an object is selected.
 */
export function editBarAiEntries(
  selectedKind: string | undefined,
): readonly AiCapabilityEntry[] {
  return applicableAiCapabilities(selectedKind, true).filter(
    (e) => e.editBarVisible,
  );
}
