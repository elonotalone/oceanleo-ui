"use client";

import { capturePortableAdvancedDraft, draftFromRecovery, noteAdvancedDraftPublished } from "./advanced-draft-recovery";
import { DRAFT_READ_FAILED, useAdvancedDraftRestore } from "./advanced-draft-restore";
import { ADVANCED_DRAFT_META_KEY, advancedDraftIdentity, normalizeAdvancedDraftPointer } from "./advanced-draft";
import { bindAdvancedDraftGate } from "./advanced-draft-gates";
import { DRAFT_OTHER_FACE } from "./advanced-draft-restore";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdvancedEditorDraftAdapter, AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";
import { uploadAdvancedDraft, type AdvancedDraftPointer } from "./advanced-draft";
import { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";
import type {
  AdvancedFlushResult,
  AdvancedSessionActions,
} from "./advanced-session-context";
import { handOff, takeBack } from "./advanced-background-saver";
import {
  AdvancedPersistenceController,
  type AdvancedEditRevision,
} from "./advanced-persistence-controller";
import type { LibraryItem } from "./library-data";
import { noteAdvancedSaveSucceeded } from "./use-advanced-recovery";

export type AdvancedAutoSaveState = "saved" | "saving" | "error";
export { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";

function withErrorMessage(result: AdvancedFlushResult): AdvancedFlushResult {
  if (result.ok) return result;
  return {
    ...result,
    errorMessage: mapAutosaveErrorMessage(result),
  };
}

function sameRevision(
  left: AdvancedEditRevision | undefined,
  right: AdvancedEditRevision | undefined,
): boolean {
  return left !== undefined && right !== undefined && Object.is(left, right);
}

/**
 * 一个 hook 实例内、跨控制器重建仍然有效的「同一 revision 只冲刷一次」账本。
 *
 * 控制器本身已经串行（`advanced-persistence-controller.ts`），但它的生命周期
 * 跟着 React effect 走：StrictMode 双跑、依赖抖动都会 dispose 掉一个正在等
 * `flushRevision` 回来的控制器、再 new 一个。新控制器一上来 observe 到同一份
 * dirty/revision，防抖后会**再叫一次** flush——同一份修改上传两遍、creations 两份、
 * 第二份对着已推进的 head 打 409「保存冲突」。账本记两件事：
 *   - `inflight`：这个 revision 的 flush 正在飞 → 直接复用那个 promise；
 *   - `covered`：上一次**成功**的 flush 调用那一刻编辑器已经处在的 revision
 *     → 再被要求冲刷同一 revision 时直接回 ok，不再上传、不再登记 creation。
 * `covered` 在 dirty 从 false 翻回 true 时清空：那是真的新改动，哪怕 revision
 * 号碰巧一样（编辑器换源后计数归零）也必须真存。
 */
class RevisionFlushLedger {
  private inflight: {
    revision: AdvancedEditRevision;
    promise: Promise<AdvancedFlushResult>;
  } | null = null;
  private covered?: AdvancedEditRevision;
  /** 只做证据用：真正调用编辑器 flush 的次数。 */
  flushCalls = 0;

  reuse(revision: AdvancedEditRevision): Promise<AdvancedFlushResult> | null {
    const inflight = this.inflight;
    if (inflight && sameRevision(inflight.revision, revision)) {
      return inflight.promise;
    }
    if (sameRevision(this.covered, revision)) {
      return Promise.resolve({ ok: true });
    }
    return null;
  }

  track(
    revision: AdvancedEditRevision,
    captured: AdvancedEditRevision,
    run: () => Promise<AdvancedFlushResult>,
  ): Promise<AdvancedFlushResult> {
    this.flushCalls += 1;
    const startedAt = Date.now();
    const promise = run()
      .then((result) => {
        if (result.ok) {
          this.covered = captured;
          // 告诉恢复草稿那一侧：这份素材在 startedAt 之前的改动已进云端。
          // 保存成功 → 宿主换素材 → 编辑器重挂 → 新实例读到旧草稿再存一份，
          // 这一环就是在这里被剪断的（见 use-advanced-recovery.ts 顶部）。
          if (result.item) noteAdvancedSaveSucceeded(result.item, startedAt);
        }
        return result;
      })
      .finally(() => {
        if (this.inflight?.promise === promise) this.inflight = null;
      });
    this.inflight = { revision, promise };
    return promise;
  }

  forgetCovered(): void {
    this.covered = undefined;
  }
}

export function useAdvancedAutoSave({
  key: materialKey,
  dirty,
  revision,
  flush,
  draft: explicitDraft,
  recovery,
  item,
  editorId,
  session,
}: {
  key?: string;
  dirty: boolean;
  revision: AdvancedEditRevision;
  flush?: () => Promise<AdvancedFlushResult> | AdvancedFlushResult;
  draft?: AdvancedEditorDraftAdapter;
  recovery?: AdvancedEditorRecoveryAdapter;
  item?: LibraryItem;
  editorId?: string;
  session: AdvancedSessionActions | null;
}) {
  const draft = explicitDraft ?? draftFromRecovery(recovery);
  const key = materialKey && draft ? `${materialKey}:${draft.schema}` : materialKey;
  const restoration = useAdvancedDraftRestore({ item, schema: draft?.schema, recovery, revision });
  const blockedRef = useRef(restoration.paused);
  blockedRef.current = restoration.paused;
  const restoredRevision = restoration.restoredRevision ?? draft?.restoredRevision;
  const restoredPointerRef = useRef(restoration.restoredPointer);
  restoredPointerRef.current = restoration.restoredPointer;
  const openingPointerRef = useRef<AdvancedDraftPointer | null>(null);
  openingPointerRef.current = item ? normalizeAdvancedDraftPointer(item.meta[ADVANCED_DRAFT_META_KEY], advancedDraftIdentity(item)) : null;
  const lastVersionItemRef = useRef<LibraryItem | undefined>(undefined);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const controllerRef = useRef<AdvancedPersistenceController<LibraryItem> | null>(null);
  // A session can be created by the first dirty edit. Let that already-running
  // legacy save finish before enabling drafts on the next observation.
  const currentController = controllerRef.current;
  const draftEnabled = Boolean(draft && session?.sessionId && session.recordDraft &&
    (!currentController || currentController.hasDraftTier() || !currentController.hasUnconfirmedWork()));
  const uploadedDraftRef = useRef<{ revision: AdvancedEditRevision; sessionId: string; pointer: AdvancedDraftPointer } | null>(null);
  const flushRef = useRef(flush);
  const sessionRef = useRef(session);
  const versionSessionsRef = useRef(new Map<AdvancedEditRevision, AdvancedSessionActions | null>());
  const mountedRef = useRef(true);
  const latestRevisionRef = useRef(revision);
  const dirtyRef = useRef(dirty);
  const ledgerRef = useRef<RevisionFlushLedger | null>(null);
  if (!ledgerRef.current) ledgerRef.current = new RevisionFlushLedger();
  const [state, setState] = useState<AdvancedAutoSaveState>("saved");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  flushRef.current = flush;
  sessionRef.current = session;
  latestRevisionRef.current = revision;
  dirtyRef.current = dirty;

  const rememberFlush = useCallback((result: AdvancedFlushResult) => {
    const next = withErrorMessage(result);
    if (mountedRef.current) {
      setErrorMessage(next.ok ? undefined : next.errorMessage);
    }
    return next;
  }, []);

  const saveDraft = useCallback(async (targetRevision: AdvancedEditRevision): Promise<boolean | "full-save"> => {
    if (blockedRef.current) return false;
    const activeDraft = draftRef.current;
    const activeSession = sessionRef.current;
    if (!activeDraft || !activeSession?.sessionId || !activeSession.recordDraft) return false;
    let uploaded = uploadedDraftRef.current;
    if (!uploaded || !sameRevision(uploaded.revision, targetRevision) || uploaded.sessionId !== activeSession.sessionId) {
      const item = activeSession.snapshot().item;
      const payload = await capturePortableAdvancedDraft(activeDraft, targetRevision);
      if (!sameRevision(latestRevisionRef.current, targetRevision)) return false;
      if (blockedRef.current) return false;
      if (payload === null) return "full-save";
      const pointer = await uploadAdvancedDraft({
        identity: { rootId: item.id, baseRevisionId: String(item.revisionId || item.meta.revision_id || item.versionId) },
        schema: activeDraft.schema, revision: targetRevision, payload, siteId: item.siteId, title: item.title,
      });
      uploaded = { revision: targetRevision, sessionId: activeSession.sessionId, pointer };
      uploadedDraftRef.current = uploaded;
    }
    // Pin the destination captured before upload; a navigation must never move
    // this receipt into the next session through a mutable React ref.
    return activeSession.recordDraft(uploaded.pointer);
  }, []);

  const bindController = useCallback(
    (controller: AdvancedPersistenceController<LibraryItem>) => {
      controller.rebind({
        ...(draftEnabled ? { draft: { saveRevision: saveDraft } } : {}),
        flushRevision: (targetRevision) => {
          if (blockedRef.current) return rememberFlush({ ok: false, error: restoration.error || DRAFT_READ_FAILED });
          if (draftEnabled && !versionSessionsRef.current.has(targetRevision)) {
            versionSessionsRef.current.set(targetRevision, sessionRef.current);
          }
          const activeFlush = flushRef.current;
          if (!activeFlush) {
            return rememberFlush({
              ok: false,
              error: "当前编辑器无法保存未提交修改",
            });
          }
          const ledger = ledgerRef.current!;
          const reused = ledger.reuse(targetRevision);
          if (reused) return reused;
          // 编辑器的 flush 存的是「此刻」的文档，不是控制器点名的那个 revision；
          // 记下此刻的 revision 作为这次成功能覆盖到的范围。
          const captured = latestRevisionRef.current;
          return ledger.track(targetRevision, captured, async () =>
            rememberFlush(await activeFlush()),
          );
        },
        recordSavedItem: async (item, coveredRevision) => {
          const activeSession = draftEnabled ? versionSessionsRef.current.get(coveredRevision) : sessionRef.current;
          const recorded = activeSession ? await (draftEnabled
            ? activeSession.recordSavedItem(item, coveredRevision, { schema: draftRef.current!.schema, restored: restoredPointerRef.current })
            : activeSession.recordSavedItem(item)) : true;
          if (recorded) versionSessionsRef.current.delete(coveredRevision);
          if (recorded) lastVersionItemRef.current = item;
          const opening = openingPointerRef.current;
          if (recorded && opening && opening.schema === draftRef.current?.schema &&
              opening.baseRevisionId !== advancedDraftIdentity(item).baseRevisionId) noteAdvancedDraftPublished(opening);
          return recorded;
        },
        onStateChange: (next) => {
          if (!mountedRef.current) return;
          setState(next);
          if (next === "saved") setErrorMessage(undefined);
        },
      });
    },
    [draftEnabled, rememberFlush, saveDraft],
  );

  const makeController = useCallback(() => {
    const controller = new AdvancedPersistenceController<LibraryItem>({
      ...(draftEnabled ? { draft: { saveRevision: saveDraft } } : {}),
      flushRevision: async () => ({
        ok: false,
        error: "自动保存控制器尚未绑定",
      }),
      recordSavedItem: async () => true,
    });
    bindController(controller);
    return controller;
  }, [bindController, draftEnabled, saveDraft]);
  if (!controllerRef.current) controllerRef.current = makeController();

  useEffect(() => {
    mountedRef.current = true;
    const taken = key ? takeBack(key, draftEnabled) : null;
    if (taken && taken !== controllerRef.current) {
      controllerRef.current?.dispose();
      controllerRef.current = taken;
    } else if (!controllerRef.current) {
      controllerRef.current = makeController();
    }
    const controller = controllerRef.current;
    if (controller) {
      bindController(controller);
      setState(controller.snapshot().state);
      if (!blockedRef.current) controller.observe({
        revision: latestRevisionRef.current,
        dirty: dirtyRef.current,
        restoredDraft: draftEnabled && sameRevision(restoredRevision, latestRevisionRef.current),
      });
    }
    return () => {
      mountedRef.current = false;
      const active = controllerRef.current;
      controllerRef.current = null;
      if (!active) return;
      if (active.isHandedOff()) return;
      if (key && active.hasUnconfirmedWork() && !blockedRef.current) {
        handOff(key, active);
        return;
      }
      active.dispose();
    };
  }, [bindController, draftEnabled, key, makeController]);

  const wasDirtyRef = useRef(dirty);
  useEffect(() => {
    // 干净 → 脏 = 用户真的又改了；上一轮成功覆盖到的 revision 不再作数。
    if (dirty && !wasDirtyRef.current) ledgerRef.current?.forgetCovered();
    wasDirtyRef.current = dirty;
    if (blockedRef.current) return;
    controllerRef.current?.observe({ revision, dirty,
      restoredDraft: draftEnabled && sameRevision(restoredRevision, revision),
    });
  }, [dirty, restoredRevision, draftEnabled, revision, restoration.paused]);

  const flushLatest = useCallback(
    async (): Promise<AdvancedFlushResult> =>
      blockedRef.current ? { ok: false, error: restoration.error || DRAFT_READ_FAILED } :
      rememberFlush(
        (await controllerRef.current?.flushLatest()) ?? {
          ok: false,
          error: "自动保存控制器不可用",
        },
      ),
    [rememberFlush, restoration.error],
  );
  const retry = useCallback(
    async (): Promise<AdvancedFlushResult> =>
      blockedRef.current ? restoration.retry() :
      rememberFlush(
        (await controllerRef.current?.retry()) ?? {
          ok: false,
          error: "自动保存控制器不可用",
        },
      ),
    [rememberFlush, restoration.retry],
  );
  const handOffToBackground = useCallback(() => {
    const controller = controllerRef.current;
    if (!key || !controller || !controller.hasUnconfirmedWork() || blockedRef.current) return;
    controller.markHandedOff();
    handOff(key, controller);
  }, [key]);

  useEffect(() => {
    if (!draftEnabled || !draft?.bindFlush) return;
    draft.bindFlush(flushLatest);
    return () => draft.bindFlush?.(null);
  }, [draft?.bindFlush, draftEnabled, flushLatest]);

  useEffect(() => {
    if (!materialKey || !draft) return;
    const gate: Parameters<typeof bindAdvancedDraftGate>[1] = async (reason) => {
      // Entering the face that owns the server draft is how the user resolves
      // this guard. Do not publish the other face's old working document.
      if (reason === "handoff" && restoration.error === DRAFT_OTHER_FACE) return { ok: true, item };
      const saved = await flushLatest();
      if (!saved.ok) return saved;
      const committed = saved.item ?? lastVersionItemRef.current;
      if (!committed) return saved;
      const meta = { ...committed.meta };
      delete meta[ADVANCED_DRAFT_META_KEY];
      return { ok: true, item: { ...committed, meta } };
    };
    const unbind = bindAdvancedDraftGate(materialKey, gate);
    // The five media mode gates use their established plugin:artifact key.
    const plugin = editorId === "chart-editor@1" ? "chart-editor" : editorId;
    const mediaKey = plugin && item ? `${plugin}:${item.artifactId || item.id}` : undefined;
    const unbindMedia = mediaKey && mediaKey !== materialKey ? bindAdvancedDraftGate(mediaKey, gate) : undefined;
    return () => { unbind(); unbindMedia?.(); };
  }, [materialKey, editorId, draft?.schema, flushLatest, item, restoration.error]);

  useEffect(() => {
    if (!draftEnabled) return;
    const onPageHide = () => { if (!blockedRef.current) void controllerRef.current?.flushLatest(); };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [draftEnabled]);

  return { state: restoration.error ? "error" as const : restoration.paused ? "saving" as const : state,
    errorMessage: restoration.error || errorMessage, flushLatest, retry, handOffToBackground };
}
