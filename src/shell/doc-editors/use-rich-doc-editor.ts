"use client";

// ============================================================================
// @oceanleo/ui — useRichDocEditor：tiptap v3 富文本编辑器状态 hook
// ----------------------------------------------------------------------------
// 三件套之一（hook / Controls / Stage，同 AdvancedImageEditor 拆法）。
// StarterKit v3 已内置 link + underline + undoRedo（侦查自
// node_modules/@tiptap/starter-kit/dist/index.d.ts），这里只补注册
// TableKit / Image / TextAlign / TextStyle+Color / Highlight，避免重复注册 throw。
// marked / turndown / mammoth / dompurify 都在 rich-doc-model.ts 内动态 import。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import type { LibraryItem } from "../library-data";
import { uploadFile } from "../../lib/database";
import { useUI } from "../../i18n/ui/useUI";
import {
  downloadBlob,
  downloadText,
  loadEditorProject,
  saveFileToLibrary,
  type PersistedEditorVersion,
  type PreparedDeliveryUpload,
  type PreparedPreviewUpload,
  type PreparedProjectUpload,
} from "./doc-io";
import { artifactSaveStepMessage } from "./artifact-save-contract";
import { renderRichDocPreviewPng } from "./editor-preview-raster";
import { tiptapJsonToDocxBlob } from "./docx-export";
import {
  notifyOfficeAccessDenied,
  officePackageKindForItem,
} from "./office-file";
import { officeExtensionForItem } from "../workbench-routes";
import {
  countText,
  fullHtmlDocument,
  htmlToMarkdown,
  loadRichDocFile,
  loadRichDocHtml,
  type RichDocLoadResult,
  type RichDocSource,
} from "./rich-doc-model";

export interface RichDocEditorState {
  /** tiptap Editor 实例；immediatelyRender:false 下 SSR/首帧为 null。 */
  editor: Editor | null;
  item: LibraryItem;
  siteId: string;
  loading: boolean;
  importing: boolean;
  saving: boolean;
  dirty: boolean;
  sourceReady: boolean;
  editRevision: number;
  error: string;
  /** The source could not be read; the stage owes the user a retry, not a mask. */
  sourceFailed: boolean;
  savedUrl: string;
  /** 内容来自哪条加载链路（inline / url-markdown / url-docx / …）。 */
  source: RichDocSource;
  words: number;
  chars: number;
  /** Re-run the source load for the same item after a failure. */
  reload: () => void;
  save: () => Promise<PersistedEditorVersion | null>;
  exportMarkdown: () => Promise<void>;
  exportHtml: () => Promise<void>;
  exportDoc: () => Promise<void>;
  exportText: () => void;
  /** Replace the active document with a local DOC/DOCX/HTML/Markdown/text file. */
  importSource: (file: File) => Promise<void>;
  /** 本地图片 → uploadFile → 光标处插入 img。 */
  uploadImage: (file: File) => Promise<void>;
  insertImageUrl: (
    url: string,
    point?: { clientX: number; clientY: number },
  ) => void;
  setLinkHref: (href: string) => void;
  unsetLink: () => void;
  clearFormat: () => void;
  restoreRecovery: (payload: unknown) => boolean;
}

const RICHDOC_PROJECT_SCHEMA = "tiptap-json@1";
export const RICHDOC_SOURCE_FORMAT = "docx";
export const RICHDOC_SOURCE_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const RICHDOC_EDITOR_CAPABILITY = "richdoc";

