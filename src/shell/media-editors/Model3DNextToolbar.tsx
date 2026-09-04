"use client";

import { useMemo } from "react";
import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionCommand } from "../selection-context";
import {
  applyModel3DNextControl,
  model3dNextSelectionContext,
  type Model3DNextViewState,
} from "./model3d-next-plan";

export function Model3DNextToolbar({
  view,
  onView,
  accent = "#4f46e5",
  disabled = false,
}: {
  view: Model3DNextViewState;
  onView: (next: Model3DNextViewState) => void;
  accent?: string;
  disabled?: boolean;
}) {
  const context = useMemo(() => model3dNextSelectionContext(view), [view]);
  const onCommand = (message: SelectionCommand) => {
    if (disabled) return;
    onView(applyModel3DNextControl(view, message));
  };
  return (
    <SelectionToolbar context={context} onCommand={onCommand} accent={accent} />
  );
}
