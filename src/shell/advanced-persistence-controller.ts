import { AdvancedDraftController } from "./advanced-draft-controller";

export type AdvancedPersistenceState = "saved" | "saving" | "error";
export type AdvancedEditRevision = string | number;

export type AdvancedPersistenceResult<Item = unknown> =
  | { ok: true; item?: Item }
  | { ok: false; error?: string; retryable?: boolean; code?: string };

const NON_RETRYABLE_PERSISTENCE_CODES = new Set([
  "integrity-failed",
  "revision-conflict",
  "unauthorized",
  "authentication-failed",
  "forbidden",
  "permission-denied",
  "missing-source",
  "unsupported-type",
  "invalid-binding",
  "invalid-payload",
  "license-restricted",
  "denied",
  "session-record-failed",
]);

/**
 * Invalid payloads and permission/CAS identity failures must not be masked by
 * the autosave retry loop. Transient network/session-unavailable failures stay
 * retryable. Drafts remain until a successful acknowledge.
 */
export function persistenceFailureRetryable(error: unknown): boolean {
  if (error && typeof error === "object") {
    const tagged = error as {
      retryable?: boolean;
      code?: string;
    };
    if (tagged.retryable === false) return false;
    if (tagged.retryable === true) return true;
    const code = String(tagged.code || "")
      .trim()
      .toLowerCase()
      .replaceAll("_", "-");
    if (NON_RETRYABLE_PERSISTENCE_CODES.has(code)) return false;
  }
  const message = errorMessage(error);
  if (
    /(?:\b401\b|\b403\b|unauthorized|authentication failed|forbidden|permission denied|登录过期|未授权|无权|权限不足|需要登录|认证失败)|integrity-failed|保存被拒绝|revision-conflict|只读导入|类型和编辑器对不上|完整性校验|校验和与(?:声明|本地)|空白内容覆盖/i.test(
      message,
    )
  ) {
    return false;
  }
  return true;
}

function taggedPersistenceError(
  error: unknown,
  fallback: string,
  extra?: { retryable?: boolean; code?: string },
): Error {
  const failure =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" && error ? error : fallback);
  if (extra?.retryable !== undefined) {
    Object.assign(failure, { retryable: extra.retryable });
  }
  if (extra?.code) Object.assign(failure, { code: extra.code });
  return failure;
}

export type AdvancedPersistenceNudgeReason = "online" | "visible" | "auth";

/** Why the newest attempt failed; lets the background saver tell people the truth. */
export interface AdvancedPersistenceFailure {
  message: string;
  code?: string;
  retryable: boolean;
  /** Needs a (re-)sign-in; resumes by itself once the session is back. */
  auth: boolean;
}

/** Capped exponential backoff; the last entry repeats for as long as the page lives. */
export const AUTOSAVE_RETRY_DELAYS: readonly number[] = [1_500, 4_000, 9_000, 20_000, 30_000];
export const AUTOSAVE_BACKGROUND_RETRY_DELAYS: readonly number[] = [5_000, 10_000, 15_000, 30_000, 60_000];
/** Ignore nudges closer together than this so online/visible bursts cannot storm. */
export const AUTOSAVE_NUDGE_MIN_GAP_MS = 1_000;

const AUTH_CODES = new Set(["unauthorized", "authentication-failed"]);
const AUTH_MESSAGE = /\b401\b|unauthorized|authentication failed|登录过期|登录已过期|未授权|需要登录|认证失败|未登录/i;

export function persistenceFailureNeedsSignIn(error: unknown): boolean {
  if (error && typeof error === "object") {
    const code = String((error as { code?: string }).code || "")
      .trim().toLowerCase().replaceAll("_", "-");
    if (AUTH_CODES.has(code)) return true;
  }
  return AUTH_MESSAGE.test(errorMessage(error));
}

export function describePersistenceFailure(error: unknown): AdvancedPersistenceFailure {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: string }).code || "") || undefined
    : undefined;
  const auth = persistenceFailureNeedsSignIn(error);
  return {
    message: errorMessage(error),
    code,
    retryable: auth ? false : persistenceFailureRetryable(error),
    auth,
  };
}

export interface AdvancedPersistenceSnapshot {
  state: AdvancedPersistenceState;
  failure?: AdvancedPersistenceFailure;
  latestRevision?: AdvancedEditRevision;
  acknowledgedRevision?: AdvancedEditRevision;
  pendingSessionRevision?: AdvancedEditRevision;
  running: boolean;
}

