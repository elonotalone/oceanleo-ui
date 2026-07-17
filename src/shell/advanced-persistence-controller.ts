export type AdvancedPersistenceState = "saved" | "saving" | "error";
export type AdvancedEditRevision = string | number;

export type AdvancedPersistenceResult<Item = unknown> =
  | { ok: true; item?: Item }
  | { ok: false; error?: string };

export interface AdvancedPersistenceSnapshot {
  state: AdvancedPersistenceState;
  latestRevision?: AdvancedEditRevision;
  acknowledgedRevision?: AdvancedEditRevision;
  pendingSessionRevision?: AdvancedEditRevision;
  running: boolean;
}

interface AdvancedPersistenceControllerOptions<Item> {
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
  private readonly debounceMs: number;
  private readonly maxRetries: number;
  private readonly retryDelays: readonly number[];
  private readonly flushRevision: AdvancedPersistenceControllerOptions<Item>["flushRevision"];
  private readonly recordSavedItem: AdvancedPersistenceControllerOptions<Item>["recordSavedItem"];
  private readonly onStateChange?: AdvancedPersistenceControllerOptions<Item>["onStateChange"];
  private readonly scheduleTimeout: NonNullable<
    AdvancedPersistenceControllerOptions<Item>["setTimeout"]
  >;
  private readonly cancelTimeout: NonNullable<
    AdvancedPersistenceControllerOptions<Item>["clearTimeout"]
  >;

  private state: AdvancedPersistenceState = "saved";
  private observed = false;
  private dirty = false;
  private latestRevision?: AdvancedEditRevision;
  private acknowledgedRevision?: AdvancedEditRevision;
  private pendingItem?: Item;
  private pendingSessionRevision?: AdvancedEditRevision;
  private timer: unknown;
  private drainPromise: Promise<AdvancedPersistenceResult<Item>> | null = null;
  private retryCount = 0;
  private disposed = false;

  constructor(options: AdvancedPersistenceControllerOptions<Item>) {
    this.debounceMs = Math.max(0, options.debounceMs ?? 1_600);
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.retryDelays = options.retryDelays ?? [1_500, 4_000, 9_000];
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

  observe(input: {
    revision: AdvancedEditRevision;
    dirty: boolean;
  }): void {
    if (this.disposed) return;
    const changed =
      !this.observed || !sameRevision(this.latestRevision, input.revision);
    this.observed = true;
    this.latestRevision = input.revision;
    this.dirty = input.dirty;

    if (!input.dirty && this.acknowledgedRevision === undefined) {
      this.acknowledgedRevision = input.revision;
    }

    if (input.dirty && changed) {
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
      return;
    }

    if (
      !this.drainPromise &&
      !this.pendingItem &&
      !sameRevision(this.latestRevision, this.acknowledgedRevision)
    ) {
      this.setState("saving");
      this.schedule(this.debounceMs);
    }
  }

  flushLatest(): Promise<AdvancedPersistenceResult<Item>> {
    if (this.disposed) {
      return Promise.resolve({ ok: false, error: "persistence disposed" });
    }
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
    this.retryCount = 0;
    return this.flushLatest();
  }

  whenIdle(): Promise<unknown> {
    return this.drainPromise ?? Promise.resolve();
  }

  snapshot(): AdvancedPersistenceSnapshot {
    return {
      state: this.state,
      latestRevision: this.latestRevision,
      acknowledgedRevision: this.acknowledgedRevision,
      pendingSessionRevision: this.pendingSessionRevision,
      running: Boolean(this.drainPromise),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private async drain(): Promise<AdvancedPersistenceResult<Item>> {
    while (!this.disposed) {
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
            throw new Error(result.error || "editor revision save failed");
          }
        }

        if (result.item !== undefined) {
          this.pendingItem = result.item;
          this.pendingSessionRevision = targetRevision;
          const recorded = await this.recordSavedItem(
            result.item,
            targetRevision,
          );
          if (!recorded) throw new Error("session snapshot failed");
        }

        this.pendingItem = undefined;
        this.pendingSessionRevision = undefined;
        this.acknowledgedRevision = targetRevision;
        this.retryCount = 0;

        if (sameRevision(targetRevision, this.latestRevision)) {
          this.dirty = false;
          this.setState("saved");
          return result;
        }
        // A newer edit landed during upload/session CAS. Keep this same drain
        // alive and serialize the newest revision immediately.
      } catch (error) {
        const message = errorMessage(error);
        if (this.retryCount < this.maxRetries) {
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
        return { ok: false, error: message };
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
