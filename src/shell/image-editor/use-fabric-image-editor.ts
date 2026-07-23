"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FabricImage } from "fabric";
import { aiEditImage } from "../../lib/image-ai-edit";
import { uploadFile } from "../../lib/database";
import {
  canvasSafeUrl,
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import { advancedEditorSourceFor } from "../advanced-features";
import { refreshArtifactRendition } from "../artifact-client";
import {
  renditionNeedsRefresh,
  type ArtifactRendition,
} from "../artifact-contract";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";
import {
  loadImageObject,
  tagImageDependency,
  type FabricNS,
} from "./editor-objects";
import { exportDocBlob } from "./editor-objects";
import {
  clearLocalImageDraft,
  createFabricImageProject,
  downloadImageBlob,
  loadLocalImageDraft,
  parseFabricImageProject,
  persistCompositeImageProject,
  persistImageProject,
  saveLocalImageDraft,
} from "./editor-persistence";
import { FabricEditorController } from "./fabric-controller";
import type { FabricControllerView } from "./fabric-controller-core";
import { normalizeEditorSnapshot } from "./editor-runtime";
import {
  IMAGE_SCENE_SOURCE_FORMAT,
  IMAGE_SCENE_SOURCE_SCHEMA,
  ImageSceneSourceError,
  assertImageDependencyAccess,
  artifactSceneClosureDigest,
  imageDependencyNeedsRefresh,
  imageSceneDependencyRevisionIds,
  imageSceneWithResolvedDependencies,
  isLikelyExpiringUrl,
  parseImageSceneSource,
  sha256Blob,
  sha256Text,
  type ImageSceneDependency,
} from "./image-scene-source";
import {
  INITIAL_FILTERS,
  type CanvasClientPoint,
  type FabricImageEditorOptions,
  type FabricImageSaveResult,
  type FabricImageEditorState,
} from "./types";

const INITIAL_VIEW: FabricControllerView = {
  doc: { width: 1080, height: 1080 },
  canvasBackground: "#ffffff",
  zoom: 1,
  activeTool: "select",
  brush: { color: "#1c1917", width: 12 },
  layers: [],
  selected: null,
  transformInfo: null,
  filterInfo: { scope: "background", settings: { ...INITIAL_FILTERS } },
  cropping: false,
  cropRatio: "free",
  canUndo: false,
  canRedo: false,
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function imageDocumentSize(image: FabricImage): {
  width: number;
  height: number;
} {
  const width = Math.max(1, Number(image.width) || 1080);
  const height = Math.max(1, Number(image.height) || 1080);
  const scale = Math.min(1, 8192 / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

type ImageDependencySeed = Omit<ImageSceneDependency, "id">;

function renditionDependencyFor(
  item: LibraryItem,
  url: string,
): ImageDependencySeed | null {
  if (!isDurableLibraryItem(item)) return null;
  const rendition = Object.values(item.artifact.renditions).find(
    (candidate) =>
      candidate?.url === url &&
      candidate.digest &&
      candidate.purpose !== "editor_manifest",
  );
  if (!rendition?.digest || rendition.purpose === "editor_manifest") return null;
  return {
    kind: "image",
    required: true,
    url,
    digest: rendition.digest.toLowerCase().replace(/^sha256:/, ""),
    artifactId: item.artifactId,
    revisionId: item.revisionId,
    renditionPurpose: rendition.purpose,
    expiresAt: rendition.expiresAt,
  };
}

async function canvasImageSource(
  source: string,
  siteId: string,
  title: string,
  evidence?: ImageDependencySeed | null,
): Promise<{ canvasUrl: string; dependency: ImageDependencySeed | null }> {
  if (source.startsWith("data:") || source.startsWith("blob:")) {
    return { canvasUrl: source, dependency: null };
  }
  const shouldImport =
    !isFirstPartyMediaUrl(source) ||
    (isLikelyExpiringUrl(source) && !evidence?.artifactId);
  const durable = !shouldImport
    ? source
    : await importMediaUrl(source, {
        kind: "image",
        siteId: siteId || "image",
        title,
        registerAsset: false,
      });
  const digest =
    evidence?.digest ||
    (await sha256Blob(
      await fetchMediaBlob(durable, { maxBytes: 80 * 1024 * 1024 }),
    ));
  const dependency: ImageDependencySeed = {
    kind: "image",
    required: true,
    url: durable,
    digest,
    ...(evidence?.artifactId && evidence.revisionId
      ? {
          artifactId: evidence.artifactId,
          revisionId: evidence.revisionId,
        }
      : {}),
    ...(evidence?.renditionPurpose
      ? { renditionPurpose: evidence.renditionPurpose }
      : {}),
    ...(evidence?.expiresAt !== undefined
      ? { expiresAt: evidence.expiresAt }
      : {}),
  };
  return { canvasUrl: canvasSafeUrl(durable), dependency };
}

async function loadEditableImageProject(
  url: string,
  signal: AbortSignal,
) {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`图片工程读取失败（HTTP ${response.status}）`);
  }
  const text = await response.text();
  if (!text || new TextEncoder().encode(text).byteLength > 5_000_000) {
    throw new Error("图片工程为空或超过 5MB 安全上限");
  }
  const parsed: unknown = JSON.parse(text);
  const persisted = parseFabricImageProject(parsed);
  if (persisted) return persisted;
  const raw =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  let snapshot = normalizeEditorSnapshot(
    raw.snapshot ?? raw.data ?? raw.document ?? raw.scene ?? parsed,
  );
  if (!snapshot && Array.isArray(raw.objects)) {
    const width = Number(raw.width || raw.canvas_width || 1080);
    const height = Number(raw.height || raw.canvas_height || 1080);
    snapshot = normalizeEditorSnapshot({
      json: raw,
      doc: {
        width: Number.isFinite(width) && width > 0 ? width : 1080,
        height: Number.isFinite(height) && height > 0 ? height : 1080,
      },
      canvasBackground:
        typeof raw.canvasBackground === "string"
          ? raw.canvasBackground
          : typeof raw.backgroundColor === "string"
            ? raw.backgroundColor
            : "#ffffff",
    });
  }
  if (!snapshot) throw new Error("图片工程格式无效");
  return createFabricImageProject(
    snapshot,
    typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  );
}

function sameRevisionIds(left: readonly string[], right: readonly string[]) {
  const first = [...new Set(left)].sort();
  const second = [...new Set(right)].sort();
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

async function refreshSceneRendition(
  dependency: ImageSceneDependency,
  signal: AbortSignal,
): Promise<ImageSceneDependency> {
  if (!dependency.artifactId || !dependency.revisionId) {
    throw new ImageSceneSourceError(
      "expired-dependency",
      `图层依赖 ${dependency.id} 的 URL 已过期，且没有可刷新的 artifact/revision identity。`,
      dependency.id,
    );
  }
  const purpose = dependency.renditionPurpose || "full";
  const refreshed = await refreshArtifactRendition(
    {
      artifactId: dependency.artifactId,
      revisionId: dependency.revisionId,
    },
    purpose,
    signal,
  );
  const rendition = refreshed.data;
  if (
    !refreshed.ok ||
    !rendition ||
    rendition.revisionId !== dependency.revisionId ||
    rendition.digest?.toLowerCase().replace(/^sha256:/, "") !==
      dependency.digest
  ) {
    throw new ImageSceneSourceError(
      "dependency-digest-mismatch",
      `图层依赖 ${dependency.id} 刷新后没有固定到原 revision/digest。`,
      dependency.id,
    );
  }
  return {
    ...dependency,
    url: rendition.url,
    expiresAt: rendition.expiresAt,
    renditionPurpose: purpose,
  };
}

async function resolveSceneDependency(
  dependency: ImageSceneDependency,
  signal: AbortSignal,
): Promise<{
  dependency: ImageSceneDependency;
  canvasUrl: string;
}> {
  let resolved = dependency;
  let refreshed = false;
  if (imageDependencyNeedsRefresh(resolved)) {
    resolved = await refreshSceneRendition(resolved, signal);
    refreshed = true;
  }
  assertImageDependencyAccess(resolved, isFirstPartyMediaUrl);
  let blob: Blob;
  try {
    blob = await fetchMediaBlob(resolved.url, {
      maxBytes: 80 * 1024 * 1024,
      signal,
    });
  } catch (caught) {
    if (!refreshed && resolved.artifactId && resolved.revisionId) {
      resolved = await refreshSceneRendition(resolved, signal);
      blob = await fetchMediaBlob(resolved.url, {
        maxBytes: 80 * 1024 * 1024,
        signal,
      });
    } else {
      throw new ImageSceneSourceError(
        imageDependencyNeedsRefresh(resolved)
          ? "expired-dependency"
          : "dependency-unavailable",
        `图层依赖 ${resolved.id} 无法读取：${
          caught instanceof Error ? caught.message : "未知错误"
        }`,
        resolved.id,
      );
    }
  }
  if ((await sha256Blob(blob)) !== resolved.digest) {
    throw new ImageSceneSourceError(
      "dependency-digest-mismatch",
      `图层依赖 ${resolved.id} 的实际字节与 scene digest 不一致。`,
      resolved.id,
    );
  }
  return {
    dependency: resolved,
    canvasUrl: canvasSafeUrl(resolved.url),
  };
}

async function fetchPinnedSceneSource(
  item: LibraryItem,
  signal: AbortSignal,
): Promise<{
  text: string;
  rendition: ArtifactRendition;
  digest: string;
}> {
  if (
    !isDurableLibraryItem(item) ||
    item.artifactType !== "composite_image" ||
    item.artifact.artifactType !== "composite_image" ||
    item.artifact.sourceFormat !== IMAGE_SCENE_SOURCE_FORMAT ||
    !item.artifact.integrity.ok ||
    item.artifact.scene?.schema !== IMAGE_SCENE_SOURCE_SCHEMA ||
    item.artifact.scene.sceneRevisionId !== item.revisionId ||
    item.artifact.scene.closureStatus !== "complete"
  ) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      "复合图片缺少 durable artifact/revision identity。",
    );
  }
  const pinned = item.artifact.renditions.source;
  if (
    !pinned ||
    pinned.revisionId !== item.revisionId ||
    !pinned.digest ||
    !pinned.url
  ) {
    throw new ImageSceneSourceError(
      "missing-dependency",
      "复合图片当前 revision 缺少 source rendition/digest。",
    );
  }
  let rendition = pinned;
  let refreshed = false;
  const assertSourceUrl = (url: string) => {
    if (!isFirstPartyMediaUrl(url)) {
      throw new ImageSceneSourceError(
        "cross-origin-dependency",
        "复合图片 scene source 指向未托管的跨域资源。",
      );
    }
  };
  const refresh = async () => {
    const result = await refreshArtifactRendition(
      { artifactId: item.artifactId, revisionId: item.revisionId },
      "source",
      signal,
    );
    if (
      !result.ok ||
      !result.data ||
      result.data.revisionId !== item.revisionId ||
      result.data.digest?.toLowerCase().replace(/^sha256:/, "") !==
        pinned.digest?.toLowerCase().replace(/^sha256:/, "")
    ) {
      throw new ImageSceneSourceError(
        "revision-digest-mismatch",
        "刷新后的复合图片 source 没有固定到原 revision/digest。",
      );
    }
    rendition = result.data;
    assertSourceUrl(rendition.url);
    refreshed = true;
  };
  assertSourceUrl(rendition.url);
  if (renditionNeedsRefresh(rendition)) await refresh();
  let response = await fetch(rendition.url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok && !refreshed && [401, 403, 404].includes(response.status)) {
    await refresh();
    response = await fetch(rendition.url, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  }
  if (!response.ok) {
    throw new ImageSceneSourceError(
      renditionNeedsRefresh(rendition)
        ? "expired-dependency"
        : "dependency-unavailable",
      `复合图片 scene source 读取失败（HTTP ${response.status}）。`,
    );
  }
  const text = await response.text();
  if (!text || new TextEncoder().encode(text).byteLength > 5_000_000) {
    throw new ImageSceneSourceError(
      "invalid-scene",
      "复合图片 scene 为空或超过 5MB 安全上限。",
    );
  }
  const digest = await sha256Text(text);
  if (
    digest !== pinned.digest.toLowerCase().replace(/^sha256:/, "") ||
    digest !== rendition.digest?.toLowerCase().replace(/^sha256:/, "")
  ) {
    throw new ImageSceneSourceError(
      "revision-digest-mismatch",
      "复合图片 scene source 字节与 revision digest 不一致。",
    );
  }
  return { text, rendition, digest };
}

async function loadCompositeImageScene(
  item: LibraryItem,
  signal: AbortSignal,
) {
  const fetched = await fetchPinnedSceneSource(item, signal);
  const source = await parseImageSceneSource(fetched.text);
  if (
    !isDurableLibraryItem(item) ||
    source.baseArtifact.artifactId !== item.artifactId
  ) {
    throw new ImageSceneSourceError(
      "revision-mismatch",
      "复合图片 scene 的 artifact root 与打开目标不一致。",
    );
  }
  const dependencyRevisionIds = imageSceneDependencyRevisionIds(source);
  const expectedSceneClosure = await artifactSceneClosureDigest(fetched.digest);
  if (
    !item.artifact.scene ||
    item.artifact.scene.sceneRevisionId !== item.revisionId ||
    item.artifact.scene.closureDigest
      ?.toLowerCase()
      .replace(/^sha256:/, "") !== expectedSceneClosure ||
    !sameRevisionIds(
      item.artifact.scene.dependencyRevisionIds,
      dependencyRevisionIds,
    )
  ) {
    throw new ImageSceneSourceError(
      "revision-digest-mismatch",
      "复合图片 projection 的 scene revision/closure 与 source 不一致。",
    );
  }
  const dependencies: ImageSceneDependency[] = [];
  const canvasUrls = new Map<string, string>();
  for (const dependency of source.dependencyClosure.dependencies) {
    const resolved = await resolveSceneDependency(dependency, signal);
    dependencies.push(resolved.dependency);
    canvasUrls.set(dependency.id, resolved.canvasUrl);
  }
  return {
    snapshot: imageSceneWithResolvedDependencies(
      source,
      dependencies,
      canvasUrls,
    ),
    updatedAt: source.updatedAt,
    revision: source.revision,
    revisionDigest: source.revisionDigest,
  };
}

function imageArtifactInputIdentity(item: LibraryItem): string {
  return isDurableLibraryItem(item)
    ? `${item.key}:${item.artifactId}:${item.revisionId}`
    : `${item.key}:${item.id}:${String(
        item.meta.editor_version_id || item.url || "",
      )}`;
}

export function useFabricImageEditor(
  item: LibraryItem,
  siteId = "",
  options: FabricImageEditorOptions = {},
): FabricImageEditorState {
  const [canvasElement, setCanvasElement] =
    useState<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<FabricControllerView>(INITIAL_VIEW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sceneDiagnostic, setSceneDiagnostic] =
    useState<FabricImageEditorState["sceneDiagnostic"]>(null);
  const [savedUrl, setSavedUrl] = useState("");
  const [savedProjectUrl, setSavedProjectUrl] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [exportFormat, setExportFormat] =
    useState<FabricImageEditorState["exportFormat"]>("png");
  const [exportQuality, setExportQualityState] = useState(92);
  const [exportScale, setExportScaleState] = useState(1);
  const [aiPrompt, setAiPrompt] = useState("");

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FabricEditorController | null>(null);
  const fabricRef = useRef<FabricNS | null>(null);
  const optionsRef = useRef(options);
  const viewRef = useRef(view);
  const aliveRef = useRef(true);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const aiBusyRef = useRef(false);
  const workingHeadUrlRef = useRef(
    String(
      item.meta.editor_working_head_url ||
        advancedEditorSourceFor(item)?.url ||
        item.url ||
        item.previewUrl ||
        "",
    ),
  );
  const artifactHeadRef = useRef(item);
  const artifactInputIdentityRef = useRef(imageArtifactInputIdentity(item));
  const pendingAborts = useRef(new Set<AbortController>());
  optionsRef.current = options;
  viewRef.current = view;
  const updateDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);
  const nextArtifactInputIdentity = imageArtifactInputIdentity(item);
  if (artifactInputIdentityRef.current !== nextArtifactInputIdentity) {
    artifactInputIdentityRef.current = nextArtifactInputIdentity;
    artifactHeadRef.current = item;
    workingHeadUrlRef.current = String(
      item.meta.editor_working_head_url ||
        advancedEditorSourceFor(item)?.url ||
        item.url ||
        item.previewUrl ||
        "",
    );
  }

  const stageCanvasRef = useCallback((element: HTMLCanvasElement | null) => {
    setCanvasElement(element);
  }, []);

  const makeAbort = useCallback(() => {
    const abort = new AbortController();
    pendingAborts.current.add(abort);
    return abort;
  }, []);

  const finishAbort = useCallback((abort: AbortController) => {
    pendingAborts.current.delete(abort);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      pendingAborts.current.forEach((abort) => abort.abort());
      pendingAborts.current.clear();
    };
  }, []);
  const editorSource = advancedEditorSourceFor(item);
  const compositeSourceRequired =
    isDurableLibraryItem(item) && item.artifactType === "composite_image";
  const structuredSourceRequired =
    compositeSourceRequired ||
    Boolean(item.artifact && editorSource?.structured);
  const sourceUrl =
    item.kind === "image" || item.kind === "xhs" || item.kind === "file"
      ? editorSource && !editorSource.structured
        ? editorSource.url
        : item.previewUrl || item.thumbUrl || item.url || ""
      : "";
  const persistedProjectUrl =
    typeof item.meta.fabric_document_url === "string"
      ? item.meta.fabric_document_url
      : typeof item.meta.editor_project_url === "string"
        ? item.meta.editor_project_url
        : "";
  const projectUrl =
    compositeSourceRequired
      ? editorSource?.url || ""
      : persistedProjectUrl || (editorSource?.structured ? editorSource.url : "");
  const projectSavedAt =
    typeof item.meta.fabric_saved_at === "string"
      ? item.meta.fabric_saved_at
      : "";

  useEffect(() => {
    if (!canvasElement || typeof window === "undefined") return;
    let cancelled = false;
    const abort = makeAbort();
    setLoading(true);
    setError("");
    setNotice("");
    setSceneDiagnostic(null);
    setSavedUrl("");
    setSavedProjectUrl("");
    setSavedAt("");
    updateDirty(false);
    revisionRef.current = 0;
    let controller: FabricEditorController | null = null;
    void (async () => {
      try {
        const fabric = await import("fabric");
        if (cancelled || abort.signal.aborted) return;
        fabricRef.current = fabric;
        controller = new FabricEditorController(
          fabric,
          canvasElement,
          stageContainerRef.current,
          {
            onChange: (next) => {
              if (!cancelled) setView(next);
            },
            onDocumentChange: () => {
              if (cancelled) return;
              revisionRef.current += 1;
              if (controller) {
                saveLocalImageDraft(item, controller.getSnapshot());
              }
              updateDirty(true);
              setSavedUrl("");
              setSavedProjectUrl("");
              setSavedAt("");
            },
            onError: (message) => {
              if (!cancelled) setError(message);
            },
          },
        );
        controllerRef.current = controller;
        let cloudProjectUpdatedAt = "";
        let projectLoaded = false;
        if (projectUrl) {
          try {
            const project = compositeSourceRequired
              ? await loadCompositeImageScene(item, abort.signal)
              : await loadEditableImageProject(projectUrl, abort.signal);
            if (cancelled || abort.signal.aborted) return;
            projectLoaded = await controller.loadSnapshot(project.snapshot);
            cloudProjectUpdatedAt = project.updatedAt;
            if (projectLoaded) {
              if ("revision" in project) {
                revisionRef.current = project.revision;
              }
              setSavedUrl(sourceUrl);
              setSavedProjectUrl(projectUrl);
              setSavedAt(project.updatedAt);
            }
          } catch (caught) {
            if (!isAbortError(caught)) {
              if (structuredSourceRequired) {
                const message =
                  caught instanceof Error
                    ? caught.message
                    : "可编辑图片源暂时无法读取，请重试。";
                setError(message);
                if (caught instanceof ImageSceneSourceError) {
                  setSceneDiagnostic({
                    code: caught.code,
                    message,
                    ...(caught.dependencyId
                      ? { dependencyId: caught.dependencyId }
                      : {}),
                  });
                }
                return;
              }
              setNotice("可编辑工程暂时无法读取，已改用预览图恢复");
            }
          }
        }
        if (structuredSourceRequired && !projectLoaded) {
          const message =
            "可编辑图片源格式无效或缺失，未使用预览 PNG 代替分层工程。";
          setError(message);
          setSceneDiagnostic({
            code: "invalid-scene",
            message,
          });
          return;
        }
        if (!projectLoaded && sourceUrl) {
          const loadedSource = await canvasImageSource(
            sourceUrl,
            siteId,
            item.title,
            renditionDependencyFor(item, sourceUrl),
          );
          if (cancelled || abort.signal.aborted) return;
          const image = await loadImageObject(
            fabric,
            loadedSource.canvasUrl,
            abort.signal,
          );
          if (cancelled || abort.signal.aborted) {
            image.dispose();
            return;
          }
          if (loadedSource.dependency) {
            tagImageDependency(image, loadedSource.dependency);
          }
          controller.setInitialBackground(image, imageDocumentSize(image));
        }
        const localDraft = loadLocalImageDraft(item);
        const cloudTime = Date.parse(cloudProjectUpdatedAt || projectSavedAt) || 0;
        const localTime = Date.parse(localDraft?.updatedAt || "") || 0;
        if (
          localDraft &&
          localTime > cloudTime &&
          !cancelled &&
          !abort.signal.aborted
        ) {
          const restored = await controller.loadSnapshot(localDraft.snapshot);
          if (restored && !cancelled) {
            revisionRef.current += 1;
            updateDirty(true);
            setNotice("已恢复这台设备上尚未同步的修改，正在继续自动保存");
          }
        }
      } catch (caught) {
        if (!cancelled && !isAbortError(caught)) {
          const message =
            caught instanceof Error ? caught.message : "图片画布初始化失败";
          setError(message);
          if (caught instanceof ImageSceneSourceError) {
            setSceneDiagnostic({
              code: caught.code,
              message,
              ...(caught.dependencyId
                ? { dependencyId: caught.dependencyId }
                : {}),
            });
          }
        }
      } finally {
        finishAbort(abort);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      finishAbort(abort);
      if (controllerRef.current === controller) controllerRef.current = null;
      controller?.dispose();
      if (fabricRef.current) fabricRef.current = null;
    };
  }, [
    canvasElement,
    compositeSourceRequired,
    finishAbort,
    item.key,
    item.revisionId,
    item.title,
    makeAbort,
    projectSavedAt,
    projectUrl,
    siteId,
    sourceUrl,
    structuredSourceRequired,
    updateDirty,
  ]);

  const addImageFromUrl = useCallback(
    async (url: string, point?: CanvasClientPoint) => {
      const source = url.trim();
      const controller = controllerRef.current;
      const fabric = fabricRef.current;
      if (!controller || !fabric || !source) return;
      const abort = makeAbort();
      setError("");
      setNotice("正在导入图片…");
      try {
        const loadedSource = await canvasImageSource(
          source,
          siteId,
          item.title,
        );
        if (abort.signal.aborted || controllerRef.current !== controller) return;
        const image = await loadImageObject(
          fabric,
          loadedSource.canvasUrl,
          abort.signal,
        );
        if (abort.signal.aborted || controllerRef.current !== controller) {
          image.dispose();
          return;
        }
        if (loadedSource.dependency) {
          tagImageDependency(image, loadedSource.dependency);
        }
        controller.addImage(image, point);
        setNotice("图片已添加为独立图层");
      } catch (caught) {
        if (!isAbortError(caught)) {
          setError(caught instanceof Error ? caught.message : "图片导入失败");
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, item.title, makeAbort, siteId],
  );
  const replaceSelectedImageFromUrl = useCallback(
    async (url: string) => {
      const source = url.trim();
      const controller = controllerRef.current;
      const fabric = fabricRef.current;
      if (!controller || !fabric || !source) return;
      const abort = makeAbort();
      setError("");
      setNotice("正在替换图片…");
      try {
        const loadedSource = await canvasImageSource(
          source,
          siteId,
          item.title,
        );
        if (abort.signal.aborted || controllerRef.current !== controller) return;
        const image = await loadImageObject(
          fabric,
          loadedSource.canvasUrl,
          abort.signal,
        );
        if (abort.signal.aborted || controllerRef.current !== controller) {
          image.dispose();
          return;
        }
        if (loadedSource.dependency) {
          tagImageDependency(image, loadedSource.dependency);
        }
        if (!controller.replaceActiveImage(image)) {
          throw new Error("请先选择要替换的图片。");
        }
        setNotice("图片已替换，位置和尺寸保持不变");
      } catch (caught) {
        if (!isAbortError(caught)) {
          const error =
            caught instanceof Error ? caught : new Error("图片替换失败");
          setError(error.message);
          throw error;
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, item.title, makeAbort, siteId],
  );

  const addImageFromFile = useCallback(
    async (file: File) => {
      const controller = controllerRef.current;
      const fabric = fabricRef.current;
      if (!controller || !fabric) return;
      if (!file.type.startsWith("image/")) {
        setError("请选择图片文件");
        return;
      }
      const abort = makeAbort();
      setError("");
      setNotice("正在上传图片；完成后会同时加入画布和文件库…");
      try {
        const uploaded = await uploadFile(file, {
          siteId: siteId || "image",
          title: file.name || `${item.title}-图片`,
        });
        const durableUrl = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !durableUrl) {
          throw new Error(uploaded.error || "图片上传失败");
        }
        if (abort.signal.aborted || controllerRef.current !== controller) return;
        const loadedSource = await canvasImageSource(
          durableUrl,
          siteId,
          file.name || item.title,
          {
            kind: "image",
            required: true,
            url: durableUrl,
            digest: await sha256Blob(file),
          },
        );
        if (abort.signal.aborted || controllerRef.current !== controller) return;
        const image = await loadImageObject(
          fabric,
          loadedSource.canvasUrl,
          abort.signal,
        );
        if (abort.signal.aborted || controllerRef.current !== controller) {
          image.dispose();
          return;
        }
        if (loadedSource.dependency) {
          tagImageDependency(image, loadedSource.dependency);
        }
        controller.addImage(image);
        setNotice("图片已加入画布和文件库，并会随工程继续保存");
      } catch (caught) {
        if (!isAbortError(caught)) {
          setError(caught instanceof Error ? caught.message : "图片上传失败");
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, item.title, makeAbort, siteId],
  );

  const addSignatureFromSvg = useCallback(
    async (svg: string) => {
      const controller = controllerRef.current;
      const fabric = fabricRef.current;
      if (!controller || !fabric || !svg.trim() || svg.length > 500_000) return;
      const abort = makeAbort();
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      setError("");
      try {
        const image = await loadImageObject(fabric, dataUrl, abort.signal);
        if (abort.signal.aborted || controllerRef.current !== controller) {
          image.dispose();
          return;
        }
        controller.addSignatureImage(image);
        setNotice("手写签名已作为独立图层插入");
      } catch (caught) {
        if (!isAbortError(caught)) {
          setError(caught instanceof Error ? caught.message : "签名插入失败");
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, makeAbort],
  );

  const makeExportBlob = useCallback(
    async (
      format = exportFormat,
      quality = exportQuality,
      scale = exportScale,
    ) => {
      const controller = controllerRef.current;
      if (!controller) throw new Error("图片画布尚未就绪");
      if (viewRef.current.cropping) {
        throw new Error("请先确认或取消当前裁剪");
      }
      const { canvas, doc } = controller.getDocument();
      const blob = await exportDocBlob(canvas, doc, {
        format,
        quality: Math.max(0.01, Math.min(1, quality / 100)),
        multiplier: Math.max(0.25, Math.min(4, scale)),
      });
      if (!blob) throw new Error("当前画布无法导出，请检查图片来源");
      return blob;
    },
    [exportFormat, exportQuality, exportScale],
  );
  const makeStaticPreviewBlob = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) throw new Error("图片画布尚未就绪");
    if (viewRef.current.cropping) {
      throw new Error("请先确认或取消当前裁剪");
    }
    const { canvas, doc } = controller.getDocument();
    const blob = await exportDocBlob(canvas, doc, {
      format: "png",
      quality: 1,
      multiplier: 1,
    });
    if (!blob) throw new Error("当前画布无法生成静态 preview");
    return blob;
  }, []);

  const download = useCallback(() => {
    void makeExportBlob()
      .then((blob) => downloadImageBlob(blob, item.title, exportFormat))
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "图片下载失败"),
      );
  }, [exportFormat, item.title, makeExportBlob]);
  const downloadDefaultPng = useCallback(async () => {
    try {
      const blob = await makeExportBlob("png", 100, exportScale);
      downloadImageBlob(blob, item.title, "png");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "PNG 下载失败";
      setError(message);
      throw new Error(message);
    }
  }, [exportScale, item.title, makeExportBlob]);

  const save = useCallback(async (): Promise<FabricImageSaveResult | null> => {
    if (savingRef.current) return null;
    if (
      artifactHeadRef.current.artifactType === "composite_image" &&
      !dirtyRef.current
    ) {
      return null;
    }
    const savingRevision = revisionRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSceneDiagnostic(null);
    try {
      const controller = controllerRef.current;
      if (!controller) throw new Error("图片画布尚未就绪");
      const snapshot = controller.getSnapshot();
      const head = artifactHeadRef.current;
      const compositePreview =
        head.artifactType === "composite_image"
          ? await makeStaticPreviewBlob()
          : null;
      if (revisionRef.current !== savingRevision) {
        throw new Error("保存期间画布已变化，本次旧快照未提交");
      }
      const saved =
        head.artifactType === "composite_image"
          ? await persistCompositeImageProject(
              snapshot,
              head,
              siteId,
              `image-scene:${head.id}:${head.revisionId}:${savingRevision}`,
              savingRevision,
              compositePreview!,
            )
          : await persistImageProject(
              snapshot,
              item,
              siteId,
              `image:${item.id}:${savingRevision}`,
              workingHeadUrlRef.current,
              {
                uploadFailed: "保存到我的库失败",
                registerFailed: "图片工程已上传，但登记到我的库失败",
              },
            );
      if (!aliveRef.current) return null;
      if (saved.item) artifactHeadRef.current = saved.item;
      workingHeadUrlRef.current = saved.previewUrl;
      setSavedUrl(saved.previewUrl);
      setSavedProjectUrl(saved.projectUrl);
      setSavedAt(saved.savedAt);
      if (revisionRef.current === savingRevision) {
        updateDirty(false);
        clearLocalImageDraft(item);
      }
      setNotice("");
      optionsRef.current.onSaved?.(saved.previewUrl);
      return {
        url: saved.previewUrl,
        projectUrl: saved.projectUrl,
        savedAt: saved.savedAt,
        versionId: saved.versionId,
        item: saved.item,
        revisionDigest: saved.revisionDigest,
        sourceDigest: saved.sourceDigest,
        dependencyClosureDigest: saved.dependencyClosureDigest,
        dependencyRevisionIds: saved.dependencyRevisionIds,
      };
    } catch (caught) {
      if (aliveRef.current && !isAbortError(caught)) {
        const message =
          caught instanceof Error ? caught.message : "图片保存失败";
        setError(message);
        if (caught instanceof ImageSceneSourceError) {
          setSceneDiagnostic({
            code: caught.code,
            message,
            ...(caught.dependencyId
              ? { dependencyId: caught.dependencyId }
              : {}),
          });
        }
      }
      return null;
    } finally {
      savingRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [item, makeStaticPreviewBlob, siteId, updateDirty]);

  const runAiEdit = useCallback(async () => {
    if (aiBusyRef.current || !aiPrompt.trim()) return;
    if (viewRef.current.layers.some((layer) => layer.locked)) {
      setError("请先解锁图层，再让 AI 替换整个画布");
      return;
    }
    const controller = controllerRef.current;
    const fabric = fabricRef.current;
    if (!controller || !fabric) return;
    aiBusyRef.current = true;
    setAiBusy(true);
    setError("");
    setNotice("AI 正在处理当前画布…");
    const abort = makeAbort();
    try {
      const source = await makeExportBlob("png", 100, 1);
      const execute =
        optionsRef.current.onAiEdit ??
        ((prompt: string, image: Blob) =>
          aiEditImage(prompt, image, {
            siteId: siteId || "image",
            signal: abort.signal,
          }));
      const resultUrl = await execute(aiPrompt.trim(), source);
      if (abort.signal.aborted || controllerRef.current !== controller) return;
      const loadedSource = await canvasImageSource(
        resultUrl,
        siteId,
        `${item.title}-AI`,
      );
      if (abort.signal.aborted || controllerRef.current !== controller) return;
      const image = await loadImageObject(
        fabric,
        loadedSource.canvasUrl,
        abort.signal,
      );
      if (abort.signal.aborted || controllerRef.current !== controller) {
        image.dispose();
        return;
      }
      if (loadedSource.dependency) {
        tagImageDependency(image, loadedSource.dependency);
      }
      if (controller.replaceWithBackground(image)) {
        setNotice("AI 结果已载入画布，可撤销或继续编辑");
      } else {
        setNotice("");
      }
    } catch (caught) {
      if (!isAbortError(caught) && aliveRef.current) {
        setError(caught instanceof Error ? caught.message : "AI 改图失败");
      }
    } finally {
      finishAbort(abort);
      aiBusyRef.current = false;
      if (aliveRef.current) setAiBusy(false);
    }
  }, [
    aiPrompt,
    finishAbort,
    item.title,
    makeAbort,
    makeExportBlob,
    siteId,
  ]);

  const controller = () => controllerRef.current;

  return {
    loading,
    saving,
    aiBusy,
    error,
    notice,
    sceneDiagnostic,
    savedUrl,
    savedProjectUrl,
    savedAt,
    dirty,
    editRevision: revisionRef.current,
    stageCanvasRef,
    stageContainerRef,
    doc: view.doc,
    canvasBackground: view.canvasBackground,
    setCanvasBackground: (color) => controller()?.setCanvasBackground(color),
    resizeDoc: (width, height) => controller()?.resizeDoc(width, height),
    zoom: view.zoom,
    setZoom: (zoom) => controller()?.setZoom(zoom),
    zoomIn: () => controller()?.zoomBy(1.2),
    zoomOut: () => controller()?.zoomBy(1 / 1.2),
    zoomFit: () => controller()?.zoomFit(),
    zoomTo100: () => controller()?.zoomTo100(),
    activeTool: view.activeTool,
    setActiveTool: (tool) => controller()?.setTool(tool),
    brush: view.brush,
    setBrush: (patch) => controller()?.setBrush(patch),
    addText: (preset) => controller()?.addText(preset),
    addShape: (kind) => controller()?.addShape(kind),
    addStickyNote: (color) => controller()?.addStickyNote(color),
    addSignature: (text, color) => controller()?.addSignature(text, color),
    addSignatureFromSvg,
    addTable: (rows, columns) => controller()?.addTable(rows, columns),
    addImageFromUrl,
    replaceSelectedImageFromUrl,
    addImageFromFile,
    layers: view.layers,
    selectLayer: (id) => controller()?.selectLayer(id),
    moveLayer: (id, direction) => controller()?.moveLayer(id, direction),
    toggleLayerLock: (id) => controller()?.toggleLayerLock(id),
    toggleLayerVisible: (id) => controller()?.toggleLayerVisible(id),
    removeLayer: (id) => controller()?.removeLayer(id),
    duplicateLayer: async (id) => controller()?.duplicateLayer(id),
    selected: view.selected,
    beginGesture: () => controller()?.beginGesture(),
    endGesture: () => controller()?.endGesture(),
    cancelGesture: () => controller()?.cancelGesture(),
    setSelectedOpacity: (value) => controller()?.setSelectedOpacity(value),
    setSelectedShadow: (patch) => controller()?.setSelectedShadow(patch),
    setSelectedStroke: (patch) => controller()?.setSelectedStroke(patch),
    setSelectedFill: (color) => controller()?.setSelectedFill(color),
    setSelectedRadius: (px) => controller()?.setSelectedRadius(px),
    setSelectedGeometry: (patch) => controller()?.setSelectedGeometry(patch),
    setSelectedImageFit: (mode) => controller()?.setSelectedImageFit(mode),
    setSelectedText: (patch) => controller()?.setSelectedText(patch),
    setSelectedTableStyle: (patch) =>
      controller()?.setSelectedTableStyle(patch),
    resizeSelectedTable: (rows, columns) =>
      controller()?.resizeSelectedTable(rows, columns),
    deleteSelected: () => controller()?.deleteSelected(),
    duplicateSelected: async () => controller()?.duplicateSelected(),
    transformInfo: view.transformInfo,
    rotateTarget: (delta) => controller()?.rotateTarget(delta),
    setTargetAngle: (angle) => controller()?.setTargetAngle(angle),
    flipTarget: (axis) => controller()?.flipTarget(axis),
    filterInfo: view.filterInfo,
    setFilter: (key, value) => controller()?.setFilter(key, value),
    resetFilters: () => controller()?.resetFilters(),
    cropping: view.cropping,
    cropRatio: view.cropRatio,
    startCrop: () => controller()?.startCrop(),
    setCropRatio: (ratio) => controller()?.setCropRatio(ratio),
    confirmCrop: async () => controller()?.confirmCrop(),
    cancelCrop: () => controller()?.cancelCrop(),
    canUndo: view.canUndo,
    canRedo: view.canRedo,
    undo: () => controller()?.undo(),
    redo: () => controller()?.redo(),
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality: (quality) =>
      setExportQualityState(Math.max(1, Math.min(100, quality))),
    exportScale,
    setExportScale: (scale) =>
      setExportScaleState(Math.max(0.25, Math.min(4, scale))),
    download,
    downloadDefaultPng,
    save,
    aiAvailable: true,
    aiPrompt,
    setAiPrompt,
    runAiEdit,
  };
}
