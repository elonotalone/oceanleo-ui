import type { RemoteControlTiming } from "./remote-desktop-control-timing";

/** Fixed numeric fields only. Enqueue, attempt retirement and successful OS-post are distinct. */
export const REMOTE_INPUT_METRICS = [
  "input_queue_depth", "input_queue_high_water", "input_queue_oldest_ms",
  "input_queue_wait_us", "input_queue_wait_max_us", "input_inject_us", "input_inject_max_us",
  "input_completed_seq", "input_injected_seq", "input_error_count",
] as const;
const INPUT_DIAGNOSTICS = ["gateway_pending_count", "gateway_inflight_count", "gateway_last_seq", "gateway_acked_seq", ...REMOTE_INPUT_METRICS] as const;
export type RemoteInputDiagnostics = Partial<Record<typeof INPUT_DIAGNOSTICS[number], number>>;

export function parseRemoteInputDiagnostics(value: unknown): RemoteInputDiagnostics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  return Object.fromEntries(INPUT_DIAGNOSTICS.filter((key) => typeof data[key] === "number" && Number.isSafeInteger(data[key]) && Number(data[key]) >= 0).map((key) => [key, data[key]]));
}

/** All times use the viewer's monotonic clock. No action contents or session identifiers. */
export interface RemoteInputSchedulerDiagnostics {
  queued_count: number; queued_soft_count: number; outstanding_count: number; retry_count: number;
  last_seq: number; execution_watermark: number; held_key_count: number; held_button_count: number;
}
export interface RemoteDesktopTransportDiagnostics extends RemoteInputSchedulerDiagnostics {
  v: 1; kind: 1; transport_instance: number; at_ms: number; elapsed_ms: number; interval_ms: number; ws_buffered_bytes: number;
  /** 0 = no receipt observed, 1 = legacy enqueue receipt, 2 = native attempt-retirement watermark. */
  dc_credit_basis: 0 | 1 | 2;
  dc_sent_seq: number; dc_receipt_seq: number; input_completed_seq?: number; input_injected_seq?: number;
  /** Sequence gaps include other-lane messages and gaps; they are NOT queue depths. */
  dc_receipt_seq_gap: number; dc_completion_seq_gap?: number;
  dc_pending_tracked_count: number; dc_oldest_tracked_ms: number; dc_tracking_evicted_total: number;
  ws_write_count: number; dc_write_count: number;
  ws_accepted_count: number; ws_accepted_sum_ms: number; ws_accepted_max_ms: number;
  ws_completed_count: number; ws_completed_sum_ms: number; ws_completed_max_ms: number;
  dc_enqueued_count: number; dc_enqueued_sum_ms: number; dc_enqueued_max_ms: number;
  dc_completed_count: number; dc_completed_sum_ms: number; dc_completed_max_ms: number;
}
type Interval = Pick<RemoteDesktopTransportDiagnostics,
  "ws_write_count" | "dc_write_count" | "ws_accepted_count" | "ws_accepted_sum_ms" | "ws_accepted_max_ms"
  | "ws_completed_count" | "ws_completed_sum_ms" | "ws_completed_max_ms" | "dc_enqueued_count"
  | "dc_enqueued_sum_ms" | "dc_enqueued_max_ms" | "dc_completed_count" | "dc_completed_sum_ms" | "dc_completed_max_ms">;
const interval = (): Interval => ({ ws_write_count: 0, dc_write_count: 0,
  ws_accepted_count: 0, ws_accepted_sum_ms: 0, ws_accepted_max_ms: 0,
  ws_completed_count: 0, ws_completed_sum_ms: 0, ws_completed_max_ms: 0,
  dc_enqueued_count: 0, dc_enqueued_sum_ms: 0, dc_enqueued_max_ms: 0,
  dc_completed_count: 0, dc_completed_sum_ms: 0, dc_completed_max_ms: 0 });
const validSequence = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
let transportInstances = 0;

