"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FabricImage } from "fabric";
import { useUI } from "../../i18n/ui/useUI";
import { aiEditImage } from "../../lib/image-ai-edit";
import { uploadFile } from "../../lib/database";
import {
  canvasSafeUrl,
  fetchMediaBlob,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import { advancedEditorSourceFor } from "../advanced-features";
import { DEFAULT_LOSSY_QUALITY } from "../media-editors/visual-formats";
import { artifactSaveStepMessage } from "../doc-editors/artifact-save-contract";
import { getArtifactItem, refreshArtifactRendition } from "../artifact-client";
import type { ImageSnapshot } from "../collab/adapters/image";
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
import {
  LOCAL_SAVE_MAX_PIXELS,
  embedPixelSources,
  readLocalImageDataUrl,
} from "./local-save-pixels";
import {
  sameImageContent,
  type ImageRecoveryRestoreResult,
} from "./image-remote-delta";
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
  parseImageSceneSource,
  sha256Blob,
  sha256Text,
  type ImageSceneDependency,
} from "./image-scene-source";
import {
  canvasImageSource,
  openFabricImagePixels,
  type ImageDependencySeed,
} from "./fabric-image-open";
import {
  INITIAL_FILTERS,
  type CanvasClientPoint,
  type ExportFormat,
  type FabricImageEditorOptions,
  type FabricImageSaveResult,
  type FabricImageEditorState,
} from "./types";
import { PsdCompositeError, isPsdSource } from "./psd-composite";
import {
  exportVectorSvg,
  isVectorImageItem,
  vectorSvgToSnapshot,
  VectorSvgError,
} from "./vector-svg-scene";
import {
  designAssetRefs,
  designAssetUrl,
  designDocumentToSnapshot,
  isDesignDocumentItem,
  type DesignAssetImage,
  unsupportedDesignMessage,
} from "./design-document-snapshot";
import {
  hydrateDesignCanvasSource,
  planDesignCanvasSource,
} from "../design-canvas/design-canvas-source";
import {
  firstForkReceiptMatches,
  imageEditorOpenIdentity,
  imageSaveAdmitted,
  isNewImageSourceSession,
} from "./image-source-ready";
import { recordUserMutation, resetUserMutation } from "../user-edit-session";

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
  controlClientCoords: null,
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

/** 多人同改：路由从外面传进来的几个开关与回调。 */
export interface FabricImageCollabOptions {
  /** 浏览者、或别人在专业模式编辑：画布不选中不拖动，任何改动立刻还原。 */
  readOnly?: boolean;
  /** 本地多了一步编辑（拖完、改完、加了图层……）；路由据此把最新画布推给房间。 */
  onLocalChange?: () => void;
  /** 存成功后告诉房间这一版已落库（新版本 id）。 */
  onSavedRevision?: (revisionId: string) => void;
}

export interface FabricImageCollabHandle {
  readOnly: boolean;
  /** 随别人的改动套进画布而递增，用来让「别人的选择框」重新量位置。 */
  tick: number;
  /** 最近一次套进来的远端改动摘要（对象 id + 字段名，不含取值），诊断用。 */
  remoteDelta: string;
  /** 协同用的画布现状（不含裁剪框）；画布还没起来时为 null。 */
  snapshot(): ImageSnapshot | null;
  ensureIds(): void;
  applyRemote(snapshot: ImageSnapshot): void;
  objectBoxes(ids: readonly string[]): Array<{ id: string; left: number; top: number; width: number; height: number }>;
  /** 读出别人保存的新版本（AI / 专业模式）并把「已保存的基线」换成它；读不到返回 null。 */
  adoptRevision(artifactId: string, revisionId: string): Promise<ImageSnapshot | null>;
  /** 这一版已被房间里的存档人落库：清掉「未保存」。 */
  markClean(): void;
}

