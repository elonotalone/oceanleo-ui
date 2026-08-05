"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import { loadEditorProject } from "../doc-editors/doc-io";
import type { LibraryItem } from "../library-data";
import { normalizeModel3DDirectorDocument } from "./model3d-director";
import type { Model3DOperation } from "./model3d-operations.mjs";
import {
  LEGACY_MODEL3D_PROJECT_SCHEMA,
  MODEL3D_PROJECT_SCHEMA,
  normalizeModel3DProjectRecovery,
  normalizeModel3DSourceProvenance,
  type Model3DSourceProvenance,
  type Model3DViewProject,
} from "./model3d-project";
import type {
  Model3DRuntimeSnapshot,
  Model3DSceneRuntime,
} from "./model3d-runtime.mjs";
import { normalizeSavedModelView } from "./model3d-view";
import {
  DEFAULT_MODEL3D_VIEW,
  EMPTY_MODEL3D_RUNTIME,
  model3DSourceForItem,
} from "./model3d-workbench-defaults";
import {
  model3DItemSourceFormat,
  model3DWorkbenchErrorMessage,
} from "./model3d-workbench-helpers";

export function useModel3DProjectBootstrap({
  item,
  artifactSourceDigest,
  siteId,
  tt: providedTranslate,
  aliveRef,
  sourceGenerationRef,
  loadedSourceRef,
  pendingOperationsRef,
  runtimeRef,
  revisionRef,
  applyView,
  setSourceUrl,
  setSourceLoading,
  setModelLoading,
  setProgress,
  setRuntimeState,
  setSavedUrl,
  setDirty,
  setNotice,
  setError,
  setSourceProvenance,
}: {
  item: LibraryItem;
  artifactSourceDigest: string;
  siteId: string;
  tt: UITranslate;
  aliveRef: MutableRefObject<boolean>;
  sourceGenerationRef: MutableRefObject<number>;
  loadedSourceRef: MutableRefObject<string>;
  pendingOperationsRef: MutableRefObject<Model3DOperation[]>;
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  revisionRef: MutableRefObject<number>;
  applyView: (next: Model3DViewProject, emit?: boolean) => void;
  setSourceUrl: Dispatch<SetStateAction<string>>;
  setSourceLoading: Dispatch<SetStateAction<boolean>>;
  setModelLoading: Dispatch<SetStateAction<boolean>>;
  setProgress: Dispatch<SetStateAction<number>>;
  setRuntimeState: Dispatch<SetStateAction<Model3DRuntimeSnapshot>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  setSourceProvenance: Dispatch<SetStateAction<Model3DSourceProvenance>>;
}): void {
  // `tt` 由 `useModel3DWorkbench` 从 `useUI()` 直接透传，是 provider 所有的函数。
  // 它进下面那个工程装载 effect 的依赖，就是 W13 治过的自锁引信：effect 体里写
  // state（setSourceUrl / setNotice / setError…）→ 重渲染 → `tt` 换身份 → 整份 3D
  // 工程重新恢复一遍，`setSourceLoading(false)` 轮不到，进度条下不来。
  // 语言切换与「这份工程要不要重新读一次 checkpoint」无关，答案是不该重跑。
  // 沿用 W13 在 `doc-editors/use-grid-editor.ts:518-531` 定下的 ref + 恒定包装，
  // 下面的 `tt` 即该包装（`vars` 一并转发）。代价：装载期文案停在产生时那个语言；
  // 这一处不能改成渲染时再翻，因为 `notice` / `error` 由不在本 owner 面上的
  // `Model3DStage` / `Model3DRoute` 原样显示。
  const translateRef = useRef(providedTranslate);
  useEffect(() => {
    translateRef.current = providedTranslate;
  }, [providedTranslate]);
  const tt = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

  useEffect(() => {
    const originalSource = model3DSourceForItem(item);
    const fallbackProvenance = normalizeModel3DSourceProvenance(
      {
        sourceUrl: originalSource,
        dependencyBaseUrl:
          typeof item.meta.model_dependency_base_url === "string"
            ? item.meta.model_dependency_base_url
            : originalSource,
        format: model3DItemSourceFormat(item),
        identity:
          typeof item.meta.model_source_identity === "string"
            ? item.meta.model_source_identity
            : "",
        artifactId:
          typeof item.meta.model_source_artifact_id === "string"
            ? item.meta.model_source_artifact_id
            : item.artifactId || "",
        revisionId:
          typeof item.meta.model_source_revision_id === "string"
            ? item.meta.model_source_revision_id
            : item.revisionId || "",
        sourceDigest:
          typeof item.meta.model_source_digest === "string"
            ? item.meta.model_source_digest
            : artifactSourceDigest,
      },
      originalSource,
      model3DItemSourceFormat(item),
    );
    const saved = normalizeSavedModelView(item.meta.view);
    const fallback: Model3DViewProject = {
      ...DEFAULT_MODEL3D_VIEW,
      sourceUrl: originalSource,
      azimuth: saved.azimuth,
      elevation: saved.elevation,
      zoom: saved.zoom,
      autoRotate: saved.autoRotate,
      exposure: saved.exposure,
      shadowIntensity: saved.shadowIntensity,
      shadowSoftness: saved.shadowSoftness,
      shadowEnabled: saved.shadowEnabled,
      background: saved.background,
      animationName: saved.animation,
      animationPlaying: saved.animationPlaying,
      animationSpeed: saved.animationSpeed,
      animationTime: saved.animationTime,
      environmentUrl: saved.environmentUrl,
      environmentIntensity: saved.environmentIntensity,
      materialOverrides: saved.materialOverrides,
      annotations: saved.annotations,
      director: normalizeModel3DDirectorDocument(saved.director, item.id),
    };
    const generation = ++sourceGenerationRef.current;
    runtimeRef.current?.clear();
    loadedSourceRef.current = "";
    pendingOperationsRef.current = [];
    setSourceUrl("");
    setSourceLoading(true);
    setModelLoading(false);
    setProgress(0);
    setRuntimeState(EMPTY_MODEL3D_RUNTIME);
    setSavedUrl("");
    setDirty(false);
    revisionRef.current = 0;
    setNotice("");
    setError("");
    applyView(fallback);

    void (async () => {
      let recovered = {
        checkpointUrl: originalSource,
        operations: [] as Model3DOperation[],
        provenance: fallbackProvenance,
        view: fallback,
      };
      const projectUrl =
        typeof item.meta.editor_project_url === "string"
          ? item.meta.editor_project_url
          : "";
      const projectSchema = String(item.meta.editor_project_schema || "");
      if (
        projectUrl &&
        [MODEL3D_PROJECT_SCHEMA, LEGACY_MODEL3D_PROJECT_SCHEMA].includes(
          projectSchema,
        )
      ) {
        try {
          const project = await loadEditorProject<unknown>(
            projectUrl,
            projectSchema,
          );
          recovered = normalizeModel3DProjectRecovery(
            project,
            fallback,
            originalSource,
          ) || recovered;
        } catch {
          // The creation metadata remains a complete sidecar fallback.
        }
      }
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return;
      }
      const recoveredProvenance = normalizeModel3DSourceProvenance(
        {
          ...recovered.provenance,
          artifactId:
            recovered.provenance.artifactId || fallbackProvenance.artifactId,
          revisionId:
            recovered.provenance.revisionId || fallbackProvenance.revisionId,
          sourceDigest:
            recovered.provenance.sourceDigest || fallbackProvenance.sourceDigest,
        },
        recovered.checkpointUrl || originalSource,
        recovered.provenance.format,
      );
      pendingOperationsRef.current = recovered.operations;
      setSourceProvenance(recoveredProvenance);
      applyView(recovered.view);
      const checkpointSource = recovered.checkpointUrl || originalSource;
      if (!checkpointSource) {
        setNotice(tt("空白 3D 场景已就绪，请导入 GLB 或自包含 glTF 模型"));
        setSourceLoading(false);
        return;
      }
      try {
        if (
          aliveRef.current &&
          generation === sourceGenerationRef.current
        ) {
          setSourceProvenance(
            normalizeModel3DSourceProvenance(
              recoveredProvenance,
              checkpointSource,
              recoveredProvenance.format,
            ),
          );
          // Keep the canonical entrypoint and dependency base together until
          // byte-signature detection proves GLB versus glTF. Importing an
          // opaque URL first can sever a glTF JSON file from its .bin/textures.
          setSourceUrl(checkpointSource);
        }
      } catch (caught) {
        if (aliveRef.current && generation === sourceGenerationRef.current) {
          setError(
            model3DWorkbenchErrorMessage(caught, tt("3D 模型导入失败")),
          );
        }
      } finally {
        if (aliveRef.current && generation === sourceGenerationRef.current) {
          setSourceLoading(false);
        }
      }
    })();
  }, [
    applyView,
    artifactSourceDigest,
    item.id,
    item.meta.editor,
    item.meta.editor_project_schema,
    item.meta.editor_project_url,
    item.meta.format,
    item.meta.mime,
    item.meta.model_dependency_base_url,
    item.meta.model_source_artifact_id,
    item.meta.model_source_digest,
    item.meta.model_source_identity,
    item.meta.model_source_revision_id,
    item.meta.model_source_url,
    item.meta.source_asset_url,
    item.meta.view,
    item.artifactId,
    item.previewUrl,
    item.revisionId,
    item.title,
    item.url,
    siteId,
    tt,
  ]);
}
