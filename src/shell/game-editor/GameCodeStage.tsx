"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { AdvancedEditorPagesAdapter } from "../plugin-chrome/plugin-pages";
import { GameProjectEditor } from "./GameProjectEditor";

/** Compatibility entry point; Code and preview now share the same file project. */
export function GameCodeStage(props: AdvancedContentWorkbenchProps & { pages?: AdvancedEditorPagesAdapter }) {
  return <GameProjectEditor {...props} />;
}
