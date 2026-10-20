"use client";

import {
  EditBarSelectionSessionContext,
  useEditBarSelectionSession,
} from "../edit-bar-selection-session";
import type { SelectionInteractionChange } from "../edit-bar-hosted-selection-hold";
import type { SelectionCommand, SelectionContext } from "../selection-context";
import { SelectionToolbarControl } from "../SelectionToolbarControl";
import { DECK_HOSTED_SELECT_OBJECT_HINT } from "./deck-hosted-selection-command";

/**
 * Hosted-deck L1 uses the shared edit-bar controls and hold session.
 * It does not import `SelectionToolbar` itself: that file publishes to
 * agent-review, and compiling DeckHostedRoute with a stubbed hosted-editor
 * (G4 / D1) would rewrite `validReviewProposal` to a hole.
 */
export function DeckHostedContextToolbar({
  context,
  onCommand,
  onSelectionInteractionChange,
  accent = "#4f46e5",
  readOnly = false,
}: {
  context: SelectionContext | null;
  onCommand: (command: SelectionCommand) => void;
  onSelectionInteractionChange?: SelectionInteractionChange;
  accent?: string;
  readOnly?: boolean;
}) {
  const session = useEditBarSelectionSession(
    context,
    false,
    onSelectionInteractionChange,
  );
  if (readOnly) return null;
  const live = session.context;
  if (!live) {
    return (
      <p
        data-deck-hosted-hint="select-object"
        className="px-3 py-1 text-[12px] text-[var(--muted,#78716c)]"
      >
        {DECK_HOSTED_SELECT_OBJECT_HINT}
      </p>
    );
  }
  return (
    <EditBarSelectionSessionContext.Provider value={session.sessionId}>
      <div
        role="toolbar"
        data-selection-kind={live.kind}
        data-selection-id={live.id}
        data-edit-bar-session={session.sessionId}
        data-edit-bar-selection-session={session.holding ? "held" : undefined}
        onPointerDownCapture={session.onPointerDownCapture}
        onKeyDownCapture={session.onKeyDownCapture}
        className="pointer-events-auto relative flex min-w-0 flex-nowrap items-center gap-1"
      >
        {(live.controls || []).map((control) => (
          <div
            key={`${live.id}:${control.id}`}
            data-selection-control-id={control.id}
            data-edit-bar-interactive
            className="inline-flex shrink-0"
          >
            <SelectionToolbarControl
              control={control}
              selectionId={live.id}
              selectionRevision={live.revision}
              selectionEpoch={live.epoch}
              onCommand={onCommand}
              accent={accent}
            />
          </div>
        ))}
      </div>
    </EditBarSelectionSessionContext.Provider>
  );
}
