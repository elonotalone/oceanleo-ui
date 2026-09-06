"use client";

import { useUI } from "../../i18n/ui/useUI";
import { IconButton } from "../../ui/Button";
import type { AdvancedWorkbenchAction } from "../advanced-workbench-chrome";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";

export function EditBarDocumentSegment({
  actions,
  onTrigger,
  emptyHint,
}: {
  actions: readonly AdvancedWorkbenchAction[];
  onTrigger(a: AdvancedWorkbenchAction): void;
  emptyHint?: string;
}) {
  const tt = useUI();
  if (actions.length === 0) {
    if (!emptyHint) return null;
    return (
      <div data-edit-bar-document-segment>
        <span className="px-2 text-[12px] text-[var(--awb-muted)]">
          {tt(emptyHint)}
        </span>
      </div>
    );
  }
  return (
    <div data-edit-bar-document-segment className="flex items-center gap-0.5">
      {actions.map((action) => (
        <IconButton
          key={action.id}
          data-workspace-action-id={action.id}
          disabled={action.disabled || action.busy}
          aria-busy={action.busy || undefined}
          onClick={() => onTrigger(action)}
          variant={action.variant === "danger" ? "danger" : "ghost"}
          selected={action.variant === "primary"}
          label={tt(
            action.busy && action.busyLabel ? action.busyLabel : action.label,
          )}
          icon={
            <AdvancedEditorIcon
              name={action.icon || "settings"}
              className="h-4 w-4"
            />
          }
        />
      ))}
    </div>
  );
}
