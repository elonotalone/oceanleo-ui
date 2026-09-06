"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";
import type {
  AdvancedFlushResult,
  AdvancedSessionActions,
} from "./advanced-session-context";
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
  dirty,
  revision,
  flush,
  session,
}: {
  dirty: boolean;
  revision: AdvancedEditRevision;
  flush?: () => Promise<AdvancedFlushResult> | AdvancedFlushResult;
  session: AdvancedSessionActions | null;
}) {
  const flushRef = useRef(flush);
  const sessionRef = useRef(session);
  const mountedRef = useRef(true);
  const latestRevisionRef = useRef(revision);
  const ledgerRef = useRef<RevisionFlushLedger | null>(null);
  if (!ledgerRef.current) ledgerRef.current = new RevisionFlushLedger();
  const [state, setState] = useState<AdvancedAutoSaveState>("saved");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  flushRef.current = flush;
  sessionRef.current = session;
  latestRevisionRef.current = revision;

  const rememberFlush = useCallback((result: AdvancedFlushResult) => {
    const next = withErrorMessage(result);
    if (mountedRef.current) {
      setErrorMessage(next.ok ? undefined : next.errorMessage);
    }
    return next;
  }, []);

  const makeController = useCallback(
    () =>
      new AdvancedPersistenceController<LibraryItem>({
        flushRevision: (targetRevision) => {
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
        recordSavedItem: async (item) => {
          const activeSession = sessionRef.current;
          return activeSession
            ? activeSession.recordSavedItem(item)
            : true;
        },
        onStateChange: (next) => {
          if (!mountedRef.current) return;
          setState(next);
          if (next === "saved") setErrorMessage(undefined);
        },
      }),
    [rememberFlush],
  );
  const controllerRef =
    useRef<AdvancedPersistenceController<LibraryItem> | null>(null);
  if (!controllerRef.current) controllerRef.current = makeController();

  useEffect(() => {
    mountedRef.current = true;
    if (!controllerRef.current) controllerRef.current = makeController();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [makeController]);

  const wasDirtyRef = useRef(dirty);
  useEffect(() => {
    // 干净 → 脏 = 用户真的又改了；上一轮成功覆盖到的 revision 不再作数。
    if (dirty && !wasDirtyRef.current) ledgerRef.current?.forgetCovered();
    wasDirtyRef.current = dirty;
    controllerRef.current?.observe({ revision, dirty });
  }, [dirty, revision]);

  const flushLatest = useCallback(
    async (): Promise<AdvancedFlushResult> =>
      rememberFlush(
        (await controllerRef.current?.flushLatest()) ?? {
          ok: false,
          error: "自动保存控制器不可用",
        },
      ),
    [rememberFlush],
  );
  const retry = useCallback(
    async (): Promise<AdvancedFlushResult> =>
      rememberFlush(
        (await controllerRef.current?.retry()) ?? {
          ok: false,
          error: "自动保存控制器不可用",
        },
      ),
    [rememberFlush],
  );

  return { state, errorMessage, flushLatest, retry };
}
