import type { RemoteDesktopDataLane, RemoteDesktopDataMessage } from './remote-desktop';
import { RemoteInputHistory } from './remote-desktop-input-history';
import { agePercentile } from './remote-desktop-quality';

export interface RemotePictureMeasurements {
  picture_age_p50_ms?: number; picture_age_p95_ms?: number;
  input_to_picture_p50_ms?: number; input_to_picture_p95_ms?: number;
}
const CAPTURE_WRAP = 2 ** 24;
const MAX_AGE_MS = 60_000;
const MAX_SAMPLES = 2000;
const wallNow = () => performance.timeOrigin + performance.now();

/** Opt-in only. All samples come from decoded picture marks, never the latest DC capture packet. */
export class RemoteDesktopMeasurements {
  private lane: RemoteDesktopDataLane | null = null;
  private unsubscribe: (() => void) | undefined;
  private enabled = false;
  private pings = new Map<number, number>();
  private offsets: Array<{ rtt: number; offset: number }> = [];
  private history: RemoteInputHistory;
  private sharedHistory = false;
  private applied = 0;
  private inputAmbiguous = false;
  private lastCapture: number | undefined;
  private lastDisplayedAt = 0;
  private ages: number[] = [];
  private inputAges: number[] = [];
  private windowAges: number[] = [];
  private windowInputAges: number[] = [];
  private lastPing = -Infinity;
  readonly sessionId: string;
  private now: () => number;
  constructor(sessionId: string, now = wallNow) { this.sessionId = sessionId; this.now = now; this.history = new RemoteInputHistory(now); }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled; this.clear();
    if (enabled) this.applied = this.history.lastSequence;
    this.write({ t: 'rd.measure', on: enabled });
    if (enabled) this.tick();
  }
  setLane(lane: RemoteDesktopDataLane | null): void {
    if (lane === this.lane) return;
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.lane = lane; this.clear(true);
    if (lane?.subscribe) this.unsubscribe = lane.subscribe(value => this.receive(value));
    if (this.enabled) { this.write({ t: 'rd.measure', on: true }); this.tick(); }
  }
  private write(value: Record<string, unknown>): void {
    try { this.lane?.send(JSON.stringify({ ...value, v: 1, sid: this.sessionId })); } catch { /* measurement never changes control */ }
  }
  tick(): void {
    if (!this.enabled || !this.lane) return;
    const at = Math.round(this.now());
    if (at - this.lastPing < 1000) return;
    this.lastPing = at; this.pings.set(at, at);
    while (this.pings.size > 8) this.pings.delete(this.pings.keys().next().value!);
    this.write({ t: 'rd.ping', t_v: at });
  }
  receive(value: RemoteDesktopDataMessage): void {
    if (!this.enabled || value.sid !== this.sessionId || value.t !== 'rd.pong') return;
    const sent = this.pings.get(value.t_v);
    if (sent === undefined || !Number.isFinite(value.device_wall_ms)) return;
    this.pings.delete(value.t_v);
    const received = this.now(), rtt = received - sent;
    if (rtt < 0 || rtt > 5000) return;
    this.offsets.push({ rtt, offset: value.device_wall_ms - (sent + received) / 2 });
    if (this.offsets.length > 32) this.offsets.shift();
  }
  setInputHistory(history: RemoteInputHistory): void {
    if (history === this.history) return;
    for (const entry of this.history.values()) entry.picturePending = false;
    this.history = history; this.sharedHistory = true;
  }
  inputSent(seq: number, measurable = true): void {
    if (!Number.isSafeInteger(seq) || seq < 1) return;
    if (!this.sharedHistory) this.history.observeSequence(seq);
    const entry = this.history.get(seq) ?? (!this.sharedHistory && this.enabled ? this.history.written(seq, "websocket", { kind: "move" }) : undefined);
    if (entry) entry.picturePending = this.enabled && measurable;
  }
  invalidateFrame(): void { this.lastCapture = undefined; }
  /** The caller has validated the marker's sync pattern and parity on this displayed video frame. */
  displayed(captureLow24: number, appliedLow16: number, displayedAt = this.now()): void {
    this.invalidateFrame();
    if (!this.enabled || this.offsets.length < 3 || !Number.isInteger(captureLow24) || captureLow24 < 0 || captureLow24 >= CAPTURE_WRAP || !Number.isInteger(appliedLow16) || appliedLow16 < 0 || appliedLow16 > 65535) return;
    const offset = this.clockOffset();
    if (offset === undefined) return;
    const deviceNow = displayedAt + offset;
    const capture = captureLow24 + Math.round((deviceNow - captureLow24) / CAPTURE_WRAP) * CAPTURE_WRAP;
    const age = deviceNow - capture;
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return;
    this.lastCapture = capture; this.lastDisplayedAt = displayedAt;
    this.add(this.ages, age); this.add(this.windowAges, age);
    // From the previous proved watermark, <32768 issued seqs has a unique low16 interpretation.
    // After a larger gap it cannot be proved: keep picture age, omit input-to-picture until a new session.
    if (this.history.lastSequence - this.applied >= 32768) this.inputAmbiguous = true;
    if (this.inputAmbiguous) return;
    const delta = (appliedLow16 - this.applied % 65536 + 65536) % 65536;
    if (delta >= 32768 || this.applied + delta > this.history.lastSequence) return;
    this.applied += delta;
    for (const entry of this.history.values()) {
      const sent = this.history.wallTime(entry);
      if (!entry.picturePending || entry.seq > this.applied || sent > capture - offset) continue;
      entry.picturePending = false;
      const delay = displayedAt - sent;
      if (delay >= 0 && delay <= MAX_AGE_MS) { this.add(this.inputAges, delay); this.add(this.windowInputAges, delay); }
    }
  }
  /** Include a frozen displayed picture instead of silently losing age samples when frames stop. */
  sampleCurrentPicture(): void {
    const now = this.now(), offset = this.clockOffset();
    if (!this.enabled || this.lastCapture === undefined || offset === undefined || now - this.lastDisplayedAt < 1000) return;
    const age = now + offset - this.lastCapture;
    if (age >= 0) { this.add(this.ages, age); this.add(this.windowAges, age); }
  }
  private clockOffset(): number | undefined {
    if (this.offsets.length < 3) return undefined;
    const best = [...this.offsets].sort((a, b) => a.rtt - b.rtt).slice(0, 5).map(value => value.offset).sort((a, b) => a - b);
    return best[Math.floor(best.length / 2)];
  }
  clockUncertainty(): number | undefined {
    if (this.offsets.length < 3) return undefined;
    const best = [...this.offsets].sort((a, b) => a.rtt - b.rtt).slice(0, 5);
    return Math.max(...best.map(value => value.rtt / 2));
  }
  private add(list: number[], value: number): void { list.push(value); if (list.length > MAX_SAMPLES) list.shift(); }
  private summary(ages: number[], inputs: number[]): RemotePictureMeasurements {
    if (!this.enabled) return {};
    const p50 = agePercentile(ages, 50), p95 = agePercentile(ages, 95);
    const i50 = agePercentile(inputs, 50), i95 = agePercentile(inputs, 95);
    return { ...(p50 !== undefined ? { picture_age_p50_ms: p50, picture_age_p95_ms: p95 } : {}),
      ...(i50 !== undefined ? { input_to_picture_p50_ms: i50, input_to_picture_p95_ms: i95 } : {}) };
  }
  snapshot(): RemotePictureMeasurements { return this.summary(this.ages, this.inputAges); }
  takeWindow(): RemotePictureMeasurements {
    const result = this.summary(this.windowAges, this.windowInputAges);
    this.windowAges = []; this.windowInputAges = []; return result;
  }
  private clear(preserveProgress = false): void {
    this.pings.clear(); this.offsets = [];
    for (const entry of this.history.values()) entry.picturePending = false;
    if (!this.sharedHistory) this.history.clearRecords();
    if (!preserveProgress) { this.applied = 0; this.inputAmbiguous = false; }
    this.lastCapture = undefined; this.lastDisplayedAt = 0;
    this.ages = []; this.inputAges = []; this.windowAges = []; this.windowInputAges = []; this.lastPing = -Infinity;
  }
  dispose(): void { this.setEnabled(false); this.unsubscribe?.(); this.unsubscribe = undefined; this.lane = null; this.clear(); if (!this.sharedHistory) this.history.clear(); }
}

/** Decode the C6 v3 bottom-right 8×7 grid. Eight sync bits and eight column parity bits guard it. */
export function decodeRemotePictureMarker(rgba: Uint8ClampedArray): { captureLow24: number; appliedLow16: number } | null {
  if (rgba.length !== 8 * 7 * 4) return null;
  const bits: number[] = [];
  for (let i = 0; i < 56; i++) {
    const rgb = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
    if (rgb.every(value => value <= 64)) bits.push(0);
    else if (rgb.every(value => value >= 192)) bits.push(1);
    else return null;
  }
  if (bits.slice(0, 8).join('') !== '10101100') return null;
  for (let column = 0; column < 8; column++) if ((bits[8 + column] ^ bits[16 + column] ^ bits[24 + column] ^ bits[32 + column] ^ bits[40 + column]) !== bits[48 + column]) return null;
  const word = bits.slice(8, 48).reduce((result, bit) => result * 2 + bit, 0);
  return { captureLow24: Math.floor(word / 65536), appliedLow16: word % 65536 };
}
