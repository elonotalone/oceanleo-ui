"use client";

import { useCallback, useEffect, useRef } from "react";
import type { UITranslate } from "../i18n/ui/useUI";
import { isCurrentFamilyFirstPartyHost } from "../contracts/domain-family";
import { saveCreations, type MediaType } from "../lib/database";
import { getArtifactItem } from "./artifact-client";
import { importMediaUrl, isFirstPartyMediaUrl } from "../lib/media-proxy";
import {
  acceptEditorFrameMessage,
  type EditorDocumentRevision,
  type EditorMessageSeverity,
} from "./editor-protocol";
import { advancedSavedItem } from "./advanced-session";
import {
  DesignCompositeCommitError,
  isEmbeddedTypedCommitType,
  persistDesignCompositeCommit,
  persistEmbeddedTypedCommit,
} from "./design-composite-commit";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";
import type { SelectionContext } from "./selection-context";
import type { SelectionCommandGate } from "./selection-transactions";
import type { EmbedEditorPaneProps } from "./workbench-embed-types";

interface ArtifactSaveOutcome {
  saved: boolean;
  detail: string;
  durableUrl: string;
  savedItem?: LibraryItem;
  artifactId?: string;
  revisionId?: string;
  code?: string;
  currentRevisionId?: string;
}

export interface EmbedEditorStatus {
  message: string;
  severity: EditorMessageSeverity;
  code?: string;
  retryable?: boolean;
}

function editorStatus(
  message: string,
  severity: EditorMessageSeverity,
  options: { code?: string; retryable?: boolean } = {},
): EmbedEditorStatus {
  return {
    message,
    severity,
    ...(options.code ? { code: options.code } : {}),
    ...(options.retryable !== undefined
      ? { retryable: options.retryable }
      : {}),
  };
}

type MutableRef<T> = { current: T };
type MessageCallbacks = Pick<
  EmbedEditorPaneProps,
  | "onCloseRequest"
  | "onDirtyChange"
  | "onExportResult"
  | "onHistoryChange"
  | "onMaterialResult"
  | "onProjectManifest"
  | "onProjectResult"
  | "onRecoveryResult"
  | "onRecoverySnapshot"
  | "onSaveResult"
  | "onSelectionChange"
  | "onSelectionResult"
  | "onToolsManifest"
  | "onVersionSaved"
  | "onViewportChange"
>;

type UseEmbedEditorMessagesInput = MessageCallbacks & {
  iframeRef: MutableRef<HTMLIFrameElement | null>;
  editorOrigin: string;
  instanceId: string;
  item: LibraryItem;
  mediaType: MediaType;
  siteId: string;
  readyHandledRef: MutableRef<boolean>;
  latestSelectionRef: MutableRef<SelectionContext | null>;
  selectionGateRef: MutableRef<SelectionCommandGate>;
  projectRequestsRef: MutableRef<Map<string, EditorDocumentRevision>>;
  latestProjectManifestRevisionRef: MutableRef<EditorDocumentRevision | null>;
  sentRecoveryCaptureRequestsRef: MutableRef<Set<string>>;
  sentRecoveryRestoreRequestsRef: MutableRef<Set<string>>;
  artifactSaveOperationsRef: MutableRef<
    Map<string, Promise<ArtifactSaveOutcome>>
  >;
  sendToEditor: (message: Record<string, unknown>) => boolean;
  sendOpenAsset: () => void;
  setPhase: (phase: "ready") => void;
  setStatus: (status: EmbedEditorStatus | null) => void;
  tt: UITranslate;
};

