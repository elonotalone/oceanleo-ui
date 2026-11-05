import { OCCUPANCY_POLL_MS, OCCUPANCY_STALE_MS } from "./occupancy";

type Entry = {
  sentAt: number;
  pending: boolean;
  pendingSince: number;
};

export function createOccupancyProbe({
  allowed,
  send,
  now = Date.now,
}: {
  allowed: (program: string) => boolean;
  send: (program: string) => boolean;
  now?: () => number;
}) {
  const entries = new Map<string, Entry>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function entryFor(program: string): Entry {
    let entry = entries.get(program);
    if (!entry) {
      entry = { sentAt: -Infinity, pending: false, pendingSince: 0 };
      entries.set(program, entry);
    }
    return entry;
  }

  function request(program: string): boolean {
    if (!allowed(program)) return false;
    const entry = entryFor(program);
    if (entry.pending && now() - entry.pendingSince <= OCCUPANCY_STALE_MS) return false;
    // A response may be lost while the tab is suspended or the connection is
    // degraded. Do not let that one request permanently block the probe.
    entry.pending = false;
    if (!send(program)) return false;
    const t = now();
    entry.sentAt = t;
    entry.pending = true;
    entry.pendingSince = t;
    return true;
  }

  function receive(program: string): void {
    const entry = entries.get(program);
    if (!entry) return;
    entry.pending = false;
  }

  function stale(program: string, staleMs = OCCUPANCY_STALE_MS): boolean {
    const entry = entries.get(program);
    if (!entry) return true;
    if (!entry.pending || now() - entry.pendingSince <= staleMs) return false;
    entry.pending = false;
    return true;
  }

  function start(programOf: () => string | null | undefined): void {
    stop();
    const tick = () => {
      const program = programOf();
      if (program) request(program);
      timer = setTimeout(tick, OCCUPANCY_POLL_MS);
    };
    tick();
  }

  function stop(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  function reset(): void {
    stop();
    entries.clear();
  }

  return { request, receive, stale, start, stop, reset };
}