export interface AdvancedPersistenceObserveInput {
  revision: AdvancedEditRevision;
  dirty: boolean;
  restoredDraft?: boolean;
  /**
   * True only after a person changed this open item. Omitted defaults to
   * false: load/hydrate dirty+revision must not schedule autosave.
   */
  userEdited?: boolean;
  /** Alternative to `userEdited: true` when the shared generation is > 0. */
  userMutationGeneration?: number;
  /** One exact revision restored from local emergency recovery, not server draft. */
  recoveredLocalDraft?: boolean;
  itemKey?: string;
}

/**
 * Autosave may schedule only after an explicit user edit or an exact local
 * emergency-recovery receipt. Generic load/hydration stays excluded.
 */
export function persistenceObserveAllowsAutosave(
  input: Pick<
    AdvancedPersistenceObserveInput,
    "userEdited" | "userMutationGeneration" | "recoveredLocalDraft"
  >,
): boolean {
  if (input.recoveredLocalDraft === true) return true;
  if (input.userEdited === false) return false;
  if (input.userEdited === true) return true;
  return (input.userMutationGeneration ?? 0) > 0;
}

export interface AdvancedPersistenceControllerOptions<Item> {
  draft?: { saveRevision: (revision: AdvancedEditRevision) => Promise<boolean | "full-save"> | boolean | "full-save" };
  draftDebounceMs?: number;
  versionIdleMs?: number;
  debounceMs?: number;
  maxRetries?: number;
  retryDelays?: readonly number[];
  flushRevision: (
    revision: AdvancedEditRevision,
  ) => Promise<AdvancedPersistenceResult<Item>> | AdvancedPersistenceResult<Item>;
  recordSavedItem: (
    item: Item,
    revision: AdvancedEditRevision,
  ) => Promise<boolean> | boolean;
  onStateChange?: (state: AdvancedPersistenceState) => void;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  /** Injected clock for nudge rate limiting (tests). */
  now?: () => number;
}

function sameRevision(
  left: AdvancedEditRevision | undefined,
  right: AdvancedEditRevision | undefined,
): boolean {
  return left !== undefined && right !== undefined && Object.is(left, right);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "advanced persistence failed";
}

/**
 * One serialized, revision-aware persistence queue shared by autosave, close,
 * Agent send and new-task gates. It deliberately knows nothing about React or
 * editor models so race behavior can be proved with deterministic timers.
 */
export class AdvancedPersistenceController<Item = unknown> {
  private readonly draftController?: AdvancedDraftController<Item>;
  private readonly debounceMs: number;
  private maxRetries: number;
  private retryDelays: readonly number[];
  private flushRevision: AdvancedPersistenceControllerOptions<Item>["flushRevision"];
  private recordSavedItem: AdvancedPersistenceControllerOptions<Item>["recordSavedItem"];
  private onStateChange?: AdvancedPersistenceControllerOptions<Item>["onStateChange"];
  private readonly scheduleTimeout: NonNullable<
    AdvancedPersistenceControllerOptions<Item>["setTimeout"]
  >;
  private readonly cancelTimeout: NonNullable<
    AdvancedPersistenceControllerOptions<Item>["clearTimeout"]
  >;

  private state: AdvancedPersistenceState = "saved";
  private observed = false;
  private dirty = false;
  private autosaveEligible = false;
  private latestRevision?: AdvancedEditRevision;
  private acknowledgedRevision?: AdvancedEditRevision;
  private pendingItem?: Item;
  private pendingSessionRevision?: AdvancedEditRevision;
  private timer: unknown;
  private drainPromise: Promise<AdvancedPersistenceResult<Item>> | null = null;
  private retryCount = 0;
  private disposed = false;
  private handedOff = false;
  private failure?: AdvancedPersistenceFailure;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private readonly clock: () => number;

