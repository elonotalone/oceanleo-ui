import type { LibraryItem } from "../library-data";
import {
  convertRichDocToUmo,
  convertUmoToRichDoc,
  inspectRichDocDocument,
  type InspectResult,
  type UmoDocument,
} from "../doc-editors/rich-doc-umo-migration";
import { saveFileToLibrary, type SaveToLibraryResult } from "../doc-editors/doc-io";

type EditorHandoff =
  | { kind: "inline"; json: unknown; revision: string | null }
  | { kind: "url"; url: string; format: string | null; revision: string | null }
  | { kind: "empty" };

const RICHDOC_SOURCE_FORMAT = "docx";
const RICHDOC_SOURCE_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const RICHDOC_PROJECT_SCHEMA = "tiptap-json@1";
export const UMO_SAVE_TIMEOUT_MS = 15_000;

export function emptyRichDoc(): { type: "doc"; content: { type: "paragraph" }[] } {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function collectRichDocText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; content?: unknown; data?: unknown };
  const own = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.content)
    ? record.content.map(collectRichDocText).join("")
    : record.data
      ? collectRichDocText(record.data)
      : "";
  return own + children;
}

export function isEmptyRichDoc(node: unknown): boolean {
  return !collectRichDocText(node).trim();
}

export function inlineJsonFromItem(item: LibraryItem): unknown | null {
  const raw = typeof item.content === "string" ? item.content.trim() : "";
  if (raw) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  const meta = item.meta || {};
  for (const key of ["tiptap", "project", "umo"] as const) {
    const value = meta[key];
    if (value && typeof value === "object") return value;
    if (typeof value === "string" && value.trim()) {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

function looksLikeDocxHint(value: unknown): boolean {
  const text = String(value || "").toLowerCase();
  return text.includes("docx") || text.includes("wordprocessingml");
}

export function isDocxUrl(url: string, item?: LibraryItem): boolean {
  if (looksLikeDocxHint(url)) return true;
  if (!item) return false;
  return [
    item.meta?.source_format,
    item.meta?.format,
    item.meta?.extension,
    item.meta?.ext,
    item.meta?.mime,
    item.title,
    item.url,
  ].some(looksLikeDocxHint);
}

export function isDocxOnlyItem(item: LibraryItem): boolean {
  if (inlineJsonFromItem(item)) return false;
  if (String(item.meta.editor_project_url || "").trim()) return false;
  const url = String(item.meta.editor_source_url || item.url || "").trim();
  return Boolean(url) && isDocxUrl(url, item);
}

export function deriveEditorHandoffFromItem(item: LibraryItem): EditorHandoff {
  const revision = item.revisionId ?? null;
  const inline = inlineJsonFromItem(item);
  if (inline) return { kind: "inline", json: inline, revision };
  const working = String(item.meta.editor_working_head_url || "").trim();
  if (working) {
    return {
      kind: "url",
      url: working,
      format: isDocxUrl(working, item) ? "docx" : "json",
      revision,
    };
  }
  const project = String(item.meta.editor_project_url || "").trim();
  if (project) {
    return { kind: "url", url: project, format: "json", revision };
  }
  const url = String(item.meta.editor_source_url || item.url || "").trim();
  if (url) {
    return {
      kind: "url",
      url,
      format: isDocxUrl(url, item) ? "docx" : null,
      revision,
    };
  }
  return { kind: "empty" };
}

export function handoffLooksLikeDocx(
  handoff: EditorHandoff | null,
  item: LibraryItem,
): boolean {
  if (handoff?.kind === "url") {
    if (handoff.format === "docx") return true;
    if (isDocxUrl(handoff.url, item)) return true;
  }
  return isDocxOnlyItem(item);
}

export function hostedStateFromResolvedJson(
  json: unknown,
  options: { fromDocx?: boolean } = {},
): {
  source: unknown;
  converted: UmoDocument | null;
  inspect: InspectResult;
  readOnly: boolean;
} {
  if (options.fromDocx) {
    const converted = convertRichDocToUmo(json);
    if (converted.ok) {
      return {
        source: converted.document.content,
        converted: converted.document,
        inspect: inspectRichDocDocument(converted.document),
        readOnly: false,
      };
    }
    const inspect = inspectRichDocDocument(json);
    return { source: json, converted: null, inspect, readOnly: false };
  }
  const inspect = inspectRichDocDocument(json);
  return {
    source: json,
    converted: null,
    inspect,
    readOnly: inspect.kind !== "umo" && inspect.differences.length > 0,
  };
}

export async function htmlToRichDocJson(
  html: string,
  generate?: (html: string) => Promise<unknown>,
): Promise<unknown> {
  if (generate) return generate(html);
  const { generateJSON } = await import("@tiptap/core");
  const { default: StarterKit } = await import("@tiptap/starter-kit");
  const { TableKit } = await import("@tiptap/extension-table");
  const { Image } = await import("@tiptap/extension-image");
  const { TextAlign } = await import("@tiptap/extension-text-align");
  const {
    Color,
    FontFamily,
    FontSize,
    TextStyle,
  } = await import("@tiptap/extension-text-style");
  const { Highlight } = await import("@tiptap/extension-highlight");
  const { RichDocTypography } = await import("../doc-editors/rich-doc-model");
  return generateJSON(html, [
    StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false, allowBase64: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TextStyle,
    Color,
    FontSize,
    FontFamily,
    RichDocTypography,
    Highlight.configure({ multicolor: true }),
  ]);
}

async function defaultLoadRichDocHtml(item: LibraryItem) {
  const { loadRichDocHtml } = await import("../doc-editors/rich-doc-model");
  return loadRichDocHtml(item);
}

export async function umoSourceFromDocxItem(
  item: LibraryItem,
  deps: {
    loadHtml?: (item: LibraryItem) => Promise<{ html: string; json?: unknown; error: string }>;
    htmlToJson?: (html: string) => Promise<unknown>;
  } = {},
): Promise<
  | { ok: true; source: unknown; converted: UmoDocument | null; inspect: InspectResult }
  | { ok: false; error: string }
> {
  const loadHtml = deps.loadHtml ?? defaultLoadRichDocHtml;
  const loaded = await loadHtml(item);
  if (loaded.error) return { ok: false, error: loaded.error };
  const json =
    loaded.json ??
    (await htmlToRichDocJson(loaded.html, deps.htmlToJson));
  if (isEmptyRichDoc(json) && !String(loaded.html || "").replace(/<[^>]+>/g, "").trim()) {
    return { ok: false, error: "这份 Word 源文件没有可导入的正文。" };
  }
  const next = hostedStateFromResolvedJson(json, { fromDocx: true });
  return {
    ok: true,
    source: next.source,
    converted: next.converted,
    inspect: next.inspect,
  };
}

export function createUmoSaveRoundtrip(timeoutMs = UMO_SAVE_TIMEOUT_MS): {
  expect: (saveId: string) => Promise<{ payload: unknown; revision?: unknown }>;
  settle: (
    saveId: string,
    snapshot: { payload?: unknown; revision?: unknown } | null,
    ok: boolean,
  ) => boolean;
} {
  const pending = new Map<
    string,
    {
      resolve: (value: { payload: unknown; revision?: unknown }) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  return {
    expect(saveId) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(saveId);
          reject(new Error("专业编辑还没确认保存。"));
        }, timeoutMs);
        pending.set(saveId, { resolve, reject, timer });
      });
    },
    settle(saveId, snapshot, ok) {
      const entry = pending.get(saveId);
      if (!entry) return false;
      clearTimeout(entry.timer);
      pending.delete(saveId);
      if (!ok) {
        entry.reject(new Error("专业编辑还没确认保存。"));
        return true;
      }
      entry.resolve({
        payload: snapshot?.payload ?? snapshot,
        revision: snapshot?.revision,
      });
      return true;
    },
  };
}

