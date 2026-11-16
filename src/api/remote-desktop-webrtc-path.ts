/** Route identities stay local: never put TURN URLs, candidates or credentials in reports. */
export type PathServer = RTCIceServer & { region?: string };
export interface PathRoute { key: string; kind: "direct" | "relay"; servers: RTCIceServer[]; region?: string }
export type RttSource = "ice" | "ctl";
export type StatsRow = Record<string, unknown>;
export interface PathReading { id: string; route?: PathRoute; rtt?: number; responses?: number; local?: StatsRow; remote?: StatsRow; pair: StatsRow }
const turn = (url: string) => /^turns?:/i.test(url);
const urls = (server: RTCIceServer): string[] => Array.isArray(server.urls) ? server.urls : [server.urls];
const rtcServer = ({ region: _region, ...server }: PathServer): RTCIceServer => server;
export function pathRoutes(servers: PathServer[]): PathRoute[] {
  const direct: PathRoute = { key: "direct", kind: "direct", servers: servers.flatMap(server => {
    const stun = urls(server).filter(url => /^stuns?:/i.test(url));
    return stun.length ? [{ ...rtcServer(server), urls: stun }] : [];
  }) };
  const relays = new Map<string, PathRoute>();
  for (const server of servers) {
    const relayUrls = urls(server).filter(turn);
    if (!relayUrls.length) continue;
    const key = `relay:${[...relayUrls].sort().join("|")}`;
    const region = typeof server.region === "string" && /^[a-z0-9-]{1,32}$/.test(server.region) ? server.region : undefined;
    relays.set(key, { key, kind: "relay", servers: [{ ...rtcServer(server), urls: relayUrls }], region });
    if (relays.size === 16) break;
  }
  return [direct, ...relays.values()];
}
export function boundedRtt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 600_000 ? Math.round(value) : undefined;
}
export function readPathStats(all: StatsRow[], routes: PathRoute[]): { selected?: PathReading; succeeded: PathReading[] } {
  const byId = new Map(all.map(row => [row.id, row]));
  const transport = all.find(row => row.type === "transport" && row.selectedCandidatePairId);
  const selected = transport ? byId.get(transport.selectedCandidatePairId) : all.find(row => row.type === "candidate-pair" && (row.selected || row.nominated && row.state === "succeeded"));
  const read = (pair: StatsRow): PathReading => {
    const local = byId.get(pair.localCandidateId), remote = byId.get(pair.remoteCandidateId);
    const relay = local?.candidateType === "relay" || remote?.candidateType === "relay";
    // A remote relay with no URL cannot be forced by a viewer's local TURN configuration.
    const route = relay ? local?.candidateType === "relay" ? routes.find(route => route.kind === "relay" && route.servers.some(server => urls(server).includes(String(local.url)))) : undefined
      : local && remote && [local, remote].every(candidate => ["host", "srflx", "prflx"].includes(String(candidate.candidateType))) ? routes[0] : undefined;
    return { id: String(pair.id), route, local, remote, pair,
      rtt: boundedRtt(typeof pair.currentRoundTripTime === "number" ? pair.currentRoundTripTime * 1000 : undefined),
      responses: typeof pair.responsesReceived === "number" && Number.isSafeInteger(pair.responsesReceived) && pair.responsesReceived >= 0 ? pair.responsesReceived : undefined };
  };
  return { selected: selected ? read(selected) : undefined, succeeded: all.filter(row => row.type === "candidate-pair" && row.state === "succeeded").slice(0, 128).map(read) };
}
interface Sample { at: number; rtt: number }
interface Series { identity: string; samples: Sample[] }
export interface PathComparison { direct_rtt_ms?: number; relay_rtt_ms?: number; best_relay_region?: string; comparison_source?: RttSource }
/** Four independent samples over >=3s; both margins must hold throughout the window. */
export class WebRtcPathSelector {
  private series = new Map<string, Series>();
  private counters = new Map<string, number>();
  private blocked = new Map<string, number>();
  private lastAttempt = -Infinity;
  private selectedKey: string | undefined;
  private routes: PathRoute[];
  constructor(routes: PathRoute[]) { this.routes = routes; }
  reset(routes = this.routes): void { this.routes = routes; this.series.clear(); this.counters.clear(); this.blocked.clear(); this.selectedKey = undefined; }
  updateRoutes(routes: PathRoute[]): void {
    this.routes = routes;
    const keys = new Set(routes.map(route => route.key));
    for (const key of this.series.keys()) if (!keys.has(key.slice(key.indexOf(":") + 1))) this.series.delete(key);
  }
  selected(key: string | undefined, now: number): void {
    if (key && this.selectedKey && key !== this.selectedKey) this.lastAttempt = now;
    this.selectedKey = key;
  }
  observe(key: string, rtt: number, now: number, source: RttSource, identity: string): void {
    if (boundedRtt(rtt) === undefined || key !== this.selectedKey && !this.routes.some(route => route.key === key)) return;
    const seriesKey = `${source}:${key}`;
    let series = this.series.get(seriesKey);
    if (!series || series.identity !== identity) { series = { identity, samples: [] }; this.series.set(seriesKey, series); }
    if (now - (series.samples.at(-1)?.at ?? -Infinity) < 750) return;
    series.samples = [...series.samples.filter(sample => now - sample.at <= 8000), { at: now, rtt }].slice(-8);
  }
  ice(reading: PathReading, now: number): void {
    if (!reading.route || reading.responses === undefined) return;
    const key = reading.id;
    const previous = this.counters.get(key); this.counters.set(key, reading.responses);
    // Stats timestamp/unchanged currentRoundTripTime does not prove a new ICE check.
    if (previous === undefined || reading.responses <= previous || reading.rtt === undefined) return;
    this.observe(reading.route.key, reading.rtt, now, "ice", reading.id);
    if (this.counters.size > 256) this.counters.delete(this.counters.keys().next().value!);
  }
  private samples(key: string, source: RttSource, now: number): Sample[] {
    const samples = this.series.get(`${source}:${key}`)?.samples.filter(sample => now - sample.at <= 8000) ?? [];
    return now - (samples.at(-1)?.at ?? -Infinity) <= 2500 ? samples : [];
  }
  private median(samples: Sample[]): number { const values = samples.map(sample => sample.rtt).sort((a, b) => a - b); return values[Math.floor(values.length / 2)]; }
  private ready(samples: Sample[]): boolean { return samples.length >= 4 && samples.at(-1)!.at - samples[0].at >= 3000; }
  choose(selected: string | undefined, now: number): PathRoute | undefined {
    if (!selected || now - this.lastAttempt < 60_000) return;
    for (const source of ["ctl", "ice"] as const) {
      const current = this.samples(selected, source, now);
      if (!this.ready(current)) continue;
      // A low outlier in the live route also has to lose by both margins.
      const baseline = Math.min(...current.map(sample => sample.rtt));
      const better = this.routes.filter(route => route.key !== selected && now >= (this.blocked.get(route.key) ?? 0)).filter(route => {
        const samples = this.samples(route.key, source, now);
        return this.ready(samples) && samples.every(sample => baseline - sample.rtt > 25 && sample.rtt < baseline * .7);
      }).sort((a, b) => this.median(this.samples(a.key, source, now)) - this.median(this.samples(b.key, source, now)));
      if (better[0]) return better[0];
    }
  }
  attempted(now: number): void { this.lastAttempt = now; }
  failed(key: string, now: number): void { this.attempted(now); this.blocked.set(key, now + 120_000); this.series.delete(`ctl:${key}`); this.series.delete(`ice:${key}`); }
  comparison(selected: string | undefined, now: number): PathComparison {
    for (const source of ["ctl", "ice"] as const) {
      if (!selected || !this.samples(selected, source, now).length) continue;
      const direct = this.samples("direct", source, now);
      const relays = this.routes.filter(route => route.kind === "relay" && this.samples(route.key, source, now).length)
        .sort((a, b) => this.median(this.samples(a.key, source, now)) - this.median(this.samples(b.key, source, now)));
      const best = relays[0];
      return { comparison_source: source, ...(direct.length ? { direct_rtt_ms: Math.round(this.median(direct)) } : {}),
        ...(best ? { relay_rtt_ms: Math.round(this.median(this.samples(best.key, source, now))), best_relay_region: best.region } : {}) };
    }
    return {};
  }
}
