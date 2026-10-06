"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { resolveEditorCore } from "../editor-core-flags";
import { usePluginMode } from "../plugin-chrome/plugin-mode";
import { PluginModeSwitchGate, useModeSwitchReady } from "./mode-switch-gate";
import {
  bindNormalFaceHandoff,
  handoffItemKey,
  captureBeforeEnterPro,
  useProSavedRevision,
} from "./editor-handoff";
import { deckDocumentToPptist } from "../doc-editors/deck-pptist-carrier";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { DeckContextToolbar } from "../doc-editors/DeckContextToolbar";
import {
  DeckDrawPanel,
  DeckLinePanel,
  DeckNotesPanel,
  DeckSignaturePanel,
  DeckTablePanel,
} from "../doc-editors/DeckCreationPanels";
import {
  DeckDesignPanel,
  DeckEffectsPanel,
  DeckElementsPanel,
  DeckLayersPanel,
  DeckTextPanel,
  DeckUploadPanel,
} from "../doc-editors/DeckControls";
import { DeckFontPanel } from "../doc-editors/DeckFontPanel";
import {
  DeckPresenterView,
  openDeckPresenterWindow,
} from "../doc-editors/DeckPresenterView";
import {
  deckRehearsalNoteLine,
  type DeckRehearsalRow,
  type PresenterFallbackReason,
} from "../doc-editors/use-deck-presenter";
import { DECK_PREVIEW_FIT_ZOOM_PERCENT } from "../doc-editors/deck-preview-geometry";
import type { DeckCreationTool } from "../doc-editors/deck-quick-tools";
import type { DeckInkStyle } from "../doc-editors/deck-ink";
import { DeckStage } from "../doc-editors/DeckStage";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import {
  buildDeckPptxBlob,
  deckPresentationSource,
  deckSavedItemForHandoff,
  useDeckEditor,
} from "../doc-editors/use-deck-editor";
import { useUI } from "../../i18n/ui/useUI";
import { useOfficeArtifactSource } from "../office-editor";
import {
  DECK_COLLAB_ROOT,
  deckElementKey,
  deckFromEntities,
  deckToEntities,
} from "../collab/adapters/deck";
import { useEntityCollab } from "../collab/adapters/use-entity-collab";
import { useCollabSelections } from "../collab/adapters/visual-selection";
import {
  guardPluginSurface,
  viewOnlyUploadHandler,
} from "../collab/adapters/visual-readonly";
import { VisualViewOnlyPanel } from "../collab/adapters/VisualViewOnlyPanel";
import { editorToolLabel } from "../workbench-routes";
import { buildDeckCommandSurface as buildRawDeckCommandSurface } from "../doc-editors/doc-family-commands";
import { downloadConvertedCopy } from "../doc-editors/doc-family-download";
import {
  DOC_FAMILY_DOWNLOAD_FORMATS,
  docFamilyAcceptAttribute,
} from "../doc-editors/doc-family-formats";
import { importDocFamilyFile } from "../doc-editors/doc-family-import";
import { usePluginCommandSurface } from "../plugin-command";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

/**
 * 双核 flag 的 `next` 分支：PPTist iframe 托管。**单独 lazy**，
 * 这样翻 flag 之前它的模块图不会被拉进本 chunk（`editor-core-flags.ts` 纪律 1）。
 */
const DeckHostedRoute = lazy(() =>
  import("./DeckHostedRoute").then((module) => ({
    default: module.DeckHostedRoute,
  })),
);

/**
 * PPT 的指令面（Leo 的「帮我改」从这里进来）。只能查看时，会改文稿的指令在这一层直接拒绝，
 * 导出等查看类指令照常；指令表本身在 doc-family-commands.ts，不在这里动。
 */
function buildDeckCommandSurface(
  editor: Parameters<typeof buildRawDeckCommandSurface>[0],
  deps: Parameters<typeof buildRawDeckCommandSurface>[1],
  readOnly: boolean,
) {
  return guardPluginSurface(buildRawDeckCommandSurface(editor, deps), readOnly);
}