function isDurableArtifactUrl(url: string, mediaType: MediaType): boolean {
  if (isFirstPartyMediaUrl(url)) return true;
  if (mediaType !== "website") return false;
  try {
    const parsed = new URL(url);
    // 「这个产物地址是否耐久」按**当前家族**判：`.com` 页面对 `.com` 主机的结论
    // 逐字不变，而 `.cn` 页面不再把一个 `.com` 主机当成自家的耐久地址。
    // isCurrentFamilyFirstPartyHost 同时把两个用户内容域挡在外面。
    return (
      parsed.protocol === "https:" &&
      isCurrentFamilyFirstPartyHost(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function artifactInputIdentity(item: LibraryItem): string {
  return isDurableLibraryItem(item)
    ? `${item.key}:${item.artifactId}:${item.revisionId}`
    : item.key;
}

export function useEmbedEditorMessages({
  iframeRef,
  editorOrigin,
  instanceId,
  item,
  mediaType,
  siteId,
  readyHandledRef,
  latestSelectionRef,
  selectionGateRef,
  projectRequestsRef,
  latestProjectManifestRevisionRef,
  sentRecoveryCaptureRequestsRef,
  sentRecoveryRestoreRequestsRef,
  artifactSaveOperationsRef,
  sendToEditor,
  sendOpenAsset,
  setPhase,
  setStatus,
  tt: providedTranslate,
  onCloseRequest,
  onDirtyChange,
  onExportResult,
  onHistoryChange,
  onMaterialResult,
  onProjectManifest,
  onProjectResult,
  onRecoveryResult,
  onRecoverySnapshot,
  onSaveResult,
  onSelectionChange,
  onSelectionResult,
  onToolsManifest,
  onVersionSaved,
  onViewportChange,
}: UseEmbedEditorMessagesInput): void {
  // `tt` 由 `workbench-embed.tsx` 从 `useUI()` 直接透传，是 provider 所有的函数。
  // 它进下面那个消息 effect 的依赖，后果比一般的「白重跑」严重：该 effect 装的是
  // `window` 上的 `message` 监听器，清理函数会 `active = false` 并摘掉监听。`tt` 一换
  // 身份就整条拆了重挂，正在飞的保存回调因此被判 `!active` 而丢弃——用户会看到保存
  // 既不成功也不失败地卡住；配合 effect 体里的 `setStatus(...)` 就是 W13 治过的自锁形状。
  // 语言切换与「这条编辑器握手还作不作数」无关，答案明确是不该重跑。
  // 沿用 W13 在 `doc-editors/use-grid-editor.ts:518-531` 定下的 ref + 恒定包装，
  // 下面的 `tt` 即该包装（`vars` 一并转发）。代价：状态提示文案停在产生时那个语言；
  // 这些文案有一部分要塞进 `save-result` 发回 iframe 里的编辑器，本来就不能等渲染时再翻。
  const translateRef = useRef(providedTranslate);
  useEffect(() => {
    translateRef.current = providedTranslate;
  }, [providedTranslate]);
  const tt = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

  const artifactHeadRef = useRef(item);
  const artifactInputIdentityRef = useRef(artifactInputIdentity(item));
  const artifactHeadGenerationRef = useRef(0);
  const nextInputIdentity = artifactInputIdentity(item);
  if (artifactInputIdentityRef.current !== nextInputIdentity) {
    artifactInputIdentityRef.current = nextInputIdentity;
    artifactHeadRef.current = item;
    artifactHeadGenerationRef.current += 1;
  }
  const typedCommitQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    const receive = (event: MessageEvent) => {
      // origin 合法只证明「消息来自该域」。因此除 origin 外还要求 source 是本
      // frame，且指令必须命中 editor→host 白名单（见 editor-protocol）。
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== editorOrigin) return;
      const message = acceptEditorFrameMessage(event, {
        expectedOrigin: editorOrigin,
        frameWindow: iframeRef.current?.contentWindow,
        instanceId,
      });
      if (!message) return;
      if (message.type === "ready") {
        setPhase("ready");
        setStatus(null);
        if (!readyHandledRef.current) {
          readyHandledRef.current = true;
          sendOpenAsset();
        }
      } else if (message.type === "dirty") {
        onDirtyChange?.(message.dirty !== false, message.revision);
      } else if (message.type === "history-changed") {
        onHistoryChange?.(message.history);
      } else if (message.type === "tools-manifest") {
        onToolsManifest?.(message.revision, message.tools);
      } else if (message.type === "project-manifest") {
        latestProjectManifestRevisionRef.current = message.manifest.revision;
        onProjectManifest?.(message.manifest);
      } else if (message.type === "project-result") {
        const pendingRevision = projectRequestsRef.current.get(
          message.requestId,
        );
        if (
          pendingRevision === undefined ||
          !Object.is(pendingRevision, message.manifestRevision)
        ) {
          return;
        }
        projectRequestsRef.current.delete(message.requestId);
        if (
          !Object.is(
            latestProjectManifestRevisionRef.current,
            message.manifestRevision,
          )
        ) {
          const staleMessage = tt("项目状态已更新，请重试");
          setStatus(editorStatus(staleMessage, "warning", { retryable: true }));
          onProjectResult?.({
            requestId: message.requestId,
            manifestRevision: message.manifestRevision,
            ok: false,
            message: staleMessage,
          });
          return;
        }
        if (!message.ok) {
          setStatus(
            editorStatus(
              message.message || tt("项目操作失败"),
              "warning",
              { retryable: true },
            ),
          );
        }
        onProjectResult?.({
          requestId: message.requestId,
          manifestRevision: message.manifestRevision,
          ok: message.ok,
          message: message.message,
        });
      } else if (message.type === "recovery-snapshot") {
        if (!sentRecoveryCaptureRequestsRef.current.has(message.recoveryId)) {
          return;
        }
        sentRecoveryCaptureRequestsRef.current.delete(message.recoveryId);
        if (!message.ok) {
          setStatus(
            editorStatus(
              message.message || tt("编辑器草稿暂时无法保存"),
              message.severity || "fatal",
              {
                code: message.code,
                retryable: message.retryable,
              },
            ),
          );
        }
        onRecoverySnapshot?.({
          recoveryId: message.recoveryId,
          ok: message.ok,
          snapshot: message.snapshot,
          message: message.message,
        });
      } else if (message.type === "recovery-result") {
        if (!sentRecoveryRestoreRequestsRef.current.has(message.recoveryId)) {
          return;
        }
        sentRecoveryRestoreRequestsRef.current.delete(message.recoveryId);
        if (!message.ok) {
          setStatus(
            editorStatus(
              message.message || tt("编辑器草稿恢复失败"),
              message.severity || "fatal",
              {
                code: message.code,
                retryable: message.retryable,
              },
            ),
          );
        }
        onRecoveryResult?.({
          recoveryId: message.recoveryId,
          ok: message.ok,
          revision: message.revision,
          message: message.message,
        });
      } else if (message.type === "error") {
        setStatus(
          editorStatus(
            message.message || tt("编辑器发生错误"),
            message.severity || "fatal",
            {
              code: message.code,
              retryable: message.retryable,
            },
          ),
        );
      } else if (message.type === "selection-changed") {
        const frameRect = iframeRef.current?.getBoundingClientRect();
        const anchor = message.selection?.anchor;
        const selection =
          message.selection && anchor && frameRect
            ? {
                ...message.selection,
                anchor: {
                  x: frameRect.left + anchor.x,
                  y: frameRect.top + anchor.y,
                  width: anchor.width,
                  height: anchor.height,
                },
              }
            : message.selection;
        for (const command of selectionGateRef.current.reconcile(selection)) {
          sendToEditor({ type: "selection-command", command });
        }
        latestSelectionRef.current = selection;
        onSelectionChange?.(selection);
      } else if (message.type === "selection-result") {
        if (!message.ok) {
          setStatus(
            editorStatus(
              message.message || tt("编辑器未能完成这项修改"),
              "warning",
              { retryable: true },
            ),
          );
        }
        onSelectionResult?.({
          requestId: message.requestId,
          ok: message.ok,
          message: message.message,
        });
      } else if (message.type === "viewport-changed") {
        onViewportChange?.(message.viewport);
      } else if (message.type === "material-result") {
        onMaterialResult?.({
          commandId: message.commandId,
          ok: message.ok,
          message: message.message,
        });
      } else if (message.type === "export-result") {
        onExportResult?.({
          exportId: message.exportId,
          ok: message.ok,
          url: message.url,
          message: message.message,
        });
      } else if (message.type === "close-request") {
        onCloseRequest?.();
      } else if (
        message.type === "artifact-created" ||
        message.type === "artifact-updated"
      ) {
        const requestArtifactId =
          typeof message.meta?.artifact_id === "string"
            ? message.meta.artifact_id
            : "";
        const requestRevisionId =
          typeof message.meta?.expected_artifact_revision_id === "string"
            ? message.meta.expected_artifact_revision_id
            : "";
        const saveKey = message.saveId
          ? `save:${instanceId}:${requestArtifactId}:${requestRevisionId}:${message.saveId}`
          : `legacy:${Date.now().toString(36)}:${Math.random()
              .toString(36)
              .slice(2, 8)}`;
        const existing = artifactSaveOperationsRef.current.get(saveKey);
        const saveGeneration = artifactHeadGenerationRef.current;
        const operation =
          existing ||
          (async (): Promise<ArtifactSaveOutcome> => {
            let saved = false;
            let detail = tt("保存失败");
            let durableUrl = message.url;
            let savedItem: LibraryItem | undefined;
            let artifactId: string | undefined;
            let revisionId: string | undefined;
            let code: string | undefined;
            let currentRevisionId: string | undefined;
            try {
              if (message.meta?.requires_typed_artifact_commit === true) {
                const commitTask = typedCommitQueueRef.current.then(
                  async () => {
                    if (saveGeneration !== artifactHeadGenerationRef.current) {
                      throw new DesignCompositeCommitError(
                        "design artifact 已切换，旧保存请求已拒绝。",
                        "stale-artifact",
                      );
                    }
                    // composite_image 走原来那条带 scene 闭包的路；
                    // vector_image / workflow / website 走 A12 新增的、
                    // 按类型 fail-closed 校验 source format 的那条。
                    const head = artifactHeadRef.current;
                    const committed = isEmbeddedTypedCommitType(
                      String(head?.artifactType || ""),
                    )
                      ? await persistEmbeddedTypedCommit(head, message)
                      : await persistDesignCompositeCommit(head, message);
                    if (saveGeneration === artifactHeadGenerationRef.current) {
                      artifactHeadRef.current = committed;
                    }
                    return committed;
                  },
                );
                typedCommitQueueRef.current = commitTask.then(
                  () => undefined,
                  () => undefined,
                );
                const committed = await commitTask;
                saved = true;
                detail = tt("新版本已保存到我的库");
                savedItem = committed;
                artifactId = committed.artifactId;
                revisionId = committed.revisionId;
                durableUrl =
                  committed.previewUrl || committed.url || durableUrl;
              } else {
                if (!isDurableArtifactUrl(durableUrl, mediaType)) {
                  const importKind =
                    mediaType === "image"
                      ? "image"
                      : mediaType === "video"
                        ? "video"
                        : mediaType === "audio"
                          ? "audio"
                          : mediaType === "model3d"
                            ? "model3d"
                            : "file";
                  durableUrl = await importMediaUrl(durableUrl, {
                    kind: importKind,
                    siteId: siteId || "oceanleo",
                    title: message.title || `${item.title}-编辑版`,
                    registerAsset: false,
                  });
                }
                const result = await saveCreations(siteId || "oceanleo", [
                  {
                    url: durableUrl,
                    thumb_url:
                      message.previewUrl &&
                      isDurableArtifactUrl(message.previewUrl, mediaType)
                        ? message.previewUrl
                        : durableUrl,
                    media_type: mediaType,
                    title: message.title || `${item.title}-编辑版`,
                    kind: item.kind,
                    meta: {
                      ...(message.meta || {}),
                      parent_asset_id: item.id,
                      editor_instance: instanceId,
                    },
                  },
                ]);
                saved = result.ok && Number(result.data?.saved || 0) === 1;
                detail = saved
                  ? tt("新版本已保存到我的库")
                  : result.error || tt("保存失败");
                savedItem = saved
                  ? advancedSavedItem(item, {
                      url: durableUrl,
                      previewUrl: message.previewUrl,
                      title: message.title,
                      meta: message.meta,
                    })
                  : undefined;
                /**
                 * A13：`website` 这类编辑器**在服务端**就把 typed revision 落好了
                 * （`materializeWebsiteProjectArtifact`），消息里带的是已经存在的
                 * artifact/revision 身份，不是请宿主再提交一次——所以它刻意不设
                 * `requires_typed_artifact_commit`，宿主再提交会变成重复 revision
                 * 或对着已推进的 head 打 409。
                 *
                 * 宿主真正欠的是**把工作台的 pin 推进到那个新 revision**：过去这里
                 * 只登记 creation，`savedItem` 仍旧背着打开时的旧 pin，于是下一次
                 * 保存还是以旧 revision 为基。这里按服务端权威投影收编新 head。
                 */
                const declaredArtifactId = String(
                  message.meta?.artifact_id || "",
                ).trim();
                const declaredRevisionId = String(
                  message.meta?.artifact_revision_id ||
                    message.meta?.revision_id ||
                    "",
                ).trim();
                if (saved && declaredArtifactId && declaredRevisionId) {
                  const adopted = await getArtifactItem(
                    declaredArtifactId,
                    declaredRevisionId,
                  );
                  const projection = adopted.data;
                  if (
                    adopted.ok &&
                    projection &&
                    isDurableLibraryItem(projection) &&
                    projection.artifactId === declaredArtifactId &&
                    projection.revisionId === declaredRevisionId
                  ) {
                    savedItem = projection;
                    artifactId = projection.artifactId;
                    revisionId = projection.revisionId;
                    durableUrl =
                      projection.previewUrl || projection.url || durableUrl;
                  }
                  // 取不到权威投影就保持既有 creation 行为，不猜、不伪造 pin。
                }
              }
            } catch (caught) {
              detail =
                caught instanceof Error && caught.message
                  ? caught.message
                  : tt("保存失败");
              if (caught instanceof DesignCompositeCommitError) {
                code = caught.code;
                currentRevisionId = caught.currentRevisionId;
              }
            }
            return {
              saved,
              detail,
              durableUrl,
              savedItem,
              artifactId,
              revisionId,
              code,
              currentRevisionId,
            };
          })();
        if (!existing) {
          artifactSaveOperationsRef.current.set(saveKey, operation);
          if (artifactSaveOperationsRef.current.size > 64) {
            const oldest = artifactSaveOperationsRef.current.keys().next().value;
            if (oldest) artifactSaveOperationsRef.current.delete(oldest);
          }
        }
        void operation.then((outcome) => {
          if (!active) return;
          if (!existing) {
            setStatus(
              outcome.saved
                ? null
                : editorStatus(outcome.detail, "fatal", {
                    code: outcome.code || "EDITOR_SAVE_FAILED",
                  }),
            );
            onSaveResult?.({
              ok: outcome.saved,
              saveId: message.saveId,
              item: outcome.savedItem,
            });
            if (outcome.savedItem) onVersionSaved?.(outcome.savedItem);
          }
          sendToEditor({
            type: "save-result",
            ok: outcome.saved,
            message: outcome.detail,
            url: outcome.durableUrl,
            saveId: message.saveId,
            revision: message.revision,
            artifactId: outcome.artifactId,
            revisionId: outcome.revisionId,
            code: outcome.code,
            currentRevisionId: outcome.currentRevisionId,
          });
        });
      }
    };
    window.addEventListener("message", receive);
    return () => {
      active = false;
      window.removeEventListener("message", receive);
    };
  }, [
    editorOrigin,
    iframeRef,
    instanceId,
    item,
    mediaType,
    onCloseRequest,
    onDirtyChange,
    onExportResult,
    onHistoryChange,
    onMaterialResult,
    onProjectManifest,
    onProjectResult,
    onRecoveryResult,
    onRecoverySnapshot,
    onSaveResult,
    onSelectionChange,
    onSelectionResult,
    onToolsManifest,
    onVersionSaved,
    onViewportChange,
    sendOpenAsset,
    sendToEditor,
    siteId,
    tt,
  ]);
}
