"use client";

// ============================================================================
// @oceanleo/ui — 任务页里点开一个文件（W6 2026-10-31，操作员要点 3）
// ----------------------------------------------------------------------------
// 首页点上传的文件 → `attachmentWorkspaceItem` + `openWorkspaceItem`，在任务页自己的
// 右侧栏（TaskWorkspaceShell → ResultCanvas → LibraryItemViewer / 编辑器）打开。任务页
// 的每个入口都走这同一条路，只是先把手上的东西换成右侧栏认得的 LibraryItem：
//
//   1. 带 typed `libraryItem`（刚上传 / 从资料库添加）→ 原样（同首页）；
//   2. 本地 `blob:`（这个标签页里刚选的图）→ 同步本地预览项（同首页）；
//   3. 私有引用 `{artifact_id, revision_id}`（已发送的消息）→ 按引用读回资料库条目，
//      查看器自己签 rendition、过期自己重签；读不回时向网关要一个 rendition 地址；
//   4. 电脑任务 inbox 文件（`native_archive.download_path`）→ 走 owner 校验的网关路由
//      换一次性地址，字节读进本地 `blob:`，页面里不出现存储域名；
//   5. 其余（旧公开地址）→ 经网关代理的显示地址。
//
// 打不开（4 读失败 / 什么地址都没有）时返回 null，调用方保持自己的退路。
//
// W13：图片始终直接预览；Library 身份只用于查看器里的附加操作。
// 非图片仍可由宿主传 `showLibrary`，打开右侧资料库并定位条目。
// ============================================================================

import { useCallback, useRef } from "react";
import type { AgentAttachment } from "../lib/agent";
import {
  attachmentDisplayUrl,
  attachmentRef,
  resolveAttachmentDisplayUrl,
  type AttachmentRenditionPurpose,
} from "../lib/attachment-url";
import { isDurableLibraryItem, isUploadedLibraryItem, type LibraryItem } from "./library-data";
import {
  attachmentOpenMode,
  attachmentWorkspaceItem,
  type OpenableAttachment,
  type TaskWorkspaceState,
} from "./TaskWorkspaceShell";
import type { TaskWorkspaceOpenItem } from "./ResultCanvas";
import type { WorkspaceActionV1 } from "./workspace-actions";
import { withTaskAttachmentLibraryLink } from "./task-attachment-library-link";

/** 电脑任务 inbox 里的云端副本（网关 `/v1/computer-task-sessions/<s>/attachments/<a>`）。 */
export interface NativeArchiveRef {
  download_path: string;
  size?: number;
  mime?: string;
  name?: string;
  /** The private Library upload the gateway registered for this file (0314). */
  artifact_id?: string;
}

// A native composer tile carries its inbox copy once uploaded under the task session,
// so a non-image file can be opened before it is sent.
declare module "./LeoComposer" {
  interface ComposerAttachment {
    nativeArchive?: NativeArchiveRef;
    /** Held locally until a managed session exists; send can proceed, preview cannot. */
    openingDisabled?: boolean;
  }
}

/** 任务页任何入口点开的东西：输入框方块、消息附件、电脑任务 inbox 文件。 */
export type TaskOpenableAttachment =
  | (OpenableAttachment & {
      artifactId?: string;
      revisionId?: string;
      nativeArchive?: NativeArchiveRef;
    })
  | (AgentAttachment & { native_archive?: NativeArchiveRef });

/** Block every opening route while a composer file is still being prepared. */
function attachmentPending(att: TaskOpenableAttachment): boolean {
  const state = att as { uploading?: boolean; failed?: boolean; openingDisabled?: boolean; state?: string; id?: string };
  return Boolean(state.uploading || state.failed || state.openingDisabled ||
    (typeof state.id === "string" && state.id.startsWith("pending:")) ||
    ["compressing", "uploading", "failed", "error"].includes(state.state || ""));
}

export interface TaskAttachmentTarget {
  item: LibraryItem;
  mode: TaskWorkspaceOpenItem["mode"];
}