/** Carry the published revision forward so a second save pins the new head. */
export function richDocSavedItemForHandoff(
  original: LibraryItem,
  saved: PersistedEditorVersion,
): LibraryItem {
  const projectUrl = saved.projectUrl || "";
  const projectSchema = saved.projectSchema || RICHDOC_PROJECT_SCHEMA;
  const base = saved.item || original;
  return {
    ...base,
    title: saved.title || base.title,
    url: saved.url || base.url,
    artifactId: saved.artifactId || base.artifactId,
    revisionId: saved.revisionId || base.revisionId,
    meta: {
      ...base.meta,
      source_format: saved.sourceFormat || RICHDOC_SOURCE_FORMAT,
      source_media_type: saved.sourceMediaType || RICHDOC_SOURCE_MEDIA_TYPE,
      delivery_format: RICHDOC_SOURCE_FORMAT,
      ...(projectUrl
        ? {
            editor_project_url: projectUrl,
            editor_project_schema: projectSchema,
            editor_manifest_url: projectUrl,
            editor_manifest_schema: projectSchema,
            editor_working_head_url: projectUrl,
            editor_working_head_project_url: projectUrl,
            editor_working_head_schema: projectSchema,
          }
        : {}),
      ...(saved.savedAt ? { editor_saved_at: saved.savedAt } : {}),
      ...(saved.previousRevisionId
        ? { previous_revision_id: saved.previousRevisionId }
        : {}),
    },
  };
}

function boundedLoadKey(parts: readonly unknown[]): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(parts) || "";
  } catch {
    return "unserializable";
  }
  return serialized.length <= 8192
    ? serialized
    : `${serialized.length}:${serialized.slice(0, 8192)}`;
}

/**
 * Everything the load effect reads out of `item`, flattened into one string.
 * Keying the effect on the value rather than on the object identity is what
 * makes a caller that rebuilds `item` or the callbacks every render harmless.
 */
export function richDocSourceLoadKey(item: LibraryItem): string {
  const meta = item.meta || {};
  return boundedLoadKey([
    item.id,
    item.key,
    item.source,
    item.url || "",
    item.previewUrl || "",
    item.content || "",
    meta.editor_project_url ?? "",
    meta.editor_source_url ?? "",
    meta.editor_working_head_url ?? "",
    meta.markdown ?? "",
    meta.content ?? "",
    meta.text ?? "",
    // `loadRichDocHtml` decides docx-vs-text by these, so they are load inputs
    // too: leaving them out turns "reloads too often" into "never reloads when
    // the same address is re-typed as another format".
    officeExtensionForItem(item),
    officePackageKindForItem(item) ?? "",
  ]);
}

/**
 * Name the step that failed and the way out. A bare「可编辑工程读取失败」tells the
 * user nothing they can act on, and an endless mask tells them even less.
 *
 * Every way out named here has to be one the rich-doc surface really offers.
 * `reload()` now has a button on both surfaces the user can end up on:
 * `RichDocStage` renders `EditorSourceFailurePanel` on `sourceFailed`, and
 * `RichDocRoute` — which swaps the stage out entirely while the source is not
 * ready — renders the same panel in its place. Local upload is backed by that
 * route's upload slot, which accepts document formats rather than `image/*`.
 */
export function richDocSourceFailureMessage(
  caught: unknown,
  translate: (value: string) => string,
): string {
  const detail =
    caught instanceof Error ? translate(caught.message).trim() : "";
  const head = translate("没能读到这份文档的源文件，编辑器已停下，没有改动被丢失。");
  const tail = translate(
    "点「重新载入」再试一次，或直接上传本地文档接着做。",
  );
  return detail ? `${head}原因：${detail}。${tail}` : `${head}${tail}`;
}

