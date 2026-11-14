import { yieldToEditor } from "./editor-publish-yield";
import type { AdvancedFlushResult } from "./advanced-session-context";
import type { WorkingCopySaver, WorkingCopyTransport } from "./editor-working-copy";

export type Publication = () => Promise<AdvancedFlushResult> | AdvancedFlushResult;
interface Publisher {
  root?: string;
  saver: WorkingCopySaver;
  transport: WorkingCopyTransport;
  prepare: () => Publication;
  record: (result: AdvancedFlushResult) => Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<AdvancedFlushResult>;
  again: boolean;
  closed: boolean;
  prepared?: Publication;
  preparedSeq?: number | null;
  owed: boolean;
  failure: boolean;
  attempts: number;
  last?: AdvancedFlushResult;
  receipt?: { result: Extract<AdvancedFlushResult, { ok: true }>; seq: number | null };
}
const jobs = new Set<Publisher>();
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function hasPendingOrFailed() { return [...jobs].some((job) => job.closed && job.saver.snapshot().pending); }
export function shouldWarnBeforeUnload(editorUnconfirmed: boolean) { return editorUnconfirmed || hasPendingOrFailed(); }
const clear = (job: Publisher) => { if (job.timer !== undefined) clearTimeout(job.timer); job.timer = undefined; };

/** Reopening waits for the previous instance's pending PUT before reading its copy. */
export async function waitForClosingWorkingCopy(root: string): Promise<void> {
  for (const job of jobs) {
    if (job.root !== root || !job.closed || !job.saver.snapshot().pending) continue;
    if (!await job.saver.flush()) throw new Error(job.saver.snapshot().error || "保存失败，请重试");
  }
}

/** Only the prepared publication and the working-copy drain survive editor teardown. */
export function createBackgroundPublisher(input: Omit<Publisher, "again" | "closed" | "owed" | "failure" | "attempts">) {
  const job: Publisher = { ...input, again: false, closed: false, owed: false, failure: false, attempts: 0 };
  jobs.add(job);
  const later = (ms: number) => { clear(job); job.timer = setTimeout(() => { job.timer = undefined; void publish(); }, ms); };
  const publish = (): Promise<AdvancedFlushResult> => {
    clear(job);
    if (job.running) { job.again = job.owed; return job.running.then(() => job.again ? publish() : job.last!); }
    if (!job.owed && !job.saver.snapshot().pending) return Promise.resolve(job.last ?? { ok: true });
    job.again = false;
    const running = (async (): Promise<AdvancedFlushResult> => {
      try {
        if (!job.receipt) {
          if (!await job.saver.flush()) return { ok: false, error: job.saver.snapshot().error || "保存失败，请重试" };
          await yieldToEditor();
          if (!await job.saver.flush()) return { ok: false, error: job.saver.snapshot().error || "保存失败，请重试" };
          const seq = job.preparedSeq !== undefined ? job.preparedSeq : job.saver.snapshot().seq;
          const run = job.prepared ?? job.prepare();
          job.prepared = undefined;
          job.preparedSeq = undefined;
          job.owed = false;
          await yieldToEditor();
          const result = await run();
          if (!result.ok) { if (!job.prepared) { job.prepared = run; job.preparedSeq = seq; } return result; }
          job.receipt = { result, seq };
        }
        const { result, seq } = job.receipt;
        await job.record(result);
        const revisionId = result.item?.revisionId || result.item?.meta?.revision_id;
        if (seq !== null && typeof revisionId === "string") await job.transport.published(seq, revisionId);
        job.receipt = undefined;
        job.owed = job.saver.snapshot().pending || (job.saver.snapshot().seq ?? 0) > (seq ?? 0);
        return result;
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    })();
    job.running = running;
    void running.then((result) => {
      if (!jobs.has(job)) return;
      job.running = undefined;
      job.last = result;
      job.failure = !result.ok;
      if (!result.ok) { job.owed = true; later(Math.min(30_000, 1000 * 2 ** job.attempts++)); }
      else {
        job.attempts = 0;
        if (job.owed || job.again) later(job.closed ? 0 : 10_000);
        else if (job.closed) { jobs.delete(job); job.saver.dispose(); }
      }
      emit();
    });
    return running;
  };
  return {
    saved() { if (!jobs.has(job)) return; job.owed = true; if (!job.closed) later(10_000); emit(); },
    publish,
    async flushLatest(): Promise<AdvancedFlushResult> {
      let result: AdvancedFlushResult;
      do { result = await publish(); } while (result.ok && (job.owed || job.saver.snapshot().pending));
      return result;
    },
    close() {
      if (job.closed) return;
      job.closed = true;
      if (!job.owed && !job.saver.snapshot().pending) { clear(job); jobs.delete(job); job.saver.dispose(); return; }
      job.owed = true;
      // Capture even when a prior publication is in flight, before editor destruction.
      job.saver.freeze();
      job.prepared = job.prepare();
      job.preparedSeq = undefined;
      void publish();
      emit();
    },
    cancelIdle() { clear(job); },
  };
}
export function leaveAdvancedWorkbench(input: {
  autoSaveEnabled: boolean; handOff: () => void; closeDetail: () => void; onClose: () => void;
  flushMounted?: () => Promise<{ ok: boolean }>;
}): void | Promise<boolean> {
  if (input.flushMounted) return input.flushMounted().then((result) => {
    if (!result.ok) return false;
    input.closeDetail(); input.onClose(); return true;
  }).catch(() => false);
  if (input.autoSaveEnabled) input.handOff();
  input.closeDetail(); input.onClose();
}
export function resetBackgroundSaverForTests() {
  for (const job of jobs) { clear(job); job.saver.dispose(); }
  jobs.clear(); emit();
}
