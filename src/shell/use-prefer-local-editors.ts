"use client";

import { useOptionalClientHost } from "../client-ui/host-context";
import { resolveEditorCore, type EditorCoreId } from "./editor-core-flags";
import {
  LOCAL_CORE_FLAG_EDITORS,
  preferLocalRemoteEditor,
} from "./client-local-editors";
import { clientHostedEmbedContext } from "./hosted-local-origin";

export function usePreferLocalRemoteEditor(editorId: EditorCoreId): boolean {
  const host = useOptionalClientHost();
  const ctx = clientHostedEmbedContext(host);
  const coreChoice = LOCAL_CORE_FLAG_EDITORS.includes(editorId)
    ? resolveEditorCore(editorId)
    : "legacy";
  return preferLocalRemoteEditor(editorId, {
    platform: ctx.platform,
    capabilities: ctx.capabilities,
    coreChoice,
  });
}
