// W14 · 通话检测：连接测试编排（test-token → 独立诊断引擎 → 发布音频 5 秒 → 统计 → 离开）与媒体探针纯函数。
import assert from "node:assert/strict";
import test from "node:test";
import {
  JOIN_FAIR_MS,
  JOIN_POOR_MS,
  TEST_DURATION_MS,
  connectionTestErrorCode,
  connectionTestErrorText,
  gradeConnection,
  gradeLabel,
  joinLevel,
  runConnectionTest,
  summarizeSamples,
} from "../src/shell/messages/call/diagnostics/connection-test.ts";
import {
  chimeDurationSec,
  chimeNotes,
  levelFromRms,
  mediaErrorCode,
  mediaErrorText,
  rmsOf,
  splitDevices,
} from "../src/shell/messages/call/diagnostics/media-probes.ts";

const RTC = {
  app_id: "app-x",
  channel_id: "diag-0123",
  user_id: "u0123",
  token: "eyJhbGciOi.fake.token-value-for-tests",
  timestamp: 1_900_000_000,
  expires_at: "2030-01-01T00:00:00Z",
};

function fakeEngine({ stats = [], joinError = null, joinNever = false, statsError = false } = {}) {
  const log = [];
  let i = 0;
  return {
    log,
    engine: {
      async join(rtc, opts) {
        log.push(["join", rtc.channel_id, opts]);
        if (joinNever) return new Promise(() => {});
        if (joinError) throw joinError;
      },
      async getStats() {
        log.push(["stats"]);
        if (statsError) throw new Error("no stats");
        return stats[Math.min(i++, stats.length - 1)] ?? { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null };
      },
      async leave() {
        log.push(["leave"]);
      },
    },
  };
}

function clockDeps() {
  let now = 1000;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    advance(ms) {
      now += ms;
    },
  };
}

test("happy path: diag token → independent engine → 5 s of samples → leave → grade + raw numbers", async () => {
  const { engine, log } = fakeEngine({
    stats: [
      { rttMs: 40, upLossPct: null, downLossPct: null, upKbps: 30, downKbps: null },
      { rttMs: 60, upLossPct: null, downLossPct: null, upKbps: 34, downKbps: null },
      { rttMs: 50, upLossPct: null, downLossPct: null, upKbps: 32, downKbps: null },
    ],
  });
  const clock = clockDeps();
  const stages = [];
  let tokenCalls = 0;
  const result = await runConnectionTest({
    testToken: async () => {
      tokenCalls += 1;
      return { rtc: RTC };
    },
    createEngine: async () => {
      clock.advance(0);
      return engine;
    },
    sleep: clock.sleep,
    now: clock.now,
    micDeviceId: "mic-2",
    displayName: "测试甲",
    onProgress: (p) => stages.push(p.stage),
  });
  assert.equal(tokenCalls, 1);
  assert.equal(TEST_DURATION_MS, 5000);
  assert.deepEqual(log[0], ["join", "diag-0123", { displayName: "测试甲", micDeviceId: "mic-2" }]);
  assert.equal(log.filter(([k]) => k === "stats").length, 5, "one sample per second for 5 s");
  assert.deepEqual(log.at(-1), ["leave"]);
  assert.equal(result.error, null);
  assert.equal(result.grade, "good");
  assert.equal(result.numbers.rttMs, 50, "median RTT");
  assert.equal(result.numbers.upKbps, 32);
  assert.equal(result.numbers.upLossPct, null, "not measurable in a solo diag channel → null, not 0");
  assert.equal(result.numbers.downLossPct, null);
  assert.equal(result.numbers.joinMs, 0);
  assert.deepEqual([...new Set(stages)], ["token", "engine", "joining", "measuring", "leaving"]);
});

