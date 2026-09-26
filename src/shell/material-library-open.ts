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
      // 先认可编辑：刚复制出的游戏副本是私有的，试玩页只读公开作品，送过去必 404。
      // 只有进不了编辑器的只读游戏才去试玩页。
      if (!isAdvancedEditableShelfItem(item)) {
        if (openArtifactPlay(item)) return;
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
