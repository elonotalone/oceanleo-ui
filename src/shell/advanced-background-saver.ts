import {
  ensureBackgroundSaveNoticeMounted,
  unmountBackgroundSaveNoticeForTests,
} from "./advanced-background-save-notice";
import type { AdvancedPersistenceController } from "./advanced-persistence-controller";
import type { LibraryItem } from "./library-data";

type BackgroundController = AdvancedPersistenceController<LibraryItem>;

export type BackgroundSaveStatus = "saving" | "failed";

export interface BackgroundSaveJobView {
  key: string;
  status: BackgroundSaveStatus;
}

interface BackgroundSaveJob extends BackgroundSaveJobView {
  controller: BackgroundController;
}

const jobs = new Map<string, BackgroundSaveJob>();
const listeners = new Set<() => void>();
let justSavedUntil = 0;
let justSavedTimer: ReturnType<typeof setTimeout> | undefined;
let noticeView = { failed: 0, saved: false };

function emit(): void {
  const failed = failedBackgroundSaveCount();
  const saved = Date.now() < justSavedUntil && failed === 0;
  if (noticeView.failed !== failed || noticeView.saved !== saved) {
    noticeView = { failed, saved };
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
    emit();
    void waitForQuiet(key, controller).then(() =>
      finish(key, controller, Promise.resolve()),
    );
    return;
  }
  if (!controller.hasUnconfirmedWork()) {
    jobs.delete(key);
    controller.dispose();
    markJustSaved();
    emit();
    return;
  }
  job.status = "failed";
  emit();
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
  return [...jobs.values()].map(({ key, status }) => ({ key, status }));
}

export function noticeSnapshot(): { failed: number; saved: boolean } {
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
  const existing = jobs.get(key);
  if (existing?.controller === controller) {
    if (existing.status !== "saving") {
      existing.status = "saving";
      emit();
      void finish(key, controller, controller.retry());
    }
    return;
  }
  if (existing && existing.status === "saving") {
    return;
  }
  jobs.set(key, { key, controller, status: "saving" });
  ensureNotice();
  emit();
  void finish(key, controller, controller.retry());
}

export function takeBack(
  key: string,
): BackgroundController | null {
  if (!key) return null;
  const job = jobs.get(key);
  if (!job) return null;
  jobs.delete(key);
  job.controller.clearHandedOff();
  emit();
  return job.controller;
}

export function retry(key: string): Promise<void> {
  const job = jobs.get(key);
  if (!job) return Promise.resolve();
  job.status = "saving";
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
}): void {
  if (input.autoSaveEnabled) input.handOff();
  input.closeDetail();
  input.onClose();
}

export function resetBackgroundSaverForTests(): void {
  for (const job of [...jobs.values()]) {
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
  noticeView = { failed: 0, saved: false };
  emit();
  unmountBackgroundSaveNoticeForTests();
}
