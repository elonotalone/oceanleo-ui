"use client";

// Extra buttons in the message multi-select bar (task rooms wave 2026-11-20, TU1 slot).
// Other code adds an action without editing ConversationView: register a component once;
// it renders in every selection bar whose conversation it applies to (default: every
// conversation except a task's own conversation, which has its own task actions).
import { useSyncExternalStore, type ComponentType } from "react";
import type { ImConversationDetail, ImMessage } from "../../../lib/im/types";

export interface MessageSelectionContext {
  conversationId: string;
  conversation: ImConversationDetail | null;
  viewerId: string | null;
  /** Selected messages that are loaded, oldest first. */
  selectedMessages: ImMessage[];
  /** Every selected id (may include messages not loaded in the list). */
  selectedMessageIds: ReadonlySet<string>;
  setSelectedMessageIds: (ids: Iterable<string>) => void;
  /** Leaves select mode and clears the selection (call after the action succeeded). */
  exitSelection: () => void;
}

export interface MessageSelectionAction {
  /** Unique; registering the same id again replaces the earlier one. */
  id: string;
  /** Lower renders further left; built-in Forward / Delete / Done stay after the slot. */
  order?: number;
  /** Default: every conversation except `kind === "task"`. Per-instance actions ignore it. */
  appliesTo?: (conversation: ImConversationDetail | null) => boolean;
  /**
   * Per-instance actions only: registered actions this one stands in for (hidden in that bar). A task view over a
   * project chat offers its own "New task from selected messages" instead of LeoChat's start-task.
   */
  replaces?: readonly string[];
  /** Renders its own button (and any dialog it opens); may use hooks. Return null to hide. */
  Component: ComponentType<{ ctx: MessageSelectionContext }>;
}

let actions: MessageSelectionAction[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) listener();
}

export function registerMessageSelectionAction(action: MessageSelectionAction): () => void {
  actions = [...actions.filter((item) => item.id !== action.id), action];
  emit();
  return () => {
    if (!actions.includes(action)) return;
    actions = actions.filter((item) => item !== action);
    emit();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The registered actions now (the hook below reads the same list). */
export function registeredSelectionActions(): readonly MessageSelectionAction[] {
  return actions;
}

const read = () => actions;

export function useMessageSelectionActions(): MessageSelectionAction[] {
  return useSyncExternalStore(subscribe, read, read);
}

export function defaultAppliesTo(conversation: ImConversationDetail | null): boolean {
  return conversation?.kind !== "task";
}

/** Registered actions for this conversation plus the host's own, ordered. */
export function selectionActionsFor(
  registered: readonly MessageSelectionAction[],
  own: readonly MessageSelectionAction[],
  conversation: ImConversationDetail | null,
): MessageSelectionAction[] {
  const applicable = registered.filter((action) => (action.appliesTo ?? defaultAppliesTo)(conversation));
  const ownIds = new Set(own.flatMap((action) => [action.id, ...(action.replaces ?? [])]));
  return [...own, ...applicable.filter((action) => !ownIds.has(action.id))]
    .map((action, index) => ({ action, index }))
    .sort((a, b) => (a.action.order ?? 0) - (b.action.order ?? 0) || a.index - b.index)
    .map(({ action }) => action);
}