  constructor(options: AdvancedPersistenceControllerOptions<Item>) {
    if (options.draft) this.draftController = new AdvancedDraftController(options);
    // Keep keyboard-heavy editors responsive without turning every keystroke
    // into a save request. The editor already reports `saving` immediately;
    // this is only the quiet window before the serialized flush starts.
    this.debounceMs = Math.max(0, options.debounceMs ?? 500);
    // Transient failures stay queued until the server confirms the draft. A
    // supplied finite limit remains available for controlled/test callers;
    // production defaults to the capped delay sequence indefinitely.
    this.maxRetries = Math.max(0, options.maxRetries ?? Number.POSITIVE_INFINITY);
    this.retryDelays = options.retryDelays ?? AUTOSAVE_RETRY_DELAYS;
    this.clock = options.now ?? Date.now;
    this.flushRevision = options.flushRevision;
    this.recordSavedItem = options.recordSavedItem;
    this.onStateChange = options.onStateChange;
    this.scheduleTimeout =
      options.setTimeout ??
      ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.cancelTimeout =
      options.clearTimeout ??
      ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  observe(input: AdvancedPersistenceObserveInput): void {
    if (this.draftController) return this.draftController.observe(input);
    if (this.disposed) return;
    const changed =
      !this.observed || !sameRevision(this.latestRevision, input.revision);
    this.observed = true;
    this.latestRevision = input.revision;
    this.dirty = input.dirty;
    const allowsAutosave = persistenceObserveAllowsAutosave(input);
    if (input.dirty && allowsAutosave) this.autosaveEligible = true;

    if (!input.dirty && this.acknowledgedRevision === undefined) {
      this.acknowledgedRevision = input.revision;
    }

    if (input.dirty && changed && allowsAutosave) {
      this.retryCount = 0;
      this.setState("saving");
      if (!this.drainPromise) this.schedule(this.debounceMs);
      return;
    }

    if (
      !input.dirty &&
      !this.drainPromise &&
      !this.pendingItem &&
      sameRevision(this.latestRevision, this.acknowledgedRevision)
    ) {
      this.clearTimer();
      this.retryCount = 0;
      this.setState("saved");
      this.autosaveEligible = false;
      return;
    }

    if (
      allowsAutosave &&
      this.dirty &&
      !this.drainPromise &&
      !this.pendingItem &&
      !sameRevision(this.latestRevision, this.acknowledgedRevision)
    ) {
      this.retryCount = 0;
      this.setState("saving");
      this.schedule(this.debounceMs);
    }
  }

  flushLatest(): Promise<AdvancedPersistenceResult<Item>> {
    if (this.draftController) return this.draftController.flushLatest();
    if (this.disposed) {
      return Promise.resolve({ ok: false, error: "persistence disposed" });
    }
    if (this.dirty) this.autosaveEligible = true;
    this.clearTimer();
    if (this.drainPromise) return this.drainPromise;
    this.setState("saving");
    const operation = this.drain().finally(() => {
      if (this.drainPromise === operation) this.drainPromise = null;
    });
    this.drainPromise = operation;
    return operation;
  }

  retry(): Promise<AdvancedPersistenceResult<Item>> {
    if (this.draftController) return this.draftController.retry();
    this.retryCount = 0;
    return this.flushLatest();
  }

  hasUnconfirmedWork(): boolean {
    if (this.draftController) return this.draftController.hasUnconfirmedWork();
    if (this.disposed) return false;
    if (this.state === "saving" || this.state === "error") return true;
    if (this.drainPromise) return true;
    if (this.pendingItem !== undefined) return true;
    return this.autosaveEligible &&
      this.latestRevision !== undefined &&
      !sameRevision(this.latestRevision, this.acknowledgedRevision);
  }

  hasDraftTier(): boolean { return Boolean(this.draftController); }

  markHandedOff(): void {
    if (this.draftController) return this.draftController.markHandedOff();
    this.handedOff = true;
  }

  clearHandedOff(): void {
    if (this.draftController) return this.draftController.clearHandedOff();
    this.handedOff = false;
  }

  isHandedOff(): boolean {
    if (this.draftController) return this.draftController.isHandedOff();
    return this.handedOff;
  }

  /**
   * 交给后台后把重试拉长到大约半分钟。maxRetries===0 的控制器保持不重试
   * （测试台架），避免手一交出去就被改成 5s+ 的定时重试。
   */
  prepareBackgroundRetries(): void {
    if (this.draftController) return this.draftController.prepareBackgroundRetries();
    if (this.maxRetries === 0) return;
    this.maxRetries = Math.max(this.maxRetries, 3);
    this.retryDelays = AUTOSAVE_BACKGROUND_RETRY_DELAYS;
  }

  /**
   * Connectivity/visibility/sign-in came back: do not wait out the backoff.
   * Permanent failures (conflict, permission) are never re-run from here.
   */
  nudge(reason: AdvancedPersistenceNudgeReason): void {
    if (this.draftController) return this.draftController.nudge(reason);
    if (this.disposed || this.drainPromise) return;
    if (this.clock() - this.lastAttemptAt < AUTOSAVE_NUDGE_MIN_GAP_MS) return;
    const waiting = this.timer !== undefined && this.retryCount > 0;
    const authBlocked = this.state === "error" && this.failure?.auth === true && reason !== "visible";
    const exhausted = this.state === "error" && this.failure?.retryable === true;
    if (!waiting && !authBlocked && !exhausted) return;
    this.retryCount = 0;
    void this.flushLatest();
  }

  rebind(
    next: Partial<
      Pick<
        AdvancedPersistenceControllerOptions<Item>,
        "flushRevision" | "recordSavedItem" | "onStateChange" | "draft"
      >
    >,
  ): void {
    if (this.draftController) return this.draftController.rebind(next);
    if (next.flushRevision) this.flushRevision = next.flushRevision;
    if (next.recordSavedItem) this.recordSavedItem = next.recordSavedItem;
    if (next.onStateChange !== undefined) this.onStateChange = next.onStateChange;
  }

  whenIdle(): Promise<unknown> {
    if (this.draftController) return this.draftController.whenIdle();
    return this.drainPromise ?? Promise.resolve();
  }

  snapshot(): AdvancedPersistenceSnapshot {
    if (this.draftController) return this.draftController.snapshot();
    return {
      state: this.state,
      latestRevision: this.latestRevision,
      acknowledgedRevision: this.acknowledgedRevision,
      pendingSessionRevision: this.pendingSessionRevision,
      running: Boolean(this.drainPromise),
      failure: this.failure,
    };
  }

  hasScheduledWork(): boolean {
    if (this.draftController) return this.draftController.hasScheduledWork();
    return this.timer !== undefined;
  }

  isBusy(): boolean {
    if (this.draftController) return this.draftController.isBusy();
    return Boolean(this.drainPromise) || this.timer !== undefined;
  }

  dispose(): void {
    if (this.draftController) return this.draftController.dispose();
    this.disposed = true;
    this.clearTimer();
  }

  private async drain(): Promise<AdvancedPersistenceResult<Item>> {
    while (!this.disposed) {
      this.lastAttemptAt = this.clock();
      const targetRevision =
        this.pendingSessionRevision ?? this.latestRevision;
      if (targetRevision === undefined) {
        this.setState("saved");
        return { ok: true };
      }

      try {
        let result: AdvancedPersistenceResult<Item>;
        if (this.pendingItem !== undefined) {
          result = { ok: true, item: this.pendingItem };
        } else {
          result = await this.flushRevision(targetRevision);
          if (!result.ok) {
            throw taggedPersistenceError(
              result.error || "editor revision save failed",
              "editor revision save failed",
              {
                retryable: result.retryable,
                code: result.code,
              },
            );
          }
        }

        if (result.item !== undefined) {
          this.pendingItem = result.item;
          this.pendingSessionRevision = targetRevision;
          const recorded = await this.recordSavedItem(
            result.item,
            targetRevision,
          );
          if (!recorded) {
            throw taggedPersistenceError(
              "session snapshot failed",
              "session snapshot failed",
              { retryable: true, code: "session-cas" },
            );
          }
        }

        this.pendingItem = undefined;
        this.pendingSessionRevision = undefined;
        this.acknowledgedRevision = targetRevision;
        this.retryCount = 0;
        this.failure = undefined;

        if (sameRevision(targetRevision, this.latestRevision)) {
          this.dirty = false;
          this.autosaveEligible = false;
          this.setState("saved");
          return result;
        }
        // A newer edit landed during upload/session CAS. Keep this same drain
        // alive and serialize the newest revision immediately.
      } catch (error) {
        const failure = describePersistenceFailure(error);
        this.failure = failure;
        const message = failure.message;
        const retryable = failure.retryable;
        if (retryable && this.retryCount < this.maxRetries) {
          const delay =
            this.retryDelays[this.retryCount] ??
            this.retryDelays[this.retryDelays.length - 1] ??
            9_000;
          this.retryCount += 1;
          this.setState("saving");
          this.schedule(delay);
        } else {
          this.setState("error");
        }
        return {
          ok: false,
          error: message,
          retryable,
          code: failure.code,
        };
      }
    }
    return { ok: false, error: "persistence disposed" };
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (this.disposed) return;
    this.timer = this.scheduleTimeout(() => {
      this.timer = undefined;
      void this.flushLatest();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    this.cancelTimeout(this.timer);
    this.timer = undefined;
  }

  private setState(next: AdvancedPersistenceState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next);
  }
}
