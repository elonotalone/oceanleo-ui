import type { RemoteDesktopAction } from "./remote-desktop";

type Entry = { action: RemoteDesktopAction; queuedAt: number; seq?: number };
export interface RemoteInputSchedulerOptions {
  /** false means nothing was written; never retry an ambiguous write. */
  write(seq: number, action: RemoteDesktopAction): boolean;
  now(): number;
  congestion(busy: boolean): void;
  failure(code: string): void;
}

/** Transport independent. Acceptance is NOT execution credit. No timer or replay survives dispose. */
export class RemoteInputScheduler {
  private queue: Entry[] = [];
  private outstanding = new Map<number, Entry>();
  private awaiting = new Set<number>();
  private retries: Entry[] = [];
  private retryAt = 0;
  private sequence = 0;
  private executed = 0;
  private ended = false;
  private busy = false;
  private options: RemoteInputSchedulerOptions;

  constructor(options: RemoteInputSchedulerOptions) { this.options = options; }

  enqueue(action: RemoteDesktopAction): boolean {
    if (this.ended) return false;
    const tail = this.queue.at(-1);
    if (action.kind === "move" && tail?.action.kind === "move") {
      // Retain the original deadline; continuous motion must not hide a stuck connection.
      tail.action = action;
    } else {
      const release = ["release_all", "pointer_up", "key_up"].includes(action.kind);
      if (this.queue.length >= (release ? 40 : 32)) {
        // Do not report success for lost text/press/release. Stop safely with unknown execution state.
        this.fail("input_backlog_timeout");
        return false;
      }
      this.queue.push({ action, queuedAt: this.options.now() });
    }
    this.tick();
    return !this.ended;
  }

  accepted(seq: number): void {
    if (!this.awaiting.has(seq) || !this.outstanding.has(seq)) return;
    this.awaiting.delete(seq);
    this.tick();
  }

  executedThrough(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0 || seq > this.sequence) { this.fail("response_malformed"); return; }
    if (seq <= this.executed) return;
    this.executed = seq;
    for (const id of this.outstanding.keys()) if (id <= seq) this.outstanding.delete(id);
    for (const id of this.awaiting) if (id <= seq) this.awaiting.delete(id);
    this.tick();
  }

  rejected(seq: number, code: string, retryAfterMs: number): void {
    const entry = this.outstanding.get(seq);
    if (!this.awaiting.has(seq) || !entry || !["input_queue_full", "rate_limited"].includes(code)) {
      this.fail("response_malformed"); return;
    }
    this.outstanding.delete(seq);
    this.awaiting.delete(seq);
    this.retries.push(entry);
    this.retries.sort((a, b) => a.seq! - b.seq!);
    this.retryAt = this.options.now() + Math.max(25, Math.min(1000, retryAfterMs));
    this.report(true);
  }

  tick(): void {
    if (this.ended) return;
    const now = this.options.now();
    if ([...this.outstanding.values()].some((entry) => now - entry.queuedAt >= 5000)) {
      this.fail("input_ack_unknown"); return;
    }
    if ((this.retries[0] && now - this.retries[0].queuedAt >= 5000) || (this.queue[0] && now - this.queue[0].queuedAt >= 5000)) {
      this.fail("input_backlog_timeout"); return;
    }
    const head = this.retries[0] || this.queue[0];
    if (!head) { this.report(this.outstanding.size >= 8); return; }
    // Gateway rejection barrier refuses every higher seq until the rejected one succeeds.
    // Drain acceptance/rejection replies before retrying; no speculative replay on silence.
    // Normal traffic pipelines eight inputs and is NOT serialized on gateway RTT.
    if (this.outstanding.size >= 8 || (this.retries.length && (now < this.retryAt || this.awaiting.size > 0))) {
      this.report(this.outstanding.size >= 8 || this.retries.length > 0 || now - head.queuedAt >= 150);
      return;
    }
    const seq = head.seq ?? this.sequence + 1;
    if (!this.options.write(seq, head.action)) { this.report(true); return; }
    this.sequence = Math.max(this.sequence, seq);
    head.seq = seq;
    this.outstanding.set(seq, head);
    this.awaiting.add(seq);
    if (this.retries.length) this.retries.shift(); else this.queue.shift();
    this.report(this.retries.length > 0 || this.outstanding.size >= 8 || (this.queue.length > 0 && now - this.queue[0].queuedAt >= 150));
    // Bounded recursion: at most eight outstanding, independent of queue size.
    this.tick();
  }

  /** Closing or an unknown ACK must never replay old input into another session. */
  dispose(): void { this.ended = true; this.queue = []; this.outstanding.clear(); this.retries = []; this.awaiting.clear(); }

  emergencyRelease(): void {
    if (this.ended) return;
    const seq = this.sequence > 0 ? this.sequence + 1 : 0;
    // A release can bypass the rejection barrier only if nothing from the old queue can replay.
    this.dispose();
    if (seq) this.options.write(seq, { kind: "release_all" });
  }

  private report(busy: boolean): void {
    if (this.busy !== busy) { this.busy = busy; this.options.congestion(busy); }
  }

  private fail(code: string): void {
    if (this.ended) return;
    this.emergencyRelease();
    this.dispose();
    this.options.failure(code);
  }
}
