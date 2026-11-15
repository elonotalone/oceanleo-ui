import type { RemoteDesktopAction } from "./remote-desktop";

export type RemoteInputLane = "websocket" | "data_channel";
/** One actual write, shared by scheduling, receipt timing, diagnostics and picture measurement. */
export interface RemoteInputWrite {
  seq: number; sentAt: number; lane: RemoteInputLane; action: RemoteDesktopAction; barrier?: boolean;
  probe: boolean; measurable: boolean;
  timingPending: boolean; timingAccepted: boolean;
  diagnosticPending: boolean; diagnosticEnqueued: boolean;
  picturePending: boolean;
}

/** Only actual writes enter this bounded history. Queued/coalesced actions have no record. */
export class RemoteInputHistory {
  private records = new Map<number, RemoteInputWrite>();
  private sequence = 0;
  peerEvicted = 0;
  readonly now: () => number;
  readonly wallOffset: number;
  constructor(now: () => number, wallOffset = 0) { this.now = now; this.wallOffset = wallOffset; }
  written(seq: number, lane: RemoteInputLane, action: RemoteDesktopAction = { kind: "release_all" }, probe = false, barrier = false): RemoteInputWrite {
    const entry: RemoteInputWrite = { seq, sentAt: this.now(), lane, action, barrier, probe,
      measurable: !probe && action.kind !== "release_all", timingPending: !probe, timingAccepted: false,
      diagnosticPending: lane === "data_channel" && !probe, diagnosticEnqueued: false, picturePending: false };
    this.observeSequence(seq);
    this.records.delete(seq); this.records.set(seq, entry);
    while (this.records.size > 256) {
      const first = this.records.values().next().value!;
      if (first.diagnosticPending) this.peerEvicted++;
      this.records.delete(first.seq);
    }
    return entry;
  }
  observeSequence(seq: number): void { this.sequence = Math.max(this.sequence, seq); }
  clearRecords(): void { this.records.clear(); }
  get(seq: number): RemoteInputWrite | undefined { return this.records.get(seq); }
  values(): IterableIterator<RemoteInputWrite> { return this.records.values(); }
  get lastSequence(): number { return this.sequence; }
  get size(): number { return this.records.size; }
  wallTime(entry: RemoteInputWrite): number { return entry.sentAt + this.wallOffset; }
  clear(): void { this.records.clear(); this.sequence = 0; this.peerEvicted = 0; }
}
