"use client";

/**
 * 3D 新核叶子。flag=`next` 时由 Model3DRoute 经 dynamic(..., { ssr: false }) 拉起。
 *
 * L0 adapter.mode（默认 normal）
 * L1 SelectionToolbar：相机/曝光/背景/材质色/可见性 + 自转
 * L2 Model3DNextDirector：出图 / 自转（旧核 Model3DDirectorPanel 不删）
 * L3 专业模式才露 three.js editor iframe；普通模式不挂
 * L4 chips + review-proposal（只造消息）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { saveFileToLibrary } from "../doc-editors/doc-io";
import { editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import { createVisualCommandSurface, fail, ok } from "./visual-command-kit";
import {
  DEFAULT_EDITOR_MODE,
  type EditorMode,
} from "../hosted-editor/index";
import { rememberEditorChips } from "../agent-review";
import { isModel3DSourceItem } from "./model3d-workbench-defaults";
import {
  MODEL3D_LEGACY_READONLY_NOTICE,
  MODEL3D_NEXT_PROJECT_SCHEMA,
  inspectModel3DProject,
  nextModel3DConversionState,
  planModel3DLegacyConversion,
  type Model3DConversionState,
} from "./model3d-next-conversion";
import {
  MODEL3D_AGENT_CHIPS,
  buildModel3DReviewProposal,
  model3dToolsManifestChips,
} from "./model3d-next-l4-chips";
import {
  MODEL3D_NEXT_MODE_ATTR,
  MODEL3D_NEXT_STAGE_ATTR,
  applyModel3DNextMode,
} from "./model3d-next-mode";
import {
  base64ToBytes,
  bytesToBase64,
  buildModel3DEmbedUrl,
  buildModel3DInitEnvelope,
} from "./model3d-hosted-embed";
import {
  defaultModel3DNextView,
  type Model3DNextViewState,
  type ModelViewerCaptureHost,
} from "./model3d-next-plan";
import { Model3DNextToolbar } from "./Model3DNextToolbar";
import { Model3DNextDirector } from "./Model3DNextDirector";
import { Model3DViewerStage } from "./Model3DViewerStage";
import {
  Model3DHostedFrame,
  postModel3DInit,
  postModel3DRecoveryCapture,
  postModel3DSetMode,
} from "./Model3DHostedFrame";

function hostOriginNow(): string {
  if (typeof window === "undefined") return "https://oceanleo.com";
  return window.location.origin || "https://oceanleo.com";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function Model3DNextStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const instanceId = useRef(
    `m3d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const iframeHolderRef = useRef<HTMLIFrameElement | null>(null);
  const viewerHandleRef = useRef<ModelViewerCaptureHost | null>(null);
  const hostedInitedRef = useRef(false);
  const pendingCaptureRef = useRef<{
    id: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [view, setView] = useState<Model3DNextViewState>(defaultModel3DNextView);
  const [objectUrl, setObjectUrl] = useState("");
  const [gltfBytes, setGltfBytes] = useState<ArrayBuffer | null>(null);
  const [format, setFormat] = useState<"glb" | "gltf">("glb");
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const [frameMounted, setFrameMounted] = useState(false);
  const [conversion, setConversion] = useState<Model3DConversionState>("converted");
  const [inspectDiffs, setInspectDiffs] = useState<
    { feature: string; reason: string }[]
  >([]);
  const [hostedSrc, setHostedSrc] = useState("");
  const chipsManifest = useMemo(() => model3dToolsManifestChips(), []);
  const readonly = conversion === "readonly" || conversion === "converting";
  const applied = applyModel3DNextMode(instanceId, mode);
  const showHosted = applied.showHostedEditor && Boolean(hostedSrc) && frameMounted;

  useEffect(() => {
    rememberEditorChips("threed", MODEL3D_AGENT_CHIPS);
    rememberEditorChips("model3d", MODEL3D_AGENT_CHIPS);
  }, []);

  useEffect(() => {
    if (!isModel3DSourceItem(item)) return;
    const url = item.url || item.previewUrl || "";
    if (!url) return;
    let cancelled = false;
    void fetchMediaBlob(url, { maxBytes: 256 * 1024 * 1024 })
      .then(async (blob) => {
        if (cancelled) return;
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        setGltfBytes(buffer);
        setFormat(blob.type.includes("json") || /\.gltf$/i.test(url) ? "gltf" : "glb");
        const nextUrl = URL.createObjectURL(new Blob([buffer]));
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "模型加载失败");
      });
    const projectUrl = String(item.meta.editor_project_url || "").trim();
    if (projectUrl) {
      void fetch(projectUrl, { cache: "no-store" })
        .then((response) => response.json())
        .then((json) => {
          if (cancelled) return;
          const looked = inspectModel3DProject(json);
          if (looked.kind === "legacy") {
            setConversion("readonly");
            setInspectDiffs(looked.differences);
          }
        })
        .catch(() => {
          /* 没有工程档就当源文件打开 */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [item]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    try {
      const src = buildModel3DEmbedUrl({
        instanceId,
        hostOrigin: hostOriginNow(),
        assetTitle: item.title,
      });
      setHostedSrc(src);
    } catch {
      setHostedSrc("");
    }
  }, [instanceId, item.title]);

  const applyGltfBytes = useCallback((bytes: ArrayBuffer, nextFormat: "glb" | "gltf") => {
    setGltfBytes(bytes);
    setFormat(nextFormat);
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(new Blob([bytes]));
    });
  }, []);

  const requestHostedCapture = useCallback(
    (reason: string): Promise<boolean> => {
      const frame = iframeHolderRef.current?.contentWindow || null;
      const recoveryId = `${reason}-${Date.now().toString(36)}`.slice(0, 128);
      return new Promise((resolve) => {
        pendingCaptureRef.current = { id: recoveryId, resolve };
        const sent = postModel3DRecoveryCapture(frame, instanceId, recoveryId);
        if (!sent) {
          pendingCaptureRef.current = null;
          resolve(false);
          return;
        }
        window.setTimeout(() => {
          if (pendingCaptureRef.current?.id === recoveryId) {
            pendingCaptureRef.current = null;
            resolve(false);
          }
        }, 8000);
      });
    },
    [instanceId],
  );

  const applyMode = useCallback(
    (next: EditorMode) => {
      const appliedNext = applyModel3DNextMode(instanceId, next);
      if (appliedNext.showHostedEditor) {
        setFrameMounted(true);
        setMode("pro");
        return;
      }
      setMode("normal");
      if (frameMounted) {
        postModel3DSetMode(
          iframeHolderRef.current?.contentWindow || null,
          instanceId,
          "normal",
        );
        void requestHostedCapture("leave-pro");
      }
    },
    [frameMounted, instanceId, requestHostedCapture],
  );

  useEffect(() => {
    if (!ready || mode !== "pro" || !gltfBytes || hostedInitedRef.current) return;
    const frame = iframeHolderRef.current?.contentWindow || null;
    const inited = postModel3DInit(
      frame,
      instanceId,
      buildModel3DInitEnvelope(instanceId, {
        gltfBase64: bytesToBase64(gltfBytes),
        format,
        readOnly: readonly,
        title: item.title,
      }),
    );
    postModel3DSetMode(frame, instanceId, "pro");
    if (inited) hostedInitedRef.current = true;
  }, [format, gltfBytes, instanceId, item.title, mode, ready, readonly]);

  const convertLegacy = useCallback(() => {
    setConversion((state) => nextModel3DConversionState(state, { type: "request" }));
    const projectUrl = String(item.meta.editor_project_url || "").trim();
    if (!projectUrl) {
      setStatus("没有旧工程档可转。");
      setConversion((state) => nextModel3DConversionState(state, { type: "reject" }));
      return;
    }
    void fetch(projectUrl, { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        const planned = planModel3DLegacyConversion(json);
        if (!planned.ok) {
          setStatus(planned.reason);
          setConversion((state) => nextModel3DConversionState(state, { type: "reject" }));
          return;
        }
        setInspectDiffs(planned.dropped);
        setConversion((state) => nextModel3DConversionState(state, { type: "resolve" }));
        setStatus(planned.summary);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "转换失败");
        setConversion((state) => nextModel3DConversionState(state, { type: "reject" }));
      });
  }, [item.meta.editor_project_url]);

  const save = useCallback(async () => {
    if (readonly) {
      return { ok: false as const, error: MODEL3D_LEGACY_READONLY_NOTICE };
    }
    if (mode === "pro" && frameMounted) {
      const captured = await requestHostedCapture("save");
      if (!captured && !gltfBytes) {
        return { ok: false as const, error: "专业内核还没有把模型交回来。" };
      }
    }
    if (!gltfBytes) {
      return { ok: false as const, error: "还没有可保存的模型字节。" };
    }
    const file = new File(
      [gltfBytes],
      `${item.title || "model"}.${format}`,
      { type: format === "gltf" ? "model/gltf+json" : "model/gltf-binary" },
    );
    const saved = await saveFileToLibrary({
      item,
      siteId,
      fallbackSite: "threed",
      title: item.title || "model",
      createFile: async () => file,
      sourceFormat: format,
      sourceMediaType: file.type,
      mediaType: "model3d",
      kind: "model3d",
      idempotencyKey: `model3d-next:${item.id}:${view.revision}`,
      deliveryProjectSchema: MODEL3D_NEXT_PROJECT_SCHEMA,
      editorManifest: {
        id: "model-3d-editor",
        format: MODEL3D_NEXT_PROJECT_SCHEMA,
      },
      meta: {
        editor: "model3d-next",
        format,
        chips: chipsManifest.chips.map((chip) => chip.id).join(","),
      },
      project: {
        schema: MODEL3D_NEXT_PROJECT_SCHEMA,
        data: {
          view,
          chips: chipsManifest.chips.map((chip) => chip.id),
        },
      },
    });
    if (!saved.ok) return { ok: false as const, error: saved.error || "保存失败" };
    return { ok: true as const, item: advancedSavedItem(item, { url: saved.url, versionId: saved.versionId }) };
  }, [
    chipsManifest.chips,
    format,
    frameMounted,
    gltfBytes,
    item,
    mode,
    readonly,
    requestHostedCapture,
    siteId,
    view,
  ]);

  usePluginCommandSurface(
    useMemo(
      () =>
        createVisualCommandSurface({
          editorId: "threed",
          state: () => ({
            mode,
            revision: view.revision,
            chips: chipsManifest.chips.map((chip) => chip.id),
          }),
          commands: () => [
            {
              spec: {
                id: "threed.propose-material",
                label: "提案：改材质色",
                summary: "只造审阅提案，不写进模型。",
                mutates: true,
              },
              run: () => {
                const proposal = buildModel3DReviewProposal({
                  proposalId: `p-${view.revision}`,
                  commandId: "threed.chip.generate-material",
                  revision: view.revision,
                  changes: [
                    {
                      id: "material-0",
                      label: "基础色",
                      before: view.materialColor,
                      after: "#ff0000",
                    },
                  ],
                });
                return proposal
                  ? ok("已送审阅，尚未写进模型。", view.revision)
                  : fail("提案不合法。");
              },
            },
          ],
        }),
      [chipsManifest.chips, mode, view.materialColor, view.revision],
    ),
  );

  const downloadCurrentGlb = useCallback(() => {
    if (!gltfBytes) {
      setStatus("还没有可下载的模型。");
      return;
    }
    triggerDownload(
      new Blob([gltfBytes], {
        type: format === "gltf" ? "model/gltf+json" : "model/gltf-binary",
      }),
      `${item.title || "model"}.${format}`,
    );
    setStatus("已下载当前模型。");
  }, [format, gltfBytes, item.title]);

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "threed",
        label: editorToolLabel({ type: "threed" }),
        mode: { current: mode, setMode: applyMode },
        contextToolbar: (
          <Model3DNextToolbar
            view={view}
            onView={setView}
            accent={accent}
            disabled={readonly}
          />
        ),
        toolbox: {
          label: "场景",
          icon: "shape",
          content: (
            <Model3DNextDirector
              view={view}
              onView={setView}
              viewerRef={viewerHandleRef}
              disabled={readonly || showHosted}
            />
          ),
        },
        actions: readonly
          ? [
              {
                id: "model3d-convert-legacy",
                label: "转换为新 3D 工程",
                disabled: conversion === "converting",
                onTrigger: convertLegacy,
              },
            ]
          : [
              {
                id: "model3d-download-glb",
                label: "下载 GLB",
                disabled: !gltfBytes,
                onTrigger: downloadCurrentGlb,
              },
            ],
        upload: {
          accept: ".glb,.gltf,model/gltf-binary,model/gltf+json",
          onFiles: async (files) => {
            const file = files[0];
            if (!file || readonly) return;
            const buffer = await file.arrayBuffer();
            hostedInitedRef.current = false;
            applyGltfBytes(buffer, /\.gltf$/i.test(file.name) ? "gltf" : "glb");
          },
        },
        stage: (
          <div
            className="flex h-full min-h-0 flex-col"
            {...{ [MODEL3D_NEXT_STAGE_ATTR]: "true" }}
            {...{ [MODEL3D_NEXT_MODE_ATTR]: mode }}
          >
            {readonly ? (
              <div className="shrink-0 border-b px-4 py-3 text-sm">
                <p className="font-medium">{MODEL3D_LEGACY_READONLY_NOTICE}</p>
                <ul className="mt-2 max-h-24 overflow-auto text-xs opacity-80">
                  {inspectDiffs.slice(0, 8).map((entry) => (
                    <li key={`${entry.feature}:${entry.reason}`}>
                      {entry.feature} · {entry.reason}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-2 rounded-md border px-3 py-1 text-xs"
                  onClick={convertLegacy}
                >
                  一键转换为新 3D 工程
                </button>
              </div>
            ) : null}
            <div className="relative min-h-0 flex-1">
              {showHosted ? null : (
                <Model3DViewerStage
                  src={objectUrl}
                  poster={item.thumbUrl || item.previewUrl}
                  view={view}
                  accent={accent}
                  viewerHandleRef={viewerHandleRef}
                />
              )}
              {frameMounted && hostedSrc ? (
                <div
                  className={
                    showHosted
                      ? "absolute inset-0 h-full w-full"
                      : "pointer-events-none invisible absolute inset-0 h-0 w-0 overflow-hidden"
                  }
                  aria-hidden={!showHosted}
                  data-testid="model3d-hosted-slot"
                  data-model3d-hosted-visible={showHosted ? "true" : "false"}
                >
                  <Model3DHostedFrame
                    instanceId={instanceId}
                    hostOrigin={hostOriginNow()}
                    iframeRef={iframeHolderRef}
                    src={hostedSrc}
                    title="three.js editor"
                    onReady={() => setReady(true)}
                    onSnapshot={(payload) => {
                      const pending = pendingCaptureRef.current;
                      if (pending && payload.recoveryId === pending.id) {
                        pendingCaptureRef.current = null;
                        pending.resolve(Boolean(payload.ok && payload.gltfBase64));
                      }
                      if (!payload.ok || !payload.gltfBase64) return;
                      const bytes = base64ToBytes(payload.gltfBase64);
                      applyGltfBytes(
                        bytes.buffer.slice(
                          bytes.byteOffset,
                          bytes.byteOffset + bytes.byteLength,
                        ),
                        "glb",
                      );
                    }}
                    onError={setStatus}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ),
        status:
          status ||
          (readonly ? MODEL3D_LEGACY_READONLY_NOTICE : "") ||
          (showHosted && !ready ? "正在连接 3D 专业内核" : ""),
        persistence: {
          dirty: view.revision > 0,
          editRevision: view.revision,
          autoSave: !readonly,
          flush: save,
          recovery: {
            key: advancedRecoveryKey("threed", item),
            ready: Boolean(gltfBytes),
            capture: () => ({ view, format }),
            restore: (payload) => {
              const record = recordOf(payload);
              const nextView = recordOf(record?.view) || record;
              if (!nextView) return false;
              setView((current) => ({
                ...current,
                azimuth: Number(nextView.azimuth ?? current.azimuth),
                elevation: Number(nextView.elevation ?? current.elevation),
                zoom: Number(nextView.zoom ?? current.zoom),
                autoRotate: nextView.autoRotate === true,
                exposure: Number(nextView.exposure ?? current.exposure),
                background: String(nextView.background || current.background),
                materialColor: String(
                  nextView.materialColor || current.materialColor,
                ),
                nodeVisible: nextView.nodeVisible !== false,
                selectedNodeName: String(
                  nextView.selectedNodeName || current.selectedNodeName,
                ),
                revision: current.revision + 1,
              }));
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
