"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { AdvancedWorkbenchDrawer } from "../advanced-editor-adapter";
import type { AdvancedWorkbenchAction } from "../advanced-workbench-chrome";
import type { AdvancedFlushResult } from "../advanced-session-context";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import {
  isEditorRecoverySnapshot,
  type EditorDocumentRevision,
  type EditorHistorySnapshot,
  type EditorMaterialInsertion,
  type EditorProjectManifest,
  type EditorRecoverySnapshot,
  type EditorToolManifestEntry,
  type EditorViewportSnapshot,
} from "../editor-protocol";
import { uploadFile } from "../../lib/database";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { SelectionToolbar } from "../SelectionToolbar";
import { EmbedEditorPane } from "../workbench-embed";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import type { LibraryItem } from "../library-data";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import { selectionRequestId } from "../selection-context";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { UnsupportedRoute } from "./UnsupportedRoute";

interface RemoteChoice {
  value: Exclude<SelectionCommand["value"], undefined>;
  label: string;
  swatch?: string;
}

function RemoteChoicePanel({
  title,
  controlId,
  choices,
  selectionId,
  selectionRevision,
  onCommand,
}: {
  title: string;
  controlId: string;
  choices: RemoteChoice[];
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  onCommand: (command: SelectionCommand) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="mb-3 text-[12px] font-semibold text-[var(--fg,#292524)]">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((choice) => (
          <button
            key={`${typeof choice.value}:${String(choice.value)}`}
            type="button"
            onClick={() =>
              onCommand({
                requestId: selectionRequestId(),
                selectionId,
                controlId,
                value: choice.value,
                ...(selectionRevision !== undefined
                  ? { selectionRevision }
                  : {}),
              })
            }
            className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-left text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,#fafaf9)]"
          >
            {choice.swatch && (
              <span
                className="h-6 w-6 shrink-0 rounded-md border border-black/10"
                style={
                  choice.swatch.startsWith("#")
                    ? { backgroundColor: choice.swatch }
                    : { backgroundImage: choice.swatch }
                }
              />
            )}
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const DESIGN_SHAPES: RemoteChoice[] = [
  ["rect", "矩形"],
  ["circle", "圆形"],
  ["triangle", "三角形"],
  ["line", "线条"],
  ["arrow", "箭头"],
  ["star", "星形"],
  ["polygon", "多边形"],
  ["bubble", "对话泡泡"],
  ["ribbon", "丝带横幅"],
].map(([value, label]) => ({ value, label }));

const DESIGN_TEXT: RemoteChoice[] = [
  ["h1", "H1 标题"],
  ["h2", "H2 副标题"],
  ["body", "正文"],
  ["emphasis", "强调文本"],
  ["warp", "变形文字"],
].map(([value, label]) => ({ value, label }));

const DESIGN_BACKGROUND: RemoteChoice[] = [
  { value: "#ffffff", label: "纯白", swatch: "#ffffff" },
  { value: "#f8fafc", label: "浅灰", swatch: "#f8fafc" },
  { value: "#fef3c7", label: "暖黄", swatch: "#fef3c7" },
  { value: "#dbeafe", label: "浅蓝", swatch: "#dbeafe" },
  { value: "#fce7f3", label: "浅粉", swatch: "#fce7f3" },
  { value: "#111827", label: "深色", swatch: "#111827" },
];

const VIDEO_NODES: RemoteChoice[] = [
  ["text", "剧本 / 文本"],
  ["script", "脚本"],
  ["model", "模型"],
  ["image", "图片生成"],
  ["video", "视频生成"],
  ["imageInput", "图片素材"],
  ["videoInput", "视频素材"],
  ["audioInput", "音频素材"],
  ["subtitle", "字幕"],
  ["bgm", "背景音乐"],
  ["compose", "视频合成"],
  ["output", "输出"],
].map(([value, label]) => ({ value, label }));

const EMBEDDED_TOOLS_MANIFEST: Partial<
  Record<"canvas" | "video_canvas" | "website", EditorToolManifestEntry[]>
> = {
  canvas: [
    {
      id: "design-shapes",
      label: "形状",
      icon: "elements",
      controlId: "insert-shape",
      choices: DESIGN_SHAPES,
    },
    {
      id: "design-text",
      label: "文字",
      icon: "text",
      controlId: "insert-text",
      choices: DESIGN_TEXT,
    },
    {
      id: "design-background",
      label: "背景",
      icon: "background",
      controlId: "background-color",
      choices: DESIGN_BACKGROUND,
    },
  ],
  video_canvas: [
    {
      id: "video-nodes",
      label: "添加节点",
      icon: "add",
      controlId: "add-node",
      choices: VIDEO_NODES,
    },
  ],
  website: [
    {
      id: "site-device",
      label: "预览设备",
      icon: "pages",
      controlId: "set-device",
      choices: [
        { value: "desktop", label: "桌面" },
        { value: "tablet", label: "平板" },
        { value: "mobile", label: "手机" },
      ],
    },
  ],
};

export function EmbeddedRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const route = editorRouteFor(item);
  const [saveRequestId, setSaveRequestId] = useState("");
  const [editRevision, setEditRevision] = useState(0);
  const [closeRequestRevision, setCloseRequestRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [remoteHistoryState, setRemoteHistoryState] =
    useState<EditorHistorySnapshot>({ canUndo: false, canRedo: false });
  const [remoteToolsManifest, setRemoteToolsManifest] = useState<{
    revision: EditorDocumentRevision;
    tools: EditorToolManifestEntry[];
  } | null>(null);
  const [projectManifest, setProjectManifest] =
    useState<EditorProjectManifest | null>(null);
  const [projectCommand, setProjectCommand] = useState<{
    requestId: string;
    kind: "view" | "action";
    targetId: string;
    manifestRevision: EditorDocumentRevision;
  } | null>(null);
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [selectionCommand, setSelectionCommand] =
    useState<SelectionCommand | null>(null);
  const [remoteViewport, setRemoteViewport] =
    useState<EditorViewportSnapshot | null>(null);
  const [viewportCommand, setViewportCommand] = useState<{
    commandId: string;
    value?: number;
    fit?: boolean;
  } | null>(null);
  const [materialInsertion, setMaterialInsertion] =
    useState<EditorMaterialInsertion | null>(null);
  const [exportRequestId, setExportRequestId] = useState("");
  const [recoveryCaptureRequestId, setRecoveryCaptureRequestId] =
    useState("");
  const [recoveryRestore, setRecoveryRestore] = useState<{
    recoveryId: string;
    snapshot: EditorRecoverySnapshot;
  } | null>(null);
  const materialResolversRef = useRef(
    new Map<
      string,
      {
        resolve: () => void;
        reject: (error: Error) => void;
        timer: number;
      }
    >(),
  );
  const exportResolverRef = useRef<{
    exportId: string;
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: number;
  } | null>(null);
  const pendingSaveIdRef = useRef("");
  const saveResolverRef = useRef<
    ((result: AdvancedFlushResult) => void) | null
  >(null);
  const savePromiseRef = useRef<Promise<AdvancedFlushResult> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastDirtyRevisionRef = useRef<EditorDocumentRevision | null>(null);
  const remoteRevisionRef = useRef<EditorDocumentRevision | null>(null);
  const recoveryGenerationRef = useRef(0);
  const recoverySnapshotRef = useRef<EditorRecoverySnapshot | null>(null);
  const recoveryCaptureRef = useRef<{
    recoveryId: string;
    generation: number;
    promise: Promise<EditorRecoverySnapshot>;
    resolve: (snapshot: EditorRecoverySnapshot) => void;
    reject: (error: Error) => void;
    timer: number;
  } | null>(null);
  const recoveryRestoreRef = useRef<{
    recoveryId: string;
    snapshot: EditorRecoverySnapshot;
  } | null>(null);
  recoveryRestoreRef.current = recoveryRestore;
  const hostedMediaType = route.type === "embed" ? route.mediaType : null;
  const embeddedAdapterId =
    hostedMediaType === "website"
      ? "website"
      : hostedMediaType === "video_canvas"
        ? "video-canvas"
        : "design-canvas";
  useEffect(() => {
    setRemoteViewport(null);
    setViewportCommand(null);
  }, [hostedMediaType, item.key]);
  const sendViewportCommand = useCallback(
    (command: { value?: number; fit?: boolean }) => {
      setViewportCommand({
        commandId: `viewport-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        ...command,
      });
    },
    [],
  );
  // Canvas/background selections used to be hidden because the leading icon
  // was only a static type badge. It is now the real tools launcher, so keep
  // those selections in the shared edit bar as well.
  const hostedSelection = selection;
  const remoteSelectionId =
    hostedSelection?.id || `host:${hostedMediaType || "editor"}`;
  const remoteSelectionRevision =
    hostedSelection?.revision ?? remoteToolsManifest?.revision;
  const remoteDrawers = useMemo<AdvancedWorkbenchDrawer[]>(() => {
    const tools =
      remoteToolsManifest?.tools ||
      (hostedMediaType === "canvas" ||
      hostedMediaType === "video_canvas" ||
      hostedMediaType === "website"
        ? EMBEDDED_TOOLS_MANIFEST[hostedMediaType] || []
        : []);
    return tools.map((tool): AdvancedWorkbenchDrawer => ({
      id: tool.id,
      label: tool.label,
      icon: tool.icon || "elements",
      content: (
        <RemoteChoicePanel
          title={tool.label}
          controlId={tool.controlId}
          choices={tool.choices}
          selectionId={remoteSelectionId}
          selectionRevision={remoteSelectionRevision}
          onCommand={setSelectionCommand}
        />
      ),
    }));
  }, [
    hostedMediaType,
    remoteSelectionId,
    remoteSelectionRevision,
    remoteToolsManifest,
  ]);
  const sendRemoteCommand = useCallback(
    (
      controlId: string,
      value?: SelectionCommand["value"],
      revision = remoteSelectionRevision,
    ) => {
      setSelectionCommand({
        requestId: selectionRequestId(),
        selectionId: remoteSelectionId,
        controlId,
        ...(value !== undefined ? { value } : {}),
        ...(revision !== undefined ? { selectionRevision: revision } : {}),
      });
    },
    [remoteSelectionId, remoteSelectionRevision],
  );
  const remoteHistory = hostedMediaType
    ? {
        canUndo: remoteHistoryState.canUndo,
        canRedo: remoteHistoryState.canRedo,
        undo: () =>
          sendRemoteCommand(
            "undo",
            undefined,
            remoteHistoryState.revision ?? remoteSelectionRevision,
          ),
        redo: () =>
          sendRemoteCommand(
            "redo",
            undefined,
            remoteHistoryState.revision ?? remoteSelectionRevision,
          ),
      }
    : undefined;
  const sendProjectCommand = useCallback(
    (
      kind: "view" | "action",
      targetId: string,
      manifestRevision: EditorDocumentRevision,
    ) => {
      setProjectCommand({
        requestId: `project-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        kind,
        targetId,
        manifestRevision,
      });
    },
    [],
  );
  const remoteActions = useMemo<AdvancedWorkbenchAction[]>(
    () => {
      if (projectManifest) {
        return [
          ...projectManifest.views.map(
            (view): AdvancedWorkbenchAction => ({
              id: `project-view:${view.id}`,
              label: view.label,
              icon: view.icon,
              variant: view.active ? "primary" : "default",
              disabled: view.disabled,
              onTrigger: () =>
                sendProjectCommand(
                  "view",
                  view.id,
                  projectManifest.revision,
                ),
            }),
          ),
          ...projectManifest.actions.map(
            (action): AdvancedWorkbenchAction => ({
              id: `project-action:${action.id}`,
              label: action.label,
              busyLabel: action.busyLabel,
              icon: action.icon,
              variant: action.variant,
              disabled: action.disabled,
              busy: action.busy,
              onTrigger: () =>
                sendProjectCommand(
                  "action",
                  action.id,
                  projectManifest.revision,
                ),
            }),
          ),
        ];
      }
      if (hostedMediaType === "video_canvas") {
        return [
          {
            id: "video-run-all",
            label: "运行全部",
            icon: "animate",
            onTrigger: () => sendRemoteCommand("run-all"),
          },
        ];
      }
      if (hostedMediaType === "website") {
        return [
          {
            id: "website-refresh",
            label: "刷新预览",
            icon: "redo",
            onTrigger: () => sendRemoteCommand("refresh-preview"),
          },
        ];
      }
      return [];
    },
    [
      hostedMediaType,
      projectManifest,
      sendProjectCommand,
      sendRemoteCommand,
    ],
  );
  useEffect(() => {
    setSelection(null);
    setSelectionCommand(null);
    setMaterialInsertion(null);
    setExportRequestId("");
    setRemoteHistoryState({ canUndo: false, canRedo: false });
    setRemoteToolsManifest(null);
    setProjectManifest(null);
    setProjectCommand(null);
    setRecoveryCaptureRequestId("");
    setRecoveryRestore(null);
    recoveryRestoreRef.current = null;
    setDirty(false);
    setEditRevision(0);
    lastDirtyRevisionRef.current = null;
    remoteRevisionRef.current = null;
    recoveryGenerationRef.current += 1;
    recoverySnapshotRef.current = null;
  }, [item.key]);
  const handleDirtyChange = useCallback(
    (nextDirty: boolean, remoteRevision?: number) => {
      setDirty(nextDirty);
      if (!nextDirty) {
        lastDirtyRevisionRef.current = null;
        recoveryGenerationRef.current += 1;
        recoverySnapshotRef.current = null;
        const pendingRecovery = recoveryCaptureRef.current;
        if (pendingRecovery) {
          window.clearTimeout(pendingRecovery.timer);
          pendingRecovery.reject(
            new Error("该编辑器 revision 已由云端确认。"),
          );
          recoveryCaptureRef.current = null;
          setRecoveryCaptureRequestId("");
        }
        return;
      }
      if (Number.isSafeInteger(remoteRevision) && Number(remoteRevision) >= 0) {
        const nextRemote = Number(remoteRevision);
        if (Object.is(nextRemote, lastDirtyRevisionRef.current)) return;
        lastDirtyRevisionRef.current = nextRemote;
        remoteRevisionRef.current = nextRemote;
      }
      setEditRevision((value) => value + 1);
    },
    [],
  );
  const handleHistoryChange = useCallback((history: EditorHistorySnapshot) => {
    if (history.revision !== undefined) {
      remoteRevisionRef.current = history.revision;
    }
    setRemoteHistoryState(history);
  }, []);
  const handleToolsManifest = useCallback(
    (
      revision: EditorDocumentRevision,
      tools: EditorToolManifestEntry[],
    ) => {
      setRemoteToolsManifest({ revision, tools });
    },
    [],
  );
  const handleProjectManifest = useCallback(
    (manifest: EditorProjectManifest) => {
      setProjectManifest(manifest);
    },
    [],
  );
  const handleProjectResult = useCallback(
    (result: { requestId: string }) => {
      setProjectCommand((current) =>
        current?.requestId === result.requestId ? null : current,
      );
    },
    [],
  );
  const handleProtocolReset = useCallback(() => {
    setSelection(null);
    setSelectionCommand(null);
    setRemoteViewport(null);
    setRemoteHistoryState({ canUndo: false, canRedo: false });
    setRemoteToolsManifest(null);
    setProjectManifest(null);
    setProjectCommand(null);
  }, []);
  const captureEmbeddedRecovery = useCallback(() => {
    const latest = recoverySnapshotRef.current;
    if (
      latest &&
      remoteRevisionRef.current !== null &&
      Object.is(latest.revision, remoteRevisionRef.current)
    ) {
      return Promise.resolve(latest);
    }
    const active = recoveryCaptureRef.current;
    if (active) return active.promise;
    const recoveryId = `recovery-capture-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const generation = recoveryGenerationRef.current;
    let resolvePromise!: (snapshot: EditorRecoverySnapshot) => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<EditorRecoverySnapshot>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timer = window.setTimeout(() => {
      if (recoveryCaptureRef.current?.recoveryId !== recoveryId) return;
      recoveryCaptureRef.current = null;
      setRecoveryCaptureRequestId("");
      rejectPromise(new Error("嵌入编辑器草稿捕获超时。"));
    }, 8_000);
    recoveryCaptureRef.current = {
      recoveryId,
      generation,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      timer,
    };
    setRecoveryCaptureRequestId(recoveryId);
    return promise;
  }, []);
  const handleRecoverySnapshot = useCallback(
    (result: {
      recoveryId: string;
      ok: boolean;
      snapshot?: EditorRecoverySnapshot;
      message?: string;
    }) => {
      const pending = recoveryCaptureRef.current;
      if (!pending || pending.recoveryId !== result.recoveryId) return;
      window.clearTimeout(pending.timer);
      recoveryCaptureRef.current = null;
      setRecoveryCaptureRequestId("");
      if (
        !result.ok ||
        !result.snapshot ||
        pending.generation !== recoveryGenerationRef.current
      ) {
        pending.reject(
          new Error(
            result.message ||
              (pending.generation !== recoveryGenerationRef.current
                ? "草稿对应的 revision 已由云端确认。"
                : "嵌入编辑器无法捕获草稿。"),
          ),
        );
        return;
      }
      if (
        remoteRevisionRef.current !== null &&
        !Object.is(result.snapshot.revision, remoteRevisionRef.current)
      ) {
        pending.reject(new Error("编辑器返回了过期的草稿 revision。"));
        return;
      }
      recoverySnapshotRef.current = result.snapshot;
      pending.resolve(result.snapshot);
    },
    [],
  );
  const restoreEmbeddedRecovery = useCallback((payload: unknown) => {
    if (!isEditorRecoverySnapshot(payload)) return false;
    const recoveryId = `recovery-restore-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    setRecoveryRestore({ recoveryId, snapshot: payload });
    return true;
  }, []);
  const handleRecoveryResult = useCallback(
    (result: {
      recoveryId: string;
      ok: boolean;
      revision?: EditorDocumentRevision;
      message?: string;
    }) => {
      const restored = recoveryRestoreRef.current;
      if (!restored || restored.recoveryId !== result.recoveryId) return;
      recoveryRestoreRef.current = null;
      setRecoveryRestore(null);
      if (!result.ok) return;
      const revision = result.revision ?? restored.snapshot.revision;
      const snapshot = { ...restored.snapshot, revision };
      recoveryGenerationRef.current += 1;
      recoverySnapshotRef.current = snapshot;
      lastDirtyRevisionRef.current = revision;
      remoteRevisionRef.current = revision;
      setDirty(true);
      setEditRevision((value) => value + 1);
    },
    [],
  );
  useEffect(
    () => () => {
      materialResolversRef.current.forEach((pending) => {
        window.clearTimeout(pending.timer);
        pending.reject(new Error("嵌入编辑器已关闭。"));
      });
      materialResolversRef.current.clear();
      const pendingExport = exportResolverRef.current;
      if (pendingExport) {
        window.clearTimeout(pendingExport.timer);
        pendingExport.reject(new Error("嵌入编辑器已关闭。"));
        exportResolverRef.current = null;
      }
      const pendingRecovery = recoveryCaptureRef.current;
      if (pendingRecovery) {
        window.clearTimeout(pendingRecovery.timer);
        pendingRecovery.reject(new Error("嵌入编辑器已关闭。"));
        recoveryCaptureRef.current = null;
      }
    },
    [item.key],
  );
  const settleSave = useCallback((result: AdvancedFlushResult) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const resolve = saveResolverRef.current;
    saveResolverRef.current = null;
    savePromiseRef.current = null;
    pendingSaveIdRef.current = "";
    setSaveRequestId("");
    resolve?.(result);
  }, []);
  useEffect(
    () => () => {
      settleSave({ ok: false });
    },
    [item.key, settleSave],
  );
  const saveBeforeNewConversation = useCallback(
    () => {
      if (savePromiseRef.current) return savePromiseRef.current;
      const requestId = `host-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const promise = new Promise<AdvancedFlushResult>((resolve) => {
        pendingSaveIdRef.current = requestId;
        saveResolverRef.current = resolve;
        setSaveRequestId(requestId);
        saveTimerRef.current = window.setTimeout(
          () => settleSave({ ok: false, error: "编辑器保存超时" }),
          item.kind === "website" ? 5 * 60_000 : 25_000,
        );
      });
      savePromiseRef.current = promise;
      return promise;
    },
    [item.kind, settleSave],
  );
  const handleSaveResult = useCallback(
    (result: { ok: boolean; saveId?: string; item?: LibraryItem }) => {
      if (
        saveResolverRef.current &&
        result.saveId === pendingSaveIdRef.current
      ) {
        settleSave(
          result.ok
            ? { ok: true, item: result.item }
            : { ok: false, error: "编辑器保存失败" },
        );
      }
    },
    [settleSave],
  );
  const requestEditorClose = useCallback(() => {
    setCloseRequestRevision((value) => value + 1);
  }, []);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter | null>(() => {
    if (!hostedMediaType) return null;
    return {
      id: `embed-materials:${hostedMediaType}@2`,
      actions:
        hostedMediaType === "canvas"
          ? ["insert", "replace", "apply"]
          : ["insert"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        const mime = String(material.meta.mime || "").toLowerCase();
        if (hostedMediaType === "website" || hostedMediaType === "canvas") {
          return (
            Boolean(material.previewUrl || material.thumbUrl) ||
            material.kind === "image" ||
            mime.startsWith("image/") ||
            urls.some((url) =>
              /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
            )
          );
        }
        return (
          ["image", "video", "audio"].includes(material.kind) ||
          /^(?:image|video|audio)\//.test(mime) ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|m4a|ogg)(?:$|[?#])/i.test(
              url || "",
            ),
          )
        );
      },
      mutate: (action, material, placement) => {
        const candidates = (
          hostedMediaType === "video_canvas"
            ? [material.url, material.previewUrl, material.thumbUrl]
            : [material.previewUrl, material.thumbUrl, material.url]
        ).filter(Boolean) as string[];
        const supportedUrl =
          hostedMediaType === "video_canvas"
            ? /\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|m4a|ogg)(?:$|[?#])/i
            : /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i;
        const url =
          candidates.find((candidate) => supportedUrl.test(candidate)) ||
          candidates[0] ||
          "";
        if (!url) throw new Error("这个素材没有可用地址。");
        const resolvedKind = /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(url)
          ? "video"
          : /\.(?:mp3|wav|m4a|ogg)(?:$|[?#])/i.test(url)
            ? "audio"
            : /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url)
              ? "image"
              : material.kind;
        const commandId = `material-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
        return new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            materialResolversRef.current.delete(commandId);
            setMaterialInsertion((current) =>
              current?.commandId === commandId ? null : current,
            );
            reject(new Error("嵌入编辑器添加素材超时。"));
          }, 20_000);
          materialResolversRef.current.set(commandId, {
            resolve,
            reject,
            timer,
          });
          setMaterialInsertion({
            commandId,
            action,
            material: {
              id: material.key || material.id,
              kind: resolvedKind,
              title: material.title,
              url,
              previewUrl: material.previewUrl || material.thumbUrl,
              meta: {
                format: material.meta.format,
                mime: material.meta.mime,
                content_type: material.meta.content_type,
                subtype: material.meta.subtype,
                template_doc_url: material.meta.template_doc_url,
              },
              writable: false,
            },
            ...(placement?.source === "drop" &&
            Number.isFinite(placement.clientX) &&
            Number.isFinite(placement.clientY)
              ? {
                  point: {
                    x: placement.clientX as number,
                    y: placement.clientY as number,
                  },
                }
              : {}),
          });
        });
      },
    };
  }, [hostedMediaType]);
  useWorkbenchMaterialAdapter(materialAdapter);
  const handleMaterialResult = useCallback(
    (result: { commandId: string; ok: boolean; message?: string }) => {
      const pending = materialResolversRef.current.get(result.commandId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      materialResolversRef.current.delete(result.commandId);
      setMaterialInsertion((current) =>
        current?.commandId === result.commandId ? null : current,
      );
      if (result.ok) pending.resolve();
      else pending.reject(new Error(result.message || "素材添加失败。"));
    },
    [],
  );
  const requestRemoteExport = useCallback(() => {
    if (exportResolverRef.current) {
      return exportResolverRef.current.promise;
    }
    const exportId = `export-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    setExportRequestId(exportId);
    let resolvePromise!: () => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timer = window.setTimeout(() => {
      exportResolverRef.current = null;
      setExportRequestId("");
      rejectPromise(new Error("嵌入编辑器未响应导出协议，请稍后重试。"));
    }, 25_000);
    exportResolverRef.current = {
      exportId,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      timer,
    };
    return promise;
  }, []);
  const handleExportResult = useCallback(
    (result: {
      exportId: string;
      ok: boolean;
      url?: string;
      message?: string;
    }) => {
      const pending = exportResolverRef.current;
      if (!pending || pending.exportId !== result.exportId) return;
      window.clearTimeout(pending.timer);
      exportResolverRef.current = null;
      setExportRequestId("");
      if (!result.ok) {
        pending.reject(new Error(result.message || "嵌入编辑器导出失败。"));
        return;
      }
      if (result.url) {
        const anchor = document.createElement("a");
        anchor.href = result.url;
        anchor.download = "";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      pending.resolve();
    },
    [],
  );
  const websiteId = useMemo(
    () =>
      String(
        item.meta.website_id ||
          item.meta.project_id ||
          item.meta.slug ||
          item.meta.site_id ||
          "",
      ),
    [item.meta],
  );
  const starterId = useMemo(
    () => String(item.meta.starter_id || "").trim(),
    [item.meta],
  );
  const githubRepo = useMemo(
    () => String(item.meta.github_repo || "").trim(),
    [item.meta],
  );
  const commitSha = useMemo(
    () => String(item.meta.commit_sha || "").trim(),
    [item.meta],
  );
  const extraParams = useMemo(
    () => {
      const blank: Record<string, string> =
        item.meta.draft === true && !item.url && !item.previewUrl
          ? { blank: "1" }
          : {};
      if (item.kind !== "website") {
        return Object.keys(blank).length ? blank : undefined;
      }
      if (websiteId) {
        return {
          ...blank,
          siteId: websiteId,
          projectId: websiteId,
          ...(starterId ? { starterId } : {}),
          ...(githubRepo ? { githubRepo } : {}),
          ...(commitSha ? { commitSha } : {}),
        };
      }
      return Object.keys(blank).length || starterId || githubRepo
        ? {
            ...blank,
            ...(starterId ? { starterId } : {}),
            ...(githubRepo ? { githubRepo } : {}),
            ...(commitSha ? { commitSha } : {}),
          }
        : undefined;
    },
    [
      item.kind,
      item.meta.draft,
      item.previewUrl,
      item.url,
      starterId,
      websiteId,
      githubRepo,
      commitSha,
    ],
  );

  if (route.type !== "embed") {
    return (
      <UnsupportedRoute
        item={item}
        previewContent={previewContent}
        linkUrl={linkUrl}
        taskId={taskId}
        siteId={siteId}
        accent={accent}
        onClose={onClose}
      />
    );
  }

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: embeddedAdapterId,
        label: editorToolLabel(route),
        stage: (
          <EmbedEditorPane
            key={`${item.key}:${item.url || ""}:${item.previewUrl || ""}:${item.title}`}
            item={item}
            editorBase={route.base}
            mediaType={route.mediaType}
            siteId={siteId}
            extraParams={extraParams}
            onCloseRequest={requestEditorClose}
            onDirtyChange={handleDirtyChange}
            onHistoryChange={handleHistoryChange}
            onToolsManifest={handleToolsManifest}
            onProjectManifest={handleProjectManifest}
            onProjectResult={handleProjectResult}
            onProtocolReset={handleProtocolReset}
            onSelectionChange={setSelection}
            onViewportChange={setRemoteViewport}
            selectionCommand={selectionCommand}
            viewportCommand={viewportCommand}
            materialInsertion={materialInsertion}
            onMaterialResult={handleMaterialResult}
            exportRequestId={exportRequestId}
            onExportResult={handleExportResult}
            projectCommand={projectCommand}
            recoveryCaptureRequestId={recoveryCaptureRequestId}
            onRecoverySnapshot={handleRecoverySnapshot}
            recoveryRestore={recoveryRestore}
            onRecoveryResult={handleRecoveryResult}
            onSaveResult={handleSaveResult}
            saveRequestId={saveRequestId}
          />
        ),
        renderContextToolbar: ({ openDrawer }) =>
          hostedSelection ? (
            <SelectionToolbar
              context={hostedSelection}
              onCommand={setSelectionCommand}
              onOpenPanel={openDrawer}
              accent={accent}
            />
          ) : null,
        drawers: remoteDrawers,
        history: remoteHistory,
        viewport: remoteViewport
          ? {
              value: remoteViewport.value,
              min: remoteViewport.min,
              max: remoteViewport.max,
              step: remoteViewport.step,
              setValue: (value) => sendViewportCommand({ value }),
              ...(remoteViewport.canFit
                ? { fit: () => sendViewportCommand({ fit: true }) }
                : {}),
            }
          : undefined,
        directDownload: {
          id: "embedded-export-default",
          label:
            route.mediaType === "website"
              ? "直接导出网站"
              : route.mediaType === "video_canvas"
                ? "直接导出视频"
                : "直接下载设计",
          icon: "download",
          busy: Boolean(exportRequestId),
          busyLabel: "等待编辑器导出…",
          onTrigger: requestRemoteExport,
        },
        actions: remoteActions,
        persistence: {
          dirty,
          editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey(embeddedAdapterId, item),
            ready: true,
            capture: captureEmbeddedRecovery,
            restore: restoreEmbeddedRecovery,
          },
        },
        upload: materialAdapter
          ? {
              accept:
                route.mediaType === "video_canvas"
                  ? "image/*,video/*,audio/*"
                  : "image/*",
              multiple: true,
              onFiles: async (files) => {
                for (const file of files) {
                  const uploaded = await uploadFile(file, {
                    siteId: siteId || route.mediaType,
                    title: file.name,
                  });
                  const row = uploaded.data?.file;
                  if (!uploaded.ok || !row?.url) {
                    throw new Error(uploaded.error || "文件上传失败");
                  }
                  await materialAdapter.mutate(
                    "insert",
                    {
                      key: `upload:${row.id || row.url}`,
                      source: "creation",
                      id: row.id || row.url,
                      title: row.title || file.name,
                      kind: file.type.startsWith("video/")
                        ? "video"
                        : file.type.startsWith("audio/")
                          ? "audio"
                          : "image",
                      siteId: siteId || route.mediaType,
                      url: row.url,
                      previewUrl: row.thumb_url || row.url,
                      thumbUrl: row.thumb_url || row.url,
                      favorite: false,
                      meta: {
                        mime: file.type,
                        format: file.name.split(".").pop()?.toLowerCase() || "",
                      },
                    },
                    { source: "click" },
                  );
                }
              },
            }
          : undefined,
        closeRequestRevision,
      }}
      onClose={onClose}
    />
  );
}
