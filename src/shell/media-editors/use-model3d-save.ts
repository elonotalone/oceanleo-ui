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
import { safeModelStem, uploadModel3DPoster } from "./model3d-files";
import { createModel3DSavePlan } from "./model3d-operations.mjs";
import {
  persistModel3DProject,
  type Model3DSourceProvenance,
  type Model3DViewProject,
  type PersistedModel3DVersion,
} from "./model3d-project";
import type { Model3DSceneRuntime } from "./model3d-runtime.mjs";

export function useModel3DSave({
  item,
  siteId,
  modelLoaded,
  checkpointUrl,
  sourceProvenance,
  posterUrl,
  view,
  runtimeRef,
  revisionRef,
  sourceGenerationRef,
  aliveRef,
  setError,
  setNotice,
  setSavedUrl,
  setDirty,
  onDurableModelUrl,
  onSaved,
  tt,
}: {
  item: LibraryItem;
  siteId: string;
  modelLoaded: boolean;
  checkpointUrl: string;
  sourceProvenance: Model3DSourceProvenance;
  posterUrl: string;
  view: Omit<Model3DViewProject, "sourceUrl">;
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  revisionRef: MutableRefObject<number>;
  sourceGenerationRef: MutableRefObject<number>;
  aliveRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  onDurableModelUrl: (
    url: string,
    provenance: Model3DSourceProvenance,
  ) => void;
  onSaved?: (url: string) => void;
  tt: UITranslate;
}): {
  saving: boolean;
  saveCopy: () => Promise<PersistedModel3DVersion | null>;
  checkpointForExport: () => Promise<ArrayBuffer | null>;
} {
  const busyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const persist = useCallback(async (forceCheckpoint = false) => {
    if (busyRef.current || !modelLoaded) return null;
    const runtime = runtimeRef.current;
    if (!runtime || !checkpointUrl) return null;
    const generation = sourceGenerationRef.current;
    const savingRevision = revisionRef.current;
    const journal = runtime.getOperationJournal();
    const plan = createModel3DSavePlan(journal, {
      force: forceCheckpoint,
    });
    let glb: ArrayBuffer | undefined;
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${safeModelStem(item.title)}-${tt("编辑版")}`;
      let durablePosterUrl = posterUrl;
      try {
        durablePosterUrl = await uploadModel3DPoster(
          await runtime.capturePng(),
          siteId,
          title,
        );
      } catch (caught) {
        if (!durablePosterUrl) throw caught;
      }
      // GLTFExporter is the canonical editable-source checkpoint serializer,
      // not a delivery renderer; saves between bounded checkpoints are journal-only.
      if (plan.shouldExportGlb) glb = await runtime.exportGlb();
      const saved = await persistModel3DProject({
        item,
        siteId,
        title,
        checkpointUrl,
        sourceProvenance,
        glb,
        operations: plan.persistedOperations,
        checkpointReason: plan.checkpointReason,
        thumbUrl:
          durablePosterUrl || item.thumbUrl || item.previewUrl || undefined,
        view,
        revision: savingRevision,
      });
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return null;
      }
      setSavedUrl(saved.url);
      if (glb) {
        runtime.commitCheckpoint(plan.coveredOperationIds);
        onDurableModelUrl(saved.url, saved.sourceProvenance);
      }
      if (revisionRef.current === savingRevision) {
        setDirty(false);
      }
      setNotice("");
      onSaved?.(saved.url);
      return { saved, glb };
    } catch (caught) {
      if (aliveRef.current) {
        setError(
          caught instanceof Error ? caught.message : tt("保存 3D 副本失败"),
        );
      }
      return glb ? { saved: null, glb } : null;
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [
    aliveRef,
    checkpointUrl,
    item,
    modelLoaded,
    onDurableModelUrl,
    onSaved,
    posterUrl,
    revisionRef,
    runtimeRef,
    setDirty,
    setError,
    setNotice,
    setSavedUrl,
    siteId,
    sourceProvenance,
    sourceGenerationRef,
    tt,
    view,
  ]);
  const saveCopy = useCallback(
    async () => (await persist(false))?.saved || null,
    [persist],
  );
  const checkpointForExport = useCallback(
    async () => (await persist(true))?.glb || null,
    [persist],
  );
  return { saving, saveCopy, checkpointForExport };
}
