/**
 * Remaining AI entry points offered in the image editor after the 2026-10-21
 * retirement of 抠图 / 放大高清 / 人像精修 / 重新打光 / 扩展画面 / 全景延展.
 *
 * `inpaint` stays as a selection-scoped erase (L4 去水印/擦除). `rewrite-text`
 * stays as a text-object action. Retired ids must not appear here.
 */

import type {
  ImageAiCommandId,
  ImageDirectCommandId,
} from "../image-capability-engine";

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
