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
  ownSavedVersionKeys,
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
  ownSavedVersionKeys?: MutableRefObject<Set<string>>;
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
  const receiptRef = useRef<{ generation: number; revision: number; inputRoot: string; saved: PersistedModel3DVersion } | null>(null);
  const [saving, setSaving] = useState(false);
  const persist = useCallback(async () => {
    if (busyRef.current || !modelLoaded) return null;
    const runtime = runtimeRef.current;
    if (!runtime || !checkpointUrl) return null;
    const generation = sourceGenerationRef.current;
    const savingRevision = revisionRef.current;
    const inputRoot = item.artifactId || item.id;
    const candidate = receiptRef.current;
    const previous = candidate && (candidate.inputRoot === inputRoot || candidate.saved.artifactId === inputRoot) ? candidate : null;
    if (previous?.generation === generation && previous.revision === savingRevision) return previous.saved;
    const journal = runtime.getOperationJournal();
    const plan = createModel3DSavePlan(journal, {
      force: true,
    });
    let glb: ArrayBuffer | undefined;
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = item.title;
      const poster = await runtime.capturePng();
      // A typed revision must carry freshly hashed source bytes. The sidecar
      // records view state, while the GLB is the canonical editable scene.
      glb = await runtime.exportGlb();
      const saved = await persistModel3DProject({
        // Undo/import changes the scene generation, not the durable target's
        // CAS head. Keep the last successful receipt across those operations.
        item: previous?.saved.item || item,
        siteId,
        title,
        checkpointUrl,
        sourceProvenance,
        glb,
        poster,
        operations: plan.persistedOperations,
        checkpointReason: plan.checkpointReason,
        thumbUrl:
          posterUrl || item.thumbUrl || item.previewUrl || undefined,
        view,
        revision: savingRevision,
      });
      receiptRef.current = { generation, revision: savingRevision, inputRoot, saved };
      if (saved.artifactId && saved.revisionId) ownSavedVersionKeys?.current.add(`${saved.artifactId}:${saved.revisionId}`);
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return saved;
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
    checkpointUrl,
    item,
    modelLoaded,
    onDurableModelUrl,
    onSaved,
    ownSavedVersionKeys,
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
    async () => await persist(),
    [persist],
  );
  const checkpointForExport = useCallback(
    async () => modelLoaded && runtimeRef.current ? await runtimeRef.current.exportGlb() : null,
    [modelLoaded, runtimeRef],
  );
  return { saving, saveCopy, checkpointForExport };
}