export function useRichDocEditor(
  item: LibraryItem,
  siteId = "",
  onSourceAccessError?: () => void,
): RichDocEditorState {
  const tt = useUI();
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sourceFailed, setSourceFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const [loaded, setLoaded] = useState<RichDocLoadResult | null>(null);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const sourceReadyRef = useRef(false);
  const workingHeadUrlRef = useRef(item.url || item.previewUrl || "");
  /** The pin a save publishes against; advances with every committed revision. */
  const persistedItemRef = useRef(item);
  const preparedSaveRef = useRef<{
    key: string;
    project?: PreparedProjectUpload;
    delivery?: PreparedDeliveryUpload;
    preview?: PreparedPreviewUpload;
  } | null>(null);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: "<p></p>",
    editorProps: {
      attributes: {
        class: "oleo-richdoc",
        spellcheck: "true",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": tt("文档编辑区"),
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (!sourceReadyRef.current) {
        instance.commands.setContent("<p></p>", { emitUpdate: false });
        setError(tt("文档源尚未成功载入；已阻止修改空白回退内容"));
        return;
      }
      setCounts(countText(instance.getText()));
      revisionRef.current += 1;
      setDirty(true);
      setSavedUrl("");
    },
  });
  const requireSourceReady = useCallback(() => {
    if (sourceReadyRef.current) return true;
    setError(tt("文档源尚未成功载入；请刷新源或导入文件后再操作"));
    return false;
  }, [tt]);

  /**
   * The caller hands these in fresh on every render. Reading them through refs
   * is what keeps them out of the load effect's dependency array — with them in
   * it, every render restarted the load and the mask never came down.
   */
  const sourceAccessErrorRef = useRef(onSourceAccessError);
  useEffect(() => {
    sourceAccessErrorRef.current = onSourceAccessError;
  }, [onSourceAccessError]);
  const notifySourceAccessError = useCallback(() => {
    sourceAccessErrorRef.current?.();
  }, []);
  const itemRef = useRef(item);
  useEffect(() => {
    itemRef.current = item;
  }, [item]);
  // `tt` is memoized today, but it is a provider-owned function: one unmemoized
  // locale provider would re-arm the very loop this file exists to kill.
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const translate = useCallback(
    (value: string) => translateRef.current(value),
    [],
  );
  const loadKey = useMemo(() => richDocSourceLoadKey(item), [item]);

  useEffect(() => {
    const source = itemRef.current;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSourceFailed(false);
    setSavedUrl("");
    setDirty(false);
    sourceReadyRef.current = false;
    setSourceReady(false);
    revisionRef.current = 0;
    persistedItemRef.current = source;
    preparedSaveRef.current = null;
    workingHeadUrlRef.current = String(
      source.meta.editor_working_head_url ||
        source.url ||
        source.previewUrl ||
        "",
    );
    setLoaded(null);
    const projectUrl = String(source.meta.editor_project_url || "").trim();
    void (projectUrl
      ? loadEditorProject<JSONContent>(projectUrl, RICHDOC_PROJECT_SCHEMA).then(
          (json) => ({
            html: "",
            json,
            source: "project" as const,
            error: "",
          }),
        )
      : loadRichDocHtml(source, notifySourceAccessError)
    )
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setSourceFailed(true);
          setError(
            richDocSourceFailureMessage(new Error(result.error), translate),
          );
          setLoading(false);
          return;
        }
        sourceReadyRef.current = true;
        setSourceReady(true);
        setLoaded(result);
      })
      .catch((caught) => {
        if (cancelled) return;
        notifyOfficeAccessDenied(caught, notifySourceAccessError);
        setSourceFailed(true);
        setError(richDocSourceFailureMessage(caught, translate));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey, notifySourceAccessError, reloadNonce, translate]);

  const reload = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!editor || !loaded) return;
    editor.commands.setContent(loaded.json || loaded.html, {
      emitUpdate: false,
    });
    setCounts(countText(editor.getText()));
    setLoading(false);
  }, [editor, loaded]);

  const baseTitle = item.title || tt("文档");

  const exportMarkdown = useCallback(async () => {
    if (!editor || !requireSourceReady()) return;
    try {
      const markdown = await htmlToMarkdown(editor.getHTML());
      downloadText(`${baseTitle}.md`, markdown, "text/markdown;charset=utf-8");
    } catch (caught) {
      setError(
        caught instanceof Error ? tt(caught.message) : tt("导出 Markdown 失败"),
      );
    }
  }, [editor, baseTitle, requireSourceReady, tt]);

  const exportHtml = useCallback(async () => {
    if (!editor || !requireSourceReady()) return;
    downloadText(
      `${baseTitle}.html`,
      fullHtmlDocument(baseTitle, editor.getHTML()),
      "text/html;charset=utf-8",
    );
  }, [editor, baseTitle, requireSourceReady]);

  const exportDoc = useCallback(async () => {
    if (!editor || !requireSourceReady()) return;
    try {
      const blob = await tiptapJsonToDocxBlob(baseTitle, editor.getJSON());
      downloadBlob(`${baseTitle}.docx`, blob);
    } catch (caught) {
      setError(
        caught instanceof Error ? tt(caught.message) : tt("导出 DOCX 失败"),
      );
    }
  }, [editor, baseTitle, requireSourceReady, tt]);

  const exportText = useCallback(() => {
    if (!editor || !requireSourceReady()) return;
    downloadText(`${baseTitle}.txt`, editor.getText(), "text/plain;charset=utf-8");
  }, [editor, baseTitle, requireSourceReady]);

  const importSource = useCallback(
    async (file: File) => {
      setImporting(true);
      setLoading(true);
      setError("");
      try {
        const result = await loadRichDocFile(file);
        if (result.error) {
          setError(tt(result.error));
          setLoading(false);
          return;
        }
        setSavedUrl("");
        revisionRef.current += 1;
        setDirty(true);
        // An imported document replaces the source we could not read.
        setSourceFailed(false);
        sourceReadyRef.current = true;
        setSourceReady(true);
        setLoaded(result);
      } catch (caught) {
        setError(
          caught instanceof Error ? tt(caught.message) : tt("文档导入失败"),
        );
        setLoading(false);
      } finally {
        setImporting(false);
      }
    },
    [tt],
  );

  const save = useCallback(async (): Promise<PersistedEditorVersion | null> => {
    if (!editor || savingRef.current) return null;
    if (!sourceReadyRef.current) {
      setError(tt("文档源尚未成功载入；请刷新源或导入文件后再保存"));
      return null;
    }
    const savingRevision = revisionRef.current;
    const json = editor.getJSON();
    const html = editor.getHTML();
    const baseItem = persistedItemRef.current;
    const baseRevision = String(
      baseItem.revisionId || baseItem.meta.revision_id || baseItem.id,
    );
    const rootId = String(
      baseItem.artifactId || baseItem.meta.artifact_id || baseItem.id,
    );
    const saveKey = `richdoc:${savingRevision}:${baseRevision.slice(
      -80,
    )}:${rootId.slice(-80)}`;
    const prepared =
      preparedSaveRef.current?.key === saveKey
        ? preparedSaveRef.current
        : null;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${baseTitle}-${tt("编辑版")}`;
      const fileStem =
        title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 180) || "document";
      const result = await saveFileToLibrary({
        item: baseItem,
        siteId,
        fallbackSite: "word",
        createFile: async () => {
          const delivery = await tiptapJsonToDocxBlob(baseTitle, json);
          return new File([delivery], `${fileStem}.docx`, {
            type: RICHDOC_SOURCE_MEDIA_TYPE,
          });
        },
        // docx is never a displayable primary; ship a rendered cover with it.
        createPreview: () => renderRichDocPreviewPng(json, baseTitle),
        sourceFormat: RICHDOC_SOURCE_FORMAT,
        sourceMediaType: RICHDOC_SOURCE_MEDIA_TYPE,
        title,
        mediaType: "doc",
        kind: "document",
        idempotencyKey: saveKey,
        workingHeadUrl: workingHeadUrlRef.current,
        preparedProject: prepared?.project,
        preparedDelivery: prepared?.delivery,
        preparedPreview: prepared?.preview,
        meta: {
          editor: "richdoc-v2",
          editor_capability: RICHDOC_EDITOR_CAPABILITY,
          content_type: "document",
          html: html.slice(0, 10_000),
          delivery_format: RICHDOC_SOURCE_FORMAT,
        },
        project: {
          schema: RICHDOC_PROJECT_SCHEMA,
          data: json,
        },
        editorManifest: {
          id: RICHDOC_EDITOR_CAPABILITY,
          format: RICHDOC_PROJECT_SCHEMA,
        },
        artifactRevision: {
          artifactType: "document",
          provenance: { editorRevision: savingRevision },
        },
      });
      if (!result.ok) {
        preparedSaveRef.current =
          result.preparedProject ||
          result.preparedDelivery ||
          result.preparedPreview
            ? {
                key: saveKey,
                project: result.preparedProject,
                delivery: result.preparedDelivery,
                preview: result.preparedPreview,
              }
            : preparedSaveRef.current;
        setError(
          tt(result.error) ||
            artifactSaveStepMessage("revision-publish", ""),
        );
        return null;
      }
      preparedSaveRef.current = null;
      const version: PersistedEditorVersion = {
        url: result.url,
        versionId: result.versionId,
        projectUrl: result.projectUrl,
        projectSchema: result.projectSchema,
        sourceFormat: result.sourceFormat || RICHDOC_SOURCE_FORMAT,
        sourceMediaType: result.sourceMediaType || RICHDOC_SOURCE_MEDIA_TYPE,
        title: result.title,
        fileName: result.fileName,
        savedAt: result.savedAt,
        artifactId: result.artifactId,
        revisionId: result.revisionId,
        previousRevisionId: result.previousRevisionId,
        preparedProject: result.preparedProject,
        preparedDelivery: result.preparedDelivery,
      };
      const handoff = richDocSavedItemForHandoff(baseItem, version);
      persistedItemRef.current = handoff;
      workingHeadUrlRef.current = result.projectUrl || result.url;
      setSavedUrl(result.url);
      if (revisionRef.current === savingRevision) setDirty(false);
      return { ...version, item: handoff };
    } catch (caught) {
      setError(
        artifactSaveStepMessage(
          "revision-publish",
          caught instanceof Error ? tt(caught.message) : caught,
        ),
      );
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [editor, siteId, baseTitle, tt]);

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor || !requireSourceReady()) return;
      setError("");
      try {
        const uploaded = await uploadFile(file, {
          siteId: siteId || "word",
          title: file.name,
        });
        const url = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !url) {
          setError(uploaded.error ? tt(uploaded.error) : tt("图片上传失败"));
          return;
        }
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      } catch (caught) {
        setError(
          caught instanceof Error ? tt(caught.message) : tt("图片上传失败"),
        );
      }
    },
    [editor, requireSourceReady, siteId, tt],
  );

  const insertImageUrl = useCallback(
    (url: string, point?: { clientX: number; clientY: number }) => {
      const trimmed = url.trim();
      if (!editor || !trimmed || !requireSourceReady()) return;
      const position = point
        ? editor.view.posAtCoords({
            left: point.clientX,
            top: point.clientY,
          })?.pos
        : undefined;
      const chain = editor.chain().focus();
      if (typeof position === "number") chain.setTextSelection(position);
      chain.setImage({ src: trimmed }).run();
    },
    [editor, requireSourceReady],
  );

  const setLinkHref = useCallback(
    (href: string) => {
      const trimmed = href.trim();
      if (!editor || !trimmed || !requireSourceReady()) return;
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: trimmed })
        .run();
    },
    [editor, requireSourceReady],
  );

  const unsetLink = useCallback(() => {
    if (!editor || !requireSourceReady()) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }, [editor, requireSourceReady]);

  const clearFormat = useCallback(() => {
    if (!editor || !requireSourceReady()) return;
    editor.chain().focus().clearNodes().unsetAllMarks().run();
  }, [editor, requireSourceReady]);

  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      if (!editor || !payload || typeof payload !== "object") return false;
      const json = payload as JSONContent;
      if (json.type !== "doc" || !Array.isArray(json.content)) return false;
      editor.commands.setContent(json, { emitUpdate: false });
      setCounts(countText(editor.getText()));
      revisionRef.current += 1;
      setDirty(true);
      sourceReadyRef.current = true;
      setSourceReady(true);
      setSourceFailed(false);
      setSavedUrl("");
      setError("");
      return true;
    },
    [editor],
  );

  return {
    editor,
    item,
    siteId,
    loading,
    importing,
    saving,
    dirty,
    sourceReady,
    editRevision: revisionRef.current,
    error,
    sourceFailed,
    savedUrl,
    source: loaded?.source ?? "empty",
    words: counts.words,
    chars: counts.chars,
    reload,
    save,
    exportMarkdown,
    exportHtml,
    exportDoc,
    exportText,
    importSource,
    uploadImage,
    insertImageUrl,
    setLinkHref,
    unsetLink,
    clearFormat,
    restoreRecovery,
  };
}
