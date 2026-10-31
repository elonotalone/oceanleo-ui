"use client";

// ============================================================================
// @oceanleo/ui — 输入框草稿：刷新不丢文字、不丢附件（2026-10-31 A1）
// ----------------------------------------------------------------------------
// 操作员：「首页输入文字或上传文件后，刷新页面不丢文字、不丢文件。」
//
// 宿主给 LeoComposer 传 `draftKey`（如 "home" / `task:<id>`）即生效，不传零行为变化。
//   - 存 sessionStorage（同一个标签页刷新还在；不跨标签、不跨窗口互相覆盖）。
//   - 文字：原样存。
//   - 附件：只存**已上传完成的私有 Library 引用**（artifactId + revisionId）和名字 /
//     mime / 媒体大类。不存字节、不存任何 URL（blob: 刷新即失效；签名地址不留长期副本）。
//     恢复时按引用向网关重新取一次 typed LibraryItem（新的短期缩略图地址、右侧栏可打开）；
//     网关说没有 / 无权（404/403/410）的直接不恢复。
//   - 上传中途刷新的文件：字节已经没了，**不恢复**（不假装还在传）。上传失败的方块同理。
//   - 电脑对话（Claude Code / Codex）的附件进的是那台电脑的 inbox，没有 Library 引用，
//     天然不在可存范围内，不恢复。
//   - 发送：点发送后，若输入框随即被宿主清空 → 草稿跟着清；若输入框原样卸载（首页
//     切到任务对话）→ 卸载时清。发送失败宿主把文字还回来 → 照常继续存。
// ============================================================================

import { useCallback, useEffect, useRef } from "react";
import { attachmentRef } from "../lib/attachment-url";
import type { ComposerAttachment } from "./LeoComposer";

export const COMPOSER_DRAFT_PREFIX = "oceanleo_composer_draft:v1:";

/** 存下来的一个附件：只有引用与展示字段，没有 URL。 */
export interface ComposerDraftAttachment {
  id: string;
  artifactId: string;
  revisionId: string;
  name?: string;
  mime?: string;
  mediaType?: string;
}

export interface ComposerDraftRecord {
  text: string;
  attachments: ComposerDraftAttachment[];
}

function draftStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function composerDraftStorageKey(draftKey: string): string {
  return `${COMPOSER_DRAFT_PREFIX}${draftKey}`;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** 可以存的附件：上传完成、没失败、带私有引用。其余（上传中 / 失败 / 电脑 inbox）不存。 */
export function draftAttachmentsOf(
  attachments: readonly ComposerAttachment[] | undefined,
): ComposerDraftAttachment[] {
  const out: ComposerDraftAttachment[] = [];
  for (const att of attachments ?? []) {
    if (att.uploading || att.failed) continue;
    const ref = attachmentRef(att);
    if (!ref || !att.id) continue;
    const name = optionalText(att.name);
    const mime = optionalText(att.mime);
    const mediaType = optionalText(att.mediaType);
    out.push({
      id: att.id,
      artifactId: ref.artifactId,
      revisionId: ref.revisionId,
      ...(name ? { name } : {}),
      ...(mime ? { mime } : {}),
      ...(mediaType ? { mediaType } : {}),
    });
  }
  return out;
}

export function readComposerDraft(draftKey: string): ComposerDraftRecord | null {
  const store = draftStorage();
  if (!store || !draftKey) return null;
  let raw: unknown;
  try {
    const text = store.getItem(composerDraftStorageKey(draftKey));
    if (!text) return null;
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { text?: unknown; attachments?: unknown };
  const text = typeof record.text === "string" ? record.text : "";
  // Re-validate on read: a hand-edited or older entry never smuggles a URL in.
  const attachments = draftAttachmentsOf(
    Array.isArray(record.attachments) ? (record.attachments as ComposerAttachment[]) : [],
  );
  if (!text.trim() && attachments.length === 0) return null;
  return { text, attachments };
}

export function clearComposerDraft(draftKey: string): void {
  const store = draftStorage();
  if (!store || !draftKey) return;
  try {
    store.removeItem(composerDraftStorageKey(draftKey));
  } catch {
    /* storage unavailable */
  }
}

export function writeComposerDraft(
  draftKey: string,
  text: string,
  attachments: readonly ComposerDraftAttachment[],
): void {
  const store = draftStorage();
  if (!store || !draftKey) return;
  if (!text.trim() && attachments.length === 0) {
    clearComposerDraft(draftKey);
    return;
  }
  try {
    store.setItem(composerDraftStorageKey(draftKey), JSON.stringify({ text, attachments }));
  } catch {
    /* quota / private mode: the draft is best effort */
  }
}

type FetchLibraryItem = (
  artifactId: string,
  revisionId: string,
) => Promise<{ ok: boolean; status?: number; data?: import("./library-data").LibraryItem }>;

async function defaultFetchLibraryItem(artifactId: string, revisionId: string) {
  const { getArtifactItem } = await import("./artifact-client");
  return getArtifactItem(artifactId, revisionId);
}

const GONE_STATUSES = new Set([403, 404, 410]);

/**
 * 存下的引用 → 可以放回输入框的附件。每个引用向网关重新取一次 typed LibraryItem：
 * 取到 → 带新的短期缩略图与 `libraryItem`；网关说没有 / 无权 → 丢掉；
 * 网络等其它失败 → 只带引用放回（发送仍走引用，网关会再校验一次）。
 */
export async function rehydrateDraftAttachments(
  items: readonly ComposerDraftAttachment[],
  fetchItem: FetchLibraryItem = defaultFetchLibraryItem,
): Promise<ComposerAttachment[]> {
  const { composerAttachmentFromLibraryItem } = await import("./composer-upload");
  const restored = await Promise.all(
    items.map(async (item): Promise<ComposerAttachment | null> => {
      const refOnly: ComposerAttachment = {
        id: item.id,
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        ...(item.name ? { name: item.name } : {}),
        ...(item.mime ? { mime: item.mime } : {}),
        ...(item.mediaType ? { mediaType: item.mediaType } : {}),
      };
      let result: Awaited<ReturnType<FetchLibraryItem>>;
      try {
        result = await fetchItem(item.artifactId, item.revisionId);
      } catch {
        return refOnly;
      }
      if (result.ok && result.data) {
        const fresh = composerAttachmentFromLibraryItem(result.data);
        if (!fresh) return refOnly;
        return {
          ...refOnly,
          ...fresh,
          // The host's id and the exact revision that was attached stay as they were.
          id: item.id,
          artifactId: item.artifactId,
          revisionId: item.revisionId,
          name: item.name || fresh.name,
          mime: item.mime || fresh.mime,
        };
      }
      if (result.status && GONE_STATUSES.has(result.status)) return null;
      return refOnly;
    }),
  );
  return restored.filter((item): item is ComposerAttachment => item !== null);
}

export interface UseComposerDraftOptions {
  draftKey?: string;
  value: string;
  onChange: (value: string) => void;
  attachments?: readonly ComposerAttachment[];
  /** 宿主把恢复出来的附件加回自己的状态。不传 = 只存文字。 */
  onAddAttachments?: (items: ComposerAttachment[]) => void;
  /** 测试注入；缺省按引用向网关取 LibraryItem。 */
  fetchItem?: FetchLibraryItem;
}

export interface ComposerDraftHandle {
  /** 点发送时调：输入框原样卸载（首页切到任务对话）即清掉草稿。 */
  markSubmitted: () => void;
}

export function useComposerDraft({
  draftKey,
  value,
  onChange,
  attachments,
  onAddAttachments,
  fetchItem,
}: UseComposerDraftOptions): ComposerDraftHandle {
  const latest = useRef({ value, onChange, attachments, onAddAttachments, fetchItem });
  latest.current = { value, onChange, attachments, onAddAttachments, fetchItem };
  const keyRef = useRef(draftKey);
  keyRef.current = draftKey;
  const restoredKeyRef = useRef<string | undefined>(undefined);
  // Last state seen by the writer: unchanged state (first render, StrictMode's
  // re-run, a just-restored key) is never written over what is stored.
  const lastSeenRef = useRef<string | null>(null);
  const submittedRef = useRef<string | null>(null);
  // Restored references still being re-read: kept in storage until they land.
  const pendingRestoreRef = useRef<ComposerDraftAttachment[]>([]);

  const saveable = onAddAttachments ? draftAttachmentsOf(attachments) : [];
  const signature = draftKey ? JSON.stringify([value, saveable]) : "";
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  // Restore once per key (refs survive StrictMode's simulated remount).
  useEffect(() => {
    if (!draftKey || restoredKeyRef.current === draftKey) return;
    restoredKeyRef.current = draftKey;
    lastSeenRef.current = null;
    submittedRef.current = null;
    pendingRestoreRef.current = [];
    const record = readComposerDraft(draftKey);
    if (!record) return;
    if (record.text && !latest.current.value.trim()) latest.current.onChange(record.text);
    if (!record.attachments.length || !latest.current.onAddAttachments) return;
    pendingRestoreRef.current = record.attachments;
    void rehydrateDraftAttachments(record.attachments, latest.current.fetchItem).then((items) => {
      if (keyRef.current !== draftKey) return;
      pendingRestoreRef.current = [];
      const add = latest.current.onAddAttachments;
      const have = new Set((latest.current.attachments ?? []).map((att) => att.id));
      const fresh = items.filter((item) => !have.has(item.id));
      if (add && fresh.length) add(fresh);
      else {
        // Nothing came back (all gone): storage follows what is shown.
        const now = latest.current;
        writeComposerDraft(draftKey, now.value, now.onAddAttachments ? draftAttachmentsOf(now.attachments) : []);
      }
    });
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (lastSeenRef.current === null || lastSeenRef.current === signature) {
      lastSeenRef.current = signature;
      return;
    }
    lastSeenRef.current = signature;
    if (submittedRef.current !== null) {
      if (submittedRef.current === signature) return;
      submittedRef.current = null;
    }
    const now = latest.current;
    const shown = now.onAddAttachments ? draftAttachmentsOf(now.attachments) : [];
    const pending = pendingRestoreRef.current.filter((item) => !shown.some((att) => att.id === item.id));
    writeComposerDraft(draftKey, now.value, [...shown, ...pending]);
  }, [draftKey, signature]);

  // Sent and then unmounted unchanged (home → the task conversation): the draft is spent.
  useEffect(() => {
    if (!draftKey) return;
    return () => {
      if (submittedRef.current !== null) clearComposerDraft(draftKey);
      submittedRef.current = null;
    };
  }, [draftKey]);

  const markSubmitted = useCallback(() => {
    if (keyRef.current) submittedRef.current = signatureRef.current;
  }, []);

  return { markSubmitted };
}
