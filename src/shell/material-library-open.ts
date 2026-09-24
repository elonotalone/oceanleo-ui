"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import { openArtifactPlay } from "./explore-artifact-class";
import { rememberOpenedLibraryItem } from "./library-current-identity";
import type { LibraryItem } from "./library-data";

export function useMaterialLibraryOpenItem(options: {
  onOpenItem?: (item: LibraryItem) => void;
  actionNonce?: string;
  setStandaloneEditorItem: Dispatch<SetStateAction<LibraryItem | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setErrorStatus: Dispatch<SetStateAction<number | undefined>>;
}): (item: LibraryItem) => void {
  const {
    actionNonce,
    onOpenItem,
    setError,
    setErrorStatus,
    setStandaloneEditorItem,
  } = options;
  return useCallback(
    (item: LibraryItem) => {
      if (openArtifactPlay(item)) return;
      if (!isAdvancedEditableShelfItem(item)) {
        setError("editor-source-unavailable");
        setErrorStatus(422);
        throw new Error("当前 revision 缺少可验证的编辑器 source。");
      }
      rememberOpenedLibraryItem(item, actionNonce);
      if (onOpenItem) onOpenItem(item);
      else setStandaloneEditorItem(item);
    },
    [actionNonce, onOpenItem, setError, setErrorStatus, setStandaloneEditorItem],
  );
}
