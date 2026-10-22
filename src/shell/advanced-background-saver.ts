import {
  ensureBackgroundSaveNoticeMounted,
  unmountBackgroundSaveNoticeForTests,
} from "./advanced-background-save-notice";
import { subscribeAutosaveNudges } from "./advanced-autosave-nudge";
import {
  AUTOSAVE_BACKGROUND_RETRY_DELAYS,
  type AdvancedPersistenceController,
  type AdvancedPersistenceNudgeReason,
} from "./advanced-persistence-controller";
import type { LibraryItem } from "./library-data";

type BackgroundController = AdvancedPersistenceController<LibraryItem>;

/**
 * "saving": the job is saving or waiting for an automatic retry (transient
 * failures never leave this state). "failed": a permanent failure that retrying
 * cannot fix; the draft is kept and `reason` says why ("auth" resumes by itself
 * after sign-in).
 */
export type BackgroundSaveStatus = "saving" | "failed";
export type BackgroundSaveFailureReason = "auth" | "blocked";

export interface BackgroundSaveJobView {
  key: string;
  status: BackgroundSaveStatus;
  reason?: BackgroundSaveFailureReason;
}

interface BackgroundSaveJob extends BackgroundSaveJobView {
  controller: BackgroundController;
  retryTimer?: ReturnType<typeof setTimeout>;
  retryAttempt: number;
}

const jobs = new Map<string, BackgroundSaveJob>();
const listeners = new Set<() => void>();
let justSavedUntil = 0;
let justSavedTimer: ReturnType<typeof setTimeout> | undefined;
let noticeView = { failed: 0, auth: 0, saved: false };
let unsubscribeNudges: (() => void) | undefined;

function emit(): void {
  const failed = failedBackgroundSaveCount();
  let auth = 0;
  for (const job of jobs.values()) if (job.status === "failed" && job.reason === "auth") auth += 1;
  const saved = Date.now() < justSavedUntil && failed === 0;
  if (noticeView.failed !== failed || noticeView.saved !== saved || noticeView.auth !== auth) {
    noticeView = { failed, auth, saved };
  }
  for (const listener of [...listeners]) listener();
}

function markJustSaved(): void {
  justSavedUntil = Date.now() + 4_000;
  if (justSavedTimer !== undefined) clearTimeout(justSavedTimer);
  justSavedTimer = setTimeout(() => {
    justSavedTimer = undefined;
    emit();
  }, 4_000);
}

function ensureNotice(): void {
  ensureBackgroundSaveNoticeMounted();
}

async function waitForQuiet(
  key: string,
  controller: BackgroundController,
): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    if (jobs.get(key)?.controller !== controller) return;
    if (controller.snapshot().running) {
      await controller.whenIdle();
      continue;
    }
    if (controller.hasScheduledWork()) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }
    return;
  }
}

function clearJobTimer(job: BackgroundSaveJob): void {
  if (job.retryTimer !== undefined) clearTimeout(job.retryTimer);
  job.retryTimer = undefined;
}

function scheduleOwnRetry(job: BackgroundSaveJob): void {
  clearJobTimer(job);
  const delays = AUTOSAVE_BACKGROUND_RETRY_DELAYS;
  const delay = delays[Math.min(job.retryAttempt, delays.length - 1)] ?? 60_000;
  job.retryAttempt += 1;
  job.retryTimer = setTimeout(() => {
    job.retryTimer = undefined;
    if (jobs.get(job.key) !== job) return;
    void finish(job.key, job.controller, job.controller.retry());
  }, delay);
}

async function finish(
  key: string,
  controller: BackgroundController,
  operation: Promise<unknown>,
): Promise<void> {
  await operation;
  const job = jobs.get(key);
  if (!job || job.controller !== controller) return;
  if (controller.isBusy()) {
    job.status = "saving";
    job.reason = undefined;
    emit();
    void waitForQuiet(key, controller).then(() =>
      finish(key, controller, Promise.resolve()),
    );
    return;
  }
  if (!controller.hasUnconfirmedWork()) {
    clearJobTimer(job);
    jobs.delete(key);
    controller.dispose();
    markJustSaved();
    emit();
    return;
  }
  const failure = controller.snapshot().failure;
  if (failure && !failure.retryable) {
    // Retrying cannot help (sign-in needed, conflict, permission, integrity).
    // The draft stays; sign-in resumes automatically through the nudges.
    clearJobTimer(job);
    job.status = "failed";
    job.reason = failure.auth ? "auth" : "blocked";
    emit();
    return;
  }
  // Transient (or a controller that gave up on a caller-set retry cap): the
  // saver keeps retrying on a capped backoff, never leaving it to the person.
  job.status = "saving";
  job.reason = undefined;
  emit();
  scheduleOwnRetry(job);
}

