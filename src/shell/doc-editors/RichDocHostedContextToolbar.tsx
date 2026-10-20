"use client";

import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionInteractionChange } from "../edit-bar-hosted-selection-hold";
import type { SelectionCommand, SelectionContext } from "../selection-context";

export function RichDocHostedContextToolbar({
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
  if (!context || readOnly) return null;
  return (
    <SelectionToolbar
      context={context}
      onCommand={onCommand}
      onSelectionInteractionChange={onSelectionInteractionChange}
      accent={accent}
    />
  );
}
