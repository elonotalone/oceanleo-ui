"use client";

import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { InlineAdvancedWorkbenchShell } from "./InlineAdvancedWorkbenchShell";
import type { LibraryItem } from "./library-data";

export interface AdvancedWorkbenchShellProps {
  item: LibraryItem;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  adapter: AdvancedEditorAdapter;
  onClose: () => void;
}

/**
 * Compatibility name retained for route adapters. The standalone workbench
 * chrome was retired; every editor now uses the App-library inline shell.
 */
export function AdvancedWorkbenchShell(
  props: AdvancedWorkbenchShellProps,
) {
  return <InlineAdvancedWorkbenchShell {...props} />;
}
