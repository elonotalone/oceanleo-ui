// W14 · 网络检测：统计 → 等级（纯函数）、持续变差判定、共享采样器。
import assert from "node:assert/strict";
import test from "node:test";
import {
  HEALTH_POLL_MS,
  RECOVER_MS,
  SUSTAIN_POOR_MS,
  combineLevels,
  formatStat,
  healthView,
  initialHealthState,
  levelFromStats,
  lossLevel,
  netLevelLabel,
  qualityFromLevel,
  reduceHealth,
  rttLevel,
  suggestionFor,
} from "../src/shell/messages/call/diagnostics/health.ts";
import {
  createHealthMonitor,
  monitorContextFromSnapshot,
} from "../src/shell/messages/call/diagnostics/health-monitor.ts";

const S = (over = {}) => ({ rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null, ...over });

test("loss and RTT map to five levels at the documented thresholds", () => {
  assert.deepEqual([0, 1.9, 2, 4.9, 5, 9.9, 10, 19.9, 20, 60].map(lossLevel), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
  assert.deepEqual([0, 149, 150, 299, 300, 499, 500, 999, 1000, 3000].map(rttLevel), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
});

test("stats → level takes the worst metric and never invents a level from nothing", () => {
  assert.equal(levelFromStats(null), 0);
  assert.equal(levelFromStats(S()), 0, "all fields null → unknown, not good");
  assert.equal(levelFromStats(S({ rttMs: 40 })), 5);
  assert.equal(levelFromStats(S({ rttMs: 40, downLossPct: 12 })), 2, "worst of rtt (5) and loss (2)");
  assert.equal(levelFromStats(S({ upLossPct: 1, downLossPct: 25 })), 1, "loss uses the larger of up/down");
  assert.equal(levelFromStats(S({ rttMs: 650 })), 2);
  assert.equal(levelFromStats(S({ rttMs: Number.NaN, downLossPct: -1 })), 0, "non-finite / negative values are ignored");
});

test("bitrate is a weak signal: it can only pull a known level down to fair, never to poor, and never stands alone", () => {
  assert.equal(levelFromStats(S({ upKbps: 3 }), { sendingCamera: true }), 0, "bitrate alone → unknown");
  assert.equal(levelFromStats(S({ rttMs: 40, upKbps: 60 }), { sendingCamera: true }), 3);
  assert.equal(levelFromStats(S({ rttMs: 40, upKbps: 60 }), { sendingCamera: false }), 5, "audio-only uplink bitrate is not judged (DTX)");
  assert.equal(levelFromStats(S({ rttMs: 40, upKbps: 400 }), { sendingCamera: true }), 5);
  assert.equal(levelFromStats(S({ rttMs: 40, downKbps: 30 }), { receivingVideo: true }), 3);
  assert.equal(levelFromStats(S({ rttMs: 40, downKbps: 30 }), { receivingVideo: false }), 5);
  assert.equal(levelFromStats(S({ rttMs: 700, upKbps: 10 }), { sendingCamera: true }), 2, "poor comes from RTT, not bitrate");
});

test("two sources combine to the worse known level; 0 means unknown and is skipped", () => {
  assert.equal(combineLevels(0, 0), 0);
  assert.equal(combineLevels(5, 0), 5);
  assert.equal(combineLevels(0, 2), 2);
  assert.equal(combineLevels(4, 2), 2);
  assert.equal(combineLevels(null, undefined, 3), 3);
});

test("quality buckets and readable names", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(qualityFromLevel), ["unknown", "poor", "poor", "fair", "good", "good"]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(netLevelLabel), [
    "网络：未知",
    "网络：很差",
    "网络：差",
    "网络：一般",
    "网络：好",
    "网络：很好",
  ]);
  assert.equal(formatStat(null, "ms"), "—");
  assert.equal(formatStat(84.6, "ms"), "85 ms");
  assert.equal(formatStat(2.345, "%"), "2.3%");
  assert.equal(formatStat(31.9, "kbps"), "32 kbps");
});

const POOR = { stats: S({ rttMs: 40, downLossPct: 15 }) };
const GOOD = { stats: S({ rttMs: 40, downLossPct: 0 }) };
const FAIR = { stats: S({ rttMs: 400 }) };
const UNKNOWN = { stats: null };

