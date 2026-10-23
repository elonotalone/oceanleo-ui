"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { leaveAdvancedWorkbench, shouldWarnBeforeUnload } from "./advanced-background-saver";
import {
  InlineEditorSwitchContext,
  libraryItemIdentityKey,
  requestOpenLibraryItemInEditor,
} from "./inline-editor-mine-activate";
import type { MineActivationResult } from "./inline-editor-mine-panel";
import type { LibraryItem } from "./library-data";
import type { useAdvancedAutoSave } from "./use-advanced-autosave";

/** One close gate for Back, header Close and in-place Library item switches. */
export function useInlineWorkbenchLeave({
  item, onClose, onPaneClose, closeDetail, autoSave, autoSaveEnabled,
  requiresMountedFlush, closeRequestRevision, editorUnconfirmed,
}: {
  item: LibraryItem;
  onClose: () => void;
  onPaneClose?: () => void;
  closeDetail: () => void;
  autoSave: Pick<ReturnType<typeof useAdvancedAutoSave>, "flushLatest" | "handOffToBackground">;
  autoSaveEnabled: boolean;
  requiresMountedFlush?: boolean;
  closeRequestRevision?: number;
  editorUnconfirmed: boolean;
}) {
  const closingRef = useRef(false);
  const [leavingMountedEditor, setLeavingMountedEditor] = useState(false);
  const handledCloseRequestRef = useRef(closeRequestRevision || 0);
  const requestLeave = useCallback((finish: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (requiresMountedFlush) setLeavingMountedEditor(true);
    const completion = leaveAdvancedWorkbench({
      autoSaveEnabled,
      handOff: () => autoSave.handOffToBackground?.(),
      closeDetail,
      onClose: finish,
      ...(requiresMountedFlush ? { flushMounted: autoSave.flushLatest } : {}),
    });
    if (completion) {
      void completion.finally(() => {
        closingRef.current = false;
        setLeavingMountedEditor(false);
      });
    } else {
      closingRef.current = false;
    }
  }, [requiresMountedFlush, autoSave.flushLatest, autoSave.handOffToBackground, closeDetail, autoSaveEnabled]);
  const requestClose = useCallback(() => requestLeave(onClose), [onClose, requestLeave]);
  const requestPaneClose = useCallback(() => requestLeave(onPaneClose || onClose), [onClose, onPaneClose, requestLeave]);
  useEffect(() => {
    const revision = closeRequestRevision || 0;
    if (revision <= handledCloseRequestRef.current) return;
    handledCloseRequestRef.current = revision;
    requestClose();
  }, [closeRequestRevision, requestClose]);
  const warnBeforeUnload = shouldWarnBeforeUnload(editorUnconfirmed);
  useEffect(() => {
    if (!warnBeforeUnload) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [warnBeforeUnload]);
  const switchItem = useContext(InlineEditorSwitchContext);
  // 我的库换文件（D2）：先把当前改动存到服务器，确认成功才换；失败就留在原处并交出原因。
  const activateMineItem = useCallback(async (next: LibraryItem): Promise<MineActivationResult> => {
    const currentId = libraryItemIdentityKey(item);
    const nextId = libraryItemIdentityKey(next);
    if (currentId && nextId && currentId === nextId) { closeDetail(); return { ok: true }; }
    if (editorUnconfirmed) {
      if (!autoSaveEnabled) return { ok: false, error: "这份文件还有没应用的改动，请先保存" };
      const saved = await autoSave.flushLatest();
      if (!saved.ok) return { ok: false, error: saved.errorMessage || saved.error || "保存失败，请重试" };
    }
    // Hosts with an in-place switch keep the same editor host; others receive the typed edit intent.
    requestLeave(() => (switchItem ? switchItem(next) : requestOpenLibraryItemInEditor(next)));
    return { ok: true };
  }, [autoSave, autoSaveEnabled, closeDetail, editorUnconfirmed, item, requestLeave, switchItem]);
  return { leavingMountedEditor, requestClose, requestPaneClose, activateMineItem };
}