/**
 * 双核分发口。**flag 只在这里判一次**，判完各走各的组件。
 *
 * 默认 `legacy`（`_COMMON.md` §10 第 3 条：换核期间旧核不删、默认旧核）。
 * 验收绿之后由我翻 flag 并单独提交删除旧目录（message 以 `[core-swap:delete]` 开头）。
 */
export function DeckRoute(props: AdvancedContentWorkbenchProps) {
  if (resolveEditorCore("deck") === "next") {
    return (
      <Suspense fallback={null}>
        <DeckHostedRoute {...props} />
      </Suspense>
    );
  }
  // 「编辑 ⇄ 专业编辑」经过渡门：旧面留到 PPTist 发 ready，中间是舞台内的切换覆盖层。
  return (
    <PluginModeSwitchGate
      pluginId="deck"
      handoffItemKey={handoffItemKey(props.item)}
      captureOnMount
      beforeEnterPro={(signal) => captureBeforeEnterPro(props.item, { waitForReady: true, signal })}
      renderNormal={() => <DeckLegacyRoute {...props} />}
      renderPro={() => (
        <Suspense fallback={null}>
          <DeckHostedRoute {...props} />
        </Suspense>
      )}
    />
  );
}

/** 自研 deck 引擎（旧核）。本波一个字未动，等 V1/V2 验收绿后整体删除。 */
function DeckLegacyRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const proSaved = useProSavedRevision(item.key || item.id);
  const workingItem = proSaved ?? item;
  const officeSource = useOfficeArtifactSource(workingItem);
  // 多人同改：编辑器先于房间创建（房间要读编辑器的文稿），所以「只读」「存成功」两件事走 state / ref 回填。
  const [collabReadOnly, setCollabReadOnly] = useState(false);
  const collabSavedRef = useRef<(revisionId: string) => void>(() => undefined);
  const collabOptions = useMemo(
    () => ({
      readOnly: collabReadOnly,
      onSaved: (revisionId: string) => collabSavedRef.current(revisionId),
    }),
    [collabReadOnly],
  );
  const editor = useDeckEditor(
    officeSource.item,
    siteId,
    previewContent,
    officeSource.resourceFailed,
    collabOptions,
  );
  const adoptingRevisionRef = useRef(false);
  const collab = useEntityCollab({
    item: { artifactId: item.artifactId, title: item.title },
    editorKind: "deck",
    rootName: DECK_COLLAB_ROOT,
    toEntities: deckToEntities,
    fromEntities: deckFromEntities,
    local: editor.loading || editor.sourceFailed || officeSource.loading ? null : editor.deck,
    applyRemote: (state) => {
      editor.applyRemoteDeck(state);
      // 外部新版本已经落库：别再存一份重复的
      if (adoptingRevisionRef.current) {
        adoptingRevisionRef.current = false;
        editor.markCollabSaved();
      }
    },
    loadRevision: async (revisionId) => {
      const deck = await editor.adoptExternalRevision(String(item.artifactId || ""), revisionId);
      adoptingRevisionRef.current = Boolean(deck);
      return deck;
    },
  });
  collabSavedRef.current = collab.markSaved;
  useEffect(() => {
    setCollabReadOnly(collab.readOnly);
  }, [collab.readOnly]);
  // 工具条、面板、指令面、上传入口都按这一个值灰掉（编辑内核另有同一条拒绝，这里让入口自己就不动作）
  const viewOnly = collab.readOnly || editor.readOnly;
  const selectionKeys = useMemo(
    () => [
      editor.activeSlide.id,
      ...(editor.selectedElementId
        ? [deckElementKey(editor.activeSlide.id, editor.selectedElementId)]
        : []),
    ],
    [editor.activeSlide.id, editor.selectedElementId],
  );
  const peerSelections = useCollabSelections(collab.room, selectionKeys);
  const liveDeckRef = useRef(editor.deck);
  liveDeckRef.current = editor.deck;
  const liveRevisionRef = useRef(editor.editRevision);
  liveRevisionRef.current = editor.editRevision;
  useEffect(() => {
    return bindNormalFaceHandoff(item.key || item.id, {
      status: editor.sourceFailed ? "error" : editor.loading || officeSource.loading ? "loading" : "ready",
      getHandoff: () =>
        editor.sourceFailed || editor.loading || officeSource.loading
          ? { kind: "empty" as const }
          : {
              kind: "inline" as const,
              json: deckDocumentToPptist(liveDeckRef.current),
              revision:
                liveRevisionRef.current == null
                  ? null
                  : String(liveRevisionRef.current),
            },
      persistInBackground: () => {
        if (editor.dirty && !editor.sourceFailed && collab.saveGate && !editor.loading && !officeSource.loading) editor.persistInBackground();
      },
    });
  }, [editor.dirty, collab.saveGate, editor.loading, editor.persistInBackground, editor.sourceFailed, officeSource.loading, item.id, item.key]);
  const [zoom, setZoom] = useState(DECK_PREVIEW_FIT_ZOOM_PERCENT);
  const [activeTool, setActiveTool] =
    useState<DeckCreationTool>("select");
  const [inkStyle, setInkStyle] = useState<DeckInkStyle>({
    color: "#111827",
    width: 2.5,
    opacity: 1,
  });
  const tt = useUI();
  const [presentation, setPresentation] = useState<{
    surface: "stage-only" | "split-fallback";
    reason: PresenterFallbackReason;
  } | null>(null);
  // 子窗的 dispose（先卸 root 再关窗）。退出放映时必须调，否则窗留在屏幕上。
  const presenterDisposeRef = useRef<(() => void) | null>(null);
  // 两个窗口必须同名才通道得上（W16-request §2）。
  const presenterChannelName = `deck-${item.id}`;
  // 本组件只画「编辑」页。切「专业编辑」时 store 变 pro，过渡门在旧面之下挂托管件。
  const { setMode: setEditorMode } = usePluginMode("deck");
  // 切回「编辑」时的 ready 信号：演示文稿载入完就算首帧可见。
  useModeSwitchReady(!editor.loading && !officeSource.loading);

  const exitPresentation = useCallback(() => {
    presenterDisposeRef.current?.();
    presenterDisposeRef.current = null;
    setPresentation(null);
  }, []);

  /**
   * 排练读数写回备注。放映视图拿不到写操作（刻意的），所以这一寸只能由集成方接。
   *
   * **追加，绝不覆盖。** `notes` 是用户手写的讲稿备注（`deck-schema.ts:123`），
   * 换成 `notes: line` 就等于把人家写的东西删了——这是这条链上唯一能造成真实
   * 损失的地方，`tests/deck-rehearsal-notes-append.test.mjs` 钉的就是它。
   *
   * 那行字用 `deckRehearsalNoteLine(row)` 的原件，不在这里重拼：措辞（讲多久算久
   * 由讲者判断，报表不替他下结论）是 `use-deck-presenter` 的产品决定。
   *
   * 没讲到的页（一次都没停留过）不写：给它记一行「用时 00:00」不是读数，是噪音。
   *
   * 引擎的公开面只有「打当前页」的 `patchSlide`，所以逐页写要先 `selectSlide`
   * （`use-deck-editor.ts:2621` 同步改 `activeRef`，紧接着的 `patchSlide` 就落在这一页）。
   * 写完把选中页还回用户原来那一页——排练报表不该顺手把他的光标拖走。
   */
  const applyRehearsalNotes = useCallback(
    (rows: DeckRehearsalRow[]) => {
      const slideNotes = new Map(
        editor.deck.slides.map((slide) => [slide.id, slide.notes]),
      );
      const restoreSlideId = editor.activeSlide.id;
      let wrote = false;
      for (const row of rows) {
        if (row.visits <= 0 && row.totalMs <= 0) continue;
        const existing = slideNotes.get(row.id);
        if (existing === undefined) continue;
        const line = deckRehearsalNoteLine(row);
        editor.selectSlide(row.id);
        editor.patchSlide({
          notes: existing ? `${existing}\n${line}` : line,
        });
        wrote = true;
      }
      if (wrote) editor.selectSlide(restoreSlideId);
    },
    [
      editor.activeSlide.id,
      editor.deck.slides,
      editor.patchSlide,
      editor.selectSlide,
    ],
  );

  const startPresentation = useCallback(async () => {
    // 🛑 这一句必须是本函数的第一个 await，前面不许再 await 别的（存盘、取数都不行）。
    // openDeckPresenterWindow 在它自己的第一个 await 之前同步 window.open，
    // 靠的就是还留在用户手势的调用栈里；一旦出栈，浏览器一律按程序自发弹窗拦掉——
    // 不抛错、不提示，用户看到的就是点了没反应。
    const outcome = await openDeckPresenterWindow({
      source: deckPresentationSource(editor),
      channelName: presenterChannelName,
      translate: tt,
    });
    if (!outcome.ok) {
      // 降级也要说清为什么，reason 不透进去界面只有一句通用话。
      setPresentation({ surface: "split-fallback", reason: outcome.reason });
      return;
    }
    presenterDisposeRef.current = outcome.dispose;
    setPresentation({ surface: "stage-only", reason: "none" });
  }, [editor, presenterChannelName, tt]);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "deck-elements@2",
      actions: ["insert", "replace"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        const mime = String(material.meta.mime || "").toLowerCase();
        return (
          Boolean(material.previewUrl || material.thumbUrl) ||
          material.kind === "image" ||
          mime.startsWith("image/") ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
          )
        );
      },
      mutate: (action, material, placement) => {
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
        editor.insertImageElement(
          url,
          material.title,
          action === "replace",
          placement,
        );
      },
    }),
    [editor.insertImageElement],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    if (!saved) return { ok: false as const };
    const receipt = advancedSavedItem(item, {
      url: saved.url,
      versionId: saved.versionId,
      title: saved.title,
      meta: {
        source_format: saved.sourceFormat || "pptx",
        source_media_type: saved.sourceMediaType,
        source_url: saved.url,
        delivery_format: "pptx",
        editor_project_url: saved.projectUrl,
        editor_project_schema: saved.projectSchema || "oceanleo.deck.v1",
        editor_manifest_url: saved.projectUrl,
        editor_manifest_schema: saved.projectSchema || "oceanleo.deck.v1",
        editor_working_head_url: saved.projectUrl,
        editor_working_head_project_url: saved.projectUrl,
        editor_working_head_schema: saved.projectSchema || "oceanleo.deck.v1",
      },
    });
    return {
      ok: true as const,
      item: deckSavedItemForHandoff(receipt || item, saved),
    };
  }, [editor.save, item]);
  const [importError, setImportError] = useState("");
  /**
   * 图片当插图插进当前页；演示文稿（pptx，以及先转成 pptx 的 ppt/odp/pot…）顶掉
   * 整份内容。过去非图片一律 `continue`，把 pptx 拖进来什么也不发生也不说一句话。
   */
  const addLocalFiles = useCallback(
    async (files: File[]) => {
      const read = (file: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("图片读取失败"));
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("图片读取失败"));
          reader.readAsDataURL(file);
        });
      setImportError("");
      for (const file of files) {
        const outcome = await importDocFamilyFile(file, "deck");
        if (outcome.image) {
          editor.insertImageElement(await read(outcome.file), outcome.file.name);
          continue;
        }
        if (!outcome.ok) {
          setImportError(outcome.message);
          continue;
        }
        await editor.importSource(outcome.file);
      }
    },
    [editor.importSource, editor.insertImageElement],
  );
  /** PPTX 本地出；PDF 交给后端转一次，内容与下载的 PPTX 同源。 */
  const downloadAs = useCallback(
    async (extension: string): Promise<string> => {
      setImportError("");
      try {
        if (extension === "pptx") {
          await editor.exportPptx();
          return editor.error || "";
        }
        if (extension === "json") {
          await editor.downloadJson();
          return "";
        }
        if (extension === "pdf") {
          await editor.flushBeforeExport();
          const title = editor.deck.title || item.title || "presentation";
          return await downloadConvertedCopy({
            source: await buildDeckPptxBlob(editor.deck),
            sourceName: `${title}.pptx`,
            target: "pdf",
            baseName: title,
          });
        }
        return `这里没有 ${extension.toUpperCase()} 这个下载格式。`;
      } catch (caught) {
        return caught instanceof Error && caught.message
          ? caught.message
          : `导出 ${extension.toUpperCase()} 失败。`;
      }
    },
    [
      editor.deck,
      editor.downloadJson,
      editor.error,
      editor.exportPptx,
      editor.flushBeforeExport,
      item.title,
    ],
  );
  // 只能查看：Leo 的「帮我改」从指令面进来，会改作品的指令在这一层直接拒绝
  usePluginCommandSurface(
    buildDeckCommandSurface(editor, { download: downloadAs }, viewOnly),
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "deck",
        label: editorToolLabel({ type: "deck" }),
        drawers: [
          {
            id: "deck-design",
            label: "模板",
            icon: "templates",
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckDesignPanel editor={editor} accent={accent} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-elements",
            label: "元素",
            icon: "elements",
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckElementsPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-draw",
            label: "画笔",
            icon: "draw",
            hiddenFromRail: true,
            content: (
              <VisualViewOnlyPanel readOnly={viewOnly}>
                <DeckDrawPanel
                  style={inkStyle}
                  onStyleChange={setInkStyle}
                  onToolChange={setActiveTool}
                />
              </VisualViewOnlyPanel>
            ),
          },
          {
            id: "deck-lines",
            label: "线条",
            icon: "line",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckLinePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-notes",
            label: "便签",
            icon: "note",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckNotesPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-text",
            label: "文字",
            icon: "text",
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckTextPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-signature",
            label: "签名",
            icon: "signature",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckSignaturePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-tables",
            label: "表格",
            icon: "table",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckTablePanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-uploads",
            label: "上传",
            icon: "uploads",
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckUploadPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-layers",
            label: "图层",
            icon: "layers",
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckLayersPanel editor={editor} accent={accent} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-effects",
            label: "效果",
            icon: "effects",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckEffectsPanel editor={editor} /></VisualViewOnlyPanel>,
          },
          {
            id: "deck-fonts",
            label: "字体",
            icon: "font",
            hiddenFromRail: true,
            content: <VisualViewOnlyPanel readOnly={viewOnly}><DeckFontPanel editor={editor} /></VisualViewOnlyPanel>,
          },
        ],
        contextToolbar: (
          <DeckContextToolbar
            editor={editor}
            accent={accent}
            readOnly={viewOnly}
          />
        ),
        history: {
          canUndo: editor.canUndo && !viewOnly,
          canRedo: editor.canRedo && !viewOnly,
          undo: editor.undo,
          redo: editor.redo,
        },
        viewport: {
          value: zoom,
          min: 10,
          max: 300,
          step: 1,
          setValue: setZoom,
          fit: () => setZoom(DECK_PREVIEW_FIT_ZOOM_PERCENT),
        },
        mode: {
          current: "normal",
          setMode: (next) => {
            setEditorMode(next);
          },
        },
        pages: { proLabel: "PPTist" },
        directDownload: {
          id: "deck-export-pptx",
          label: `直接下载 ${DOC_FAMILY_DOWNLOAD_FORMATS.deck[0].label}`,
          icon: "download",
          busyLabel: "导出 PPTX…",
          busy: editor.exporting,
          onTrigger: editor.exportPptx,
        },
        actions: [
          {
            id: "deck-present",
            // 两个字面量都挑成 DeckPresenterView 里已经在用的 tt key
            // （`:933` 的「放映」、`:771` 的「结束放映」），不新造待翻译串。
            label: presentation ? "结束放映" : "放映",
            // `pages`（一摞纸）是 W29 当时的将就：`fullscreen` 这批名字那会儿只在
            // 未提交的工作树里，用它会让 main 上指向一个还不存在的图标名。
            // 那批图标已由 `acd8192` 入库（`AdvancedEditorIcon.tsx:27`），
            // 换成真正对得上这个动作的那个：这个键是「把幻灯片铺满整块屏幕」，
            // 放映中则是「收回来」——label 已经在这么换了，图标不跟着换就对不上。
            icon: presentation
              ? ("fullscreen-exit" as const)
              : ("fullscreen" as const),
            variant: presentation ? ("primary" as const) : undefined,
            disabled: editor.loading || !editor.deck.slides.length,
            // 直接把 async 函数交给 onTrigger：从 onClick 到这里全程同步
            // （ActionBar:132 `void triggerAction(action)` → :67 `await onTriggerAction(...)`
            // 的实参在挂起前同步求值 → InlineHeader:139 同步 `action.onTrigger?.()`），
            // 手势栈没断，开窗才不会被拦。别在这里包一层先 await 的壳。
            onTrigger: presentation ? exitPresentation : startPresentation,
          },
          ...(editor.error || officeSource.error
            ? [
                {
                  id: "deck-refresh-office-source",
                  label: "重新获取文件后重试",
                  onTrigger: officeSource.retry,
                },
              ]
            : []),
          ...DOC_FAMILY_DOWNLOAD_FORMATS.deck.slice(1).map((format) => ({
            id: `deck-export-${format.extension}`,
            label: `下载 ${format.label}`,
            group: "download" as const,
            disabled: editor.loading || editor.exporting,
            onTrigger: () => {
              void downloadAs(format.extension);
            },
          })),
        ],
        upload: {
          accept: docFamilyAcceptAttribute("deck"),
          multiple: true,
          onFiles: viewOnlyUploadHandler(viewOnly, addLocalFiles),
        },
        stage: editor.sourceFailed ? (
          <EditorSourceFailurePanel
            message={`${item.title || "演示文稿"}：${editor.error}`}
            onReload={editor.reload}
            variant="surface"
          />
        ) : presentation ? (
          <DeckPresenterView
            source={deckPresentationSource(editor)}
            surface={presentation.surface}
            fallbackReason={presentation.reason}
            channelName={presenterChannelName}
            translate={tt}
            onExit={exitPresentation}
            onApplyRehearsalNotes={applyRehearsalNotes}
          />
        ) : (
          <DeckStage
            editor={editor}
            accent={accent}
            zoom={zoom}
            onZoomChange={setZoom}
            activeTool={activeTool}
            inkStyle={inkStyle}
            peers={peerSelections}
          />
        ),
        status:
          importError ||
          (!item.meta.editor_project_url &&
            Boolean(item.url || item.artifactId) &&
            officeSource.error) ||
          editor.error ||
          editor.notice ||
          (editor.loading || officeSource.loading ? "正在载入演示文稿" : ""),
        collab: collab.collab,
        persistence: {
          // 房间里只有存档人自动保存；别的人改了也由存档人那边存
          dirty: editor.dirty && collab.saveGate,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          draft: editor.draft,
          recovery: {
            key: advancedRecoveryKey("deck", item),
            ready: !editor.loading,
            capture: () => structuredClone(editor.deck),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
