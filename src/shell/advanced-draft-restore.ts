"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";
import type { AdvancedEditRevision } from "./advanced-persistence-controller";
import type { LibraryItem } from "./library-data";
import { ADVANCED_DRAFT_META_KEY, advancedDraftIdentity, loadAdvancedDraft, normalizeAdvancedDraftPointer } from "./advanced-draft";
import { advancedDraftPublished, clearAdvancedDraftRestored, draftRecoveryKey, noteAdvancedDraftRestored, portableAdvancedDraft } from "./advanced-draft-recovery";
import { readAdvancedRecovery, deleteAdvancedRecovery } from "./advanced-recovery-store";
import { advancedRecoverySupersededBySave } from "./use-advanced-recovery";

export const DRAFT_READ_FAILED = "最新服务器草稿暂时无法恢复，自动保存已暂停。请点重试。";
export const DRAFT_OTHER_FACE = "最新修改在另一个编辑面，请切换到那个编辑面继续。当前自动保存已暂停。";

/** One owner for server/local restoration. The guard is active during render,
 * before effects or autosave timers can publish the old base document. */
export function useAdvancedDraftRestore({ item, schema, recovery, revision }: {
  item?: LibraryItem;
  schema?: string;
  recovery?: AdvancedEditorRecoveryAdapter;
  revision: AdvancedEditRevision;
}) {
  const identity = item && advancedDraftIdentity(item);
  const rawPointer = item?.meta[ADVANCED_DRAFT_META_KEY];
  const candidate = identity ? normalizeAdvancedDraftPointer(rawPointer, identity) : null;
  const pointer = candidate && !advancedDraftPublished(candidate) ? candidate : null;
  const foreign = Boolean(schema && pointer && pointer.schema !== schema);
  const managed = Boolean(schema && recovery?.draftSchema);
  const key = schema && identity ? `${identity.rootId}:${identity.baseRevisionId}:${schema}` : "";
  const latest = useRef({ recovery, revision });
  latest.current = { recovery, revision };
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; phase: "ready" | "applied" | "error"; server?: boolean; updatedAt?: number; restoredRevision?: AdvancedEditRevision }>({ key: "", phase: "ready" });
  const pending = managed && Boolean(key) && (state.key !== key || state.phase === "applied");
  const failed = state.key === key && state.phase === "error";
  // Once this exact base is restored, new draft receipts for our own edits must
  // not re-run restoration. A new base/schema gets a fresh guard.
  const complete = state.key === key && state.phase === "ready";
  const ready = recovery?.ready;
  const generationRef = useRef(0);
  const runningRef = useRef<number | null>(null);

  useEffect(() => {
    generationRef.current += 1;
    runningRef.current = null;
    if (latest.current.recovery) clearAdvancedDraftRestored(draftRecoveryKey(latest.current.recovery));
    return () => { generationRef.current += 1; runningRef.current = null; };
  }, [key, managed, foreign, attempt]);

  useEffect(() => {
    if (!managed || !key || foreign || !ready || complete || failed) return;
    if (state.key === key && state.phase === "applied") {
      if (state.updatedAt !== undefined && recovery) noteAdvancedDraftRestored(draftRecoveryKey(recovery), revision, state.updatedAt);
      setState({ key, phase: "ready", restoredRevision: state.server ? revision : undefined });
      return;
    }
    const generation = generationRef.current;
    if (runningRef.current === generation) return;
    runningRef.current = generation;
    const cancelled = () => generationRef.current !== generation;
    const startRevision = latest.current.revision;
    const active = latest.current.recovery!;
    void (async () => {
      const localKey = draftRecoveryKey(active);
      const records = await Promise.all([localKey, active.key].filter((key, index, keys) => keys.indexOf(key) === index)
        .map(key => readAdvancedRecovery(key).catch(() => null)));
      let local = null as (typeof records)[number];
      for (const record of records) {
        if (!record) continue;
        if (advancedRecoverySupersededBySave(record.key, record.updatedAt)) {
          await deleteAdvancedRecovery(record.key).catch(() => undefined);
        } else if (!local || record.updatedAt > local.updatedAt) local = record;
      }
      const serverTime = pointer ? Date.parse(pointer.savedAt) : 0;
      const useLocal = Boolean(local && (!pointer || local.updatedAt > serverTime));
      // Always validate a matching server pointer before allowing a newer local
      // recovery to replace it; unreadable server data never silently vanishes.
      const serverPayload = pointer ? await loadAdvancedDraft(pointer) : null;
      if (pointer && portableAdvancedDraft(serverPayload) === null) throw new Error(DRAFT_READ_FAILED);
      if (cancelled()) return;
      const current = latest.current;
      if (!Object.is(current.revision, startRevision) || current.recovery?.key !== active.key) throw new Error(DRAFT_READ_FAILED);
      if (!local && !pointer) { setState({ key, phase: "ready" }); return; }
      const payload = useLocal ? local!.payload : serverPayload;
      const savedAt = useLocal ? local!.updatedAt : serverTime;
      const restored = await current.recovery!.restore(payload, savedAt);
      if (cancelled()) return;
      if (restored === false) throw new Error(DRAFT_READ_FAILED);
      if (local && !useLocal) await deleteAdvancedRecovery(local.key).catch(() => undefined);
      if (!cancelled()) setState({ key, phase: "applied", server: !useLocal, updatedAt: savedAt });
    })().catch(() => { if (!cancelled()) setState({ key, phase: "error" }); })
      .finally(() => { if (runningRef.current === generation) runningRef.current = null; });
    // The pointer is consumed once per material base, not on every session ack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, managed, foreign, ready, complete, failed, attempt, state.phase]);

  const retry = useCallback(async () => {
    setState({ key: "", phase: "ready" });
    setAttempt(value => value + 1);
    return { ok: false as const, error: foreign ? DRAFT_OTHER_FACE : DRAFT_READ_FAILED };
  }, [foreign]);
  return {
    paused: foreign || pending || failed || (managed && !ready),
    error: foreign ? DRAFT_OTHER_FACE : failed ? DRAFT_READ_FAILED : undefined,
    restoredRevision: complete ? state.restoredRevision : undefined,
    restoredPointer: complete && state.restoredRevision !== undefined ? pointer ?? undefined : undefined,
    retry,
  };
}
