"use client";

import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionCommand, SelectionContext } from "../selection-context";

export function RichDocHostedContextToolbar({
  context,
  onCommand,
  accent = "#4f46e5",
  readOnly = false,
}: {
  context: SelectionContext | null;
  onCommand: (command: SelectionCommand) => void;
  accent?: string;
  readOnly?: boolean;
}) {
  if (!context || readOnly) return null;
  return (
    <SelectionToolbar
      context={context}
      onCommand={onCommand}
      accent={accent}
    />
  );
}
