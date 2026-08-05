"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { useUI } from "../../i18n/ui/useUI";
import type { EditorManifestV1, LibraryItem } from "../library-data";
import {
  GEO_MAP_CONSTANTS,
  GEO_MAP_EDITOR_ID,
  GEO_MAP_PROJECT_SCHEMA,
  assertGeoMapRoundtrip,
  parseGeoMapSource,
  resolveGeoMapDependencyClosure,
  validateGeoMapProject,
  type GeoMapAvailableDependency,
  type GeoMapErrorCode,
  type GeoMapLayer,
  type GeoMapProject,
  type GeoMapValidationError,
} from "./geo-map-source";
import { geoMapLatitudeLimit } from "./geo-map-advanced-controls";
import {
  commitGeoMapProject,
  type GeoMapCommitResult,
} from "./geo-map-persistence";

/** The accepted half of the commit union; a rejection never becomes `saved`. */
export type GeoMapCommitSuccess = Extract<GeoMapCommitResult, { ok: true }>;
import { GEO_MAP_SCALE_BAND_ZOOM } from "./geo-map-advanced-controls";
import {
  GeoMapLoadMachine,
  GeoMapProjectHistory,
  geoMapStateAllowsMutation,
  geoMapStateAllowsSave,
  type GeoMapFailure,
  type GeoMapLoadState,
} from "./geo-map-history";

export {
  GEO_MAP_ILLEGAL_TRANSITIONS,
  GEO_MAP_LOAD_TRANSITIONS,
  geoMapIsIllegalTransition,
  geoMapNextLoadState,
  geoMapStateAllowsMutation,
  geoMapStateAllowsSave,
} from "./geo-map-history";
export type {
  GeoMapFailure,
  GeoMapFailureCode,
  GeoMapLoadEvent,
  GeoMapLoadState,
} from "./geo-map-history";

export {
  GEO_MAP_EDITOR_ADAPTER,
  GEO_MAP_EDITOR_ID,
  GEO_MAP_PROJECT_SCHEMA,
} from "./geo-map-source";

export type GeoMapPanDirection = "left" | "right" | "up" | "down";

export interface GeoMapClosureReport {
  /** Declared in `dependencies[]` but absent from the revision closure. */
  missingDependencies: readonly string[];
  /** Present but with a sha256 that does not match the declared digest. */
  digestMismatches: readonly string[];
  /** Referenced by `sources[*].dependencyPath` yet never declared. */
  undeclaredSources: readonly string[];
  declaredDependencies: number;
  resolvedDependencies: number;
  /**
   * False when the item carried no closure manifest, so digests could not be
   * checked here. The status line says so rather than implying a clean audit.
   */
  verified: boolean;
}

export interface GeoMapWorkbenchState {
  project: GeoMapProject | null;
  state: GeoMapLoadState;
  failure: GeoMapFailure | null;
  closure: GeoMapClosureReport;
  activeLayerId: string;
  focusedAnnotationId: string;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  sourceReady: boolean;
  editRevision: number;
  error: string;
  notice: string;
  saved: GeoMapCommitSuccess | null;
  canUndo: boolean;
  canRedo: boolean;
  selectLayer: (id: string) => void;
  setTitle: (title: string) => void;
  setSubtitle: (subtitle: string) => void;
  setProjection: (patch: Partial<GeoMapProject["projection"]>) => void;
  setCamera: (patch: Partial<GeoMapProject["camera"]>) => void;
  setBasemap: (patch: Partial<GeoMapProject["basemap"]>) => void;
  setLegend: (patch: Partial<NonNullable<GeoMapProject["legend"]>>) => void;
  setInteractions: (
    patch: Partial<NonNullable<GeoMapProject["interactions"]>>,
  ) => void;
  patchLayer: (id: string, patch: Partial<GeoMapLayer>) => void;
  toggleLayerVisibility: (id: string) => void;
  panBy: (direction: GeoMapPanDirection) => void;
  zoomBy: (steps: number) => void;
  fitToBasemap: () => void;
  focusFeature: (delta: number) => void;
  importProject: (bytes: string) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<GeoMapCommitSuccess | null>;
  restoreRecovery: (payload: unknown) => boolean;
}

