import type { RemoteDesktopAction } from "./remote-desktop";
import type { RemoteInputSchedulerDiagnostics } from "./remote-desktop-diagnostics";

type Entry = { barrier?: boolean; action: RemoteDesktopAction; seq?: number; lane?: "websocket" | "data_channel"; sentAt?: number };
const WINDOW = 8;
const KEY_BACKLOG = 32;
const SOFT = new Set(["move", "scroll"]);
const RELEASE = new Set(["release_all", "pointer_up", "key_up"]);
export interface RemoteInputSchedulerOptions {
  /** false means definitely unwritten. An ambiguous write reserves its seq and fails without replay. */
  write(seq: number, action: RemoteDesktopAction, context?: { retry: boolean; barrier: boolean; emergency?: boolean }): boolean | "unknown" | { lane: "websocket" | "data_channel" };
  now(): number;
  congestion(busy: boolean): void;
  failure(code: string): void;
}

/** WS acceptance releases its credit; peer credit uses retirement (or weaker legacy admission). */
export class RemoteInputScheduler {
  private queue: Entry[] = [];
  private outstanding = new Map<number, Entry>();
  private retries: Entry[] = [];
  private retryAt = 0;
  private sequence = 0;
  private executed = 0;
  private gatewayWritten = 0;
  /** Gateway writes above `executed` that were not refused; a refused seq never reaches acked_seq. */
  private gatewayUnretired: number[] = [];
  private peerWritten = 0;
  private peerAdmission = 0;
  private peerCompleted: number | undefined;
  private peerUpgradeFence = 0;
  private peerUpgradeAt = 0;
  private ended = false;
  private busy = false;
  private heldKeys = new Set<string>();
  private heldButtons = new Set<string>();
  private options: RemoteInputSchedulerOptions;
  private handoff: { promise: Promise<void>; resolve(): void; reject(error: Error): void;
    deadline: number; seq?: number; executed: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;

  /** Explicit handback only. Keep manual input frozen through the subsequent CAS. */
  releaseForHandoff(): Promise<void> {
    if (this.ended) return Promise.reject(new Error("input_ack_unknown"));
    if (this.handoff) return this.handoff.promise;
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const pending = { promise, resolve, reject, deadline: this.options.now() + 5000,
      executed: false, timer: undefined as ReturnType<typeof setTimeout> | undefined, seq: undefined as number | undefined };
    this.handoff = pending;
    pending.timer = setTimeout(() => { if (this.handoff === pending && !pending.executed) this.fail("input_ack_unknown"); }, 5000);
    this.enqueueAction({ kind: "release_all" }, true);
    return promise;
  }

  /** Called only after the same handback's CAS has a confirmed successful answer. */
  finishHandoff(): void {
    if (!this.ended && this.handoff?.executed) this.handoff = null;
  }

  private completeHandoff(): void {
    const pending = this.handoff;
    if (pending && !pending.executed && pending.seq !== undefined && this.executed >= pending.seq) {
      pending.executed = true;
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.resolve();
    }
  }

  private cancelHandoff(): void {
    const pending = this.handoff;
    this.handoff = null;
    if (pending) { if (pending.timer !== undefined) clearTimeout(pending.timer); if (!pending.executed) pending.reject(new Error("input_ack_unknown")); }
  }


  constructor(options: RemoteInputSchedulerOptions) { this.options = options; }

  private keyBacklog(): number {
    return [...this.queue, ...this.retries].filter((entry) => !SOFT.has(entry.action.kind)).length;
  }

  enqueue(action: RemoteDesktopAction): boolean { return this.enqueueAction(action); }

  private enqueueAction(action: RemoteDesktopAction, barrier = false): boolean {
    if (this.ended || (this.handoff && !barrier)) return false;
    const release = RELEASE.has(action.kind);
    const key = action.key ?? "";
    const button = action.button ?? "left";
    if (action.kind === "key_down" && this.heldKeys.size >= 32 && !this.heldKeys.has(key)) {
      this.report(true); return false; // Same held-key bound as the native injector.
    }
    if (!SOFT.has(action.kind) && !release && this.keyBacklog() >= KEY_BACKLOG) {
      this.report(true);
      return false; // Pause new presses/text; retain every previously queued action.
    }
    if (release && !barrier) {
      const known = action.kind === "key_up" ? this.heldKeys.has(key) : action.kind === "pointer_up" ? this.heldButtons.has(button) : true;
      // A repeated release has no OS effect unless this session pressed that key again.
      // Keep the first release in place; never replace ordinary releases with release_all.
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const previous = this.queue[i].action;
        if (action.kind === "release_all" && ["key_down", "pointer_down"].includes(previous.kind)) break;
        if (action.kind === "key_up" && previous.key === key && previous.kind === "key_down") break;
        if (action.kind === "pointer_up" && (previous.button ?? "left") === button && previous.kind === "pointer_down") break;
        if (previous.kind === action.kind && (action.kind === "release_all" || action.kind === "key_up" && previous.key === key || action.kind === "pointer_up" && (previous.button ?? "left") === button)) return true;
      }
      if (!known && this.keyBacklog() >= 64) {
        // Unknown key-up is a no-op in LiveInput; an unknown pointer-up only moves.
        // Actual held input always has reserved release capacity.
        return action.kind === "pointer_up" ? this.enqueue({ kind: "move", x: action.x, y: action.y }) : true;
      }
    }
    if (SOFT.has(action.kind)) {
      // Only replace never-written input in the current gesture segment. A down/up/key/text
      // remains a barrier. Alternating move/wheel floods consume at most two queue entries.
      let start = this.queue.length;
      while (start > 0 && SOFT.has(this.queue[start - 1].action.kind)) start--;
      const index = this.queue.findIndex((entry, i) => i >= start && entry.action.kind === action.kind);
      if (index >= 0) {
        const previous = this.queue.splice(index, 1)[0].action;
        if (action.kind === "scroll") action = {
          ...action,
          deltaX: (previous.deltaX ?? 0) + (action.deltaX ?? 0),
          deltaY: (previous.deltaY ?? 0) + (action.deltaY ?? 0),
        };
      }
    }
    if (action.kind === "key_down") this.heldKeys.add(key);
    if (action.kind === "key_up") this.heldKeys.delete(key);
    if (action.kind === "pointer_down") this.heldButtons.add(button);
    if (action.kind === "pointer_up") this.heldButtons.delete(button);
    if (action.kind === "release_all") { this.heldKeys.clear(); this.heldButtons.clear(); }
    this.queue.push({ action, barrier });
    this.tick();
    return !this.ended;
  }

