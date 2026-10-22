"use client";

import {
  advancedLocalRecoveryPromotion,
  capturePortableAdvancedDraft,
  clearAdvancedLocalRecoveryPromotion,
  draftFromRecovery,
  noteAdvancedDraftPublished,
  subscribeAdvancedLocalRecovery,
  type AdvancedLocalRecoveryPromotion,
} from "./advanced-draft-recovery";
import { DRAFT_READ_FAILED, useAdvancedDraftRestore } from "./advanced-draft-restore";
import { ADVANCED_DRAFT_META_KEY, advancedDraftIdentity, normalizeAdvancedDraftPointer } from "./advanced-draft";
import { bindAdvancedDraftGate } from "./advanced-draft-gates";
import { DRAFT_OTHER_FACE } from "./advanced-draft-restore";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  subscribeUserEditSession,
  userMutationGeneration,
} from "./user-edit-session";
import type { AdvancedEditorDraftAdapter, AdvancedEditorRecoveryAdapter } from "./advanced-editor-adapter";
import { uploadAdvancedDraft, type AdvancedDraftPointer } from "./advanced-draft";
import { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";
import type {
  AdvancedFlushResult,
  AdvancedSessionActions,
} from "./advanced-session-context";
import { subscribeAutosaveNudges } from "./advanced-autosave-nudge";
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

function localRecoveryReceiptCovers(
  receiptRevision: AdvancedEditRevision,
  restoredRevision: AdvancedEditRevision,
): boolean {
  if (Object.is(receiptRevision, restoredRevision)) return true;
  // Numeric editor revisions are monotonic within one editor lifetime. For
  // opaque string revisions, equality is the only safe coverage proof.
  return typeof receiptRevision === "number" &&
    typeof restoredRevision === "number" &&
    Number.isFinite(receiptRevision) &&
    Number.isFinite(restoredRevision) &&
    receiptRevision > restoredRevision;
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

interface ControllerSourceLifetime { key: string | undefined; current: boolean }

function sourceItemIdentity(item: LibraryItem): string {
  const meta = item.meta || {};
  return JSON.stringify([item.source, item.key, item.id, item.url,
    item.revisionId, meta.revision_id, meta.version_id]);
}

function sourceItemRoot(item: LibraryItem | undefined): string {
  return String(item?.artifactId || item?.meta?.root_asset_id ||
    item?.meta?.parent_asset_id || item?.id || item?.key || "");
}

/** Background callbacks keep the refs of their source, not the next render. */
function useSourceRef<T>(lifetime: ControllerSourceLifetime, initial: T) {
  const slot = useRef({ lifetime, ref: { current: initial } });
  if (slot.current.lifetime !== lifetime) slot.current = { lifetime, ref: { current: initial } };
  return slot.current.ref;
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
  // A saved-item receipt can replace the current item while its old controller
  // is still completing the same drain. Do not let the next item lifetime
  // take that controller back: its revision number and flush closure belong to
  // the previous source document, and observing the new lifetime's revision 0
  // would make the old drain publish the same document a second time.
  const controllerKey = key && item
    ? `${key}:${sourceItemIdentity(item)}`
    : key;
  const sourceLifetimeRef = useRef<ControllerSourceLifetime>({ key: controllerKey, current: true });
  if (sourceLifetimeRef.current.key !== controllerKey) {
    sourceLifetimeRef.current.current = false;
    sourceLifetimeRef.current = { key: controllerKey, current: true };
  }
  const sourceLifetime = sourceLifetimeRef.current;
  const userEditKey = materialKey || "";
  const userMutationGen = useSyncExternalStore(
    subscribeUserEditSession,
    () => userMutationGeneration(userEditKey),
    () => 0,
  );
  const userEdited = userMutationGen > 0;
  const localRecoveryKey = recovery && !recovery.draftSchema ? recovery.key : "";
  const subscribedLocalPromotion = useSyncExternalStore(
    subscribeAdvancedLocalRecovery,
    () => localRecoveryKey ? advancedLocalRecoveryPromotion(localRecoveryKey) : undefined,
    () => undefined,
  );
  const recoveryPromotionBaselineRef = useRef({
    key: localRecoveryKey,
    token: subscribedLocalPromotion?.token ?? 0,
  });
  if (recoveryPromotionBaselineRef.current.key !== localRecoveryKey) {
    recoveryPromotionBaselineRef.current = {
      key: localRecoveryKey,
      token: subscribedLocalPromotion?.token ?? 0,
    };
  }
  // A promotion already present when this editor lifetime mounted belongs to
  // an earlier lifetime. A new restore publishes a larger token after mount.
  const localPromotion = subscribedLocalPromotion &&
    subscribedLocalPromotion.token > recoveryPromotionBaselineRef.current.token
    ? subscribedLocalPromotion
    : undefined;
  const registeredLocalPromotionRef = useSourceRef<AdvancedLocalRecoveryPromotion | undefined>(sourceLifetime, subscribedLocalPromotion);
  registeredLocalPromotionRef.current = subscribedLocalPromotion;
  const recoveredLocalDraft = Boolean(
    dirty && localPromotion && Object.is(localPromotion.revision, revision),
  );
  const restoration = useAdvancedDraftRestore({ item, schema: draft?.schema, recovery, revision });
  const blockedRef = useSourceRef(sourceLifetime, restoration.paused);
  blockedRef.current = restoration.paused;
  const restoredRevision = restoration.restoredRevision ?? draft?.restoredRevision;
  const restoredPointerRef = useSourceRef(sourceLifetime, restoration.restoredPointer);
  restoredPointerRef.current = restoration.restoredPointer;
  const openingPointerRef = useSourceRef<AdvancedDraftPointer | null>(sourceLifetime, null);
  openingPointerRef.current = item ? normalizeAdvancedDraftPointer(item.meta[ADVANCED_DRAFT_META_KEY], advancedDraftIdentity(item)) : null;
  const lastVersionItemRef = useSourceRef<LibraryItem | undefined>(sourceLifetime, undefined);
  const draftRef = useSourceRef(sourceLifetime, draft);
  draftRef.current = draft;
  const controllerRef = useRef<AdvancedPersistenceController<LibraryItem> | null>(null);
  // A session can be created by the first dirty edit. Let that already-running
  // legacy save finish before enabling drafts on the next observation.
  const currentController = controllerRef.current;
  const draftEnabled = Boolean(draft && session?.sessionId && session.recordDraft &&
    (!currentController || currentController.hasDraftTier() || !currentController.hasUnconfirmedWork()));
  const uploadedDraftRef = useSourceRef<{ revision: AdvancedEditRevision; sessionId: string; pointer: AdvancedDraftPointer } | null>(sourceLifetime, null);
  const flushRef = useSourceRef(sourceLifetime, flush);
  const sessionRef = useSourceRef(sourceLifetime, session);
  const versionSessionsRef = useSourceRef(sourceLifetime, new Map<AdvancedEditRevision, AdvancedSessionActions | null>());
  // Pin the exact emergency-restore marker at the beginning of a full save.
  // A later restore with the same stable-root key must not be cleared by this
  // operation's receipt, even if its editor revision has reset.
  const versionRecoveryReceiptsRef = useSourceRef(sourceLifetime,
    new Map<AdvancedEditRevision, {
      promotion?: AdvancedLocalRecoveryPromotion;
      startedAt: number;
    }>(),
  );
  const mountedRef = useRef(true);
  const latestRevisionRef = useSourceRef(sourceLifetime, revision);
  const ledgerRef = useSourceRef<RevisionFlushLedger | null>(sourceLifetime, null);
  if (!ledgerRef.current) ledgerRef.current = new RevisionFlushLedger();
  const [state, setState] = useState<AdvancedAutoSaveState>("saved");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  flushRef.current = flush;
  sessionRef.current = session;
  latestRevisionRef.current = revision;
  const observation = { controllerKey, persistenceKey: key,
    itemIdentity: item ? sourceItemIdentity(item) : "", root: sourceItemRoot(item),
    paused: restoration.paused, input: {
    revision, dirty, restoredDraft: draftEnabled && sameRevision(restoredRevision, revision),
    userEdited, userMutationGeneration: userMutationGen, recoveredLocalDraft,
    itemKey: userEditKey || undefined,
  } };
  const observationRef = useRef(observation);
  observationRef.current = observation;
  const activeControllerKeyRef = useRef(controllerKey);
  const wasDirtyRef = useSourceRef(sourceLifetime, dirty);
  const wasUserEditedRef = useSourceRef(sourceLifetime, userEdited);

  const observeLatestController = useCallback(() => {
    const latest = observationRef.current;
    // Before the lifetime effect has switched sources, the old controller must
    // never observe or flush the newly rendered document's revision/closure.
    if (!sourceLifetime.current || blockedRef.current || activeControllerKeyRef.current !== latest.controllerKey) return null;
    const controller = controllerRef.current;
    if (!controller) return null;
    const input = latest.input;
    // Use this same boundary for passive autosave and explicit close/send gates.
    // A layout/event gate can run before React's passive observe effect.
    if (input.userEdited && !wasUserEditedRef.current) ledgerRef.current?.forgetCovered();
    if (input.dirty && !wasDirtyRef.current && input.userEdited) ledgerRef.current?.forgetCovered();
    wasDirtyRef.current = input.dirty;
    wasUserEditedRef.current = input.userEdited;
    controller.observe(input);
    return controller;
  }, [sourceLifetime]);

  const rememberFlush = useCallback((result: AdvancedFlushResult) => {
    const next = withErrorMessage(result);
    if (mountedRef.current && sourceLifetime.current) {
      setErrorMessage(next.ok ? undefined : next.errorMessage);
    }
    return next;
  }, [sourceLifetime]);

  const saveDraft = useCallback(async (targetRevision: AdvancedEditRevision): Promise<boolean | "full-save"> => {
    if (blockedRef.current) return false;
    const activeDraft = draftRef.current;
    const activeSession = sessionRef.current;
    if (!activeDraft || !activeSession?.sessionId || !activeSession.recordDraft) return false;
    const promotion = registeredLocalPromotionRef.current;
    const recoveryReceiptStartedAt = Date.now();
    const recoveryReceipt = promotion && localRecoveryReceiptCovers(targetRevision, promotion.revision)
      ? promotion
      : undefined;
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
    const recorded = await activeSession.recordDraft(uploaded.pointer);
    if (
      recorded &&
      recoveryReceipt &&
      recoveryReceiptStartedAt >= recoveryReceipt.updatedAt &&
      sameRevision(targetRevision, latestRevisionRef.current)
    ) {
      clearAdvancedLocalRecoveryPromotion(recoveryReceipt.key, {
        updatedAt: recoveryReceipt.updatedAt,
        token: recoveryReceipt.token,
      });
    }
    return recorded;
  }, [sourceLifetime]);

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
          const promotion = registeredLocalPromotionRef.current;
          const recoveryReceiptStartedAt = Date.now();
          const pinnedReceipt = {
            promotion: promotion && recoveryReceiptStartedAt >= promotion.updatedAt
              ? promotion
              : undefined,
            startedAt: recoveryReceiptStartedAt,
          };
          // The persistence controller records its requested revision, while
          // the editor flush can cover the latest captured revision. Keep the
          // same pinned marker reachable by either receipt identity.
          versionRecoveryReceiptsRef.current.set(targetRevision, pinnedReceipt);
          versionRecoveryReceiptsRef.current.set(captured, pinnedReceipt);
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
          if (recorded) {
            const pinnedRecoveryReceipt = versionRecoveryReceiptsRef.current.get(coveredRevision);
            if (
              pinnedRecoveryReceipt?.promotion &&
              pinnedRecoveryReceipt.startedAt >= pinnedRecoveryReceipt.promotion.updatedAt &&
              sameRevision(coveredRevision, latestRevisionRef.current)
            ) {
              clearAdvancedLocalRecoveryPromotion(pinnedRecoveryReceipt.promotion.key, {
                updatedAt: pinnedRecoveryReceipt.promotion.updatedAt,
                token: pinnedRecoveryReceipt.promotion.token,
              });
            }
            if (pinnedRecoveryReceipt) {
              for (const [revision, receipt] of versionRecoveryReceiptsRef.current) {
                if (receipt === pinnedRecoveryReceipt) versionRecoveryReceiptsRef.current.delete(revision);
              }
            } else {
              versionRecoveryReceiptsRef.current.delete(coveredRevision);
            }
          }
          const opening = openingPointerRef.current;
          if (recorded && opening && opening.schema === draftRef.current?.schema &&
              opening.baseRevisionId !== advancedDraftIdentity(item).baseRevisionId) noteAdvancedDraftPublished(opening);
          return recorded;
        },
        onStateChange: (next) => {
          if (!mountedRef.current || !sourceLifetime.current) return;
          setState(next);
          if (next === "saved") setErrorMessage(undefined);
        },
      });
    },
    [draftEnabled, rememberFlush, saveDraft, sourceLifetime],
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
    const taken = controllerKey ? takeBack(controllerKey, draftEnabled) : null;
    if (taken && taken !== controllerRef.current) {
      controllerRef.current?.dispose();
      controllerRef.current = taken;
    } else if (!controllerRef.current) {
      controllerRef.current = makeController();
    }
    const controller = controllerRef.current;
    if (controller) {
      activeControllerKeyRef.current = controllerKey;
      bindController(controller);
      setState(controller.snapshot().state);
      observeLatestController();
    }
    return () => {
      mountedRef.current = false;
      const active = controllerRef.current;
      controllerRef.current = null;
      if (!active) return;
      if (active.isHandedOff()) return;
      if (controllerKey && active.hasUnconfirmedWork() && !blockedRef.current) {
        handOff(controllerKey, active);
        return;
      }
      active.dispose();
    };
  }, [bindController, controllerKey, draftEnabled, makeController, observeLatestController]);

  // Back online / tab visible / signed in again: skip the remaining backoff.
  useEffect(
    () => subscribeAutosaveNudges((reason) => {
      if (!blockedRef.current) controllerRef.current?.nudge(reason);
    }),
    [],
  );

  useEffect(() => {
    observeLatestController();
  }, [dirty, restoredRevision, draftEnabled, revision, restoration.paused, userEdited, userMutationGen, userEditKey, recoveredLocalDraft, observeLatestController]);

  const drainLatest = useCallback(async (retrying = false): Promise<AdvancedFlushResult> => {
    for (;;) {
      const controller = observeLatestController();
      if (!controller) return { ok: false, error: "自动保存控制器不可用" };
      const captured = observationRef.current;
      const result = await (retrying ? controller.retry() : controller.flushLatest());
      if (!result.ok) return result;
      // A newer render can land while the previous receipt is completing but
      // before its passive effect. Do not let that receipt close over new work.
      const latest = observationRef.current;
      if (!sourceLifetime.current || blockedRef.current || controllerRef.current !== controller ||
          captured.controllerKey !== latest.controllerKey) {
        const saved = result.item;
        // A flush may adopt its own receipt before resolving. That exact new
        // pin is safe only when it is the same root/tier and already clean.
        // A different file, different receipt or newer dirty edit still fails.
        if (saved && (saved.revisionId || saved.meta?.revision_id || saved.meta?.version_id) &&
            !latest.paused && !latest.input.dirty && captured.root &&
            captured.root === sourceItemRoot(saved) &&
            captured.persistenceKey === latest.persistenceKey &&
            latest.itemIdentity === sourceItemIdentity(saved)) return result;
        return { ok: false, error: "编辑文档已切换，请重试保存" };
      }
      // Do not reassert a same-revision dirty prop after the controller just
      // acknowledged it. Editors may clear that prop one render later; doing
      // so would leave false unconfirmed work and prevent draft-tier admission.
      if (sameRevision(captured.input.revision, observationRef.current.input.revision)) return result;
      retrying = false;
    }
  }, [observeLatestController, sourceLifetime]);

  const flushLatest = useCallback(
    async (): Promise<AdvancedFlushResult> =>
      blockedRef.current ? { ok: false, error: restoration.error || DRAFT_READ_FAILED } :
      rememberFlush(await drainLatest()),
    [drainLatest, rememberFlush, restoration.error],
  );
  const retry = useCallback(
    async (): Promise<AdvancedFlushResult> =>
      blockedRef.current ? restoration.retry() :
      rememberFlush(await drainLatest(true)),
    [drainLatest, rememberFlush, restoration.retry],
  );
  const handOffToBackground = useCallback(() => {
    const controller = observeLatestController();
    if (!controllerKey || !controller || !controller.hasUnconfirmedWork() || blockedRef.current) return;
    controller.markHandedOff();
    handOff(controllerKey, controller);
  }, [controllerKey, observeLatestController]);

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
    const plugin = editorId;
    const mediaKey = plugin && item ? `${plugin}:${item.artifactId || item.id}` : undefined;
    const unbindMedia = mediaKey && mediaKey !== materialKey ? bindAdvancedDraftGate(mediaKey, gate) : undefined;
    return () => { unbind(); unbindMedia?.(); };
  }, [materialKey, editorId, draft?.schema, flushLatest, item, restoration.error]);

  useEffect(() => {
    if (!draftEnabled) return;
    const onPageHide = () => { if (!blockedRef.current) void flushLatest(); };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [draftEnabled, flushLatest]);

  return { state: restoration.error ? "error" as const : restoration.paused ? "saving" as const : state,
    errorMessage: restoration.error || errorMessage, flushLatest, retry, handOffToBackground };
}