export interface TaskAttachmentDeps {
  /** 按私有引用读回资料库条目（默认 `getArtifactItem`）。 */
  loadLibraryItem?: (artifactId: string, revisionId: string) => Promise<LibraryItem | null>;
  /** 私有引用的 rendition 地址（默认 `resolveAttachmentDisplayUrl`）。 */
  resolveUrl?: (
    att: { artifactId: string; revisionId: string; mime?: string },
    purpose: AttachmentRenditionPurpose,
  ) => Promise<string | undefined>;
  /** inbox 文件 → 本地 `blob:` 地址（默认走网关路由 + 读字节）。 */
  loadNativeArchive?: (path: string, mime: string) => Promise<string | null>;
}

const NATIVE_ROUTE =
  /^\/v1\/computer-task-sessions\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}$/;
/** inbox 文件读进页面的上限；更大的文件留给调用方的下载退路。 */
export const NATIVE_ARCHIVE_PREVIEW_MAX_BYTES = 64 * 1024 * 1024;

function isLocal(url: string | undefined): url is string {
  return Boolean(url && (url.startsWith("blob:") || url.startsWith("data:")));
}

/** inbox 云端副本的网关路径（只认 owner 校验的那条路由）。 */
export function nativeArchiveOf(att: TaskOpenableAttachment): NativeArchiveRef | null {
  const raw =
    ("nativeArchive" in att ? att.nativeArchive : undefined) ??
    ("native_archive" in att ? att.native_archive : undefined);
  if (!raw || typeof raw.download_path !== "string" || !NATIVE_ROUTE.test(raw.download_path)) return null;
  return raw;
}

/** 统一成右侧栏认得的附件形状（消息里的 snake_case 也认）。 */
export function taskOpenable(att: TaskOpenableAttachment): OpenableAttachment {
  if ("id" in att && typeof att.id === "string") return att;
  const message = att as AgentAttachment;
  const archive = nativeArchiveOf(att);
  const ref = attachmentRef(message);
  return {
    id: ref?.artifactId || archive?.download_path || message.url || message.name || "attachment",
    name: message.name || archive?.name,
    mime:
      message.mime ||
      archive?.mime ||
      (message.media_type && message.media_type !== "doc" ? `${message.media_type}/*` : undefined),
    url: message.url || undefined,
  };
}

const ARTIFACT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Library type category (filter id) of an uploaded file, by MIME / extension. */
export function uploadLibraryCategory(mime: string | undefined, name: string | undefined): string | undefined {
  const type = (mime || "").split(";")[0].trim().toLowerCase();
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  if (type.startsWith("image/")) return "images";
  if (type.startsWith("video/")) return "videos";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (/presentation|powerpoint/.test(type) || ["ppt", "pptx", "odp"].includes(ext)) return "presentations";
  if (/spreadsheet|ms-excel|text\/csv/.test(type) || ["xls", "xlsx", "csv", "ods"].includes(ext)) return "spreadsheets";
  if (/wordprocessing|msword|text\/plain|text\/markdown/.test(type) || ["doc", "docx", "txt", "md", "rtf", "odt"].includes(ext)) {
    return "documents";
  }
  return undefined;
}

/**
 * Optional Library destination of an attachment. Image clicks use the direct
 * viewer; this action is only their explicit "view in Library" destination.
 * Null means there is no durable Library identity yet.
 */
export function taskAttachmentLibraryAction(att: TaskOpenableAttachment): WorkspaceActionV1 | null {
  const openable = taskOpenable(att);
  const item = openable.libraryItem || null;
  const archive = nativeArchiveOf(att);
  const candidates = [
    item && isDurableLibraryItem(item) ? item.artifactId : "",
    "artifactId" in att && typeof att.artifactId === "string" ? att.artifactId : "",
    attachmentRef(att as Parameters<typeof attachmentRef>[0])?.artifactId || "",
    archive?.artifact_id || "",
  ];
  const itemId = candidates.map((id) => String(id || "").trim()).find((id) => ARTIFACT_ID_RE.test(id));
  if (!itemId) return null;
  const category = uploadLibraryCategory(
    openable.mime || archive?.mime || (item ? String(item.meta?.source_media_type || "") : ""),
    openable.name || archive?.name || item?.title,
  );
  return {
    version: 1,
    tab: "mine",
    itemId,
    intent: "open",
    ...(category ? { category } : {}),
    // A Library pick that is not an upload opens in Library without the filter.
    ...(item && isDurableLibraryItem(item) && !isUploadedLibraryItem(item) ? {} : { filter: "uploaded" as const }),
  };
}