  accepted(seq: number): void {
    if (!this.outstanding.has(seq) || this.outstanding.get(seq)?.lane === "data_channel") return;
    this.outstanding.delete(seq);
    this.tick();
  }

  /**
   * No queued action or pending credit; prior WS writes retired and prior peer writes reached
   * the negotiated credit fence. Legacy peer admission remains weaker than retirement.
   */
  drained(): boolean {
    return !this.ended && !this.handoff && !this.queue.length && !this.outstanding.size && this.gatewayDrained() && this.peerDrained();
  }

  /** Ignore never-written queue entries when changing lanes; otherwise continuous input starves DC. */
  gatewayDrained(): boolean {
    return !this.ended && !this.retries.length && ![...this.outstanding.values()].some(entry => entry.lane !== "data_channel") && this.executed >= this.gatewayWritten;
  }

  /** Queued releases can clear desired held state before any release is written; drain them first. */
  probeAllowed(): boolean {
    return !this.ended && !this.handoff && !this.holding() && ![...this.queue, ...this.retries].some(entry => RELEASE.has(entry.action.kind));
  }

  /** Completion is preferred while the host reports it; legacy admission proves only native enqueue. */
  peerDrained(): boolean { return (this.peerCompleted ?? this.peerAdmission) >= this.peerWritten; }
  peerCreditReady(): boolean { return this.peerCompleted === undefined || this.peerCompleted >= this.peerUpgradeFence; }

