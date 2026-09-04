/**
 * 宿主侧审阅收件箱：Native 编辑器把 `review-proposal` 交到这里；选区与 chips 也走这里。
 *
 * 编辑器目录我不能改。W03 今天 `buildGridReviewProposal` 之后没有把提案交出来——
 * 请改成调 `submitAgentReviewProposal`。在那之前，agent 闸仍会把 mutates 的 `run()`
 * 拦下来自己造一份提案。
 */
import type { EditorAgentChip, EditorReviewProposal } from "../hosted-editor/index";
import { validAgentChips, validReviewProposal } from "../hosted-editor/index";
import type { SelectionContext } from "../selection-context-types";
import { hostReviewSession, type ParkedReview } from "./session";
import {
  selectionToAgent,
  type AgentSelection,
} from "./selection-bridge";

const chipStore = new Map<string, EditorAgentChip[]>();
let currentSelection: AgentSelection | null = null;
const mentionCatalog: AgentSelection[] = [];
const selectionListeners = new Set<() => void>();
const chipListeners = new Set<() => void>();

function emit(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

export function submitAgentReviewProposal(
  parked: ParkedReview,
  liveRevision: number,
): "ok" | "invalid" | "stale" {
  return hostReviewSession.receive(parked, liveRevision);
}

export function submitRawReviewProposal(
  proposal: EditorReviewProposal,
  extras: {
    liveRevision: number;
    editorId: string;
    params?: Record<string, unknown>;
    inverseParams?: Record<string, unknown>;
  },
): "ok" | "invalid" | "stale" {
  if (!validReviewProposal(proposal)) return "invalid";
  return submitAgentReviewProposal(
    {
      proposal,
      params: extras.params || {},
      inverseParams: extras.inverseParams || {},
      editorId: extras.editorId,
    },
    extras.liveRevision,
  );
}

export function publishAgentSelection(
  sel: SelectionContext | AgentSelection | null,
  editorId?: string,
): AgentSelection | null {
  const next =
    sel && "summary" in sel && "kind" in sel && "id" in sel && !("controls" in sel)
      ? (sel as AgentSelection)
      : selectionToAgent(sel as SelectionContext | null, editorId);
  currentSelection = next;
  if (next) {
    const idx = mentionCatalog.findIndex(
      (item) => item.kind === next.kind && item.id === next.id,
    );
    if (idx >= 0) mentionCatalog.splice(idx, 1);
    mentionCatalog.unshift(next);
    if (mentionCatalog.length > 24) mentionCatalog.pop();
  }
  emit(selectionListeners);
  return next;
}

export function readAgentSelection(): AgentSelection | null {
  return currentSelection;
}

export function readMentionCatalog(): AgentSelection[] {
  return mentionCatalog.slice();
}

export function subscribeAgentSelection(listener: () => void): () => void {
  selectionListeners.add(listener);
  return () => {
    selectionListeners.delete(listener);
  };
}

export function rememberEditorChips(
  editorId: string,
  chips: readonly EditorAgentChip[] | undefined,
): boolean {
  const id = String(editorId || "").trim();
  if (!id) return false;
  if (!chips || chips.length === 0) {
    chipStore.delete(id);
    emit(chipListeners);
    return true;
  }
  const copy = chips.map((chip) => ({ ...chip, appliesTo: [...chip.appliesTo] }));
  if (!validAgentChips(copy)) return false;
  chipStore.set(id, copy);
  emit(chipListeners);
  return true;
}

export function rememberedChips(editorId: string): EditorAgentChip[] | null {
  return chipStore.get(editorId) || null;
}

export function subscribeEditorChips(listener: () => void): () => void {
  chipListeners.add(listener);
  return () => {
    chipListeners.delete(listener);
  };
}

export function resetAgentReviewInbox(): void {
  chipStore.clear();
  currentSelection = null;
  mentionCatalog.length = 0;
  hostReviewSession.reset();
  emit(selectionListeners);
  emit(chipListeners);
}
