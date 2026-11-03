/** Local upload measurements. Snapshots contain only fixed phase names, durations and byte counts. */
export const UPLOAD_TIMING_EVENT = "oceanleo:upload-timing";

export type ClientUploadPhase = "client_compress" | "client_key" | "client_request" | "client_response";
export const SERVER_UPLOAD_PHASES = [
  "body_read", "private_commit", "private_commit.queue_wait", "private_commit.run",
  "private_sweep", "private_reserve", "private_write", "private_register", "private_finalize", "total",
] as const;
type ServerUploadPhase = typeof SERVER_UPLOAD_PHASES[number];

export interface UploadTimingSnapshot {
  readonly input_bytes: number;
  readonly upload_bytes: number;
  readonly client_ms: Readonly<Partial<Record<ClientUploadPhase, number>>>;
  /** Server spans can be nested; do not add them to client_request. */
  readonly server_ms: Readonly<Partial<Record<ServerUploadPhase, number>>>;
}

const records = new WeakMap<File, { snapshot: UploadTimingSnapshot }>();

export function uploadTimingNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function recordFor(file: File) {
  let record = records.get(file);
  if (!record) {
    record = { snapshot: { input_bytes: file.size, upload_bytes: file.size, client_ms: {}, server_ms: {} } };
    records.set(file, record);
  }
  return record;
}

function publish(record: { snapshot: UploadTimingSnapshot }, snapshot: UploadTimingSnapshot) {
  record.snapshot = Object.freeze({
    ...snapshot,
    client_ms: Object.freeze(snapshot.client_ms),
    server_ms: Object.freeze(snapshot.server_ms),
  });
  if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
    window.dispatchEvent(new window.CustomEvent(UPLOAD_TIMING_EVENT, { detail: record.snapshot }));
  }
}

export function latestUploadTiming(file: File): UploadTimingSnapshot | undefined {
  return records.get(file)?.snapshot;
}

export function recordClientUploadTiming(file: File, phase: ClientUploadPhase, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const record = recordFor(file);
  publish(record, { ...record.snapshot, client_ms: { ...record.snapshot.client_ms, [phase]: durationMs } });
}

/** Original and compressed bytes share one record without retaining either file globally. */
export function recordCompressionTiming(original: File, upload: File, durationMs: number): void {
  // Late events from an aborted prepared upload must not overwrite a new original upload.
  const record = { snapshot: { input_bytes: original.size, upload_bytes: upload.size,
    client_ms: {}, server_ms: {} } as UploadTimingSnapshot };
  records.set(original, record);
  records.set(upload, record);
  publish(record, { ...record.snapshot, input_bytes: original.size, upload_bytes: upload.size });
  recordClientUploadTiming(upload, "client_compress", durationMs);
}

/** Read the fixed duration-only success field; discard all other response data. */
export function recordServerUploadTiming(file: File, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  const server: Partial<Record<ServerUploadPhase, number>> = {};
  for (const phase of SERVER_UPLOAD_PHASES) {
    const duration = source[phase];
    if (typeof duration === "number" && Number.isFinite(duration) && duration >= 0) server[phase] = duration;
  }
  if (!Object.keys(server).length) return;
  const record = recordFor(file);
  publish(record, { ...record.snapshot, server_ms: server });
}