export function geoMapEditorManifest(): EditorManifestV1 {
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: GEO_MAP_EDITOR_ID,
    version: 1,
    capabilities: ["load", "mutate", "save", "reopen"],
    source: { kind: "inline", format: GEO_MAP_PROJECT_SCHEMA },
  };
}

function geoMapArtifactInputIdentity(item: LibraryItem): string {
  if (item.artifactId && item.revisionId) {
    return `${item.key}:${item.artifactId}:${item.revisionId}`;
  }
  return `${item.key}:${item.id}:${String(
    item.meta.editor_version_id ||
      item.meta.editor_project_url ||
      item.content ||
      "",
  )}`;
}

/**
 * §5.1: the project must reopen without the network. Inline bytes win; a
 * first-party rendition URL is the only remote fallback and it is bounded by
 * §4 C33 so an oversized blob cannot be streamed into the editor.
 */
async function readGeoMapSourceBytes(
  item: LibraryItem,
  signal: AbortSignal,
): Promise<string> {
  const inline =
    typeof item.content === "string" && item.content.trim()
      ? item.content
      : typeof item.meta.geo_map_project === "string"
        ? String(item.meta.geo_map_project)
        : item.meta.geo_map_project
          ? JSON.stringify(item.meta.geo_map_project)
          : "";
  if (inline.trim()) return inline;
  const url = String(
    item.meta.editor_project_url || item.url || item.previewUrl || "",
  );
  if (!url) {
    throw new Error("geo_map 素材缺少 source 字节与可读的 project URL。");
  }
  const blob = await fetchMediaBlob(url, {
    maxBytes: GEO_MAP_CONSTANTS.sourceBytesMax,
    signal,
    cache: "no-store",
  });
  return blob.text();
}

/**
 * The dependency blobs the revision actually carries. `source_integrity =
 * complete_dependency_closure` means the platform reports them alongside the
 * source; when nothing is reported the digests simply cannot be checked here,
 * and the report says `verified: false` instead of inventing a verdict.
 */
export function geoMapAvailableDependencies(item: LibraryItem): {
  available: GeoMapAvailableDependency[];
  verified: boolean;
} {
  const manifest = item.meta.source_manifest ?? item.meta.dependency_closure;
  const entries = Array.isArray(manifest)
    ? manifest
    : Array.isArray((manifest as { dependencies?: unknown })?.dependencies)
      ? (manifest as { dependencies: unknown[] }).dependencies
      : null;
  if (!entries) return { available: [], verified: false };
  const available: GeoMapAvailableDependency[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const path = String(record.path ?? "");
    const sha256 = String(record.sha256 ?? "");
    if (!path || !/^[0-9a-f]{64}$/i.test(sha256)) continue;
    const byteSize = Number(record.byteSize ?? record.byte_size);
    available.push({
      path,
      sha256,
      ...(Number.isFinite(byteSize) ? { byteSize } : {}),
    });
  }
  return { available, verified: true };
}

const EMPTY_CLOSURE: GeoMapClosureReport = Object.freeze({
  missingDependencies: Object.freeze([]),
  digestMismatches: Object.freeze([]),
  undeclaredSources: Object.freeze([]),
  declaredDependencies: 0,
  resolvedDependencies: 0,
  verified: false,
});

