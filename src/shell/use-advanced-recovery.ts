"use client";

import { useEffect, useRef } from "react";
import type {
  AdvancedEditRevision,
  AdvancedPersistenceState,
} from "./advanced-persistence-controller";
import {
  deleteAdvancedRecovery,
  readAdvancedRecovery,
  writeAdvancedRecovery,
} from "./advanced-recovery-store";
import type { AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";
import type { LibraryItem } from "./library-data";

const RECOVERY_DEBOUNCE_MS = 450;

// ============================================================================
// 「这份草稿已经被一次成功的保存盖过了」——本页会话内的登记（X7，2026-09-06）
// ----------------------------------------------------------------------------
// 实测（website 开发槽，改 B1 再改 C1）：2 次编辑 → 35 s 内 6 份 creations 且还在继续。
// 环是这样转的：
//   保存成功 → 宿主换成新素材 → 编辑器整棵重挂 → 旧实例卸载时把「仍 dirty」的草稿
//   写回 IndexedDB → 新实例一挂载就读到这份草稿并 restore → 编辑器又 dirty →
//   再保存一份 creation → 又重挂 → …
// 旧实例永远等不到 `saved` 那一帧去删草稿（重挂发生在它之前），于是每一圈都把
// **已经存进云端的内容**当成「崩溃前未保存的改动」再存一次。
//
// 解法不改草稿的写法，只在**恢复前**多问一句：这份草稿最后一次编辑之后，同一份素材
// 是否已经成功保存过？是 → 草稿作废，删掉、不恢复。答案由 `useAdvancedAutoSave`
// 在 flush 成功时登记：以 flush **发起**的时刻为界（编辑器的 flush 存的是发起那一刻
// 的文档），素材身份用保存回执里的 id / key / root_asset_id / parent_asset_id，
// 与 `advancedRecoveryKey()` 拼 key 的字段一致。
//
// 只登记在内存里：环只在同一页会话内转；真崩溃后刷新页面，登记为空，草稿照旧恢复。
// ============================================================================

const RECENT_SAVES = new Map<string, number>();
const RECENT_SAVES_LIMIT = 256;
const MIN_IDENTITY_TOKEN_LENGTH = 6;

function recoveryIdentityTokens(item: LibraryItem): string[] {
  const meta = (item.meta || {}) as Record<string, unknown>;
  const candidates = [
    item.id,
    item.key,
    meta.root_asset_id,
    meta.parent_asset_id,
    (item as { artifactId?: unknown }).artifactId,
  ];
  const tokens: string[] = [];
  for (const candidate of candidates) {
    const token = String(candidate ?? "").trim().slice(0, 600);
    if (token.length >= MIN_IDENTITY_TOKEN_LENGTH && !tokens.includes(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

/** flush 成功后登记：这份素材在 `startedAt` 之前的编辑都已进云端。 */
export function noteAdvancedSaveSucceeded(
  item: LibraryItem,
  startedAt: number = Date.now(),
): void {
  for (const token of recoveryIdentityTokens(item)) {
    RECENT_SAVES.set(token, Math.max(RECENT_SAVES.get(token) ?? 0, startedAt));
  }
  while (RECENT_SAVES.size > RECENT_SAVES_LIMIT) {
    const oldest = RECENT_SAVES.keys().next().value;
    if (oldest === undefined) break;
    RECENT_SAVES.delete(oldest);
  }
}

/** 草稿最后一次编辑（`updatedAt`）之后，同一素材是否已成功保存过。 */
export function advancedRecoverySupersededBySave(
  key: string,
  updatedAt: number,
): boolean {
  if (!Number.isFinite(updatedAt)) return false;
  for (const [token, startedAt] of RECENT_SAVES) {
    if (startedAt >= updatedAt && key.includes(`:${token}`)) return true;
  }
  return false;
}

/** 只给测试用：清空登记，避免用例之间串味。 */
export function resetAdvancedSaveLedgerForTests(): void {
  RECENT_SAVES.clear();
}

export function useAdvancedRecovery({
  editorId,
  revision,
  dirty,
  persistenceState,
  recovery,
}: {
  editorId: string;
  revision: AdvancedEditRevision;
  dirty: boolean;
  persistenceState: AdvancedPersistenceState;
  recovery?: AdvancedEditorRecoveryAdapter;
}): void {
  const recoveryRef = useRef(recovery);
  const restoredKeyRef = useRef("");
  const hadDirtyRef = useRef(false);
  // 草稿的时间戳记「最后一次编辑」而不是「落盘那一刻」：卸载时的兜底写盘发生在
  // 保存成功之后，若记落盘时刻，它会把已入云的内容伪装成比保存更新的改动。
  const lastEditAtRef = useRef(0);
  recoveryRef.current = recovery;

  useEffect(() => {
    if (dirty) lastEditAtRef.current = Date.now();
  }, [dirty, revision]);

  useEffect(() => {
    const active = recoveryRef.current;
    if (!active?.ready || restoredKeyRef.current === active.key) return;
    let cancelled = false;
    restoredKeyRef.current = active.key;
    void readAdvancedRecovery(active.key)
      .then(async (record) => {
        if (cancelled || !record) return;
        const latest = recoveryRef.current;
        if (!latest || latest.key !== record.key || !latest.ready) return;
        if (advancedRecoverySupersededBySave(record.key, record.updatedAt)) {
          await deleteAdvancedRecovery(record.key).catch(() => undefined);
          return;
        }
        const restored = await latest.restore(record.payload);
        if (restored !== false) hadDirtyRef.current = true;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [recovery?.key, recovery?.ready]);

  useEffect(() => {
    const active = recoveryRef.current;
    if (!dirty || !active?.ready) return;
    hadDirtyRef.current = true;
    const persist = () => {
      const latest = recoveryRef.current;
      if (!latest?.ready) return;
      const updatedAt = lastEditAtRef.current || Date.now();
      void Promise.resolve(latest.capture())
        .then((payload) =>
          writeAdvancedRecovery({
            key: latest.key,
            editorId,
            revision,
            updatedAt,
            payload,
          }),
        )
        .catch(() => undefined);
    };
    const timer = window.setTimeout(persist, RECOVERY_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      persist();
    };
  }, [dirty, editorId, recovery?.key, recovery?.ready, revision]);

  useEffect(() => {
    const active = recoveryRef.current;
    if (
      !active ||
      dirty ||
      persistenceState !== "saved" ||
      !hadDirtyRef.current
    ) {
      return;
    }
    hadDirtyRef.current = false;
    void deleteAdvancedRecovery(active.key).catch(() => undefined);
  }, [dirty, persistenceState, recovery?.key]);
}
