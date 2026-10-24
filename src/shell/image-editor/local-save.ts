/**
 * Local (native host) save for the image editor.
 *
 * Only a trusted native editor mount passes `onLocalSave`; the website never
 * does, so its cloud save is untouched. A save here means: the host received the
 * real Fabric project, persisted it, and returned a matching ok ack. It is NOT a
 * cloud sync and must never be reported as one.
 */

import type { AdvancedFlushResult } from "../advanced-session-context";

/** The EditorSession `save` payload for the image editor (oceanleo.fabric-image.v1). */
export interface LocalImageSaveRequest {
  project: unknown;
  /** Editor mutation revision the project was captured at. */
  revision: number;
}

export type LocalImageSaveResult =
  | { ok: true }
  | { ok: false; error: string };

export type LocalImageSaveHandler = (
  request: LocalImageSaveRequest,
) => Promise<LocalImageSaveResult>;

export const LOCAL_SAVE_TIMEOUT_MS = 15_000;
export const LOCAL_SAVED_NOTICE = "已保存到本机（未同步到云端）";

export interface LocalSaveDeps {
  handler: LocalImageSaveHandler;
  admitted: () => { ok: true } | { ok: false; error: string };
  /** Synchronous capture of the current project + revision; null = canvas not ready. */
  capture: () => LocalImageSaveRequest | null;
  /**
   * Clears the editor's dirty flag only if no newer edit landed since `revision`.
   * Returns whether it cleared.
   */
  markSaved: (revision: number) => boolean;
  onSaved?: (revision: number, stillDirty: boolean) => void;
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface LocalSaveRunner {
  run(): Promise<AdvancedFlushResult>;
  /** Unmount: pending saves fail explicitly and a late ack changes nothing. */
  dispose(): void;
}

function failure(error: string): AdvancedFlushResult {
  return { ok: false, error, retryable: true, code: "local-save" } as AdvancedFlushResult;
}

export function createLocalSaveRunner(deps: LocalSaveDeps): LocalSaveRunner {
  const timeoutMs = deps.timeoutMs ?? LOCAL_SAVE_TIMEOUT_MS;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let disposed = false;
  let inflight: Promise<AdvancedFlushResult> | null = null;
  let lastSavedRevision = -1;
  let cancelInflight: (() => void) | null = null;

  async function once(): Promise<AdvancedFlushResult> {
    if (disposed) return failure("编辑器已关闭，没有保存到本机");
    const admitted = deps.admitted();
    if (!admitted.ok) return failure(admitted.error);
    const captured = deps.capture();
    if (!captured) return failure("图片画布尚未就绪，没有保存到本机");
    if (captured.revision === lastSavedRevision) return { ok: true };
    let timer: unknown;
    const outcome = await new Promise<LocalImageSaveResult>((resolve) => {
      cancelInflight = () => resolve({ ok: false, error: "编辑器已关闭，没有保存到本机" });
      timer = setTimer(
        () => resolve({ ok: false, error: "宿主没有在时限内确认保存，修改仍保留，请重试" }),
        timeoutMs,
      );
      deps.handler(captured).then(resolve, (caught: unknown) =>
        resolve({
          ok: false,
          error: caught instanceof Error && caught.message ? caught.message : "保存到本机失败",
        }),
      );
    });
    clearTimer(timer);
    cancelInflight = null;
    if (!outcome.ok) return failure(outcome.error);
    if (disposed) return failure("编辑器已关闭，没有保存到本机");
    lastSavedRevision = captured.revision;
    const cleared = deps.markSaved(captured.revision);
    deps.onSaved?.(captured.revision, !cleared);
    // A newer edit keeps the editor dirty; the shell's own observer flushes it next.
    return { ok: true };
  }

  return {
    run() {
      // One save in flight. A caller arriving meanwhile waits, then captures the
      // then-current document, so an older ack can never stand in for newer work.
      const previous = inflight;
      const next = (async () => {
        if (previous) await previous.catch(() => undefined);
        return once();
      })();
      inflight = next;
      const clear = () => {
        if (inflight === next) inflight = null;
      };
      void next.then(clear, clear);
      return next;
    },
    dispose() {
      disposed = true;
      cancelInflight?.();
    },
  };
}