let libraryOpenSeq = 0;

/** Open the task sidebar's Library on `action` (a `taskAttachmentLibraryAction`). */
export function openTaskWorkspaceLibrary(
  state: Pick<TaskWorkspaceState, "setRightOpen" | "setLibTab" | "setWorkspaceAction">,
  action: WorkspaceActionV1,
): void {
  libraryOpenSeq += 1;
  state.setRightOpen(true);
  state.setLibTab(action.tab);
  state.setWorkspaceAction({ nonce: `library-open:${action.itemId || ""}:${Date.now()}:${libraryOpenSeq}`, action });
}

function isImageAttachment(att: OpenableAttachment): boolean {
  return attachmentWorkspaceItem(att).kind === "image";
}

function taskAttachmentMode(item: LibraryItem): TaskAttachmentTarget["mode"] {
  return item.kind === "image" ? "preview" : attachmentOpenMode(item);
}

/**
 * 不用等网络就能打开的那一份（同首页）：typed `libraryItem`，或本页的本地 `blob:`。
 * 已发送的私有引用 / inbox 文件返回 null（要走 `resolveTaskAttachment`）。
 */
export function immediateTaskAttachment(
  att: TaskOpenableAttachment,
  siteId = "oceanleo",
): TaskAttachmentTarget | null {
  if (attachmentPending(att)) return null;
  const openable = taskOpenable(att);
  if (openable.libraryItem) {
    return { item: openable.libraryItem, mode: taskAttachmentMode(openable.libraryItem) };
  }
  if (isLocal(openable.previewUrl) || isLocal(openable.url)) {
    const item = attachmentWorkspaceItem(openable, siteId);
    return { item, mode: taskAttachmentMode(item) };
  }
  return null;
}

async function defaultLoadLibraryItem(artifactId: string, revisionId: string): Promise<LibraryItem | null> {
  const { getArtifactItem } = await import("./artifact-client");
  const result = await getArtifactItem(artifactId, revisionId);
  return result.ok && result.data ? result.data : null;
}

/** 网关路由换一次性地址 → 读进本地 `blob:`（同 NativeArchivedImage 的做法，任意类型）。 */
export async function loadNativeArchiveBlobUrl(
  path: string,
  mime: string,
  signedUrl: (path: string) => Promise<string> = async (route) => {
    const api = await import("../lib/cloud-computer-api");
    return (await api.cloudComputerRequest<{ url: string }>(route)).url;
  },
): Promise<string | null> {
  if (!NATIVE_ROUTE.test(path)) return null;
  const parsed = new URL(await signedUrl(path));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const res = await fetch(parsed.href, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok) return null;
  const bytes = await res.blob();
  if (!bytes.size || bytes.size > NATIVE_ARCHIVE_PREVIEW_MAX_BYTES) return null;
  // The inbox stores octet-stream; the archive row knows the real type.
  const typed = mime && bytes.type !== mime ? new Blob([bytes], { type: mime }) : bytes;
  return URL.createObjectURL(typed);
}

// One read per inbox file per page: opening it again reuses the blob; a failure may be
// transient (offline, expired login), so it is forgotten and the next click retries.
const archiveBlobs = new Map<string, Promise<string | null>>();

function cachedNativeArchive(path: string, mime: string): Promise<string | null> {
  let hit = archiveBlobs.get(path);
  if (!hit) {
    hit = loadNativeArchiveBlobUrl(path, mime).catch(() => null);
    archiveBlobs.set(path, hit);
    void hit.then((url) => { if (!url) archiveBlobs.delete(path); });
  }
  return hit;
}

