import type { RemoteDesktopAction } from "./remote-desktop";

type Entry = { action: RemoteDesktopAction; seq?: number };
const WINDOW = 8;
const KEY_BACKLOG = 32;
const SOFT = new Set(["move", "scroll"]);
const RELEASE = new Set(["release_all", "pointer_up", "key_up"]);
export interface RemoteInputSchedulerOptions {
  /** false means nothing was written; never retry an ambiguous write. */
  write(seq: number, action: RemoteDesktopAction): boolean;
  now(): number;
  congestion(busy: boolean): void;
  failure(code: string): void;
}

/** Gateway acceptance releases transport credit; execution watermarks are diagnostics only. */
export class RemoteInputScheduler {
  private queue: Entry[] = [];
  private outstanding = new Map<number, Entry>();
  private retries: Entry[] = [];
  private retryAt = 0;
  private sequence = 0;
  private executed = 0;
  private ended = false;
  private busy = false;
  private heldKeys = new Set<string>();
  private heldButtons = new Set<string>();
  private options: RemoteInputSchedulerOptions;

  constructor(options: RemoteInputSchedulerOptions) { this.options = options; }

  private keyBacklog(): number {
    return [...this.queue, ...this.retries].filter((entry) => !SOFT.has(entry.action.kind)).length;
  }

  enqueue(action: RemoteDesktopAction): boolean {
    if (this.ended) return false;
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
    if (release) {
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
    this.queue.push({ action });
    this.tick();
    return !this.ended;
  }

  accepted(seq: number): void {
    if (!this.outstanding.has(seq)) return;
    this.outstanding.delete(seq);
    this.tick();
  }

  executedThrough(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0 || seq > this.sequence) { this.fail("response_malformed"); return; }
    this.executed = Math.max(this.executed, seq);
  }

  rejected(seq: number, code: string, retryAfterMs: number): void {
    const entry = this.outstanding.get(seq);
    if (!entry || !["input_queue_full", "rate_limited"].includes(code)) {
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
      if (!this.options.write(seq, action)) break;
      this.sequence = Math.max(this.sequence, seq);
      this.outstanding.set(seq, { action, seq });
      if (this.retries.length) this.retries.shift(); else this.queue.shift();
      if (remainder) this.queue.unshift({ action: remainder });
    }
    // Ordinary RTT/window pressure is silent. Only an actual key/text backlog pauses input.
    this.report(this.keyBacklog() >= KEY_BACKLOG);
  }

  /** Closing never replays old input into a replacement session. */
  dispose(): void {
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
    if (seq) this.options.write(seq, { kind: "release_all" });
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
