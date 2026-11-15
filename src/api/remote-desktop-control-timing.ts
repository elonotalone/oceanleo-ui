import { RemoteInputHistory, type RemoteInputReceipt } from "./remote-desktop-input-history";
/** Same-viewer monotonic intervals, not gateway/native clock subtraction or OS success. */
export interface RemoteControlTiming {
  seq: number;
  stage: "accepted" | "completion_watermark" | "direct_ack" | "input_receipt";
  status?: RemoteInputReceipt["status"];
  elapsedMs: number;
}
export class RemoteControlTimings {
  private history: RemoteInputHistory;
  private shared: boolean;
  private now: () => number;
  private report: (sample: RemoteControlTiming) => void;
  constructor(now: () => number, report: (sample: RemoteControlTiming) => void, history?: RemoteInputHistory) {
    this.now = now; this.report = report; this.shared = !!history; this.history = history ?? new RemoteInputHistory(now);
  }
  sent(seq: number, direct = false): void {
    if (!Number.isSafeInteger(seq) || seq < 1) return;
    const entry = (this.shared && this.history.get(seq)) || this.history.written(seq, direct ? "data_channel" : "websocket");
    entry.timingPending = true; entry.timingAccepted = false;
  }

  /** @deprecated Pre-receipt gateway admission timing. */
  accepted(seq: number): void {
    const entry = this.history.get(seq);
    if (!entry?.timingPending || entry.timingAccepted) return;
    entry.timingAccepted = true;
    this.emit(seq, "accepted", entry.sentAt);
  }
  receipt(value: RemoteInputReceipt): void {
    const entry = this.history.get(value.seq);
    if (!entry || entry.receiptTimed || !Number.isFinite(value.executed_at_ms)) return;
    entry.receipt = value;
    entry.receiptTimed = true;
    entry.timingPending = false;
    const elapsedMs = this.now() - entry.sentAt;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    try { this.report({ seq: value.seq, stage: "input_receipt", status: value.status, elapsedMs }); } catch { /* measurement only */ }
  }
  /** @deprecated C6 admission timing; never used after terminal receipt negotiation. */
  admittedThrough(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0) return;
    for (const entry of this.history.values()) if (entry.timingPending && entry.seq <= seq && entry.lane === "data_channel" && !entry.timingAccepted) {
      entry.timingAccepted = true; this.emit(entry.seq, "direct_ack", entry.sentAt);
    }
  }
  /** @deprecated Native completion watermark, which does not prove successful execution. */
  completedThrough(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0) return;
    for (const entry of this.history.values()) {
      if (!entry.timingPending || entry.seq > seq) continue;
      entry.timingPending = false;
      // Coalesced moves and failed inputs can be covered by this watermark.
      this.emit(entry.seq, "completion_watermark", entry.sentAt);
    }
  }
  dispose(): void { for (const entry of this.history.values()) entry.timingPending = false; }
  private emit(seq: number, stage: RemoteControlTiming["stage"], sent: number): void {
    const elapsedMs = this.now() - sent;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    try { this.report({ seq, stage, elapsedMs }); } catch { /* diagnostics cannot affect controls */ }
  }
}
