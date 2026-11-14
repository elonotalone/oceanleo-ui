"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AdvancedEditorDraftAdapter, AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";
import type { AdvancedFlushResult, AdvancedSessionActions } from "./advanced-session-context";
import type { CollabRoom } from "./collab";
import type { LibraryItem } from "./library-data";
import { bindAdvancedDraftGate } from "./advanced-draft-gates";
import { createBackgroundPublisher, waitForClosingWorkingCopy, type Publication } from "./advanced-background-saver";
import { subscribeUserEditSession, userMutationGeneration, userMutationAt } from "./user-edit-session";
import { WORKING_COPY_CONFLICT, WorkingCopyError, WorkingCopySaver, workingCopyRoot, workingCopyTransport, type WorkingCopySnapshot } from "./editor-working-copy";
export { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";
export type AdvancedAutoSaveState = "saved" | "saving" | "error";

interface Input {
  key?: string; writer?: boolean; shared?: boolean; room?: CollabRoom | null; dirty: boolean; revision: string | number;
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
  const mutationGeneration = useSyncExternalStore(subscribeUserEditSession,
    () => userMutationGeneration(input.key || "") + (root !== input.key ? userMutationGeneration(root || "") : 0), () => 0);
  const baseline = useRef({ identity: sources.current.identity, generation: mutationGeneration, revision: input.revision });
  if (baseline.current.identity !== sources.current.identity || mutationGeneration < baseline.current.generation)
    baseline.current = { identity: sources.current.identity, generation: mutationGeneration, revision: input.revision };
  const [roomRevision, setRoomRevision] = useState(0);
  const roomRevisionRef = useRef(0);
  const peerBaseline = useRef({ identity: sources.current.identity, revision: roomRevision });
  if (peerBaseline.current.identity !== sources.current.identity) peerBaseline.current = { identity: sources.current.identity, revision: roomRevision };
  if (input.writer !== false) {
    baseline.current.generation = mutationGeneration;
    baseline.current.revision = input.revision;
    peerBaseline.current.revision = roomRevision;
  }
  const blockedPeer = Boolean(input.shared && input.writer === false && (mutationGeneration > baseline.current.generation ||
    (!input.room && !Object.is(input.revision, baseline.current.revision)) || roomRevision > peerBaseline.current.revision));
  const local = input.destination === "local-device";
  const available = Boolean(input.writer !== false && (input.recovery || local) && root);
  const ready = Boolean(input.writer !== false && (input.recovery ? input.recovery.ready : local) && root);
  const [view, setView] = useState<WorkingCopySnapshot>({ state: ready ? "saving" : "saved", error: "", seq: null, pending: false });
  useEffect(() => {
    const room = input.room;
    if (!room) return;
    const changed = (_update: Uint8Array, origin: unknown) => {
      // A room sync acknowledgement is not a working-copy receipt. Also
      // observe local Yjs edits when the editor omits its mutation-feed event.
      const current = rendered.current;
      if (current.writer === false ? origin === room || (current.recovery && !current.recovery.ready) : origin !== room) return;
      roomRevisionRef.current += 1;
      setRoomRevision(roomRevisionRef.current);
    };
    room.doc.on("update", changed);
    return () => { room.doc.off("update", changed); };
  }, [input.room]);
  const active = useRef<{
    root: string; saver: WorkingCopySaver; publisher: ReturnType<typeof createBackgroundPublisher>;
    revision: string | number; roomRevision: number; initialized: boolean; mutations: number; initialize: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (!available || !root) return;
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
    const initialMutations = userMutationGeneration(initial.key || "") + (root !== initial.key ? userMutationGeneration(root) : 0);
    const saver = new WorkingCopySaver({ transport, schema, baseRevision: base,
      baseSavedAt: Date.parse(String(initial.item?.meta?.revision_created_at || initial.item?.createdAt || "")),
      capture: () => source.current.recovery?.capture() ?? (local ? {} : null),
      restore: async (doc, at) => {
        const currentMutations = userMutationGeneration(source.current.key || "") + (root !== source.current.key ? userMutationGeneration(root) : 0);
        if (currentMutations > initialMutations) { saver.edit(); throw new WorkingCopyError(WORKING_COPY_CONFLICT, 409); }
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
    const slot = { root, saver, publisher, revision: initial.revision, roomRevision: roomRevisionRef.current, initialized: false, mutations: initialMutations,
      initialize: async () => {
        await saver.initialize();
        if (active.current !== slot || slot.initialized || saver.snapshot().state === "error" || saver.snapshot().state === "conflict") return;
        // Source/room hydration and recovery may change dirty/revision. They are
        // the open handshake, not edits competing with the copy just read.
        slot.initialized = true;
        slot.revision = source.current.revision;
        slot.roomRevision = roomRevisionRef.current;
        const currentMutations = userMutationGeneration(source.current.key || "") + (root !== source.current.key ? userMutationGeneration(root) : 0);
        if (currentMutations > slot.mutations) { slot.mutations = currentMutations; saver.edit(userMutationAt(source.current.key || root)); }
        update();
      },
    };
    active.current = slot;
    const update = () => { if (active.current === slot && !restoring) setView(saver.snapshot()); };
    const unsubscribe = saver.subscribe(update);
    update();
    const initiallyReady = Boolean(initial.recovery?.ready || local);
    if (initiallyReady) void slot.initialize();
    return () => {
      unsubscribe();
      if (active.current === slot) active.current = null;
      publisher.close();
    };
  }, [root, schema, available, latest, local]);

  useLayoutEffect(() => {
    const slot = active.current;
    if (!ready || !slot || slot.root !== root) return;
    if (!slot.initialized) {
      if (mutationGeneration > slot.mutations) {
        slot.mutations = mutationGeneration;
        slot.saver.edit(userMutationAt(input.key || root || ""));
      }
      if (slot.saver.snapshot().state !== "error" && slot.saver.snapshot().state !== "conflict") void slot.initialize();
      return;
    }
    const remoteChanged = slot.roomRevision !== roomRevision;
    if (Object.is(slot.revision, input.revision) && !remoteChanged) return;
    if (input.dirty || remoteChanged) {
      slot.revision = input.revision;
      slot.roomRevision = roomRevision;
      slot.publisher.cancelIdle();
      slot.saver.edit(remoteChanged ? undefined : userMutationAt(input.key || root || ""));
    }
  }, [input.dirty, input.revision, input.key, root, ready, roomRevision, mutationGeneration, view.state]);

  const flushLatest = useCallback(async (): Promise<AdvancedFlushResult> => {
    if (blockedPeer) return { ok: false, error: WORKING_COPY_CONFLICT };
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
  }, [latest, blockedPeer]);
  const retry = useCallback(async (): Promise<AdvancedFlushResult> => {
    const saver = active.current?.saver;
    if (blockedPeer || saver?.snapshot().state === "conflict") { window.location.reload(); return { ok: false, error: "保存冲突" }; }
    if (!saver) return flushLatest();
    return await saver.retry() ? { ok: true } : { ok: false, error: saver.snapshot().error };
  }, [blockedPeer, flushLatest]);
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
  return { state: blockedPeer ? "error" as const : !ready && input.sharedSaveState ? input.sharedSaveState : input.writer !== false && input.recovery && !ready ? "saving" : (view.state === "conflict" ? "error" : view.state) as AdvancedAutoSaveState,
    pending: blockedPeer || view.pending || Boolean(input.sharedSavePending),
    errorMessage: blockedPeer ? WORKING_COPY_CONFLICT : (!ready && input.sharedSaveState === "error") ? "网络不通，稍后自动重试" : view.error, conflict: blockedPeer || view.state === "conflict", flushLatest, retry, handOffToBackground };
}
