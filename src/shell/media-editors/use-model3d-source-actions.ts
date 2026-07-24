"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  uploadImportedModel,
  type Model3DArtifactIdentity,
} from "./model3d-files";
import type { Model3DOperation } from "./model3d-operations.mjs";
import {
  normalizeModel3DSourceProvenance,
  type Model3DSourceFormat,
  type Model3DSourceProvenance,
} from "./model3d-project";

export function useModel3DSourceActions({
  siteId,
  sourceGenerationRef,
  loadedSourceRef,
  pendingOperationsRef,
  markDirty,
  setSourceProvenance,
  setSourceUrl,
  setSourceLoading,
  setProgress,
  setError,
  setNotice,
  tt,
}: {
  siteId: string;
  sourceGenerationRef: MutableRefObject<number>;
  loadedSourceRef: MutableRefObject<string>;
  pendingOperationsRef: MutableRefObject<Model3DOperation[]>;
  markDirty: () => void;
  setSourceProvenance: Dispatch<SetStateAction<Model3DSourceProvenance>>;
  setSourceUrl: Dispatch<SetStateAction<string>>;
  setSourceLoading: Dispatch<SetStateAction<boolean>>;
  setProgress: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  tt: UITranslate;
}) {
  const handlePreparedSource = useCallback((prepared: {
    sourceUrl: string;
    dependencyBaseUrl: string;
    format: "glb" | "gltf";
  }) => {
    setSourceProvenance((current) =>
      normalizeModel3DSourceProvenance(
        {
          ...current,
          sourceUrl: prepared.sourceUrl,
          dependencyBaseUrl: prepared.dependencyBaseUrl,
          format: prepared.format,
        },
        prepared.sourceUrl,
        prepared.format,
      ));
  }, [setSourceProvenance]);

  const importModel = useCallback(async (file: File) => {
    setSourceLoading(true);
    setError("");
    setNotice(tt("正在上传 3D 模型…"));
    try {
      const imported = await uploadImportedModel(file, siteId, tt);
      sourceGenerationRef.current += 1;
      loadedSourceRef.current = "";
      pendingOperationsRef.current = [];
      setSourceProvenance(
        normalizeModel3DSourceProvenance(
          {
            sourceUrl: imported.url,
            dependencyBaseUrl: imported.dependencyBaseUrl,
            format: imported.format,
          },
          imported.url,
          imported.format,
        ),
      );
      setSourceUrl(imported.url);
      setProgress(0);
      markDirty();
      setNotice(tt("模型已导入，可以编辑场景对象"));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : tt("3D 模型导入失败"),
      );
    } finally {
      setSourceLoading(false);
    }
  }, [
    loadedSourceRef,
    markDirty,
    pendingOperationsRef,
    setError,
    setNotice,
    setProgress,
    setSourceLoading,
    setSourceProvenance,
    setSourceUrl,
    siteId,
    sourceGenerationRef,
    tt,
  ]);

  const openModelUrl = useCallback((
    url: string,
    format: Model3DSourceFormat = "",
    identity: Model3DArtifactIdentity | null = null,
  ) => {
    if (!/^https?:\/\//i.test(url)) {
      setError(tt("3D 模型地址无效"));
      return;
    }
    sourceGenerationRef.current += 1;
    loadedSourceRef.current = "";
    pendingOperationsRef.current = [];
    setSourceProvenance(
      normalizeModel3DSourceProvenance(
        {
          sourceUrl: url,
          dependencyBaseUrl: url,
          format,
          artifactId: identity?.artifactId || "",
          revisionId: identity?.revisionId || "",
          sourceDigest: identity?.sourceDigest || "",
        },
        url,
        format,
      ),
    );
    setSourceUrl(url);
    setError("");
    setNotice(tt("正在载入完整 3D 模型…"));
    markDirty();
  }, [
    loadedSourceRef,
    markDirty,
    pendingOperationsRef,
    setError,
    setNotice,
    setSourceProvenance,
    setSourceUrl,
    sourceGenerationRef,
    tt,
  ]);

  return { handlePreparedSource, importModel, openModelUrl };
}
