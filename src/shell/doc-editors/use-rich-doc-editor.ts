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
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import type { LibraryItem } from "../library-data";
import { uploadFile } from "../../lib/database";
import { useUI } from "../../i18n/ui/useUI";
import { downloadBlob, downloadText, saveFileToLibrary } from "./doc-io";
import { tiptapJsonToDocxBlob } from "./docx-export";
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
  error: string;
  savedUrl: string;
  /** 内容来自哪条加载链路（inline / url-markdown / url-docx / …）。 */
  source: RichDocSource;
  words: number;
  chars: number;
  save: () => Promise<string | null>;
  exportMarkdown: () => Promise<void>;
  exportHtml: () => Promise<void>;
  exportDoc: () => Promise<void>;
  exportText: () => void;
  /** Replace the active document with a local DOC/DOCX/HTML/Markdown/text file. */
  importSource: (file: File) => Promise<void>;
  /** 本地图片 → uploadFile → 光标处插入 img。 */
  uploadImage: (file: File) => Promise<void>;
  insertImageUrl: (url: string) => void;
  setLinkHref: (href: string) => void;
  unsetLink: () => void;
  clearFormat: () => void;
}

export function useRichDocEditor(
  item: LibraryItem,
  siteId = "",
): RichDocEditorState {
  const tt = useUI();
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState<RichDocLoadResult | null>(null);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const revisionRef = useRef(0);
  const savingRef = useRef(false);

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
      attributes: { class: "oleo-richdoc", spellcheck: "false" },
    },
    onUpdate: ({ editor: instance }) => {
      setCounts(countText(instance.getText()));
      revisionRef.current += 1;
      setDirty(true);
      setSavedUrl("");
    },
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSavedUrl("");
    setDirty(false);
    revisionRef.current = 0;
    setLoaded(null);
    void loadRichDocHtml(item).then((result) => {
      if (cancelled) return;
      setLoaded(result);
      if (result.error) setError(tt(result.error));
    });
    return () => {
      cancelled = true;
    };
  }, [item, tt]);

  useEffect(() => {
    if (!editor || !loaded) return;
    editor.commands.setContent(loaded.html, { emitUpdate: false });
    setCounts(countText(editor.getText()));
    setLoading(false);
  }, [editor, loaded]);

  const baseTitle = item.title || tt("文档");

  const exportMarkdown = useCallback(async () => {
    if (!editor) return;
    try {
      const markdown = await htmlToMarkdown(editor.getHTML());
      downloadText(`${baseTitle}.md`, markdown, "text/markdown;charset=utf-8");
    } catch (caught) {
      setError(
        caught instanceof Error ? tt(caught.message) : tt("导出 Markdown 失败"),
      );
    }
  }, [editor, baseTitle, tt]);

  const exportHtml = useCallback(async () => {
    if (!editor) return;
    downloadText(
      `${baseTitle}.html`,
      fullHtmlDocument(baseTitle, editor.getHTML()),
      "text/html;charset=utf-8",
    );
  }, [editor, baseTitle]);

  const exportDoc = useCallback(async () => {
    if (!editor) return;
    try {
      const blob = await tiptapJsonToDocxBlob(baseTitle, editor.getJSON());
      downloadBlob(`${baseTitle}.docx`, blob);
    } catch (caught) {
      setError(
        caught instanceof Error ? tt(caught.message) : tt("导出 DOCX 失败"),
      );
    }
  }, [editor, baseTitle, tt]);

  const exportText = useCallback(() => {
    if (!editor) return;
    downloadText(`${baseTitle}.txt`, editor.getText(), "text/plain;charset=utf-8");
  }, [editor, baseTitle]);

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

  const save = useCallback(async (): Promise<string | null> => {
    if (!editor || savingRef.current) return null;
    const savingRevision = revisionRef.current;
    const json = editor.getJSON();
    const html = editor.getHTML();
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${baseTitle}-${tt("编辑版")}`;
      const blob = await tiptapJsonToDocxBlob(baseTitle, json);
      const file = new File([blob], `${title}.docx`, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const result = await saveFileToLibrary({
        item,
        siteId,
        fallbackSite: "word",
        file,
        title,
        mediaType: "doc",
        kind: "document",
        meta: {
          editor: "richdoc-v2",
          html: html.slice(0, 10_000),
        },
      });
      if (!result.ok) {
        setError(result.error ? tt(result.error) : tt("保存到我的库失败"));
        return null;
      }
      setSavedUrl(result.url);
      if (revisionRef.current === savingRevision) setDirty(false);
      return result.url;
    } catch (caught) {
      setError(
        caught instanceof Error ? tt(caught.message) : tt("保存到我的库失败"),
      );
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [editor, item, siteId, baseTitle, tt]);

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) return;
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
    [editor, siteId, tt],
  );

  const insertImageUrl = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      if (!editor || !trimmed) return;
      editor.chain().focus().setImage({ src: trimmed }).run();
    },
    [editor],
  );

  const setLinkHref = useCallback(
    (href: string) => {
      const trimmed = href.trim();
      if (!editor || !trimmed) return;
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: trimmed })
        .run();
    },
    [editor],
  );

  const unsetLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }, [editor]);

  const clearFormat = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().clearNodes().unsetAllMarks().run();
  }, [editor]);

  return {
    editor,
    item,
    siteId,
    loading,
    importing,
    saving,
    dirty,
    error,
    savedUrl,
    source: loaded?.source ?? "empty",
    words: counts.words,
    chars: counts.chars,
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
  };
}