test("grading uses loss/RTT and join time, worst wins", () => {
  assert.equal(joinLevel(null), 0);
  assert.equal(joinLevel(JOIN_FAIR_MS - 1), 5);
  assert.equal(joinLevel(JOIN_FAIR_MS), 3);
  assert.equal(joinLevel(JOIN_POOR_MS), 2);
  const base = { rttMs: 40, upLossPct: null, downLossPct: null, upKbps: 30, downKbps: null };
  assert.equal(gradeConnection({ ...base, joinMs: 500 }).grade, "good");
  assert.equal(gradeConnection({ ...base, joinMs: 4000 }).grade, "fair");
  assert.equal(gradeConnection({ ...base, joinMs: 9000 }).grade, "poor");
  assert.equal(gradeConnection({ ...base, rttMs: 420, joinMs: 500 }).grade, "fair");
  assert.equal(gradeConnection({ ...base, rttMs: 900, joinMs: 500 }).grade, "poor");
  assert.equal(gradeConnection({ ...base, downLossPct: 30, joinMs: 500 }).grade, "poor");
  assert.deepEqual(["good", "fair", "poor"].map(gradeLabel), ["连接：好", "连接：一般", "连接：差"]);
});

test("samples are summarised robustly: median for RTT/bitrate, max for loss, null when never measured", () => {
  const s = summarizeSamples([
    { rttMs: 40, upLossPct: null, downLossPct: 1, upKbps: 10, downKbps: null },
    { rttMs: 900, upLossPct: null, downLossPct: 6, upKbps: 30, downKbps: null },
    { rttMs: 50, upLossPct: null, downLossPct: 2, upKbps: 20, downKbps: null },
    { rttMs: 60, upLossPct: null, downLossPct: null, upKbps: 40, downKbps: null },
  ]);
  assert.equal(s.rttMs, 55);
  assert.equal(s.downLossPct, 6);
  assert.equal(s.upKbps, 25);
  assert.equal(s.upLossPct, null);
  assert.equal(s.downKbps, null);
  assert.deepEqual(summarizeSamples([]), { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null });
});

test("token errors map to precise reasons and no engine is created", async () => {
  let created = 0;
  const fail = (status, code) => Object.assign(new Error(code), { status, code });
  for (const [error, code] of [
    [fail(429, "rate_limited"), "rate_limited"],
    [fail(503, "artc_not_configured"), "artc_not_configured"],
    [fail(401, "http_401"), "not_signed_in"],
    [fail(0, "network"), "network"],
    [fail(500, "boom"), "failed"],
  ]) {
    const result = await runConnectionTest({
      testToken: async () => {
        throw error;
      },
      createEngine: async () => {
        created += 1;
        return fakeEngine().engine;
      },
      ...clockDeps(),
    });
    assert.equal(result.grade, "failed");
    assert.equal(result.error, code);
    assert.equal(result.numbers, null);
  }
  assert.equal(created, 0);
});

test("SDK / join failures map to reasons and the engine is always left", async () => {
  const sdkFail = await runConnectionTest({
    testToken: async () => ({ rtc: RTC }),
    createEngine: async () => {
      throw new Error("artc_sdk_load_failed");
    },
    ...clockDeps(),
  });
  assert.equal(sdkFail.error, "sdk_unavailable");

  const { engine, log } = fakeEngine({ joinError: new Error("join refused") });
  const joinFail = await runConnectionTest({ testToken: async () => ({ rtc: RTC }), createEngine: async () => engine, ...clockDeps() });
  assert.equal(joinFail.error, "join_failed");
  assert.deepEqual(log.at(-1), ["leave"]);

  const hung = fakeEngine({ joinNever: true });
  const timeout = await runConnectionTest({
    testToken: async () => ({ rtc: RTC }),
    createEngine: async () => hung.engine,
    joinTimeoutMs: 20,
    ...clockDeps(),
  });
  assert.equal(timeout.error, "join_timeout");
  assert.deepEqual(hung.log.at(-1), ["leave"]);

  assert.equal(connectionTestErrorCode(new Error("artc_browser_unsupported"), "engine"), "unsupported");
  assert.equal(connectionTestErrorCode(new Error("multi_instance_unsupported"), "engine"), "in_call_unavailable");
});

