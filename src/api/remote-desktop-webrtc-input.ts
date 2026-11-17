import type { RemoteDesktopAction } from "./remote-desktop";

export const WEBRTC_MESSAGE_BYTES = 16 * 1024;
export const WEBRTC_BUFFER_BYTES = 256 * 1024;
export const WEBRTC_PENDING_ACTIONS = 32;
export const WEBRTC_RECEIPT_MS = 1500;
export type InputLabel = "rd-input" | "rd-fast";
export interface WebRtcInputReceipt {
  t: "rd.input_receipt"; v: 1; sid: string; seq: number;
  status: "executed" | "merged" | "rejected"; executed_at_ms: number;
  received_at_ms?: number; reason?: string;
}
export interface WebRtcInputWrite { seq: number; action: RemoteDesktopAction; sentAt: number; sentWall: number }
interface Queued { action: RemoteDesktopAction; barrier?: boolean }
interface InputOptions {
  sid: string; sequenceFloor?: number; now(): number; wallNow(): number;
  fault(label: InputLabel, reason: string): void;
  written(write: WebRtcInputWrite): void;
  receipt(write: WebRtcInputWrite, receipt: WebRtcInputReceipt): void;
}

/** No receipt credit window: only SCTP bufferedAmount and a bounded unsent queue. */
export class WebRtcInputScheduler {
  private options: InputOptions;
  private lanes = new Map<InputLabel, RTCDataChannel>();
  private queue: Queued[] = [];
  private move: Queued | undefined;
  private pending = new Map<number, WebRtcInputWrite>();
  private sequence = 0;
  private frozen = false;
  private closed = false;
  private releaseNeeded = false;
  private receiptsAvailable = false;
  private watchdogResumeAt = 0;
  private held = new Set<string>();
  private handoff: { resolve(): void; reject(error: Error): void; seq?: number; deadline: number } | undefined;
  constructor(options: InputOptions) {
    this.options = options;
    if (Number.isSafeInteger(options.sequenceFloor) && options.sequenceFloor! >= 0) this.sequence = options.sequenceFloor!;
  }
  get lastSequence(): number { return this.sequence; }
  sequenceFloor(value: number): void { if (Number.isSafeInteger(value) && value >= this.sequence) this.sequence = value; }
  get queuedCount(): number { return this.queue.length; }
  get heldCount(): number { return this.held.size; }
  setReceiptsAvailable(available: boolean): void {
    if (available && !this.receiptsAvailable) this.watchdogResumeAt = this.options.now();
    this.receiptsAvailable = available;
  }
  setLane(label: InputLabel, lane: RTCDataChannel | null): void {
    if (lane) this.lanes.set(label, lane); else this.lanes.delete(label);
    this.flush();
  }
  send(action: RemoteDesktopAction): boolean {
    if (this.closed || this.frozen || !this.valid(action)) return false;
    const item = { action: { ...action, modifiers: action.modifiers?.slice() } };
    if (action.kind === "move") this.move = item;
    else {
      if (this.queue.length >= WEBRTC_PENDING_ACTIONS) return false;
      this.queue.push(item);
    }
    this.flush();
    return true;
  }
  private valid(action: RemoteDesktopAction): boolean {
    try { return new TextEncoder().encode(JSON.stringify({ v: 1, sid: this.options.sid, seq: Number.MAX_SAFE_INTEGER, a: action })).length <= WEBRTC_MESSAGE_BYTES; }
    catch { return false; }
  }
  /** A failed/ambiguous write is never replayed. Clear stale input and release on the reliable lane. */
  recover(reason = "input_reconnecting"): void {
    this.queue = []; this.move = undefined; this.pending.clear(); this.held.clear();
    if (this.handoff) { this.handoff.reject(new Error(reason)); this.handoff = undefined; this.frozen = false; }
    this.releaseNeeded = true;
    this.flush();
  }
  flush(): void {
    if (this.closed) return;
    if (this.releaseNeeded && this.write("rd-input", { action: { kind: "release_all" } })) this.releaseNeeded = false;
    if (this.releaseNeeded) return;
    while (this.queue.length) {
      const item = this.queue[0];
      if (!this.write("rd-input", item)) break;
      // A synchronous fault can discard the entire queue.
      if (this.queue[0] === item) this.queue.shift();
    }
    if (this.move && this.write("rd-fast", this.move)) this.move = undefined;
  }
  private write(label: InputLabel, item: Queued): boolean {
    const lane = this.lanes.get(label);
    if (!lane || lane.readyState !== "open" || lane.bufferedAmount > (label === "rd-fast" ? 0 : WEBRTC_BUFFER_BYTES)) return false;
    const seq = ++this.sequence;
    const entry: WebRtcInputWrite = { seq, action: item.action, sentAt: this.options.now(), sentWall: this.options.wallNow() };
    // Register before send: synchronous test transports may immediately return a receipt.
    this.pending.set(seq, entry);
    if (item.barrier && this.handoff) this.handoff.seq = seq;
    try { lane.send(JSON.stringify({ v: 1, sid: this.options.sid, seq, a: item.action })); }
    catch {
      this.pending.delete(seq); this.lanes.delete(label);
      this.options.fault(label, "input_send_failed");
      return false;
    }
    if (item.action.kind === "key_down" && item.action.key) this.held.add(`key:${item.action.key}`);
    if (item.action.kind === "key_up" && item.action.key) this.held.delete(`key:${item.action.key}`);
    if (item.action.kind === "pointer_down") this.held.add(`button:${item.action.button ?? "left"}`);
    if (item.action.kind === "pointer_up") this.held.delete(`button:${item.action.button ?? "left"}`);
    if (item.action.kind === "release_all") this.held.clear();
    this.options.written(entry);
    // Bound receipt bookkeeping independently of flow control.
    while (this.pending.size > 4096) this.pending.delete(this.pending.keys().next().value!);
    return true;
  }
  receipt(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const receipt = value as WebRtcInputReceipt;
    if (receipt.t !== "rd.input_receipt" || receipt.v !== 1 || receipt.sid !== this.options.sid
      || !Number.isSafeInteger(receipt.seq) || !["executed", "merged", "rejected"].includes(receipt.status)
      || !Number.isFinite(receipt.executed_at_ms) || receipt.executed_at_ms < 0) return false;
    const entry = this.pending.get(receipt.seq);
    if (!entry) return false;
    this.pending.delete(receipt.seq);
    this.options.receipt(entry, receipt);
    if (this.handoff?.seq === receipt.seq) {
      const pending = this.handoff; this.handoff = undefined;
      if (receipt.status === "executed") pending.resolve();
      else { this.frozen = false; pending.reject(new Error(`input_receipt_${receipt.status}`)); }
    }
    if (receipt.status === "rejected" && /executor|execution|input_failed/.test(receipt.reason ?? "")) this.options.fault("rd-input", "host_input_executor_failed");
    return true;
  }
  tick(): void {
    if (this.closed) return;
    const now = this.options.now();
    if (this.handoff && now >= this.handoff.deadline) {
      this.handoff.reject(new Error("release_all_timeout")); this.handoff = undefined; this.frozen = false;
    }
    const oldest = [...this.pending.values()].find(write => write.action.kind !== "move");
    if (this.receiptsAvailable && oldest && now - Math.max(oldest.sentAt, this.watchdogResumeAt) >= WEBRTC_RECEIPT_MS) {
      this.pending.clear(); this.options.fault("rd-input", "input_receipt_missing");
    }
    this.flush();
  }
  releaseForHandoff(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("viewer_closed"));
    if (this.handoff || this.frozen) return Promise.reject(new Error("handoff_pending"));
    this.frozen = true; this.queue = []; this.move = undefined;
    return new Promise((resolve, reject) => {
      this.handoff = { resolve, reject, deadline: this.options.now() + WEBRTC_RECEIPT_MS };
      this.queue.push({ action: { kind: "release_all" }, barrier: true }); this.flush();
    });
  }
  finishHandoff(): void { if (!this.handoff && !this.closed) this.frozen = false; }
  close(): void {
    if (this.closed) return;
    this.queue = []; this.move = undefined; this.releaseNeeded = true; this.flush();
    this.closed = true; this.held.clear(); this.pending.clear(); this.lanes.clear();
    this.handoff?.reject(new Error("viewer_closed")); this.handoff = undefined;
  }
}
