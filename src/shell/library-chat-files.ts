// Library「来自 LeoChat」：用户在 LeoChat 里收发过的文件，直接读 IM 存储（不复制进 Library）。
// 契约 2026-11-07 UX wave §2.4：`GET /v1/library/chat-files?cursor=&limit=` →
// `{"items":[{id,name,kind,size,mime,url,conversation_id,conversation_title,sender_name,direction,created_at}],"next":cursor|null}`。
// 请求走 IM 客户端 `imFetch`（与 Memo 同一个网关助手、同一套登录）；地址按 IM 附件的规则显示，不另起签名。
import { ImApiError, imFetch } from "../lib/im/client";
import { attachmentDisplayUrl } from "../lib/attachment-url";
import { safeMediaUrl } from "./messages/conversation/AttachmentView";
import { ADVANCED_CAPABILITY_MATRIX } from "./artifact-contract";
import { inferLibraryKind, type LibraryItem } from "./library-data";
import { libraryEditorCategory, normalizeLibraryCategory } from "./library-editor-category";

export interface LibraryChatFile {
  id: string;
  name: string;
  kind: string;
  /** 字节数；服务没给合法数字时为 null（不显示）。 */
  size: number | null;
  mime: string;
  /** 可直接下载的地址（已按 IM 附件规则解析，只会是 http(s)）。 */
  url: string;
  conversation_id: string;
  conversation_title: string;
  sender_name: string;
  direction: "received" | "sent" | null;
  created_at: string;
}

export type LibraryChatFilesResult =
  | { ok: true; items: LibraryChatFile[]; next: string | null; skipped: number }
  | { ok: false; status: number; error: string };

/** IM `imFetch` 解析不了响应体时用的同一句话。 */
const UNREADABLE_RESPONSE = "服务返回的内容无法识别";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 附件地址的显示规则与 IM 一致：IM 气泡只认 http(s)（`safeMediaUrl`）；网关相对地址
 * （`/v1/…`）按 Library 附件的同一个助手拼上网关域名。其余形状一律不认。
 */
function chatFileUrl(raw: string): string | null {
  return safeMediaUrl(raw.startsWith("/v1/") ? attachmentDisplayUrl({ url: raw }) : raw);
}

/** 一条原始记录 → `LibraryChatFile`；缺 `id` / `name` / 可用 `url` 时返回 null（调用方计数）。 */
export function normalizeChatFile(raw: unknown): LibraryChatFile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  const name = text(row.name);
  const url = chatFileUrl(text(row.url));
  if (!id || !name || !url) return null;
  const size = typeof row.size === "number" && Number.isFinite(row.size) && row.size >= 0 ? row.size : null;
  const direction = row.direction === "sent" || row.direction === "received" ? row.direction : null;
  return {
    id,
    name,
    kind: text(row.kind),
    size,
    mime: text(row.mime).toLowerCase(),
    url,
    conversation_id: text(row.conversation_id),
    conversation_title: text(row.conversation_title),
    sender_name: text(row.sender_name),
    direction,
    created_at: text(row.created_at),
  };
}

export async function listLibraryChatFiles(
  options: { cursor?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<LibraryChatFilesResult> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const query = params.toString();
  let body: unknown;
  try {
    body = await imFetch<unknown>(`/v1/library/chat-files${query ? `?${query}` : ""}`, options.signal ? { signal: options.signal } : {});
  } catch (error) {
    if (error instanceof ImApiError) return { ok: false, status: error.status, error: error.message || error.code };
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!record || !Array.isArray(record.items) || !(record.next === null || typeof record.next === "string")) {
    return { ok: false, status: 200, error: UNREADABLE_RESPONSE };
  }
  const items: LibraryChatFile[] = [];
  let skipped = 0;
  for (const raw of record.items) {
    const file = normalizeChatFile(raw);
    if (file) items.push(file);
    else skipped += 1;
  }
  return { ok: true, items, next: record.next || null, skipped };
}

/**
 * 文件在 Library 分类体系里的样子：viewer kind 由 `inferLibraryKind` 判，正好是某个编辑器
 * 声明的源格式（mime 与扩展名都对上能力矩阵那一行）时带上那一行的 artifactType——
 * 与上传进 Library 的同一份文件归到同一类（PDF 归「PDF」而不是「文档」）。
 */
export function chatFileLibraryItem(file: LibraryChatFile): LibraryItem {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const source = file.mime
    ? ADVANCED_CAPABILITY_MATRIX.find((row) => row.sourceMediaType === file.mime && row.sourceFormat === extension)
    : undefined;
  return {
    key: `leochat:${file.id}`,
    source: "artifact",
    id: file.id,
    title: file.name,
    kind: inferLibraryKind({ kind: file.kind, mediaType: file.mime, url: file.name }),
    siteId: "",
    favorite: false,
    meta: {},
    ...(source ? { artifactType: source.artifactType } : {}),
  };
}

/** MyLibrary 类型筛选用的类别 id（`LIBRARY_EDITOR_CATEGORIES` 的 value）。 */
export function chatFileCategory(file: LibraryChatFile): string {
  return libraryEditorCategory(chatFileLibraryItem(file));
}

/** `query` 不分大小写匹配文件名 / 会话名 / 发送者；`category` 是 MyLibrary 当前的类型 id（`"all"` 不筛）。 */
export function chatFileMatches(file: LibraryChatFile, filter: { query: string; category: string }): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query && ![file.name, file.conversation_title, file.sender_name].some((value) => value.toLowerCase().includes(query))) {
    return false;
  }
  const category = filter.category && filter.category !== "all" ? normalizeLibraryCategory(filter.category) : "";
  return !category || chatFileCategory(file) === category;
}