test("closing the panel mid-test aborts, leaves the channel and reports no error text", async () => {
  const { engine, log } = fakeEngine({ stats: [{ rttMs: 40, upLossPct: null, downLossPct: null, upKbps: 30, downKbps: null }] });
  const controller = new AbortController();
  const clock = clockDeps();
  let sleeps = 0;
  const result = await runConnectionTest({
    testToken: async () => ({ rtc: RTC }),
    createEngine: async () => engine,
    now: clock.now,
    sleep: async (ms) => {
      sleeps += 1;
      if (sleeps === 2) controller.abort();
      await clock.sleep(ms);
    },
    signal: controller.signal,
  });
  assert.equal(result.error, "aborted");
  assert.equal(result.grade, "failed");
  assert.deepEqual(log.at(-1), ["leave"]);
  assert.equal(connectionTestErrorText("aborted"), null);
});

test("a stats hiccup skips that sample instead of inventing numbers", async () => {
  const { engine } = fakeEngine({ statsError: true });
  const result = await runConnectionTest({ testToken: async () => ({ rtc: RTC }), createEngine: async () => engine, ...clockDeps() });
  assert.equal(result.error, null);
  assert.equal(result.numbers.rttMs, null);
  assert.equal(result.numbers.upKbps, null);
  assert.equal(result.grade, "good", "joined fast; graded on join time only");
});

test("every error code has a sentence (except aborted)", () => {
  for (const code of [
    "rate_limited",
    "artc_not_configured",
    "not_signed_in",
    "network",
    "unsupported",
    "sdk_unavailable",
    "join_failed",
    "join_timeout",
    "in_call_unavailable",
    "failed",
  ]) {
    assert.match(connectionTestErrorText(code), /[一-鿿]/, code);
  }
});

test("media helpers: getUserMedia errors, device split, meter scale, test chime", () => {
  assert.equal(mediaErrorCode({ name: "NotAllowedError" }), "permission");
  assert.equal(mediaErrorCode({ name: "SecurityError" }), "permission");
  assert.equal(mediaErrorCode({ name: "NotFoundError" }), "not_found");
  assert.equal(mediaErrorCode({ name: "OverconstrainedError" }), "not_found");
  assert.equal(mediaErrorCode({ name: "NotReadableError" }), "busy");
  assert.equal(mediaErrorCode({ name: "TypeError" }), "unsupported");
  assert.equal(mediaErrorCode(new Error("x")), "failed");
  assert.equal(mediaErrorText("mic", "busy"), "麦克风被其他程序占用，或者无法打开。");
  assert.equal(mediaErrorText("camera", "not_found"), "没有找到摄像头。");

  const lists = splitDevices([
    { kind: "audioinput", deviceId: "default", label: "Default - Mic A" },
    { kind: "audioinput", deviceId: "a", label: "Mic A" },
    { kind: "audioinput", deviceId: "a", label: "Mic A (dup)" },
    { kind: "audioinput", deviceId: "", label: "" },
    { kind: "videoinput", deviceId: "cam", label: "" },
    { kind: "audiooutput", deviceId: "spk", label: "Speakers" },
  ]);
  assert.deepEqual(lists.microphones.map((d) => d.deviceId), ["default", "a"]);
  assert.deepEqual(lists.cameras, [{ deviceId: "cam", label: "" }]);
  assert.deepEqual(lists.speakers, [{ deviceId: "spk", label: "Speakers" }]);

  assert.equal(levelFromRms(0), 0);
  assert.equal(levelFromRms(0.0005), 0, "below -60 dB is silence");
  assert.equal(levelFromRms(1), 1);
  assert.ok(Math.abs(levelFromRms(0.1) - 2 / 3) < 1e-9, "-20 dB → 2/3");
  assert.equal(rmsOf([]), 0);
  assert.ok(Math.abs(rmsOf([0.5, -0.5, 0.5, -0.5]) - 0.5) < 1e-12);

  const notes = chimeNotes();
  assert.ok(notes.length >= 3);
  assert.ok(notes.every((n) => n.frequency > 200 && n.frequency < 2000), "audible, not harsh");
  const total = chimeDurationSec(notes);
  assert.ok(total > 1 && total < 2.5, `chime ${total}s`);
});