/** 当前这次点击能打开的右侧栏条目；打不开时 null。 */
export async function resolveTaskAttachment(
  att: TaskOpenableAttachment,
  siteId = "oceanleo",
  deps: TaskAttachmentDeps = {},
): Promise<TaskAttachmentTarget | null> {
  if (attachmentPending(att)) return null;
  const immediate = immediateTaskAttachment(att, siteId);
  if (immediate) return immediate;
  const openable = taskOpenable(att);
  const ref = attachmentRef(att as Parameters<typeof attachmentRef>[0]);
  if (ref) {
    const load = deps.loadLibraryItem ?? defaultLoadLibraryItem;
    const durable = await load(ref.artifactId, ref.revisionId).catch(() => null);
    if (durable) return { item: durable, mode: taskAttachmentMode(durable) };
    const resolve = deps.resolveUrl ?? resolveAttachmentDisplayUrl;
    const url = await resolve(
      { ...ref, mime: openable.mime },
      isImageAttachment(openable) ? "preview" : "source",
    ).catch(() => undefined);
    const item = {
      ...attachmentWorkspaceItem({ ...openable, url: url || undefined, previewUrl: undefined }, siteId),
      // An expired grant is re-signed by the viewer from this reference.
      artifactId: ref.artifactId,
      revisionId: ref.revisionId,
    };
    return { item, mode: "preview" };
  }
  const archive = nativeArchiveOf(att);
  if (archive) {
    if (typeof archive.size === "number" && archive.size > NATIVE_ARCHIVE_PREVIEW_MAX_BYTES) return null;
    const mime = openable.mime || archive.mime || "";
    const url = deps.loadNativeArchive
      ? await deps.loadNativeArchive(archive.download_path, mime).catch(() => null)
      : await cachedNativeArchive(archive.download_path, mime);
    if (!url) return null;
    const item = attachmentWorkspaceItem({ ...openable, id: archive.download_path, url }, siteId);
    return { item, mode: "preview" };
  }
  const url = attachmentDisplayUrl(openable);
  if (!url) return null;
  const item = attachmentWorkspaceItem({ ...openable, url, previewUrl: undefined }, siteId);
  return { item, mode: "preview" };
}

/**
 * 任务页所有入口共用的「点开文件」：能同步打开的立刻打开（同首页），要读网络的
 * 读完再打开；连点两个文件时只打开最后点的那个。返回 false = 打不开（调用方退路）。
 */
export function useTaskAttachmentOpener(
  siteId: string,
  show: (target: TaskAttachmentTarget) => void,
  /** Non-images may open the Library; images always open their direct preview. */
  showLibrary?: (action: WorkspaceActionV1) => void,
): (attachment: TaskOpenableAttachment) => Promise<boolean> {
  const showRef = useRef(show);
  showRef.current = show;
  const showLibraryRef = useRef(showLibrary);
  showLibraryRef.current = showLibrary;
  const seqRef = useRef(0);
  return useCallback(async (attachment: TaskOpenableAttachment) => {
    const seq = ++seqRef.current;
    if (attachmentPending(attachment)) return false;
    const showTarget = (target: TaskAttachmentTarget) => {
      const action = taskAttachmentLibraryAction(attachment);
      showRef.current({
        ...target,
        item: withTaskAttachmentLibraryLink(
          target.item,
          action,
          showLibraryRef.current ? (next) => showLibraryRef.current?.(next) : undefined,
        ),
      });
    };
    const library = showLibraryRef.current && !isImageAttachment(taskOpenable(attachment))
      ? taskAttachmentLibraryAction(attachment)
      : null;
    if (library) {
      showLibraryRef.current!(library);
      return true;
    }
    const now = immediateTaskAttachment(attachment, siteId);
    if (now) {
      showTarget(now);
      return true;
    }
    const target = await resolveTaskAttachment(attachment, siteId);
    if (!target) return false;
    if (seq === seqRef.current) showTarget(target);
    return true;
  }, [siteId]);
}
