/** Signed 16 bit little endian mono PCM conversion used by both realtime editions. */
export function floatToPcm16LE(data: Float32Array): Uint8Array {
  const out = new Uint8Array(data.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < data.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return out;
}

export function pcm16LEToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

export function pcmSamplesPerFrame(sampleRateHz: number, frameMs = 20): number {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < 8000 || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 200) {
    throw new RangeError("invalid_pcm_frame_shape");
  }
  return Math.round(sampleRateHz * frameMs / 1000);
}

export function stopMediaStreams(streams: Array<MediaStream | null | undefined>): void {
  for (const stream of streams) stream?.getTracks().forEach((track) => track.stop());
}

export function flushPlaybackQueue<T extends { stop(): void; disconnect(): void }>(
  queue: T[], currentTime: number, setCursor: (time: number) => void,
): void {
  for (const source of queue.splice(0)) {
    try { source.stop(); } catch { /* already ended */ }
    source.disconnect();
  }
  setCursor(currentTime);
}

export function isCurrentCallAttempt(attempt: number, currentAttempt: number): boolean {
  return attempt === currentAttempt;
}

export function isCurrentCallSocket<T>(attempt: number, currentAttempt: number, socket: T, currentSocket: T | null): boolean {
  return isCurrentCallAttempt(attempt, currentAttempt) && socket === currentSocket;
}

export function dispatchForCurrentCallSocket<T>(
  attempt: number, currentAttempt: number, socket: T, currentSocket: T | null, dispatch: () => void,
): boolean {
  if (!isCurrentCallSocket(attempt, currentAttempt, socket, currentSocket)) return false;
  dispatch();
  return true;
}

export function shouldRefreshRealtimeBill(lastFetchAt: number, now = Date.now(), intervalMs = 15_000): boolean {
  return now - lastFetchAt >= intervalMs;
}

export function applyForCurrentSession<T>(sessionId: string, currentSessionId: string | null | undefined, value: T, apply: (value: T) => void): boolean {
  if (!currentSessionId || sessionId !== currentSessionId) return false;
  apply(value);
  return true;
}

export async function acceptMediaStreamIfCurrent<T extends { getTracks(): Array<{ stop(): void }> }>(
  pending: Promise<T>,
  isCurrent: () => boolean,
): Promise<T | null> {
  const stream = await pending;
  if (isCurrent()) return stream;
  for (const track of stream.getTracks()) track.stop();
  return null;
}

export function videoFrameEnvelope(source: "camera" | "screen", data: string) {
  return { type: "video.frame" as const, source, mime_type: "image/jpeg" as const, data };
}
