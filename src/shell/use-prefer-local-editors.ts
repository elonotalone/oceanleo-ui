"use client";

import { useOptionalClientHost } from "../client-ui/host-context";
import { resolveEditorCore, type EditorCoreId } from "./editor-core-flags";
import {
  LOCAL_CORE_FLAG_EDITORS,
  preferLocalRemoteEditor,
} from "./client-local-editors";

export function usePreferLocalRemoteEditor(editorId: EditorCoreId): boolean {
  const host = useOptionalClientHost();
  const coreChoice = LOCAL_CORE_FLAG_EDITORS.includes(editorId)
    ? resolveEditorCore(editorId)
    : "legacy";
  return preferLocalRemoteEditor(editorId, {
    platform: host?.environment.platform,
    capabilities: host?.environment.capabilities,
    coreChoice,
  });
}