  observePeerProgress(value: { admissionSeq?: number; completedSeq?: number }): void {
    const valid = (seq: unknown): seq is number => typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0;
    // A valid report can race a resume floor. It cannot grant credits to future local writes;
    // epoch/floor synchronization needs a fresh stream rather than silently accepting input here.
    if ([value.admissionSeq, value.completedSeq].some(seq => valid(seq) && seq > this.sequence)) { this.fail("input_ack_unknown"); return; }
    if (valid(value.admissionSeq)) this.peerAdmission = Math.max(this.peerAdmission, value.admissionSeq);
    // A host report with admission but no completion means completion is not currently safe there
    // (pending overflow, generation change): fall back to the weaker admission credit, never close.
    if (valid(value.admissionSeq) && value.completedSeq === undefined && this.peerCompleted !== undefined) {
      this.peerCompleted = undefined; this.peerUpgradeFence = 0;
    }
    if (valid(value.completedSeq)) {
      if (this.peerCompleted === undefined) { this.peerUpgradeFence = this.peerWritten; this.peerUpgradeAt = this.options.now(); }
      this.peerCompleted = Math.max(this.peerCompleted ?? 0, value.completedSeq);
    }
    const through = this.peerCompleted ?? this.peerAdmission;
    for (const [seq, entry] of this.outstanding) if (entry.lane === "data_channel" && seq <= through) this.outstanding.delete(seq);
    this.tick();
  }

  oldestPeerPendingAt(): number | undefined {
    const pending = [...this.outstanding.values()].filter(entry => entry.lane === "data_channel").map(entry => entry.sentAt!);
    if (!this.peerCreditReady()) pending.push(this.peerUpgradeAt);
    return pending.length ? Math.min(...pending) : undefined;
  }

  /** Any key or button this session still holds (either lane). */
  holding(): boolean { return this.heldKeys.size > 0 || this.heldButtons.size > 0; }

  /** One seq space for both lanes: the data channel claims the next number, the gateway path continues above it. */
  claimSequence(): number {
    this.sequence += 1;
    // Peer input has no gateway receipt; the gateway path only proves its own seqs.
    this.executed = this.sequence;
    return this.sequence;
  }

