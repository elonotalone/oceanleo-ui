"use client";
import { useLibraryEditReadOnly } from "../plugin-command/use-library-edit";
import { richDocEditable } from "../collab/adapters/richdoc";

import { useExportDownloads } from "../doc-editors/use-export-downloads";

import { afterAdvancedDraftExport } from "../advanced-draft-gates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { useAdvancedSession } from "../advanced-session-context";
import { advancedRootItemId, advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { EditBarPanelRequest } from "../EditBarFloatingPanel";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { exportWechatFromTiptap } from "../doc-editors/rich-doc-wechat-export";
import { useRichDocSelectionAdapter } from "../doc-editors/use-rich-doc-selection-adapter";
import { RichDocControls, RichDocFindReplace, RichDocImageCropControls } from "../doc-editors/RichDocControls";
import { RichDocCommentRail } from "../doc-editors/richdoc-review/RichDocCommentRail";
import { RichDocReviewReadOnlyContext } from "../doc-editors/richdoc-review/review-readonly-context";
import { useRichDocReviewCollab } from "../doc-editors/richdoc-review/use-richdoc-review-collab";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { RichDocStage } from "../doc-editors/RichDocStage";
import { downloadText, loadEditorProject } from "../doc-editors/doc-io";
import { richDocProjectUrl } from "../doc-editors/rich-doc-model";
import { artifactSaveStepMessage } from "../doc-editors/artifact-save-contract";
import type { AdvancedContextToolbarHost } from "../advanced-editor-adapter";
import { useRichDocFindShortcut } from "../doc-editors/use-rich-doc-find-shortcut";
import { buildRichDocContext } from "../doc-editors/doc-family-commands";
import {
  docFamilyAcceptAttribute,
} from "../doc-editors/doc-family-formats";
import { importDocFamilyFile } from "../doc-editors/doc-family-import";
import { useEditorContext } from "../plugin-command";
import {
  richDocSavedItemForHandoff,
  useRichDocEditor,
  RICHDOC_SOURCE_FORMAT,
  RICHDOC_SOURCE_MEDIA_TYPE,
} from "../doc-editors/use-rich-doc-editor";
import { isDurableLibraryItem } from "../library-data";
import { useOfficeArtifactSource } from "../office-editor";
import { imEnabledHere } from "../../lib/im/client";
import { useCollabRoom } from "../collab";
import { workingCopyRoot, workingCopyTransport } from "../editor-working-copy";
import { getCurrentArtifactItem } from "../artifact-client";
import { RICHDOC_COLLAB_EDITOR_KIND } from "../collab/adapters/richdoc";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { withEditorHistoryCommand } from "../workbench-material-command";

function samePublishedDocument(left: unknown, right: unknown): boolean {
  const stable = (value: unknown) => JSON.stringify(value, (_key, next) =>
    next && typeof next === "object" && !Array.isArray(next)
      ? Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
      : next);
  return stable(left) === stable(right);
}

export function RichDocRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const aiReadOnly = useLibraryEditReadOnly(item);
  const advancedSession = useAdvancedSession();
  const tt = useUI();
  // A successful commit updates `item` to the new pinned revision. Keep the
  // loaded bytes stable so that parent identity updates cannot discard edits
  // that landed while the save request was in flight.
  const openedItemRef = useRef(item);
  const officeSource = useOfficeArtifactSource(openedItemRef.current);
  // 多人同改（work-chat W12）：房间由 W11 提供；没有 artifactId 或没开协同就是单人编辑。
  const collabRoom = useCollabRoom({
    resource: item.artifactId
      ? { kind: "artifact", id: String(item.artifactId) }
      : null,
    editorKind: RICHDOC_COLLAB_EDITOR_KIND,
    enabled: imEnabledHere(),
  });
  const editor = useRichDocEditor(
    officeSource.item,
    siteId,
    officeSource.resourceFailed,
    // 协同里谁写的批注要看得出来：作者取房间里的自己（不传就是匿名 local，两个人分不清）。
    collabRoom
      ? {
          author: String(collabRoom.self.id),
          authorName: String(collabRoom.self.name || ""),
        }
      : undefined,
    { room: collabRoom },
  );
  useEffect(() => {
    editor.editor?.setEditable(!aiReadOnly && richDocEditable(editor.collabPhase, editor.collabReadOnly), false);
  }, [aiReadOnly, editor.editor, editor.collabReadOnly, editor.collabPhase]);
  const exportDownloads = useExportDownloads({ editor: "richdoc", item, disabled: editor.loading || !editor.sourceReady || !editor.editor, generate: editor.exportFile });
  const panelHostRef = useRef<AdvancedContextToolbarHost | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const openImageCrop = useCallback(() => setCropOpen((open) => !open), []);
  const selection = useRichDocSelectionAdapter({ editor, onCrop: openImageCrop });
  useRichDocFindShortcut(Boolean(editor.editor && !editor.loading && editor.sourceReady),
    () => panelHostRef.current?.openDrawer("richdoc-find"));
  // 批注的内容、回复、已解决接进房间的共享评论字段（F09）；没有房间或房间被拒时什么都不做。
  useRichDocReviewCollab({
    review: editor.review,
    editor: editor.editor,
    room: collabRoom,
    active: editor.collabPhase !== "off",
    live: editor.collabPhase === "live",
    readOnly: editor.collabReadOnly,
  });
  const [exportError, setExportError] = useState("");
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "richdoc-materials@2",
      actions: ["insert"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        // 文档只接图片：视频、PDF 这类素材带的封面图不是用户要插的东西。
        return (
          material.kind === "image" ||
          String(material.meta.mime || "").startsWith("image/") ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
          )
        );
      },
      mutate: (_action, material, placement) => {
        const candidates = [
          material.previewUrl,
          material.thumbUrl,
          material.url,
        ].filter(Boolean) as string[];
        const url =
          candidates.find((candidate) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(candidate),
          ) || candidates[0] || "";
        if (!url) throw new Error("这个图片素材没有可用地址。");
        editor.insertImageUrl(
          url,
          placement?.source === "drop" &&
            Number.isFinite(placement.clientX) &&
            Number.isFinite(placement.clientY)
            ? {
                clientX: placement.clientX as number,
                clientY: placement.clientY as number,
              }
            : undefined,
        );
      },
    }),
    [editor.insertImageUrl],
  );
  // 素材库「点一下 / 拖进去 = 插入」：插图走 Tiptap 自己的撤销历史（`setImage` 链），
  // 基线是当前 revision（保存后随 `item` 前移）；基线未知时不登记，面板如实说还不能插。
  const materialCommandAdapter = useMemo(
    () =>
      withEditorHistoryCommand(materialAdapter, {
        documentId: advancedRootItemId(item),
        targetRevisionId: item.revisionId,
      }),
    [item, materialAdapter],
  );
  useWorkbenchMaterialAdapter(materialCommandAdapter);
  const saveBeforeNewConversation = useCallback(async (prepared?: ReturnType<typeof editor.prepareSave>, document = editor.captureRecovery()) => {
    // 只读成员可以发送现有文件，不发起保存。
    if (editor.collabReadOnly) return { ok: true as const, item };
    // Another tab may already have published this acknowledged working copy.
    // Reuse its pinned revision; avoid rebuilding files or creating a duplicate.
    const root = workingCopyRoot(item);
    const copy = await workingCopyTransport(root, "oceanleo.richdoc.edit.v1", item.revisionId || null).get();
    if (copy) {
      const current = await getCurrentArtifactItem(root);
      if (!current.ok || !current.data) return { ok: false as const, error: current.error || "保存失败，请重试" };
      if (copy.seq <= (copy.published_seq ?? 0) && current.data.revisionId === copy.base_revision_id) { editor.adoptPublishedItem(current.data); return { ok: true as const, item: current.data }; }
      // Content also covers different seqs and delayed publication-marker writes.
      const projectUrl = richDocProjectUrl(current.data);
      if (projectUrl && samePublishedDocument(await loadEditorProject(projectUrl, "tiptap-json@1"), document)) {
        editor.adoptPublishedItem(current.data);
        return { ok: true as const, item: current.data };
      }
    }
    const saved = await (prepared ? prepared() : editor.save());
    if (!saved) {
      return {
        ok: false as const,
        // 读这一次保存自己记下的原因：闭包里的 `editor.error` 是上一次渲染的值。
        error:
          editor.lastSaveError() ||
          editor.error ||
          artifactSaveStepMessage(
            "contract",
            "文档源可能尚未成功载入，没有可提交的内容",
          ),
      };
    }
    const savedMeta = {
      source_format: saved.sourceFormat || RICHDOC_SOURCE_FORMAT,
      source_media_type: saved.sourceMediaType || RICHDOC_SOURCE_MEDIA_TYPE,
      source_url: saved.url,
      delivery_format: saved.sourceFormat || RICHDOC_SOURCE_FORMAT,
      editor_project_url: saved.projectUrl,
      editor_project_schema: saved.projectSchema,
      editor_manifest_url: saved.projectUrl,
      editor_manifest_schema: saved.projectSchema,
      editor_working_head_url: saved.projectUrl,
      editor_working_head_project_url: saved.projectUrl,
      editor_working_head_schema: saved.projectSchema,
    };
    const receipt = advancedSavedItem(item, {
      url: saved.url,
      versionId: saved.versionId,
      title: saved.title,
      meta: savedMeta,
    });
    // The typed revision is published by the editor's own save through the
    // shared contract. A durable item that comes back without a new revision
    // means the commit silently fell through to the legacy creation path.
    if (isDurableLibraryItem(item)) {
      if (
        !saved.item ||
        !isDurableLibraryItem(saved.item) ||
        saved.item.artifactId !== item.artifactId ||
        !saved.revisionId ||
        saved.revisionId === saved.previousRevisionId
      ) {
        return {
          ok: false as const,
          error: artifactSaveStepMessage(
            "revision-verify",
            "这次保存没有在同一份素材上产生新的版本",
          ),
        };
      }
      return {
        ok: true as const,
        item: richDocSavedItemForHandoff(saved.item, saved),
      };
    }
    return {
      ok: true as const,
      item: richDocSavedItemForHandoff(receipt || item, saved),
    };
  }, [editor.collabReadOnly, editor.adoptPublishedItem, editor.captureRecovery, editor.error, editor.lastSaveError, editor.save, item]);
  const restoreWorkingDocument = useCallback(
    (payload: unknown) => editor.restoreRecovery(payload),
    [editor.restoreRecovery],
  );
  const [importError, setImportError] = useState("");
  /**
   * 上传/拖进来的文件先归一化：`.doc`/`.rtf`/`.odt` 这类先转成 DOCX 再进编辑器
   * （转换在后端，合同 §3.3）。转不了的一律报出**一句能看懂的原因**，
   * 不再像过去那样把二进制 `.doc` 当纯文本塞进去、留一个乱码或空白文档。
   */
  const importLocalFiles = useCallback(
    async (files: File[]) => {
      setImportError("");
      for (const file of files) {
        const outcome = await importDocFamilyFile(file, "richdoc");
        if (outcome.image) {
          await editor.uploadImage(outcome.file);
          continue;
        }
        if (!outcome.ok) {
          setImportError(outcome.message);
          continue;
        }
        await editor.importSource(outcome.file);
      }
    },
    [editor.importSource, editor.uploadImage],
  );
  const exportWechat = useCallback(() => {
    setExportError("");
    if (!editor.editor) {
      setExportError("文档尚未载入，不能转公众号排版。");
      return;
    }
    const result = exportWechatFromTiptap(editor.editor.getJSON(), {
      title: item.title,
    });
    if (!result.html) {
      setExportError(result.warnings[0] || "没有可排版的正文。");
      return;
    }
    downloadText(
      `${item.title || "document"}.wechat.html`,
      result.html,
      "text/html;charset=utf-8",
    );
    if (result.warnings.length > 0) setExportError(result.warnings[0]);
  }, [editor.editor, item.title]);
  // 只读（viewer、专业模式锁在别人手里）时，Leo 的帮改入口不能绕过灰掉的按钮：
  // 会改正文的指令在这里直接拒绝，describe / state 照旧让 agent 看得到现状。
  useEditorContext(buildRichDocContext(editor));
  const downloadDisabled =
    !editor.editor || editor.loading || !editor.sourceReady;
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "richdoc",
        label: editorToolLabel({ type: "richdoc" }),
        collab: {
          room: collabRoom,
          artifact: item.artifactId
            ? {
                id: String(item.artifactId),
                title: item.title || "",
                editorKind: RICHDOC_COLLAB_EDITOR_KIND,
              }
            : null,
        },
        // 申报了 `drawers` 之后 `resolveInlineAdvancedDrawers` 就直接返回它，
        // `toolbox` 那条合成回落整段不再执行（`inline-advanced-shell-helpers.ts:22`）。
        // 所以「插入」必须在这里原样重申一遍，漏了它插入面板当场从界面上消失。
        panelHostRef,
        drawers: [
          {
            id: "editor-global",
            label: "插入",
            icon: "add",
            content: <RichDocControls editor={editor} accent={accent} />,
          },
          {
            id: "richdoc-find",
            label: "查找和替换",
            icon: "search",
            content: <RichDocFindReplace editor={editor} onClose={() => panelHostRef.current?.closeDrawer()} />,
          },
          {
            // 工具栏的「插入批注」只负责建，读/回复/解决三件事只有这条侧栏做得到。
            id: "richdoc-review",
            label: "批注",
            icon: "note",
            content: (
              <RichDocReviewReadOnlyContext.Provider
                value={editor.review.readOnly}
              >
                <RichDocCommentRail
                  hasSelection={editor.review.hasSelection}
                  onAddComment={editor.review.addComment}
                  comments={editor.review.comments}
                  changes={editor.review.changes}
                  activeCommentId={editor.review.activeCommentId}
                  trackChangesEnabled={editor.review.trackChangesEnabled}
                  onFocusComment={editor.review.focusComment}
                  onReply={editor.review.replyToComment}
                  onResolve={editor.review.resolveComment}
                  onRemove={editor.review.removeComment}
                  onAcceptChange={editor.review.acceptChange}
                  onRejectChange={editor.review.rejectChange}
                  onAcceptAll={editor.review.acceptAllChanges}
                  onRejectAll={editor.review.rejectAllChanges}
                />
              </RichDocReviewReadOnlyContext.Provider>
            ),
          },
        ],
        selection,
        history: {
          canUndo: editor.editor?.can().undo() ?? false,
          canRedo: editor.editor?.can().redo() ?? false,
          undo: () => {
            editor.editor?.chain().focus().undo().run();
          },
          redo: () => {
            editor.editor?.chain().focus().redo().run();
          },
        },
        directDownload: exportDownloads[0],
        // 第一条格式是主交付物，已经由 directDownload 呈现；其余每个格式一条菜单项。
        actions: [
          ...(officeSource.error && !editor.dirty
            ? [
                {
                  id: "richdoc-refresh-office-source",
                  label: "重新获取文件后重试",
                  onTrigger: officeSource.retry,
                },
              ]
            : []),
          ...exportDownloads.slice(1),
          {
            id: "richdoc-wechat-layout",
            label: "转公众号排版",
            group: "download" as const,
            disabled: downloadDisabled,
            onTrigger: () => afterAdvancedDraftExport(item.key || item.id, exportWechat),
          },
        ],
        upload: {
          accept: docFamilyAcceptAttribute("richdoc"),
          multiple: true,
          onFiles: importLocalFiles,
        },
        stage:
          !editor.loading && !editor.sourceReady ? (
            // 取源失败时这条路由不挂 tiptap，`RichDocStage` 里的失败态就够不着；
            // 重试入口必须由顶掉舞台的这一格自己带上，否则文案里的「重新载入」
            // 又会变成一句用户点不到的空话。
            <EditorSourceFailurePanel
              variant="surface"
              message={editor.error || "文档源未成功载入，编辑器已停止。"}
              onReload={editor.reload}
            />
          ) : (
            <>
              <RichDocStage editor={editor} accent={accent} />
              {cropOpen && <EditBarPanelRequest id="richdoc-image-crop" label={tt("裁剪")} triggerSelector='[data-selection-control-id="crop"]' onClose={() => setCropOpen(false)}>
                <RichDocImageCropControls editor={editor} selection={selection} />
              </EditBarPanelRequest>}
            </>
          ),
        status:
          importError ||
          exportError ||
          (!item.meta.editor_project_url &&
            Boolean(item.url || item.artifactId) &&
            officeSource.error) ||
          editor.error ||
          (editor.collabPhase === "connecting" ||
          editor.collabPhase === "wait-sync" ||
          editor.collabPhase === "load-source"
            ? "正在与协作者同步…"
            : "") ||
          (editor.loading || officeSource.loading ? "正在载入文档" : ""),
        persistence: {
          // 每个可编辑标签页都保存自己的当前合并文档。
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          autoSave: !editor.collabReadOnly,
          flush: saveBeforeNewConversation,
          preparePublish: () => { const document = editor.captureRecovery(); const save = editor.prepareSave(); return () => saveBeforeNewConversation(save, document); },
          recovery: {
            draftSchema: "oceanleo.richdoc.edit.v1",
            key: advancedRecoveryKey("richdoc", item),
            ready: Boolean(editor.editor) && !editor.loading,
            capture: editor.captureRecovery,
            restore: restoreWorkingDocument,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
