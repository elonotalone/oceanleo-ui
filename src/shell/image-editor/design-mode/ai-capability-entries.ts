/**
 * Entry points for the four AI capabilities the engine already implements, plus
 * "AI 重绘改字" as a text-object action (task criterion 4).
 *
 * The gap this closes is not the engine — `image-capability-engine.ts` has had
 * `inpaint` / `outpaint` / `upscale` providers and a `remove-bg` direct command
 * for a while, and the creation panel renders them. What was missing is an
 * entry point on L1 (edit bar) and L2 (left console): reaching them meant
 * knowing which panel to open. These definitions are what the command surface
 * turns into commands.
 *
 * Ids are the engine's own ids, not new ones, so one action stays one command
 * with one history entry (five-layer spec §2 rule 2).
 */

import type {
  ImageAiCommandId,
  ImageDirectCommandId,
} from "../image-capability-engine";

/**
 * Rewriting the pixels behind a text object with `qwen-image-edit-plus` is not
 * one of the engine's provider commands: it takes a text object rather than the
 * canvas, so it is named separately here and routed by the command surface.
 */
export const AI_REWRITE_TEXT_ID = "rewrite-text" as const;

export type AiEntryId =
  | ImageAiCommandId
  | ImageDirectCommandId
  | typeof AI_REWRITE_TEXT_ID;

export interface AiCapabilityEntry {
  id: AiEntryId;
  label: string;
  summary: string;
  /** Whether an object must be selected before the action means anything. */
  requiresSelection: boolean;
  /** Restricts the action to certain selected object types. */
  selectionTypes?: readonly string[];
  /** Shown directly on the edit bar (L1) rather than only in the panel (L2). */
  onEditBar: boolean;
  /** Which left-console section it belongs to (L2). */
  section: "ai" | "text";
  /** Costs a provider call, so it needs the confirm-and-receipt path. */
  billable: boolean;
}

export const AI_CAPABILITY_ENTRIES: readonly AiCapabilityEntry[] = Object.freeze([
  {
    id: "remove-bg",
    label: "抠图",
    summary: "去掉背景，只留主体，结果作为新图层放上来。",
    requiresSelection: false,
    onEditBar: true,
    section: "ai",
    billable: true,
  },
  {
    id: "inpaint",
    label: "AI 擦除 / 局部重绘",
    summary: "把选中区域交给 AI 重画，用来去水印、去杂物或换掉一个物件。",
    requiresSelection: true,
    selectionTypes: ["image"],
    onEditBar: true,
    section: "ai",
    billable: true,
  },
  {
    id: "outpaint",
    label: "AI 扩图",
    summary: "把画面向外补出来，用于换尺寸时补足边缘。",
    requiresSelection: false,
    onEditBar: true,
    section: "ai",
    billable: true,
  },
  {
    id: "upscale",
    label: "高清放大",
    summary: "放大 2 倍或 4 倍并补细节，适合印刷前处理。",
    requiresSelection: false,
    onEditBar: false,
    section: "ai",
    billable: true,
  },
  {
    id: AI_REWRITE_TEXT_ID,
    label: "AI 重绘改字",
    summary: "改写选中文字，并用 qwen-image-edit-plus 重绘它所在的画面区域。",
    requiresSelection: true,
    selectionTypes: ["textbox", "i-text", "text"],
    onEditBar: true,
    section: "text",
    billable: true,
  },
]);

export interface AiSelectionContext {
  hasSelection: boolean;
  /** Fabric `type` of the selected object, when exactly one is selected. */
  selectedType?: string;
}

export function applicableAiEntries(
  context: AiSelectionContext,
): readonly AiCapabilityEntry[] {
  return AI_CAPABILITY_ENTRIES.filter((entry) => {
    if (entry.requiresSelection && !context.hasSelection) return false;
    if (!entry.selectionTypes) return true;
    // A selection-typed action with an unknown type stays hidden rather than
    // being offered on a guess: running inpaint on a text object burns a paid
    // provider call and returns something the user did not ask for.
    if (!context.selectedType) return false;
    return entry.selectionTypes.includes(context.selectedType);
  });
}

/** The L1 subset: what the edit bar shows for the current selection. */
export function editBarAiEntries(
  context: AiSelectionContext,
): readonly AiCapabilityEntry[] {
  return applicableAiEntries(context).filter((entry) => entry.onEditBar);
}

/** The L2 subset: the left console groups by section. */
export function panelAiEntries(
  context: AiSelectionContext,
  section: AiCapabilityEntry["section"],
): readonly AiCapabilityEntry[] {
  return applicableAiEntries(context).filter((entry) => entry.section === section);
}