/** Measurement only: never supplies credit, retries input, or changes a transport decision. */
export class RemoteTransportDiagnostics {
  private readonly instance = ++transportInstances;
  private readonly started: number;
  private intervalStarted: number;
  private values = interval();
  private peer = new Map<number, { sent: number; enqueued: boolean }>();
  private evicted = 0;
  private peerSent = 0;
  private peerReceipt = 0;
  private receiptSeen = false;
  private completed: number | undefined;
  private injected: number | undefined;
  private now: () => number;
  constructor(now: () => number) { this.now = now; this.started = this.intervalStarted = now(); }

  written(lane: "websocket" | "data_channel", seq: number): void {
    if (lane === "websocket") { this.values.ws_write_count++; return; }
    this.values.dc_write_count++;
    this.peerSent = Math.max(this.peerSent, seq);
    this.peer.set(seq, { sent: this.now(), enqueued: false });
    while (this.peer.size > 256) { this.peer.delete(this.peer.keys().next().value!); this.evicted++; }
  }
  control(sample: RemoteControlTiming): void {
    if (!Number.isFinite(sample.elapsedMs) || sample.elapsedMs < 0) return;
    const prefix = sample.stage === "accepted" ? "ws_accepted" : "ws_completed";
    this.add(prefix, sample.elapsedMs);
  }
  observe(metrics: { dc_input_seq?: number; input_completed_seq?: number; input_injected_seq?: number } | null | undefined): void {
    if (!metrics) return;
    if (validSequence(metrics.dc_input_seq)) { this.receiptSeen = true; this.peerReceipt = Math.max(this.peerReceipt, metrics.dc_input_seq); }
    // Explicit zero proves support. Missing/stale snapshots never downgrade completion semantics.
    if (validSequence(metrics.input_completed_seq)) this.completed = Math.max(this.completed ?? 0, metrics.input_completed_seq);
    if (validSequence(metrics.input_injected_seq)) this.injected = Math.max(this.injected ?? 0, metrics.input_injected_seq);
    const now = this.now();
    for (const [seq, entry] of this.peer) {
      if (!entry.enqueued && seq <= this.peerReceipt) { entry.enqueued = true; this.add("dc_enqueued", Math.max(0, now - entry.sent)); }
      if (this.completed !== undefined && seq <= this.completed) { this.add("dc_completed", Math.max(0, now - entry.sent)); this.peer.delete(seq); }
      else if (this.completed === undefined && entry.enqueued) this.peer.delete(seq);
    }
  }
  private add(prefix: "ws_accepted" | "ws_completed" | "dc_enqueued" | "dc_completed", elapsed: number): void {
    this.values[`${prefix}_count`]++;
    this.values[`${prefix}_sum_ms`] += elapsed;
    this.values[`${prefix}_max_ms`] = Math.max(this.values[`${prefix}_max_ms`], elapsed);
  }
  snapshot(scheduler: RemoteInputSchedulerDiagnostics, buffered: number, finishInterval = false): RemoteDesktopTransportDiagnostics {
    const now = this.now();
    const oldest = this.peer.values().next().value as { sent: number } | undefined;
    const value: RemoteDesktopTransportDiagnostics = { v: 1, kind: 1, transport_instance: this.instance, at_ms: now, elapsed_ms: Math.max(0, now - this.started), interval_ms: Math.max(0, now - this.intervalStarted),
      ...scheduler, ...this.values, ws_buffered_bytes: Number.isFinite(buffered) && buffered >= 0 ? buffered : 0,
      dc_credit_basis: this.completed !== undefined ? 2 : this.receiptSeen ? 1 : 0,
      dc_sent_seq: this.peerSent, dc_receipt_seq: this.peerReceipt, dc_receipt_seq_gap: Math.max(0, this.peerSent - this.peerReceipt),
      ...(this.completed !== undefined ? { input_completed_seq: this.completed, dc_completion_seq_gap: Math.max(0, this.peerSent - this.completed) } : {}),
      ...(this.injected !== undefined ? { input_injected_seq: this.injected } : {}),
      dc_pending_tracked_count: this.peer.size, dc_oldest_tracked_ms: oldest ? Math.max(0, now - oldest.sent) : 0, dc_tracking_evicted_total: this.evicted };
    if (finishInterval) { this.values = interval(); this.intervalStarted = now; }
    return value;
  }
  dispose(): void { this.peer.clear(); }
}
