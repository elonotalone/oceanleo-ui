"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdvancedEditorDraftAdapter, AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";
import type { AdvancedFlushResult, AdvancedSessionActions } from "./advanced-session-context";
import type { LibraryItem } from "./library-data";
import { bindAdvancedDraftGate } from "./advanced-draft-gates";
import { createBackgroundPublisher, waitForClosingWorkingCopy, type Publication } from "./advanced-background-saver";
import { WorkingCopySaver, workingCopyRoot, workingCopyTransport, type WorkingCopySnapshot } from "./editor-working-copy";
export { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";
export type AdvancedAutoSaveState = "saved" | "saving" | "error";

interface Input {
  key?: string; dirty: boolean; revision: string | number;
  flush?: Publication; preparePublish?: () => Publication;
  draft?: AdvancedEditorDraftAdapter; recovery?: AdvancedEditorRecoveryAdapter;
  item?: LibraryItem; editorId?: string; destination?: "cloud" | "local-device"; sharedSaveState?: AdvancedAutoSaveState; sharedSavePending?: boolean; session: AdvancedSessionActions | null;
}
export function useAdvancedAutoSave(input: Input) {
  const rendered = useRef(input);
  rendered.current = input;
  const root = input.item ? workingCopyRoot(input.item) : input.key;
  const schema = input.recovery?.draftSchema || input.draft?.schema || `oceanleo.${input.editorId}.edit.v1`;
  const sources = useRef({ identity: `${root}:${schema}`, source: { current: input } });
  if (sources.current.identity !== `${root}:${schema}`) sources.current = { identity: `${root}:${schema}`, source: { current: input } };
  sources.current.source.current = input;
  const latest = sources.current.source;
  const local = input.destination === "local-device";
  const ready = Boolean((input.recovery?.ready || local) && root);
  const [view, setView] = useState<WorkingCopySnapshot>({ state: ready ? "saving" : "saved", error: "", seq: null, pending: false });
  const active = useRef<{
    root: string; saver: WorkingCopySaver; publisher: ReturnType<typeof createBackgroundPublisher>;
    revision: string | number;
  } | null>(null);

  useEffect(() => {
    if (!ready || !root) return;
    // The source slot remains tied to this item when another item opens.
    const source = latest;
    const initial = source.current;
    const base = String(initial.item?.revisionId || initial.item?.meta?.revision_id || "") || null;
    const cloudTransport = workingCopyTransport(root, schema, base);
    const transport = local ? {
      get: async () => null,
      put: async (_doc: unknown, seq: number | null) => {
        const result = await source.current.flush?.();
        if (!result?.ok) throw new Error(result?.errorMessage || result?.error || "保存失败，请重试");
        return { ok: true as const, seq: (seq ?? 0) + 1, saved_at: new Date().toISOString(), server_ms: 0 };
      },
      published: async () => {},
    } : { ...cloudTransport, get: async () => { await waitForClosingWorkingCopy(root); return cloudTransport.get(); } };
    let publisher: ReturnType<typeof createBackgroundPublisher>;
    let restoring = false;
    const saver = new WorkingCopySaver({ transport, schema, baseRevision: base,
      baseSavedAt: Date.parse(String(initial.item?.meta?.revision_created_at || initial.item?.createdAt || "")),
      capture: () => source.current.recovery?.capture() ?? (local ? {} : null),
      restore: async (doc, at) => {
        restoring = true;
        try { return await source.current.recovery!.restore(doc, at); }
        finally {
          // Restore changes the editor model, but is already acknowledged by the server.
          if (active.current?.saver === saver) active.current.revision = source.current.revision;
          restoring = false;
        }
      },
      onSaved: () => { if (!local) publisher.saved(); },
      events: typeof window !== "undefined" ? window : undefined,
    });
    publisher = createBackgroundPublisher({ root, saver, transport,
      prepare: () => {
        if (local) return () => ({ ok: true });
        const current = source.current;
        const revision = current.revision;
        const record = current.session?.recordSavedItem;
        const run = current.preparePublish?.() ?? (() => current.flush?.() ?? { ok: false, error: "保存失败，请重试" });
        let receipt: AdvancedFlushResult | undefined;
        return async () => {
          const result = receipt?.ok ? receipt : await run();
          if (result.ok) receipt = result;
          if (result.ok && result.item && record && !await record(result.item, revision)) return { ok: false, error: "文件保存或任务文件记录更新失败，请重试。" };
          return result;
        };
      },
      record: async () => {},
    });
    const slot = { root, saver, publisher, revision: initial.revision };
    active.current = slot;
    const update = () => { if (active.current === slot && !restoring) setView(saver.snapshot()); };
    const unsubscribe = saver.subscribe(update);
    update();
    if (initial.dirty) saver.edit();
    void saver.initialize().then(() => {
      if (active.current !== slot) return;
      slot.revision = latest.current.revision;
      update();
    });
    return () => {
      unsubscribe();
      if (active.current === slot) active.current = null;
      publisher.close();
    };
  }, [root, schema, ready, latest, local]);

  useEffect(() => {
    const slot = active.current;
    if (!slot || slot.root !== root || Object.is(slot.revision, input.revision)) return;
    slot.revision = input.revision;
    if (input.dirty) { slot.publisher.cancelIdle(); slot.saver.edit(); }
  }, [input.dirty, input.revision, root]);

  const flushLatest = useCallback(async (): Promise<AdvancedFlushResult> => {
    const slot = active.current;
    if (slot) {
      if (!Object.is(slot.revision, latest.current.revision)) {
        slot.revision = latest.current.revision;
        if (latest.current.dirty) slot.saver.edit();
      }
      return slot.publisher.flushLatest();
    }
    const captured = rendered.current;
    const result = await (captured.flush?.() ?? { ok: false as const, error: "保存失败，请重试" });
    // Mounted serializers may adopt their own receipt in the flush callback.
    // Let that render commit before deciding whether it is safe to close.
    await Promise.resolve();
    await Promise.resolve();
    const current = rendered.current;
    if (!result.ok || current === captured) return result;
    const rootOf = (value: Input) => value.item ? workingCopyRoot(value.item) : value.key;
    if (current.key !== captured.key || rootOf(current) !== rootOf(captured)) return { ok: false, error: "编辑文档已切换，请重试保存" };
    if (current.revision !== captured.revision || current.item?.revisionId !== captured.item?.revisionId) {
      if (current.dirty || !result.item || workingCopyRoot(result.item) !== rootOf(current) || result.item.revisionId !== current.item?.revisionId) return { ok: false, error: "编辑文档已切换，请重试保存" };
    }
    return result;
  }, [latest]);
  const retry = useCallback(async (): Promise<AdvancedFlushResult> => {
    const saver = active.current?.saver;
    if (saver?.snapshot().state === "conflict") { window.location.reload(); return { ok: false, error: "保存冲突" }; }
    if (!saver) return flushLatest();
    return await saver.retry() ? { ok: true } : { ok: false, error: saver.snapshot().error };
  }, [flushLatest]);
  const handOffToBackground = useCallback(() => {
    const slot = active.current;
    if (!slot) return;
    if (!Object.is(slot.revision, latest.current.revision)) {
      slot.revision = latest.current.revision;
      if (latest.current.dirty) slot.saver.edit();
    }
    slot.publisher.close();
  }, [latest]);
  useEffect(() => {
    if (!root || !active.current) return;
    const gate = () => flushLatest();
    const keys = new Set([input.key, input.item?.key, input.item?.id, root,
      input.item && `${input.editorId}:${root}`].filter(Boolean) as string[]);
    const unbind = [...keys].map((key) => bindAdvancedDraftGate(key, gate));
    input.draft?.bindFlush?.(flushLatest);
    return () => { unbind.forEach((fn) => fn()); input.draft?.bindFlush?.(null); };
  }, [root, ready, flushLatest, input.key, input.item?.key, input.item?.id, input.editorId, input.draft, input.item]);
  return { state: !ready && input.sharedSaveState ? input.sharedSaveState : (view.state === "conflict" ? "error" : view.state) as AdvancedAutoSaveState,
    pending: view.pending || Boolean(input.sharedSavePending),
    errorMessage: (!ready && input.sharedSaveState === "error") ? "网络不通，稍后自动重试" : view.error, conflict: view.state === "conflict", flushLatest, retry, handOffToBackground };
}