export function useGeoMapWorkbench(
  item: LibraryItem,
  siteId = "",
): GeoMapWorkbenchState {
  const tt = useUI();
  const aliveRef = useRef(true);
  const revisionRef = useRef(0);
  const projectRef = useRef<GeoMapProject | null>(null);
  const historyRef = useRef(new GeoMapProjectHistory());
  const machineRef = useRef(new GeoMapLoadMachine());
  const saveBusyRef = useRef(false);
  const artifactHeadRef = useRef(item);
  const artifactInputIdentityRef = useRef(geoMapArtifactInputIdentity(item));
  const workingHeadUrlRef = useRef(item.url || item.previewUrl || "");
  const [project, setProject] = useState<GeoMapProject | null>(null);
  const [state, setState] = useState<GeoMapLoadState>("empty");
  const [failure, setFailure] = useState<GeoMapFailure | null>(null);
  const [closure, setClosure] = useState<GeoMapClosureReport>(EMPTY_CLOSURE);
  const [activeLayerId, setActiveLayerId] = useState("");
  const [focusedAnnotationId, setFocusedAnnotationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<GeoMapCommitSuccess | null>(null);
  const nextInputIdentity = geoMapArtifactInputIdentity(item);
  if (artifactInputIdentityRef.current !== nextInputIdentity) {
    artifactInputIdentityRef.current = nextInputIdentity;
    artifactHeadRef.current = item;
  }

  const syncMachine = useCallback(() => {
    setState(machineRef.current.state);
    setFailure(machineRef.current.failure);
  }, []);

  /**
   * 加载 effect 读这两个 ref，不读形参。
   *
   * W13 在 `dcc0a7d` 里治过同一条病（`use-grid-editor.ts` 的 `translateRef`）：
   * effect 体里写 state，依赖数组里又放着**每渲染换身份**的东西，于是渲染一次就
   * 重跑一次加载，`setLoading(false)` 永远轮不到，遮罩再也下不来。
   * 这里两处都满足：`item` 由调用方每渲染重建，`tt` 由 i18n provider owns ——
   * 今天各站不传 `messages` 所以 `tt` 恰好稳定，但那是巧合不是契约。
   * 起跑的判据改成取值的 `nextInputIdentity`：**换的是另一件东西**才重载。
   */
  const itemRef = useRef(item);
  useEffect(() => {
    itemRef.current = item;
  }, [item]);
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const translate = useCallback(
    (value: string) => translateRef.current(value),
    [],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const source = itemRef.current;
    const controller = new AbortController();
    setError("");
    setNotice("");
    setSaved(null);
    setClosure(EMPTY_CLOSURE);
    setActiveLayerId("");
    setFocusedAnnotationId("");
    revisionRef.current = 0;
    historyRef.current.reset();
    projectRef.current = null;
    setProject(null);
    // Opening a different artifact starts a new machine instance. It is not a
    // `ready → empty` transition, which §3.3 forbids.
    machineRef.current = new GeoMapLoadMachine();
    syncMachine();
    workingHeadUrlRef.current = String(
      source.meta.editor_working_head_url ||
        source.url ||
        source.previewUrl ||
        "",
    );

    const load = async () => {
      const machine = machineRef.current;
      let bytes: string;
      try {
        bytes = await readGeoMapSourceBytes(source, controller.signal);
      } catch (caught) {
        if (controller.signal.aborted) return;
        machine.send("source-bytes");
        machine.send("parse-failed", {
          code: "geo-map-empty-source",
          summary: translate("地图源字节读取失败"),
          details: [caught instanceof Error ? caught.message : String(caught)],
        });
        setError(
          caught instanceof Error ? caught.message : translate("地图源读取失败"),
        );
        syncMachine();
        return;
      }
      if (controller.signal.aborted) return;
      machine.send("source-bytes");
      syncMachine();

      // §3.3 routes JSON failures and §3.2 schema failures onto the same
      // `parsing → invalid` edge, and parseGeoMapSource already validates, so
      // one branch carries both with the §6 code the parser chose.
      let project: GeoMapProject;
      try {
        project = parseGeoMapSource(bytes);
      } catch (caught) {
        const failure = caught as {
          code?: GeoMapErrorCode;
          errors?: GeoMapValidationError[];
          message?: string;
        };
        machine.send("parse-failed", {
          code: failure.code ?? "geo-map-invalid-json",
          summary: translate("地图源无法解析为 oceanleo.geo-map.v1"),
          details: failure.errors?.length
            ? failure.errors.map((entry) => `${entry.path}: ${entry.message}`)
            : [String(failure.message ?? caught)],
        });
        setError(
          caught instanceof Error ? caught.message : translate("地图源解析失败"),
        );
        syncMachine();
        return;
      }
      const validated = { ok: true as const, project };
      machine.send("schema-ok");
      syncMachine();

      // §3.3 `resolving`. Dangling `layers[].source` references were already
      // rejected as `geo-map-dangling-layer-source` during validation (§6 F2),
      // so this step only has to settle the dependency closure (§6 F3).
      const { available, verified } = geoMapAvailableDependencies(source);
      const declared = validated.project.dependencies ?? [];
      const closureResult = resolveGeoMapDependencyClosure(
        validated.project,
        verified ? available : declared,
      );
      const report: GeoMapClosureReport = {
        missingDependencies: closureResult.missingPaths,
        digestMismatches: closureResult.digestMismatchPaths,
        undeclaredSources: closureResult.undeclaredSourcePaths,
        declaredDependencies: declared.length,
        resolvedDependencies:
          declared.length -
          closureResult.missingPaths.length -
          closureResult.digestMismatchPaths.length,
        verified,
      };
      setClosure(report);
      const details = closureResult.errors.map(
        (entry) => `${entry.path}: ${entry.message}`,
      );

      if (closureResult.verdict === "invalid") {
        machine.send("closure-empty", {
          code: "geo-map-dependency-closure-incomplete",
          summary: translate("依赖闭包不可用，无法渲染任何数据层"),
          details,
        });
        syncMachine();
        return;
      }
      projectRef.current = validated.project;
      setProject(validated.project);
      setActiveLayerId(validated.project.layers[0]?.id || "");
      if (closureResult.verdict === "degraded") {
        machine.send("closure-partial", {
          code: "geo-map-dependency-closure-incomplete",
          summary: translate("依赖缺失，已降级为只渲底图；降级态不可保存"),
          details,
        });
      } else {
        machine.send("closure-complete");
      }
      syncMachine();
    };

    void load();
    return () => controller.abort();
  }, [nextInputIdentity, syncMachine, translate]);

  const mutate = useCallback(
    (producer: (value: GeoMapProject) => GeoMapProject) => {
      const before = projectRef.current;
      if (!before) return;
      if (!geoMapStateAllowsMutation(machineRef.current.state)) {
        setError(
          tt("当前载入状态不允许编辑；降级或非法态不得写入新 revision。"),
        );
        return;
      }
      try {
        const next = producer(before);
        const validated = validateGeoMapProject(next);
        if (!validated.ok) {
          setError(
            validated.errors
              .map((entry) => String(entry.message ?? entry))
              .join("；") || tt("地图修改未通过校验"),
          );
          return;
        }
        if (!historyRef.current.record(before, validated.project)) return;
        projectRef.current = validated.project;
        revisionRef.current += 1;
        setProject(validated.project);
        machineRef.current.send("edit");
        syncMachine();
        setSaved(null);
        setNotice("");
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : tt("地图修改失败"));
      }
    },
    [syncMachine, tt],
  );

  const applyHistoryProject = useCallback(
    (next: GeoMapProject | null) => {
      if (!next) return;
      projectRef.current = next;
      revisionRef.current += 1;
      setProject(next);
      machineRef.current.send("edit");
      syncMachine();
      setSaved(null);
      setNotice("");
      setError("");
    },
    [syncMachine],
  );

  const undo = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    applyHistoryProject(historyRef.current.undo(current));
  }, [applyHistoryProject]);

  const redo = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    applyHistoryProject(historyRef.current.redo(current));
  }, [applyHistoryProject]);

  const save = useCallback(async (): Promise<GeoMapCommitSuccess | null> => {
    const snapshot = projectRef.current;
    if (saveBusyRef.current || !snapshot) return null;
    if (!geoMapStateAllowsSave(machineRef.current.state)) {
      // §3.3: `degraded → saving` is illegal; saving an incomplete closure
      // would mint a second hollow revision.
      setError(
        tt("当前状态不可保存：依赖闭包不完整或工程未处于已修改态。"),
      );
      return null;
    }
    saveBusyRef.current = true;
    setSaving(true);
    setError("");
    machineRef.current.send("commit");
    syncMachine();
    try {
      // §5 determinism: never mint a revision whose bytes do not reopen to
      // themselves. W4's guard throws on drift, which the catch below turns
      // into a `dirty` retry rather than a half-written head.
      assertGeoMapRoundtrip(snapshot);
      const savingRevision = revisionRef.current;
      const result = await commitGeoMapProject({
        item: artifactHeadRef.current,
        siteId,
        editRevision: savingRevision,
        project: snapshot,
        durableDependencies: geoMapAvailableDependencies(item).available,
        title: `${snapshot.metadata.title || item.title || tt("地图")}-${tt("编辑版")}`,
      });
      if (!result.ok) {
        // A rejected commit is still not `invalid`: fall back to `dirty` and
        // keep the local bytes so the user can fix and retry.
        if (aliveRef.current) {
          machineRef.current.send("commit-conflict");
          syncMachine();
          setError(
            result.errors.map((entry) => entry.message).join("；") ||
              tt("地图保存被拒绝"),
          );
        }
        return null;
      }
      if (result.item) artifactHeadRef.current = result.item;
      if (result.projectUrl) workingHeadUrlRef.current = result.projectUrl;
      if (aliveRef.current) {
        setSaved(result);
        machineRef.current.send("commit-accepted");
        syncMachine();
        setNotice("");
      }
      return result;
    } catch (caught) {
      if (aliveRef.current) {
        // §3.3: the save path must never end in `invalid`; fall back to
        // `dirty` and keep the local bytes.
        machineRef.current.send("commit-conflict");
        syncMachine();
        setError(caught instanceof Error ? caught.message : tt("地图保存失败"));
      }
      return null;
    } finally {
      saveBusyRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [item, siteId, syncMachine, tt]);

  const degreesPerPixel = useMemo(() => {
    const zoom = project?.camera.zoom ?? 0;
    return 360 / (GEO_MAP_CONSTANTS.tileSizeDefault * Math.pow(2, zoom));
  }, [project?.camera.zoom]);

  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { schema?: unknown }).schema !== GEO_MAP_PROJECT_SCHEMA
      ) {
        return false;
      }
      const validated = validateGeoMapProject(payload);
      if (!validated.ok) return false;
      if (!geoMapStateAllowsMutation(machineRef.current.state)) return false;
      mutate(() => validated.project);
      setNotice(tt("已恢复上次未同步的本地草稿"));
      return true;
    },
    [mutate, tt],
  );

  const loading = state === "empty" || state === "parsing" || state === "resolving";
  const sourceReady = state === "ready" || state === "dirty";

  return {
    project,
    state,
    failure,
    closure,
    activeLayerId,
    focusedAnnotationId,
    loading,
    saving,
    dirty: state === "dirty",
    sourceReady,
    editRevision: revisionRef.current,
    error,
    notice,
    saved,
    canUndo: historyRef.current.canUndo,
    canRedo: historyRef.current.canRedo,
    selectLayer: (id) => {
      if (projectRef.current?.layers.some((layer) => layer.id === id)) {
        setActiveLayerId(id);
      }
    },
    setTitle: (title) =>
      mutate((current) => ({
        ...current,
        metadata: { ...current.metadata, title: title.slice(0, 300) },
      })),
    setSubtitle: (subtitle) =>
      mutate((current) => ({
        ...current,
        metadata: { ...current.metadata, subtitle: subtitle.slice(0, 300) },
      })),
    setProjection: (patch) =>
      mutate((current) => ({
        ...current,
        projection: { ...current.projection, ...patch },
      })),
    setCamera: (patch) =>
      mutate((current) => ({
        ...current,
        camera: { ...current.camera, ...patch },
      })),
    setBasemap: (patch) =>
      mutate((current) => ({
        ...current,
        basemap: { ...current.basemap, ...patch },
      })),
    setLegend: (patch) =>
      mutate((current) => ({
        ...current,
        legend: current.legend
          ? { ...current.legend, ...patch }
          : { position: "bottom-right", entries: [], ...patch },
      })),
    setInteractions: (patch) =>
      mutate((current) => ({
        ...current,
        interactions: { ...(current.interactions ?? {}), ...patch },
      })),
    patchLayer: (id, patch) =>
      mutate((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === id ? { ...layer, ...patch } : layer,
        ),
      })),
    toggleLayerVisibility: (id) =>
      mutate((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === id
            ? {
                ...layer,
                layout: {
                  ...(layer.layout ?? {}),
                  visibility:
                    (layer.layout?.visibility ?? "visible") === "visible"
                      ? "none"
                      : "visible",
                },
              }
            : layer,
        ),
      })),
    panBy: (direction) =>
      mutate((current) => {
        const step =
          (current.interactions?.keyboardPanStepPx ??
            GEO_MAP_CONSTANTS.keyboardPanStepDefaultPx) * degreesPerPixel;
        const [lon, lat] = current.camera.center;
        const latLimit = geoMapLatitudeLimit(current.projection.name);
        const nextLon =
          direction === "left" ? lon - step : direction === "right" ? lon + step : lon;
        const nextLat =
          direction === "up" ? lat + step : direction === "down" ? lat - step : lat;
        return {
          ...current,
          camera: {
            ...current.camera,
            center: [
              Math.max(
                GEO_MAP_CONSTANTS.longitudeMin,
                Math.min(GEO_MAP_CONSTANTS.longitudeMax, nextLon),
              ),
              Math.max(-latLimit, Math.min(latLimit, nextLat)),
            ],
          },
        };
      }),
    zoomBy: (steps) =>
      mutate((current) => {
        const step =
          current.interactions?.keyboardZoomStep ??
          GEO_MAP_CONSTANTS.keyboardZoomStepDefault;
        return {
          ...current,
          camera: {
            ...current.camera,
            zoom: Math.max(
              GEO_MAP_CONSTANTS.zoomMin,
              Math.min(
                GEO_MAP_CONSTANTS.zoomMax,
                current.camera.zoom + steps * step,
              ),
            ),
          },
        };
      }),
    fitToBasemap: () =>
      mutate((current) => ({
        ...current,
        camera: {
          ...current.camera,
          zoom:
            GEO_MAP_SCALE_BAND_ZOOM[current.basemap.scaleBand] ??
            current.camera.zoom,
        },
      })),
    focusFeature: (delta) => {
      const annotations = projectRef.current?.annotations ?? [];
      if (!annotations.length) return;
      const index = annotations.findIndex(
        (entry) => entry.id === focusedAnnotationId,
      );
      const next =
        (((index < 0 ? 0 : index + delta) % annotations.length) +
          annotations.length) %
        annotations.length;
      setFocusedAnnotationId(annotations[next]?.id || "");
    },
    importProject: (bytes) => {
      let incoming: GeoMapProject;
      try {
        incoming = parseGeoMapSource(bytes);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : tt("导入的地图工程无法解析"),
        );
        return;
      }
      mutate(() => incoming);
      setNotice(tt("已用导入的结构化地图工程替换当前内容"));
    },
    undo,
    redo,
    save,
    restoreRecovery,
  };
}