/** Same-viewer monotonic intervals, not gateway/native clock subtraction or OS success. */
export interface RemoteControlTiming {
  seq: number;
  stage: "accepted" | "completion_watermark";
  elapsedMs: number;
}
export class RemoteControlTimings {
  private pending = new Map<number, { sent: number; accepted: boolean }>();
  private now: () => number;
  private report: (sample: RemoteControlTiming) => void;
  constructor(now: () => number, report: (sample: RemoteControlTiming) => void) {
    this.now = now; this.report = report;
  }
  sent(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 1) return;
    const sent = this.now();
    if (!Number.isFinite(sent)) return;
    // A known rejection may be retried. Measure the latest actual write only.
    this.pending.delete(seq);
    this.pending.set(seq, { sent, accepted: false });
    while (this.pending.size > 256) this.pending.delete(this.pending.keys().next().value!);
  }
  accepted(seq: number): void {
    const entry = this.pending.get(seq);
    if (!entry || entry.accepted) return;
    entry.accepted = true;
    this.emit(seq, "accepted", entry.sent);
  }
  completedThrough(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0) return;
    for (const [key, entry] of this.pending) {
      if (key > seq) continue;
      this.pending.delete(key);
      // Coalesced moves and failed inputs can be covered by this watermark.
      this.emit(key, "completion_watermark", entry.sent);
    }
  }
  dispose(): void { this.pending.clear(); }
  private emit(seq: number, stage: RemoteControlTiming["stage"], sent: number): void {
    const elapsedMs = this.now() - sent;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    try { this.report({ seq, stage, elapsedMs }); } catch { /* diagnostics cannot affect controls */ }
  }
}