export async function persistUmoPayload(input: {
  item: LibraryItem;
  siteId: string;
  payload: unknown;
  save?: (args: Parameters<typeof saveFileToLibrary>[0]) => Promise<SaveToLibraryResult>;
}): Promise<{ ok: true; item: LibraryItem } | { ok: false; error: string }> {
  const reversed = convertUmoToRichDoc(input.payload);
  if (!reversed.ok) {
    return { ok: false, error: reversed.reason };
  }
  const json = reversed.data;
  const title = `${input.item.title || "文档"}-编辑版`;
  const fileStem =
    title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 180) || "document";
  const save = input.save ?? saveFileToLibrary;
  const { tiptapJsonToDocxBlob } = await import("../doc-editors/docx-export");
  const { renderRichDocPreviewPng } = await import(
    "../doc-editors/editor-preview-raster"
  );
  const result = await save({
    item: input.item,
    siteId: input.siteId || "word",
    fallbackSite: "word",
    createFile: async () => {
      const delivery = await tiptapJsonToDocxBlob(input.item.title || "文档", json);
      return new File([delivery], `${fileStem}.docx`, {
        type: RICHDOC_SOURCE_MEDIA_TYPE,
      });
    },
    createPreview: () => renderRichDocPreviewPng(json, input.item.title || "文档"),
    sourceFormat: RICHDOC_SOURCE_FORMAT,
    sourceMediaType: RICHDOC_SOURCE_MEDIA_TYPE,
    title,
    mediaType: "doc",
    kind: "document",
    idempotencyKey: `umo:${input.item.revisionId || input.item.id}:${Date.now().toString(36)}`,
    meta: {
      editor: "umo-hosted",
      editor_capability: "richdoc",
      content_type: "document",
      delivery_format: RICHDOC_SOURCE_FORMAT,
    },
    project: { schema: RICHDOC_PROJECT_SCHEMA, data: json },
    editorManifest: { id: "richdoc", format: RICHDOC_PROJECT_SCHEMA },
    artifactRevision: {
      artifactType: "document",
      provenance: { editor: "umo-hosted" },
    },
  });
  if (!result.ok) {
    return { ok: false, error: result.error || "文档没有存成新版本。" };
  }
  const projectUrl = result.projectUrl || "";
  const base = result.item || input.item;
  return {
    ok: true,
    item: {
      ...base,
      title: result.title || base.title,
      url: result.url || base.url,
      artifactId: result.artifactId || base.artifactId,
      revisionId: result.revisionId || base.revisionId,
      meta: {
        ...base.meta,
        source_format: result.sourceFormat || RICHDOC_SOURCE_FORMAT,
        source_media_type: result.sourceMediaType || RICHDOC_SOURCE_MEDIA_TYPE,
        delivery_format: RICHDOC_SOURCE_FORMAT,
        ...(projectUrl
          ? {
              editor_project_url: projectUrl,
              editor_project_schema: result.projectSchema || RICHDOC_PROJECT_SCHEMA,
              editor_manifest_url: projectUrl,
              editor_manifest_schema: result.projectSchema || RICHDOC_PROJECT_SCHEMA,
              editor_working_head_url: projectUrl,
              editor_working_head_project_url: projectUrl,
              editor_working_head_schema: result.projectSchema || RICHDOC_PROJECT_SCHEMA,
            }
          : {}),
        ...(result.savedAt ? { editor_saved_at: result.savedAt } : {}),
        ...(result.previousRevisionId
          ? { previous_revision_id: result.previousRevisionId }
          : {}),
      },
    },
  };
}