function feed(samples, start = 0, step = HEALTH_POLL_MS) {
  let state = initialHealthState();
  const trace = [];
  samples.forEach((sample, index) => {
    state = reduceHealth(state, sample, start + index * step);
    trace.push(state.sustainedPoor);
  });
  return { state, trace };
}

test("sustained poor needs ≥6 s of consecutive poor samples (one blip does not trigger)", () => {
  assert.equal(SUSTAIN_POOR_MS, 6000);
  assert.equal(HEALTH_POLL_MS, 2000);
  // 0, 2, 4 s → still not sustained; 6 s → sustained
  assert.deepEqual(feed([POOR, POOR, POOR, POOR]).trace, [false, false, false, true]);
  // a good sample in between restarts the streak
  assert.deepEqual(feed([POOR, POOR, GOOD, POOR, POOR, POOR]).trace, [false, false, false, false, false, false]);
  // fair is not poor
  assert.deepEqual(feed([FAIR, FAIR, FAIR, FAIR, FAIR]).trace, [false, false, false, false, false]);
});

test("unknown samples neither extend a poor streak nor clear an existing verdict", () => {
  // unknown at 2 s and 4 s does not count; poor resumes at 6 s → poorSince stays at 0 → sustained at 6 s
  const { trace } = feed([POOR, UNKNOWN, UNKNOWN, POOR]);
  assert.deepEqual(trace, [false, false, false, true]);
  const after = feed([POOR, POOR, POOR, POOR, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN]);
  assert.equal(after.state.sustainedPoor, true, "stats outage does not silently clear the warning");
  assert.equal(after.state.quality, "unknown");
});

test("recovery needs ≥6 s of non-poor samples (no flicker)", () => {
  assert.equal(RECOVER_MS, 6000);
  const { trace } = feed([POOR, POOR, POOR, POOR, GOOD, GOOD, GOOD, GOOD]);
  assert.deepEqual(trace, [false, false, false, true, true, true, true, false]);
  const flicker = feed([POOR, POOR, POOR, POOR, GOOD, POOR, GOOD, GOOD, GOOD]);
  assert.deepEqual(flicker.trace, [false, false, false, true, true, true, true, true, true]);
});

test("the SDK network quality joins the verdict (worse source wins)", () => {
  let state = initialHealthState();
  for (let i = 0; i < 4; i += 1) state = reduceHealth(state, { ...GOOD, sdkLevel: 2 }, i * 2000);
  assert.equal(state.level, 2);
  assert.equal(state.sustainedPoor, true);
  const sdkOnly = reduceHealth(initialHealthState(), { stats: null, sdkLevel: 4 }, 0);
  assert.equal(sdkOnly.level, 4);
  assert.equal(sdkOnly.quality, "good");
});

test("reduceHealth is pure (does not mutate the previous state)", () => {
  const prev = initialHealthState();
  const frozen = Object.freeze({ ...prev });
  const next = reduceHealth(frozen, POOR, 1000);
  assert.notEqual(next, frozen);
  assert.equal(frozen.poorSince, null);
  assert.equal(next.poorSince, 1000);
});

test("suggestion: audio-only when sustained poor and not already audio-only; otherwise check network", () => {
  assert.equal(suggestionFor({ sustainedPoor: false }, false), null);
  assert.equal(suggestionFor({ sustainedPoor: true }, false), "audio_only");
  assert.equal(suggestionFor({ sustainedPoor: true }, true), "check_network");
  const view = healthView({ ...initialHealthState(), sustainedPoor: true, level: 2, quality: "poor" }, false);
  assert.equal(view.suggestAudioOnly, true);
  assert.equal(view.suggestion, "audio_only");
  assert.equal(healthView({ ...initialHealthState(), sustainedPoor: true }, true).suggestAudioOnly, false);
});

function snapshot(over = {}) {
  return {
    phase: "connected",
    participants: [
      { participantId: "me", isMe: true, camera: false, screen: false },
      { participantId: "p2", isMe: false, camera: true, screen: false },
    ],
    me: { mic: true, camera: true, screen: false, audioOnly: false, network: 4 },
    ...over,
  };
}

