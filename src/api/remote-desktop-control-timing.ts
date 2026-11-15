import { RemoteInputHistory, type RemoteInputReceipt } from "./remote-desktop-input-history";
/** Same-viewer monotonic intervals, not gateway/native clock subtraction or OS success. */
export interface RemoteControlTiming {
  seq: number;
  stage: "input_receipt";
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

  receipt(value: RemoteInputReceipt): void {
    const entry = this.history.get(value.seq);
    if (!entry || !entry.timingPending || entry.receiptTimed || !Number.isFinite(value.executed_at_ms)) return;
    entry.receipt = value;
    entry.receiptTimed = true;
    entry.timingPending = false;
    const elapsedMs = this.now() - entry.sentAt;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    try { this.report({ seq: value.seq, stage: "input_receipt", status: value.status, elapsedMs }); } catch { /* measurement only */ }
  }
  dispose(): void { for (const entry of this.history.values()) entry.timingPending = false; }
}
