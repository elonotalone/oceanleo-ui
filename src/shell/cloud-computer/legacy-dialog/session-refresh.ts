const MIN_INTERVAL_MS = 1_000;
const BASE_INTERVAL_MS = 15_000;
const MAX_INTERVAL_MS = 60_000;

type Entry = {
  sentAt: number;
  pending: boolean;
  dirty: boolean;
  signature?: string;
  interval: number;
  timer?: ReturnType<typeof setTimeout>;
};

// With no request id or cancellation in the protocol, only a response or a new
// connection can release an outstanding request without overlapping server work.
export function createSessionRefresh({
  allowed,
  send,
  now = Date.now,
}: {
  allowed: (program: string) => boolean;
  send: (program: string) => boolean;
  now?: () => number;
}) {
  const entries = new Map<string, Entry>();
  function entryFor(program: string) {
    let entry = entries.get(program);
    if (!entry) {
      entry = { sentAt: -Infinity, pending: false, dirty: false, interval: BASE_INTERVAL_MS };
      entries.set(program, entry);
    }
    return entry;
  }
  function request(program: string, reason: "activity" | "wake" | "poll" | "manual" = "wake") {
    if (!allowed(program)) return false;
    const entry = entryFor(program);
    if (entry.pending) {
      if (reason === "activity" || reason === "manual") entry.dirty = true;
      return false;
    }
    if (reason === "poll" && now() - entry.sentAt < entry.interval) return false;
    if (now() - entry.sentAt < MIN_INTERVAL_MS) {
      if (reason === "wake") return false;
      if (!entry.timer) entry.timer = setTimeout(() => {
        entry.timer = undefined;
        request(program, reason);
      }, MIN_INTERVAL_MS - (now() - entry.sentAt));
      return false;
    }
    if (!send(program)) return false;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.sentAt = now();
    entry.pending = true;
    entry.dirty = false;
    return true;
  }
  function receive(program: string, signature: string, supported: boolean) {
    const entry = entryFor(program);
    entry.interval = entry.signature === signature ? Math.min(MAX_INTERVAL_MS, entry.interval * 2) : BASE_INTERVAL_MS;
    entry.signature = signature;
    // Older gateways also report supported:false for transient startup failures.
    // Back off, but keep probing so recovery never requires reopening the panel.
    if (!supported) entry.interval = MAX_INTERVAL_MS;
    entry.pending = false;
    if (entry.dirty) request(program, "activity");
  }
  function pause() {
    for (const entry of entries.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = undefined;
    }
  }
  function reset() {
    pause();
    entries.clear();
  }
  return { request, receive, pause, reset };
}
