import type {
  AdvancedEditRevision as Revision,
  AdvancedPersistenceControllerOptions as Options,
  AdvancedPersistenceResult as Result,
  AdvancedPersistenceSnapshot,
  AdvancedPersistenceState,
} from "./advanced-persistence-controller";

const same = (a: Revision | undefined, b: Revision | undefined) =>
  a !== undefined && b !== undefined && Object.is(a, b);

/** Draft uploads never wait for PPTX rendering. Both tiers commit through the
 * session's serial snapshot writer; a late version receipt cannot erase a newer draft. */
export class AdvancedDraftController<Item> {
  private options: Options<Item>;
  private state: AdvancedPersistenceState = "saved";
  private latest?: Revision;
  private acknowledged?: Revision;
  private version?: Revision;
  private draftTimer: unknown;
  private versionTimer: unknown;
  private draftRunning: Promise<void> | null = null;
  private versionRunning: Promise<Result<Item>> | null = null;
  private pending?: { item: Item; revision: Revision; record: Options<Item>["recordSavedItem"] };
  private draftRetries = 0;
  private versionRetries = 0;
  private disposed = false;
  private handedOff = false;
  private forceVersion = false;
  private restored?: Revision;

  constructor(options: Options<Item>) { this.options = options; }

  observe(input: { revision: Revision; dirty: boolean; restoredDraft?: boolean }): void {
    if (this.disposed) return;
    const changed = !same(this.latest, input.revision);
    this.latest = input.revision;
    if (input.restoredDraft && !same(this.restored, input.revision)) {
      this.restored = input.revision;
      this.acknowledged = input.revision;
      this.setState("saved");
      this.scheduleVersion(this.options.versionIdleMs ?? 20_000);
      return;
    }
    if (!input.dirty && this.acknowledged === undefined) {
      this.acknowledged = input.revision;
      this.version = input.revision;
    }
    if (changed && !same(this.latest, this.acknowledged)) {
      this.draftRetries = 0;
      this.versionRetries = 0;
      this.clear("version");
      this.setState("saving");
      this.scheduleDraft(this.options.draftDebounceMs ?? 400);
    }
  }

  flushLatest(): Promise<Result<Item>> {
    if (this.disposed) return Promise.resolve({ ok: false, error: "persistence disposed" });
    this.forceVersion = true;
    this.clear("version");
    return this.runVersion();
  }

  retry(): Promise<Result<Item>> {
    this.draftRetries = 0;
    this.versionRetries = 0;
    if (!same(this.latest, this.acknowledged)) this.scheduleDraft(0);
    return this.flushLatest();
  }
  hasUnconfirmedWork(): boolean {
    return !this.disposed && (Boolean(this.pending || this.versionRunning || this.draftRunning) ||
      (this.latest !== undefined && !same(this.latest, this.version)));
  }
  markHandedOff(): void { this.handedOff = true; }
  clearHandedOff(): void { this.handedOff = false; }
  isHandedOff(): boolean { return this.handedOff; }
  prepareBackgroundRetries(): void {
    if (this.options.maxRetries === 0) return;
    this.options = { ...this.options, maxRetries: Math.max(this.options.maxRetries ?? 3, 3), retryDelays: [5_000, 10_000, 15_000] };
  }
  rebind(next: Partial<Options<Item>>): void { this.options = { ...this.options, ...next }; }
  whenIdle(): Promise<unknown> {
    return Promise.all([this.draftRunning, this.versionRunning]);
  }
  snapshot(): AdvancedPersistenceSnapshot {
    return { state: this.state, latestRevision: this.latest, acknowledgedRevision: this.acknowledged,
      pendingSessionRevision: this.pending?.revision, running: Boolean(this.draftRunning || this.versionRunning) };
  }
  hasScheduledWork(): boolean { return this.draftTimer !== undefined || this.versionTimer !== undefined; }
  isBusy(): boolean { return this.hasScheduledWork() || Boolean(this.draftRunning || this.versionRunning); }
  dispose(): void { this.disposed = true; this.clear("draft"); this.clear("version"); }