test("monitor context comes from the engine snapshot", () => {
  assert.deepEqual(monitorContextFromSnapshot(snapshot()), {
    active: true,
    sdkLevel: 4,
    audioOnly: false,
    ctx: { sendingCamera: true, receivingVideo: true },
  });
  const audioOnly = monitorContextFromSnapshot(snapshot({ me: { mic: true, camera: false, screen: false, audioOnly: true, network: 0 } }));
  assert.equal(audioOnly.ctx.receivingVideo, false, "audio-only receives no video");
  assert.equal(monitorContextFromSnapshot(snapshot({ phase: "reconnecting" })).active, true);
  for (const phase of ["idle", "joining", "leaving", "ended", "error"]) {
    assert.equal(monitorContextFromSnapshot(snapshot({ phase })).active, false, phase);
  }
});

function fakeClock() {
  let now = 0;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => now,
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    count: () => timers.size,
    async tick(ms = HEALTH_POLL_MS) {
      now += ms;
      for (const { fn } of [...timers.values()]) fn();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("one shared 2 s timer for any number of subscribers; it stops when the last one leaves", async () => {
  const clock = fakeClock();
  let calls = 0;
  const monitor = createHealthMonitor({
    getStats: async () => {
      calls += 1;
      return S({ rttMs: 30 });
    },
    getContext: () => ({ active: true, sdkLevel: 0, audioOnly: false, ctx: {} }),
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  });
  const offA = monitor.subscribe(() => {});
  const offB = monitor.subscribe(() => {});
  assert.equal(clock.count(), 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1, "first subscriber triggers an immediate sample");
  await clock.tick();
  assert.equal(calls, 2);
  assert.equal(monitor.getSnapshot().level, 5);
  assert.equal(monitor.getSnapshot(), monitor.getSnapshot(), "snapshot identity is stable between changes");
  offA();
  assert.equal(clock.count(), 1);
  offB();
  assert.equal(clock.count(), 0);
  await clock.tick();
  assert.equal(calls, 2, "no sampling without subscribers");
});

test("monitor: not in a call → no getStats and the state resets; a failed getStats counts as unknown", async () => {
  const clock = fakeClock();
  let active = true;
  let fail = false;
  let calls = 0;
  const monitor = createHealthMonitor({
    getStats: async () => {
      calls += 1;
      if (fail) throw new Error("not_ready");
      return S({ rttMs: 30, downLossPct: 30 });
    },
    getContext: () => ({ active, sdkLevel: 0, audioOnly: false, ctx: {} }),
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  });
  let notified = 0;
  monitor.subscribe(() => {
    notified += 1;
  });
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < 3; i += 1) await clock.tick();
  assert.equal(monitor.getSnapshot().sustainedPoor, true);
  assert.equal(monitor.getSnapshot().suggestAudioOnly, true);
  fail = true;
  await clock.tick();
  assert.equal(monitor.getSnapshot().quality, "unknown");
  assert.equal(monitor.getSnapshot().sustainedPoor, true, "a stats outage alone does not clear the warning");
  active = false;
  const before = calls;
  await clock.tick();
  assert.equal(calls, before, "no getStats outside a call");
  assert.equal(monitor.getSnapshot().level, 0);
  assert.equal(monitor.getSnapshot().sustainedPoor, false, "leaving the call clears the verdict");
  assert.ok(notified > 0);
});

test("monitor: overlapping polls are skipped while one getStats is still pending", async () => {
  const clock = fakeClock();
  let release;
  let calls = 0;
  const monitor = createHealthMonitor({
    getStats: () => {
      calls += 1;
      return new Promise((resolve) => {
        release = () => resolve(S({ rttMs: 30 }));
      });
    },
    getContext: () => ({ active: true, sdkLevel: 0, audioOnly: false, ctx: {} }),
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  });
  monitor.subscribe(() => {});
  await clock.tick();
  await clock.tick();
  assert.equal(calls, 1);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  await clock.tick();
  assert.equal(calls, 2);
});

test("monitor: audio-only flips the suggestion without a new sample", async () => {
  const clock = fakeClock();
  let audioOnly = false;
  const monitor = createHealthMonitor({
    getStats: async () => S({ rttMs: 1500 }),
    getContext: () => ({ active: true, sdkLevel: 0, audioOnly, ctx: {} }),
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  });
  monitor.subscribe(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < 3; i += 1) await clock.tick();
  assert.equal(monitor.getSnapshot().suggestion, "audio_only");
  audioOnly = true;
  assert.equal(monitor.getSnapshot().suggestion, "check_network");
  assert.equal(monitor.getServerSnapshot().level, 0);
});