export function useFabricImageEditor(
  item: LibraryItem,
  siteId = "",
  options: FabricImageEditorOptions & { collab?: FabricImageCollabOptions } = {},
): FabricImageEditorState & { collab: FabricImageCollabHandle } {
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
  const [sourceReady, setSourceReady] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  // SVG features Fabric cannot carry: the item opens view-only until the user
  // explicitly converts (the stored original is never touched either way).
  const [vectorLosses, setVectorLosses] = useState<string[]>([]);
  const [vectorConverted, setVectorConverted] = useState(false);
  const conversionPending = vectorLosses.length > 0 && !vectorConverted;
  const conversionPendingRef = useRef(false);
  conversionPendingRef.current = conversionPending;
  const [savedUrl, setSavedUrl] = useState("");
  const [savedProjectUrl, setSavedProjectUrl] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [exportFormat, setExportFormat] =
    useState<FabricImageEditorState["exportFormat"]>("png");
  // 有损格式的默认画质：和下载菜单里那条 JPG/WebP 条目用的是同一个数
  // （`media-editors/visual-formats.ts` 的 DEFAULT_LOSSY_QUALITY）。
  const [exportQuality, setExportQualityState] = useState(DEFAULT_LOSSY_QUALITY);
  const [exportScale, setExportScaleState] = useState(1);
  const [aiPrompt, setAiPrompt] = useState("");
  const [collabTick, setCollabTick] = useState(0);
  const [remoteDelta, setRemoteDelta] = useState("");
  const tt = useUI();
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const sourceSessionRef = useRef<{
    key: string;
    nonce: number;
    artifactId?: string;
    rootAssetId?: string;
  } | null>(null);
  const firstForkReceiptRef = useRef<{
    rootAssetId: string;
    artifactId: string;
  } | null>(null);
  const legacyReceiptAliasRef = useRef<{
    rootAssetId: string;
    itemIdentities: Set<string>;
    openIdentity: string;
    nonce: number;
  } | null>(null);
  const openIdentityRef = useRef("");
  const candidateOpenIdentity = imageEditorOpenIdentity(item);
  const currentSourceSession = sourceSessionRef.current;
  const currentArtifactId =
    isDurableLibraryItem(item) ? item.artifactId : undefined;
  const currentRootAssetId = String(
    item.meta.root_asset_id || item.meta.parent_asset_id || item.id,
  );
  const currentInputIdentity = imageArtifactInputIdentity(item);
  // Keep the component identity through a first fork only after this hook has
  // received that fork's save receipt. Other artifacts with the same root are
  // separate opens.
  let openIdentity = candidateOpenIdentity;
  if (
    currentSourceSession &&
    currentSourceSession.nonce === reloadNonce &&
    currentSourceSession.artifactId === currentArtifactId &&
    currentArtifactId
  ) {
    openIdentity = currentSourceSession.key;
  } else if (
    firstForkReceiptMatches({
      current: currentSourceSession,
      nonce: reloadNonce,
      rootAssetId: currentRootAssetId,
      artifactId: currentArtifactId || "",
      receipt: firstForkReceiptRef.current,
    }) &&
    currentArtifactId &&
    currentSourceSession
  ) {
    currentSourceSession.artifactId = currentArtifactId;
    openIdentity = currentSourceSession.key;
    firstForkReceiptRef.current = null;
  } else if (
    !currentArtifactId &&
    currentSourceSession &&
    currentSourceSession.nonce === reloadNonce &&
    currentSourceSession.rootAssetId === currentRootAssetId &&
    legacyReceiptAliasRef.current?.nonce === reloadNonce &&
    legacyReceiptAliasRef.current.rootAssetId === currentRootAssetId &&
    legacyReceiptAliasRef.current.itemIdentities.has(currentInputIdentity)
  ) {
    openIdentity = legacyReceiptAliasRef.current.openIdentity;
  }
  openIdentityRef.current = openIdentity;

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FabricEditorController | null>(null);
  const fabricRef = useRef<FabricNS | null>(null);
  const optionsRef = useRef(options);
  const viewRef = useRef(view);
  const aliveRef = useRef(true);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const sourceReadyRef = useRef(false);
  const sceneDiagnosticRef = useRef<FabricImageEditorState["sceneDiagnostic"]>(null);
  const revisionRef = useRef(0);
  /** 只数本人的编辑（不含别人同步过来的改动），恢复草稿时据此判断有没有被新手势打断。 */
  const localEditsRef = useRef(0);
  /** 画布当前所基于的云端版本的保存时刻（ms）；比它旧的本机/草稿恢复不再盖上来。 */
  const cloudSavedAtRef = useRef(0);
  /** 本页自己提交过的版本：协同房间把它当「外部版本」回推时不再套回画布。 */
  const ownRevisionIdsRef = useRef(new Set<string>());
  /** 上一次成功提交：哪个编辑计数、哪次打开、回执。 */
  const lastSaveRef = useRef<{
    revision: number;
    identity: string;
    result: FabricImageSaveResult;
  } | null>(null);
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
  const supersededArtifactRevisionsRef = useRef(new Map<string, Set<string>>());
  const pendingAborts = useRef(new Set<AbortController>());
  optionsRef.current = options;
  viewRef.current = view;
  sceneDiagnosticRef.current = sceneDiagnostic;
  const updateDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);
  const nextArtifactInputIdentity = imageArtifactInputIdentity(item);
  if (artifactInputIdentityRef.current !== nextArtifactInputIdentity) {
    artifactInputIdentityRef.current = nextArtifactInputIdentity;
    const superseded = isDurableLibraryItem(item) &&
      supersededArtifactRevisionsRef.current.get(item.artifactId)?.has(item.revisionId);
    if (!superseded) {
      artifactHeadRef.current = item;
      workingHeadUrlRef.current = String(
        item.meta.editor_working_head_url ||
          advancedEditorSourceFor(item)?.url ||
          item.url ||
          item.previewUrl ||
          "",
      );
    }
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
  // Legacy design canvas projects open here too (one editor). They are read
  // as a design-document and converted to a scene at read time; the stored
  // revision is not rewritten.
  const designDocumentSource = isDesignDocumentItem(item);
  // A stored vector_image is read as SVG (sanitized) unless a Fabric project
  // from an earlier save of this editor already exists for the revision.
  const vectorImageItem = isVectorImageItem(item);
  const compositeSourceRequired =
    isDurableLibraryItem(item) &&
    item.artifactType === "composite_image" &&
    !designDocumentSource;
  const structuredSourceRequired =
    compositeSourceRequired ||
    designDocumentSource ||
    vectorImageItem ||
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
    const session = {
      key: openIdentity,
      nonce: reloadNonce,
      artifactId: isDurableLibraryItem(item) ? item.artifactId : undefined,
      rootAssetId: String(
        item.meta.root_asset_id || item.meta.parent_asset_id || item.id,
      ),
    };
    const isNewSourceSession = isNewImageSourceSession(
      sourceSessionRef.current,
      session,
    );
    sourceSessionRef.current = session;
    if (isNewSourceSession) {
      resetUserMutation(openIdentity);
      setLoading(true);
      setError("");
      setNotice("");
      setSceneDiagnostic(null);
      sceneDiagnosticRef.current = null;
      sourceReadyRef.current = false;
      setSourceReady(false);
      setSavedUrl("");
      setSavedProjectUrl("");
      setSavedAt("");
      setVectorLosses([]);
      setVectorConverted(false);
      updateDirty(false);
      revisionRef.current = 0;
      localEditsRef.current = 0;
      cloudSavedAtRef.current = 0;
    }
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
              localEditsRef.current += 1;
              if (controller) {
                saveLocalImageDraft(item, controller.getSnapshot());
              }
              updateDirty(true);
              setSavedUrl("");
              setSavedProjectUrl("");
              setSavedAt("");
              const mutationKey = openIdentityRef.current;
              if (mutationKey) recordUserMutation(mutationKey);
              optionsRef.current.collab?.onLocalChange?.();
            },
            onRemoteApplied: (summary) => {
              if (cancelled) return;
              setRemoteDelta(summary);
              // 别人的改动：这份画布和库里最近一版不同了；不是本地的一步编辑。
              // 本人这次打开还没动过手时不标未保存（只打开不改 = 0 个新版本，10-23 W09 R3）：
              // 自动保存本来就只在本人编辑后才存，标脏只会留下本机恢复记录、下次打开被「恢复」并发布。
              revisionRef.current += 1;
              if (localEditsRef.current > 0 || dirtyRef.current) updateDirty(true);
              setCollabTick((value) => value + 1);
            },
            onRemoteRelabeled: () => {
              if (cancelled) return;
              setRemoteDelta("relabel");
              setCollabTick((value) => value + 1);
              optionsRef.current.collab?.onLocalChange?.();
            },
            onError: (message) => {
              if (!cancelled) setError(message);
            },
          },
        );
        controllerRef.current = controller;
        let cloudProjectUpdatedAt = "";
        let projectLoaded = false;
        // Native local editor: the host's own stored project (already matched to this artifact and
        // library revision by the mount) opens the canvas with no remote read, so a restart works
        // offline and after any signed URL expired. If it cannot be loaded the original opens with a
        // notice; nothing is saved or cleared by this step.
        let seededFromHost = false;
        const hostProject = isNewSourceSession
          ? parseFabricImageProject(optionsRef.current.localProject)
          : null;
        if (hostProject) {
          try {
            seededFromHost = await controller.loadSnapshot(hostProject.snapshot);
          } catch (caught) {
            if (isAbortError(caught)) throw caught;
          }
          if (cancelled || abort.signal.aborted) return;
          if (seededFromHost) {
            projectLoaded = true;
            setNotice("已从本机保存的工程打开");
          } else {
            setNotice("本机保存的修改无法载入，已打开原图；保存会替换它们");
          }
        }
        if (seededFromHost) {
          // The stored project is the document; no source or cloud project is read.
        } else if (designDocumentSource) {
          try {
            const hydrated = await hydrateDesignCanvasSource(
              planDesignCanvasSource(item),
              async (url) =>
                (
                  await fetchMediaBlob(url, {
                    cache: "no-store",
                    maxBytes: 20_000_000,
                    signal: abort.signal,
                  })
                ).text(),
            );
            if (cancelled || abort.signal.aborted) return;
            if (!hydrated.ok) throw new Error(hydrated.error);
            // Image / icon / chart-embed elements: assetId is a platform asset
            // key. Load each once to learn its natural size; a missing asset
            // fails the open instead of dropping the layer.
            const assets: Record<string, DesignAssetImage> = {};
            for (const ref of designAssetRefs(hydrated.project)) {
              if (assets[ref.assetId]) continue;
              const url = designAssetUrl(ref.assetId);
              if (!url) {
                throw new Error(`设计稿素材引用无效（${ref.assetId}），未改用空白画布覆盖原件。`);
              }
              const safe = canvasSafeUrl(url);
              try {
                const probe = await loadImageObject(fabric, safe, abort.signal);
                assets[ref.assetId] = {
                  url: safe,
                  width: probe.width || 0,
                  height: probe.height || 0,
                };
                probe.dispose();
              } catch (caught) {
                if (isAbortError(caught)) throw caught;
                throw new Error(`设计稿素材无法载入（${ref.assetId}），未改用空白画布覆盖原件。`);
              }
              if (cancelled || abort.signal.aborted) return;
            }
            const converted = designDocumentToSnapshot(hydrated.project, assets);
            if (converted.unsupported.length) {
              throw new Error(unsupportedDesignMessage(converted.unsupported));
            }
            projectLoaded = await controller.loadSnapshot(converted.snapshot);
            if (!projectLoaded) throw new Error("设计稿无法载入到图片画布。");
            cloudProjectUpdatedAt = "";
          } catch (caught) {
            if (cancelled || isAbortError(caught)) return;
            const message =
              caught instanceof Error
                ? caught.message
                : "设计稿暂时无法读取，请重试。";
            setError(message);
            setSceneDiagnostic({ code: "invalid-scene", message });
            return;
          }
        } else if (vectorImageItem && !projectUrl) {
          try {
            const svgUrl = editorSource?.url || item.url || item.previewUrl || "";
            if (!svgUrl) throw new VectorSvgError("这份矢量图没有可读取的 SVG 源。");
            const svgBlob = await fetchMediaBlob(svgUrl, {
              cache: "no-store",
              maxBytes: 8 * 1024 * 1024,
              signal: abort.signal,
            });
            const svgText = await svgBlob.text();
            if (cancelled || abort.signal.aborted) return;
            const scene = await vectorSvgToSnapshot(fabric, svgText);
            if (cancelled || abort.signal.aborted) return;
            projectLoaded = await controller.loadSnapshot(scene.snapshot);
            if (!projectLoaded) throw new VectorSvgError("矢量图无法载入到画布。");
            if (scene.losses.length > 0) {
              setVectorLosses(scene.losses);
              setVectorConverted(false);
            } else if (scene.removed > 0) {
              setNotice(`已清除 ${scene.removed} 处不安全内容（脚本、事件属性等），不影响显示。`);
            }
          } catch (caught) {
            if (cancelled || isAbortError(caught)) return;
            const message =
              caught instanceof Error ? caught.message : "矢量图暂时无法读取，请重试。";
            setError(message);
            setSceneDiagnostic({ code: "invalid-scene", message });
            return;
          }
        } else if (projectUrl) {
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
        // The work names a picture URL but this item kind has no source path (an unrecognised kind, e.g.
        // a library type the editor does not read): refuse visibly. Opening an empty canvas as ready
        // would pass for the work being open, and a save would then replace it.
        if (!projectLoaded && !sourceUrl && (item.previewUrl || item.thumbUrl || item.url)) {
          setError(
            "这份作品的类型暂时无法在图片编辑器里读取原图，没有改用空白画布覆盖它。",
          );
          return;
        }
        if (!projectLoaded && sourceUrl) {
          const loadedSource = await openFabricImagePixels({
            source: sourceUrl,
            siteId,
            title: item.title,
            evidence: renditionDependencyFor(item, sourceUrl),
            hints: {
              format: editorSource?.format,
              mime: String(
                item.meta.source_media_type ||
                  item.meta.preview_media_type ||
                  item.descriptor?.contentType ||
                  "",
              ),
              name: String(item.meta.filename || item.title || sourceUrl),
              previewUrl: item.previewUrl,
              thumbUrl: item.thumbUrl,
              signal: abort.signal,
            },
          });
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
        cloudSavedAtRef.current = cloudTime;
        const localTime = Date.parse(localDraft?.updatedAt || "") || 0;
        if (
          localDraft &&
          !seededFromHost &&
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
        if (!cancelled) {
          sourceReadyRef.current = true;
          setSourceReady(true);
          setLoading(false);
        }
      } catch (caught) {
        if (!cancelled && !isAbortError(caught)) {
          const message =
            caught instanceof PsdCompositeError
              ? ttRef.current(caught.message)
              : caught instanceof Error
                ? caught.message
                : "图片画布初始化失败";
          setError(message);
          if (isNewSourceSession) {
            sourceReadyRef.current = false;
            setSourceReady(false);
          }
          if (caught instanceof ImageSceneSourceError) {
            const diagnostic = {
              code: caught.code,
              message,
              ...(caught.dependencyId
                ? { dependencyId: caught.dependencyId }
                : {}),
            };
            sceneDiagnosticRef.current = diagnostic;
            setSceneDiagnostic(diagnostic);
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
    finishAbort,
    openIdentity,
    makeAbort,
    reloadNonce,
    siteId,
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
        const loadedSource = await openFabricImagePixels({
          source,
          siteId,
          title: item.title,
          hints: { name: source, signal: abort.signal },
        });
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
          setError(
            caught instanceof PsdCompositeError
              ? tt(caught.message)
              : caught instanceof Error
                ? caught.message
                : "图片导入失败",
          );
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, item.title, makeAbort, siteId, tt],
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
        const loadedSource = await openFabricImagePixels({
          source,
          siteId,
          title: item.title,
          hints: { name: source, signal: abort.signal },
        });
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
            caught instanceof PsdCompositeError
              ? new Error(tt(caught.message))
              : caught instanceof Error
                ? caught
                : new Error("图片替换失败");
          setError(error.message);
          throw error;
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, item.title, makeAbort, siteId, tt],
  );

  const addImageFromFile = useCallback(
    async (file: File) => {
      const controller = controllerRef.current;
      const fabric = fabricRef.current;
      if (!controller || !fabric) return;
      if (optionsRef.current.localImport) {
        // Native local editor: the file's own bytes become the layer; no upload, no token, no network.
        const abort = makeAbort();
        setError("");
        setNotice("正在插入图片…");
        try {
          const dataUrl = await readLocalImageDataUrl(file);
          if (abort.signal.aborted || controllerRef.current !== controller) return;
          const image = await loadImageObject(fabric, dataUrl, abort.signal);
          if (abort.signal.aborted || controllerRef.current !== controller) {
            image.dispose();
            return;
          }
          if ((image.width || 0) * (image.height || 0) > LOCAL_SAVE_MAX_PIXELS) {
            image.dispose();
            throw new Error("图片像素太多，无法完整保存到本机，没有插入；之前的保存仍然保留");
          }
          controller.addImage(image);
          setNotice("图片已加入画布，保存时随工程存到本机（没有上传）");
        } catch (caught) {
          if (!isAbortError(caught)) {
            setNotice("");
            setError(caught instanceof Error && caught.message ? caught.message : "图片无法插入");
          }
        } finally {
          finishAbort(abort);
        }
        return;
      }
      const fileName = file.name || `${item.title}-图片`;
      const psdFile = isPsdSource({ name: fileName, mime: file.type });
      if (!psdFile && !file.type.startsWith("image/")) {
        setError("请选择图片文件");
        return;
      }
      const abort = makeAbort();
      setError("");
      setNotice("正在上传图片；完成后会同时加入画布和文件库…");
      try {
        const psdBytes = psdFile ? await file.arrayBuffer() : undefined;
        const loadedSource = psdFile
          ? await openFabricImagePixels({
              source: fileName,
              siteId,
              title: fileName,
              hints: {
                format: "psd",
                mime: file.type,
                name: fileName,
                bytes: psdBytes,
                signal: abort.signal,
              },
            })
          : null;
        const uploaded = await uploadFile(file, {
          siteId: siteId || "image",
          title: fileName,
        });
        const durableUrl = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !durableUrl) {
          throw new Error(uploaded.error || "图片上传失败");
        }
        if (abort.signal.aborted || controllerRef.current !== controller) return;
        const pixels =
          loadedSource ||
          (await openFabricImagePixels({
            source: durableUrl,
            siteId,
            title: fileName,
            evidence: {
              kind: "image",
              required: true,
              url: durableUrl,
              digest: await sha256Blob(file),
            },
            hints: {
              mime: file.type,
              name: fileName,
              signal: abort.signal,
            },
          }));
        if (abort.signal.aborted || controllerRef.current !== controller) return;
        const image = await loadImageObject(
          fabric,
          pixels.canvasUrl,
          abort.signal,
        );
        if (abort.signal.aborted || controllerRef.current !== controller) {
          image.dispose();
          return;
        }
        if (pixels.dependency) {
          tagImageDependency(image, pixels.dependency);
        }
        controller.addImage(image);
        setNotice("图片已加入画布和文件库，并会随工程继续保存");
      } catch (caught) {
        if (!isAbortError(caught)) {
          setError(
            caught instanceof PsdCompositeError
              ? tt(caught.message)
              : caught instanceof Error
                ? caught.message
                : "图片上传失败",
          );
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, item.title, makeAbort, siteId, tt],
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

  const captureRecovery = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || loading || !sourceReadyRef.current) return null;
    return createFabricImageProject(controller.getSnapshot());
  }, [loading]);

  const captureRecoveryRevision = useCallback((revision: string | number) => {
    const controller = controllerRef.current;
    if (
      !controller ||
      !sourceReadyRef.current ||
      !Object.is(revisionRef.current, revision)
    ) return null;
    const payload = createFabricImageProject(controller.getSnapshot());
    // Keep the receipt tied to the exact bytes and monotonic revision that the
    // shared draft controller asked for. Selection-only changes do not advance
    // this revision and never schedule this capture themselves.
    if (!Object.is(revisionRef.current, revision)) return null;
    return { revision, payload };
  }, []);

  /**
   * Native host save: the live project and the edit revision it was captured at. Every image layer
   * carries its own (already loaded) pixels, so the stored project opens after the signed URL it was
   * loaded from expired. The snapshot and revision are read in one synchronous step; encoding then runs
   * async, so an edit that lands meanwhile only makes the next save newer. Throws if a layer's pixels
   * cannot be embedded within the budget; nothing is sent in that case.
   */
  const captureLocalSave = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || !sourceReadyRef.current) return null;
    const revision = revisionRef.current;
    const { snapshot, sources } = controller.getSnapshotWithPixelSources();
    await embedPixelSources(sources);
    return { revision, project: createFabricImageProject(snapshot) };
  }, []);

  /** The edit revision a local save would capture now (no pixels read). */
  const captureLocalRevision = useCallback(() => {
    if (!controllerRef.current || !sourceReadyRef.current) return null;
    return revisionRef.current;
  }, []);

  /** Clear "unsaved" only if no edit landed after `revision` (an old ack must not clean new work). */
  const markLocalSaved = useCallback((revision: number) => {
    if (!Object.is(revisionRef.current, revision)) return false;
    updateDirty(false);
    return true;
  }, [updateDirty]);

  const restoreRecovery = useCallback(async (
    payload: unknown,
    updatedAt?: number,
  ): Promise<ImageRecoveryRestoreResult> => {
    const project = parseFabricImageProject(payload);
    const controller = controllerRef.current;
    if (!project || !controller || !sourceReadyRef.current) return false;
    // 已经在画布上（保存后残留的本机记录）：什么也不用恢复，也不把画布标成未保存。
    if (sameImageContent(project.snapshot, controller.getSnapshot(), { ignoreIds: true })) return "unchanged";
    // 比画布所基于的云端版本还旧：不拿旧内容盖掉更新的版本（记录本身保留，不删）。
    if (
      typeof updatedAt === "number" &&
      updatedAt > 0 &&
      cloudSavedAtRef.current > 0 &&
      updatedAt <= cloudSavedAtRef.current
    ) return "stale";
    const identity = openIdentityRef.current;
    const startingEdits = localEditsRef.current;
    // Server draft reads happen after the source is ready. Freeze edits while
    // Fabric resolves the snapshot so a late restore cannot overwrite a new
    // gesture; restore the collaboration permission that is current at finish.
    controller.setReadOnly(true);
    try {
      const restored = await controller.loadSnapshot(project.snapshot);
      if (
        !restored ||
        !aliveRef.current ||
        controllerRef.current !== controller ||
        openIdentityRef.current !== identity ||
        localEditsRef.current !== startingEdits
      ) return false;
      revisionRef.current += 1;
      updateDirty(true);
      setSavedUrl("");
      setSavedProjectUrl("");
      setSavedAt("");
      setNotice("已恢复服务器工作草稿");
      optionsRef.current.collab?.onLocalChange?.();
      return true;
    } finally {
      if (controllerRef.current === controller) {
        controller.setReadOnly(
          Boolean(optionsRef.current.collab?.readOnly) || conversionPendingRef.current,
        );
      }
    }
  }, [updateDirty]);

  const download = useCallback(() => {
    void makeExportBlob()
      .then((blob) => downloadImageBlob(blob, item.title, exportFormat))
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "图片下载失败"),
      );
  }, [exportFormat, item.title, makeExportBlob]);
  /**
   * 按指定格式与画质交付一次，不动用户在导出面板里选的那一套。
   *
   * 下载菜单里的每个格式条目走的都是这条：菜单点一下就该拿到那个格式，
   * 不该顺手把面板设置改掉。
   */
  const downloadAs = useCallback(
    async (format: ExportFormat, quality = exportQuality) => {
      try {
        const blob = await makeExportBlob(format, quality, exportScale);
        downloadImageBlob(blob, item.title, format);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "图片下载失败";
        setError(message);
        throw new Error(message);
      }
    },
    [exportQuality, exportScale, item.title, makeExportBlob],
  );
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
    // 外壳在会话快照重试 / 会话补建后会再要一次保存：画布从上次提交后没动过，就交回上次回执，
    // 不再把同一份内容提交成一个新版本（10-23 W09 实测：一次改动出了两个 revision）。
    const last = lastSaveRef.current;
    if (
      last &&
      !dirtyRef.current &&
      last.revision === revisionRef.current &&
      last.identity === openIdentityRef.current &&
      last.result.item === artifactHeadRef.current
    ) return last.result;
    const admitted = imageSaveAdmitted({
      loading,
      sourceReady: sourceReadyRef.current,
      sceneDiagnostic: sceneDiagnosticRef.current,
    });
    if (!admitted.ok) {
      setError(admitted.error);
      return null;
    }
    if (
      artifactHeadRef.current.artifactType === "composite_image" &&
      !dirtyRef.current
    ) {
      return null;
    }
    let savingRevision = revisionRef.current;
    const savingIdentity = openIdentityRef.current;
    const savingController = controllerRef.current;
    const sourceItem = artifactHeadRef.current;
    const head = sourceItem;
    const workingHeadUrl = workingHeadUrlRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const controller = savingController;
      if (!controller) throw new Error("图片画布尚未就绪");
      // The static preview is rasterized from the live canvas. If a newer edit
      // lands before it is captured, capture again so the persisted project and
      // preview stay paired (连点几下时不再报「保存失败」). Edits after upload
      // starts remain dirty for the next save.
      let snapshot = controller.getSnapshot();
      let previewBlob = await makeStaticPreviewBlob();
      for (let attempt = 0; ; attempt += 1) {
        if (
          openIdentityRef.current !== savingIdentity ||
          controllerRef.current !== savingController
        ) return null;
        if (revisionRef.current === savingRevision) break;
        if (attempt >= 3) {
          throw new Error("保存快照生成期间画布已变化，本次未提交，修改仍保留。");
        }
        savingRevision = revisionRef.current;
        snapshot = controller.getSnapshot();
        previewBlob = await makeStaticPreviewBlob();
      }
      const saved =
        head.artifactType === "composite_image" && !isDesignDocumentItem(head)
          ? await persistCompositeImageProject(
              snapshot,
              head,
              siteId,
              `image-scene:${head.id}:${head.revisionId}:${savingRevision}`,
              savingRevision,
              previewBlob,
            )
          : await persistImageProject(
              snapshot,
              sourceItem,
              siteId,
              `image:${sourceItem.artifactId || sourceItem.id}:${sourceItem.revisionId || "source"}:${savingRevision}`,
              workingHeadUrl,
              {
                uploadFailed: artifactSaveStepMessage("delivery-upload", ""),
                registerFailed: artifactSaveStepMessage(
                  "creation-register",
                  "图片工程已上传，但没有登记成功",
                ),
              },
              async () => previewBlob,
              isVectorImageItem(sourceItem)
                ? {
                    createSvg: () => {
                      const { canvas, doc } = controller.getDocument();
                      return exportVectorSvg(canvas, doc);
                    },
                    createPreview: async () => previewBlob,
                  }
                : undefined,
            );
      if (
        !aliveRef.current ||
        openIdentityRef.current !== savingIdentity ||
        controllerRef.current !== savingController
      ) return null;
      if (
        saved.item &&
        !isDurableLibraryItem(sourceItem) &&
        isDurableLibraryItem(saved.item)
      ) {
        const rootAssetId = String(
          sourceItem.meta.root_asset_id ||
            sourceItem.meta.parent_asset_id ||
            sourceItem.id,
        );
        firstForkReceiptRef.current = {
          rootAssetId,
          artifactId: saved.item.artifactId,
        };
      }
      if (
        saved.item &&
        !isDurableLibraryItem(sourceItem) &&
        !isDurableLibraryItem(saved.item)
      ) {
        const rootAssetId = String(
          sourceItem.meta.root_asset_id ||
            sourceItem.meta.parent_asset_id ||
            sourceItem.id,
        );
        const priorAlias = legacyReceiptAliasRef.current;
        const itemIdentities =
          priorAlias?.rootAssetId === rootAssetId &&
          priorAlias.openIdentity === savingIdentity &&
          priorAlias.nonce === reloadNonce
            ? priorAlias.itemIdentities
            : new Set<string>();
        itemIdentities.add(imageArtifactInputIdentity(saved.item));
        legacyReceiptAliasRef.current = {
          rootAssetId,
          itemIdentities,
          openIdentity: savingIdentity,
          nonce: reloadNonce,
        };
      }
      if (saved.item) {
        if (isDurableLibraryItem(saved.item)) {
          const superseded = supersededArtifactRevisionsRef.current.get(saved.item.artifactId) || new Set<string>();
          if (
            isDurableLibraryItem(sourceItem) &&
            sourceItem.artifactId === saved.item.artifactId &&
            sourceItem.revisionId !== saved.item.revisionId
          ) superseded.add(sourceItem.revisionId);
          const previousRevisionId = String(saved.item.meta.previous_revision_id || "").trim();
          if (previousRevisionId) superseded.add(previousRevisionId);
          supersededArtifactRevisionsRef.current.set(saved.item.artifactId, superseded);
        }
        artifactHeadRef.current = saved.item;
      }
      workingHeadUrlRef.current = saved.previewUrl;
      setSavedUrl(saved.previewUrl);
      setSavedProjectUrl(saved.projectUrl);
      setSavedAt(saved.savedAt);
      cloudSavedAtRef.current = Date.parse(saved.savedAt) || Date.now();
      if (revisionRef.current === savingRevision) {
        updateDirty(false);
        clearLocalImageDraft(sourceItem);
      }
      const result: FabricImageSaveResult = {
        baseItem: sourceItem,
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
      for (const id of [saved.item?.revisionId, saved.versionId]) {
        if (id) ownRevisionIdsRef.current.add(String(id));
      }
      lastSaveRef.current = {
        revision: savingRevision,
        identity: savingIdentity,
        result,
      };
      setNotice("");
      optionsRef.current.onSaved?.(saved.previewUrl);
      const savedRevisionId = String(saved.item?.revisionId || saved.versionId || "");
      if (savedRevisionId) optionsRef.current.collab?.onSavedRevision?.(savedRevisionId);
      return result;
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
  }, [item, loading, makeStaticPreviewBlob, siteId, updateDirty]);

  // 一次只跑一个保存；外壳在上一次还没结束时又要保存（关闭、会话重试），等它结束再存最新的，
  // 不再回 null（以前会被当成「保存失败」显示出来）。
  const saveRunRef = useRef<Promise<FabricImageSaveResult | null> | null>(null);
  const saveSerialized = useCallback(async (): Promise<FabricImageSaveResult | null> => {
    for (let waited = 0; saveRunRef.current && waited < 10; waited += 1) {
      await saveRunRef.current.catch(() => null);
    }
    const run = save();
    saveRunRef.current = run;
    try {
      return await run;
    } finally {
      if (saveRunRef.current === run) saveRunRef.current = null;
    }
  }, [save]);

  const runAiEdit = useCallback(async () => {
    if (aiBusyRef.current || !aiPrompt.trim()) return;
    // 只能查看：不导出画布、不调模型（controller 的 readOnly 也会拒绝替换，但那时钱已经花了）
    if (optionsRef.current.collab?.readOnly) {
      setError("你现在只能查看，不能修改这个作品。");
      return;
    }
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

  const collabReadOnly = Boolean(options.collab?.readOnly);
  useEffect(() => {
    controllerRef.current?.setReadOnly(collabReadOnly || conversionPending);
  }, [collabReadOnly, conversionPending, loading]);
  const collabHandle: FabricImageCollabHandle = {
    readOnly: collabReadOnly,
    tick: collabTick,
    remoteDelta,
    snapshot: () => (controllerRef.current ? (controllerRef.current.getCollabSnapshot() as ImageSnapshot) : null),
    ensureIds: () => {
      controllerRef.current?.ensureObjectIds();
    },
    applyRemote: (snapshot) => {
      void controllerRef.current?.applyRemote(snapshot as never);
    },
    objectBoxes: (ids) => controllerRef.current?.collabObjectBoxes(ids) ?? [],
    adoptRevision: async (artifactId, revisionId) => {
      // 房间可能先于保存回执把本页刚提交的版本当「外部版本」推回来：等手上的保存结束，
      // 是自己的就不套（否则会把保存开始后的撤销 / 新改动盖掉——10-23 W09 实测）。
      for (let waited = 0; saveRunRef.current && waited < 10; waited += 1) {
        await saveRunRef.current.catch(() => null);
      }
      if (ownRevisionIdsRef.current.has(String(revisionId))) return null;
      try {
        const result = await getArtifactItem(artifactId, revisionId);
        const revisionItem = (result as { data?: LibraryItem }).data;
        if (!revisionItem || revisionItem.artifactType === "composite_image") return null;
        const source = advancedEditorSourceFor(revisionItem);
        const url =
          typeof revisionItem.meta.fabric_document_url === "string"
            ? revisionItem.meta.fabric_document_url
            : typeof revisionItem.meta.editor_project_url === "string"
              ? revisionItem.meta.editor_project_url
              : source?.structured
                ? source.url
                : "";
        if (!url) return null;
        const abort = makeAbort();
        try {
          const project = await loadEditableImageProject(url, abort.signal);
          artifactHeadRef.current = revisionItem;
          workingHeadUrlRef.current = String(
            revisionItem.meta.editor_working_head_url || source?.url || revisionItem.url || revisionItem.previewUrl || "",
          );
          return project.snapshot as ImageSnapshot;
        } finally {
          finishAbort(abort);
        }
      } catch {
        return null;
      }
    },
    markClean: () => {
      updateDirty(false);
    },
  };

  return {
    collab: collabHandle,
    vectorConversion: vectorLosses.length
      ? { pending: conversionPending, losses: vectorLosses }
      : null,
    confirmVectorConversion: () => setVectorConverted(true),
    openIdentity,
    loading,
    saving,
    aiBusy,
    error,
    notice,
    sceneDiagnostic,
    sourceReady,
    reload: () => setReloadNonce((value) => value + 1),
    savedUrl,
    savedProjectUrl,
    savedAt,
    dirty,
    editRevision: revisionRef.current,
    captureRecovery,
    captureRecoveryRevision,
    captureLocalSave,
    captureLocalRevision,
    markLocalSaved,
    restoreRecovery,
    stageCanvasRef,
    stageContainerRef,
    doc: view.doc,
    canvasBackground: view.canvasBackground,
    setCanvasBackground: (color) => controller()?.setCanvasBackground(color),
    resizeDoc: (width, height) => controller()?.resizeDoc(width, height),
    zoom: view.zoom,
    controlClientCoords: view.controlClientCoords,
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
    toggleSelectedTextCase: () => controller()?.toggleSelectedTextCase(),
    toggleSelectedTextList: () => controller()?.toggleSelectedTextList(),
    setSelectedTextList: (mode) => controller()?.setSelectedTextList(mode),
    clearSelectedTextFormat: () => controller()?.clearSelectedTextFormat(),
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
    downloadAs,
    downloadDefaultPng,
    save: saveSerialized,
    aiAvailable: true,
    aiPrompt,
    setAiPrompt,
    runAiEdit,
  };
}