  /**
   * A re-attached stream of the same session continues numbering above everything the session
   * already accepted (the gateway and the computer drop seqs at or below that). Earlier seqs
   * belong to the previous socket: they are not tracked here, so they count as settled.
   */
  seed(sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence <= this.sequence) return;
    this.sequence = sequence;
    this.executed = Math.max(this.executed, sequence);
    this.gatewayWritten = Math.max(this.gatewayWritten, sequence);
  }

  /** Highest seq claimed so far (both lanes); the floor for a re-attached stream. */
  lastSequence(): number { return this.sequence; }

  /** Numeric observation only; reading it never pumps, releases credit or mutates input. */
  diagnostics(): RemoteInputSchedulerDiagnostics {
    return { queued_count: this.queue.length, queued_soft_count: this.queue.filter((entry) => SOFT.has(entry.action.kind)).length,
      outstanding_count: this.outstanding.size, retry_count: this.retries.length, last_seq: this.sequence,
      execution_watermark: this.executed, held_key_count: this.heldKeys.size, held_button_count: this.heldButtons.size };
  }

  /** Track press state of input sent on the other lane so emergency release stays complete. */
  noteSent(action: RemoteDesktopAction): void {
    const key = action.key ?? "", button = action.button ?? "left";
    if (action.kind === "key_down") this.heldKeys.add(key);
    if (action.kind === "key_up") this.heldKeys.delete(key);
    if (action.kind === "pointer_down") this.heldButtons.add(button);
    if (action.kind === "pointer_up") this.heldButtons.delete(button);
    if (action.kind === "release_all") { this.heldKeys.clear(); this.heldButtons.clear(); }
  }

  /** A final refusal (e.g. `input_not_allowed`: the computer allows viewing only). Never retried. */
  refused(seq: number): boolean {
    if (!this.outstanding.has(seq) || this.outstanding.get(seq)?.lane === "data_channel") return false;
    this.outstanding.delete(seq);
    // The gateway never executes a refused write, so it cannot be the retirement fence.
    this.gatewayUnretired = this.gatewayUnretired.filter(written => written !== seq);
    if (seq === this.gatewayWritten) this.gatewayWritten = Math.max(this.executed, this.gatewayUnretired.at(-1) ?? 0);
    this.tick();
    return true;
  }

  executedThrough(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0 || seq > this.sequence) { this.fail("response_malformed"); return; }
    this.executed = Math.max(this.executed, seq);
    this.gatewayUnretired = this.gatewayUnretired.filter(written => written > this.executed);
    this.completeHandoff();
  }

  rejected(seq: number, code: string, retryAfterMs: number): void {
    const entry = this.outstanding.get(seq);
    if (!entry || entry.lane === "data_channel" || !["input_queue_full", "rate_limited"].includes(code)) {
      this.fail("response_malformed"); return;
    }
    this.outstanding.delete(seq);
    this.retries.push(entry);
    this.retries.sort((a, b) => a.seq! - b.seq!);
    this.retryAt = this.options.now() + Math.max(25, Math.min(1000, retryAfterMs));
    this.report(this.keyBacklog() >= KEY_BACKLOG);
  }

  tick(): void {
    if (this.ended) return;
    const now = this.options.now();
    if (this.handoff && !this.handoff.executed && now >= this.handoff.deadline) { this.fail("input_ack_unknown"); return; }
    while (this.outstanding.size < WINDOW) {
      const head = this.retries[0] || this.queue[0];
      if (!head) break;
      // Never replay a write on silence. A rejected pipeline drains every response before
      // retrying the lowest seq; the gateway refuses higher sequences until it is accepted.
      if (this.retries.length && (now < this.retryAt || this.outstanding.size > 0)) break;
      const seq = head.seq ?? this.sequence + 1;
      let action = head.action;
      let remainder: RemoteDesktopAction | undefined;
      if (action.kind === "scroll" && head.seq === undefined) {
        // Preserve accumulated wheel distance while respecting the gateway's per-message bound.
        const x = action.deltaX ?? 0, y = action.deltaY ?? 0;
        const dx = Math.max(-10_000, Math.min(10_000, x));
        const dy = Math.max(-10_000, Math.min(10_000, y));
        action = { ...action, deltaX: dx, deltaY: dy };
        if (x !== dx || y !== dy) remainder = { ...head.action, deltaX: x - dx, deltaY: y - dy };
      }
      const result = this.options.write(seq, action, { retry: head.seq !== undefined, barrier: head.barrier === true });
      if (!result) break;
      this.sequence = Math.max(this.sequence, seq);
      if (result === "unknown") { this.fail("input_ack_unknown"); return; }
      const lane = result === true ? "websocket" : result.lane;
      if (lane === "data_channel") this.peerWritten = Math.max(this.peerWritten, seq);
      else { this.gatewayWritten = Math.max(this.gatewayWritten, seq); this.gatewayUnretired.push(seq); }
      if (head.barrier && this.handoff) this.handoff.seq = seq;
      this.outstanding.set(seq, { action, seq, barrier: head.barrier, lane, sentAt: now });
      if (this.retries.length) this.retries.shift(); else this.queue.shift();
      if (remainder) this.queue.unshift({ action: remainder });
    }
    // Ordinary RTT/window pressure is silent. Only an actual key/text backlog pauses input.
    this.report(this.keyBacklog() >= KEY_BACKLOG);
  }

  /** Closing never replays old input into a replacement session. */
  dispose(): void {
    this.cancelHandoff();
    this.ended = true;
    this.queue = [];
    this.outstanding.clear();
    this.retries = [];
    this.heldKeys.clear(); this.heldButtons.clear();
    this.report(false);
  }

  emergencyRelease(): void {
    if (this.ended) return;
    const seq = this.sequence > 0 ? this.sequence + 1 : 0;
    this.dispose();
    if (seq) this.options.write(seq, { kind: "release_all" }, { retry: false, barrier: false, emergency: true });
  }

  private report(busy: boolean): void {
    if (this.busy !== busy) { this.busy = busy; this.options.congestion(busy); }
  }

  private fail(code: string): void {
    if (this.ended) return;
    this.emergencyRelease();
    this.options.failure(code);
  }
}
