"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { leaveAdvancedWorkbench, shouldWarnBeforeUnload } from "./advanced-background-saver";
import { libraryItemIdentityKey, requestOpenLibraryItemInEditor } from "./inline-editor-mine-activate";
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
      handOff: () => autoSave.handOffToBackground(),
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
  const activateMineItem = useCallback((next: LibraryItem) => {
    const currentId = libraryItemIdentityKey(item);
    const nextId = libraryItemIdentityKey(next);
    if (currentId && nextId && currentId === nextId) { closeDetail(); return; }
    // MyLibrary consumes this typed edit intent without closing its own host.
    requestLeave(() => requestOpenLibraryItemInEditor(next));
  }, [closeDetail, item, requestLeave]);
  return { leavingMountedEditor, requestClose, requestPaneClose, activateMineItem };
}
