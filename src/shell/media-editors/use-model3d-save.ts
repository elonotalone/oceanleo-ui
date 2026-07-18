"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import type { PersistedEditorVersion } from "../doc-editors/doc-io";
import { safeModelStem } from "./model3d-files";
import {
  persistModel3DProject,
  type Model3DViewProject,
} from "./model3d-project";

export function useModel3DSave({
  item,
  siteId,
  sourceUrl,
  modelLoaded,
  posterUrl,
  view,
  revisionRef,
  sourceGenerationRef,
  aliveRef,
  setError,
  setNotice,
  setSavedUrl,
  setDirty,
  onSaved,
  tt,
}: {
  item: LibraryItem;
  siteId: string;
  sourceUrl: string;
  modelLoaded: boolean;
  posterUrl: string;
  view: Omit<Model3DViewProject, "sourceUrl">;
  revisionRef: MutableRefObject<number>;
  sourceGenerationRef: MutableRefObject<number>;
  aliveRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  onSaved?: (url: string) => void;
  tt: UITranslate;
}): {
  saving: boolean;
  saveCopy: () => Promise<PersistedEditorVersion | null>;
} {
  const busyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const saveCopy = useCallback(async () => {
    if (!sourceUrl || busyRef.current || !modelLoaded) return null;
    const generation = sourceGenerationRef.current;
    const savingRevision = revisionRef.current;
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${safeModelStem(item.title)}-${tt("视图副本")}`;
      const saved = await persistModel3DProject({
        item,
        siteId,
        title,
        sourceUrl,
        thumbUrl:
          posterUrl || item.thumbUrl || item.previewUrl || undefined,
        view,
        revision: savingRevision,
      });
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return null;
      }
      setSavedUrl(saved.url);
      if (revisionRef.current === savingRevision) {
        setDirty(false);
      }
      setNotice("");
      onSaved?.(saved.url);
      return saved;
    } catch (caught) {
      if (aliveRef.current) {
        setError(
          caught instanceof Error ? caught.message : tt("保存 3D 副本失败"),
        );
      }
      return null;
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [
    aliveRef,
    item,
    modelLoaded,
    onSaved,
    posterUrl,
    revisionRef,
    setDirty,
    setError,
    setNotice,
    setSavedUrl,
    siteId,
    sourceGenerationRef,
    sourceUrl,
    tt,
    view,
  ]);
  return { saving, saveCopy };
}