function nudgeAll(reason: AdvancedPersistenceNudgeReason): void {
  for (const job of [...jobs.values()]) {
    if (job.status === "failed") {
      if (job.reason === "auth" && reason !== "visible") {
        job.status = "saving";
        job.reason = undefined;
        emit();
        void finish(job.key, job.controller, job.controller.retry());
      }
      continue;
    }
    if (job.retryTimer !== undefined) {
      clearJobTimer(job);
      void finish(job.key, job.controller, job.controller.retry());
      continue;
    }
    job.controller.nudge(reason);
  }
}

function ensureNudges(): void {
  if (!unsubscribeNudges) unsubscribeNudges = subscribeAutosaveNudges(nudgeAll);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasPendingOrFailed(): boolean {
  return jobs.size > 0;
}

export function shouldWarnBeforeUnload(editorUnconfirmed: boolean): boolean {
  return editorUnconfirmed || hasPendingOrFailed();
}

export function failedBackgroundSaveCount(): number {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === "failed") count += 1;
  }
  return count;
}

export function snapshotBackgroundSaves(): readonly BackgroundSaveJobView[] {
  return [...jobs.values()].map(({ key, status, reason }) => ({
    key,
    status,
    ...(reason ? { reason } : {}),
  }));
}

export function noticeSnapshot(): { failed: number; auth: number; saved: boolean } {
  return noticeView;
}

export function justSavedVisible(): boolean {
  return noticeView.saved;
}

export function handOff(
  key: string,
  controller: BackgroundController,
): void {
  if (!key) return;
  controller.markHandedOff();
  controller.prepareBackgroundRetries();
  ensureNudges();
  const existing = jobs.get(key);
  if (existing?.controller === controller) {
    if (existing.status !== "saving") {
      existing.status = "saving";
      existing.reason = undefined;
      emit();
      void finish(key, controller, controller.retry());
    }
    return;
  }
  if (existing && existing.status === "saving") {
    return;
  }
  jobs.set(key, { key, controller, status: "saving", retryAttempt: 0 });
  ensureNotice();
  emit();
  void finish(key, controller, controller.retry());
}

export function takeBack(
  key: string,
  draftTier?: boolean,
): BackgroundController | null {
  if (!key) return null;
  const job = jobs.get(key);
  if (!job) return null;
  // Normal PPT and hosted PPTist have different document/revision sources.
  // Keep the originating controller until it publishes its captured version.
  if (draftTier !== undefined && job.controller.hasDraftTier() !== draftTier) return null;
  clearJobTimer(job);
  jobs.delete(key);
  job.controller.clearHandedOff();
  emit();
  return job.controller;
}

export function retry(key: string): Promise<void> {
  const job = jobs.get(key);
  if (!job) return Promise.resolve();
  job.status = "saving";
  job.reason = undefined;
  clearJobTimer(job);
  emit();
  return finish(key, job.controller, job.controller.retry());
}

export function retryAllFailed(): Promise<void> {
  return Promise.all(
    [...jobs.values()]
      .filter((job) => job.status === "failed")
      .map((job) => retry(job.key)),
  ).then(() => undefined);
}

export function leaveAdvancedWorkbench(input: {
  autoSaveEnabled: boolean;
  handOff: () => void;
  closeDetail: () => void;
  onClose: () => void;
  /** Opt-in only for editors whose serializer lives in the mounted iframe. */
  flushMounted?: () => Promise<{ ok: boolean }>;
}): void | Promise<boolean> {
  if (input.flushMounted) {
    return input.flushMounted().then((result) => {
      if (!result.ok) return false;
      input.closeDetail();
      input.onClose();
      return true;
    }).catch(() => false);
  }
  if (input.autoSaveEnabled) input.handOff();
  input.closeDetail();
  input.onClose();
}

export function resetBackgroundSaverForTests(): void {
  unsubscribeNudges?.();
  unsubscribeNudges = undefined;
  for (const job of [...jobs.values()]) {
    clearJobTimer(job);
    try {
      job.controller.dispose();
    } catch {
      // test reset
    }
  }
  jobs.clear();
  justSavedUntil = 0;
  if (justSavedTimer !== undefined) clearTimeout(justSavedTimer);
  justSavedTimer = undefined;
  noticeView = { failed: 0, auth: 0, saved: false };
  emit();
  unmountBackgroundSaveNoticeForTests();
}