  private runDraft(): Promise<void> {
    if (this.draftRunning) return this.draftRunning;
    if (this.disposed || this.latest === undefined || same(this.latest, this.acknowledged)) return Promise.resolve();
    const revision = this.latest;
    const run = (async () => {
      try {
        if (!await this.options.draft!.saveRevision(revision)) throw new Error("draft snapshot failed");
        if (this.disposed) return;
        // A version may already have acknowledged a newer edit while the upload ran.
        if (same(this.latest, revision)) {
          this.acknowledged = revision;
          this.draftRetries = 0;
          this.setState("saved");
          if (!same(this.version, revision)) this.scheduleVersion(this.options.versionIdleMs ?? 20_000);
        }
      } catch {
        if (this.disposed || !same(this.latest, revision) || same(this.latest, this.acknowledged)) return;
        if (this.draftRetries < (this.options.maxRetries ?? 3)) {
          this.setState("saving");
          this.scheduleDraft(this.retryDelay(this.draftRetries++));
        } else this.setState("error");
      }
    })().finally(() => {
      if (this.draftRunning === run) this.draftRunning = null;
      if (!this.disposed && !same(this.latest, revision) && !same(this.latest, this.acknowledged) && this.draftTimer === undefined) this.scheduleDraft(0);
    });
    this.draftRunning = run;
    return run;
  }

  private runVersion(): Promise<Result<Item>> {
    if (this.versionRunning) return this.versionRunning;
    let succeeded = false;
    const run = this.drainVersion().then(result => { succeeded = result.ok; return result; }).finally(() => {
      if (this.versionRunning === run) this.versionRunning = null;
      if (!this.disposed && succeeded && same(this.latest, this.acknowledged) && !same(this.latest, this.version) && this.versionTimer === undefined) {
        this.scheduleVersion(0);
      }
    });
    this.versionRunning = run;
    return run;
  }

  private async drainVersion(): Promise<Result<Item>> {
    let result: Result<Item> = { ok: true };
    while (!this.disposed) {
      const revision = this.pending?.revision ?? this.latest;
      if (revision === undefined || (!this.pending && same(revision, this.version))) {
        this.forceVersion = false;
        return result;
      }
      const record = this.pending?.record ?? this.options.recordSavedItem;
      try {
        result = this.pending ? { ok: true, item: this.pending.item } : await this.options.flushRevision(revision);
        if (!result.ok) throw new Error(result.error || "editor revision save failed");
        if (result.item !== undefined) {
          this.pending = { item: result.item, revision, record };
          if (!await record(result.item, revision)) throw new Error("session snapshot failed");
        }
        this.pending = undefined;
        this.version = revision;
        this.versionRetries = 0;
        if (same(this.latest, revision)) {
          this.acknowledged = revision;
          this.clear("draft");
          this.clear("version");
          this.setState("saved");
          this.forceVersion = false;
          return result;
        }
        // Explicit gates cover all edits made while exporting. Idle publication
        // leaves newer, already durable drafts on their own 20 second timer.
        if (!this.forceVersion) return result;
      } catch (error) {
        if (this.disposed) return { ok: false, error: "persistence disposed" };
        if (this.versionRetries < (this.options.maxRetries ?? 3)) this.scheduleVersion(this.retryDelay(this.versionRetries++));
        if (!same(this.latest, this.acknowledged) && this.state !== "error") this.setState("saving");
        this.forceVersion = false;
        return { ok: false, error: error instanceof Error ? error.message : "advanced persistence failed" };
      }
    }
    return { ok: false, error: "persistence disposed" };
  }

  private retryDelay(attempt: number): number {
    const delays = this.options.retryDelays ?? [1_500, 4_000, 9_000];
    return delays[attempt] ?? delays[delays.length - 1] ?? 9_000;
  }
  private scheduleDraft(delay: number): void {
    this.clear("draft");
    if (!this.disposed) this.draftTimer = this.timer(() => { this.draftTimer = undefined; void this.runDraft(); }, delay);
  }
  private scheduleVersion(delay: number): void {
    this.clear("version");
    if (!this.disposed) this.versionTimer = this.timer(() => { this.versionTimer = undefined; void this.runVersion(); }, delay);
  }
  private timer(callback: () => void, delay: number): unknown {
    return (this.options.setTimeout ?? globalThis.setTimeout)(callback, delay);
  }
  private clear(tier: "draft" | "version"): void {
    const timer = tier === "draft" ? this.draftTimer : this.versionTimer;
    if (timer !== undefined) {
      if (this.options.clearTimeout) this.options.clearTimeout(timer);
      else globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
    if (tier === "draft") this.draftTimer = undefined;
    else this.versionTimer = undefined;
  }
  private setState(next: AdvancedPersistenceState): void {
    if (this.state === next) return;
    this.state = next;
    this.options.onStateChange?.(next);
  }
}
