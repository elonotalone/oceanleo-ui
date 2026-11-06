import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const UI_ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIXTURE = "/root/.cache/tpp-fixtures/frames-all.json";
const WAVE_ROOT = "/root/projects/oceandino/docs/work-logs/2026-11-06-task-page-pack";

function source(relative) {
  return readFileSync(resolve(UI_ROOT, relative), "utf8");
}

function timelineReady() {
  if (!existsSync(resolve(UI_ROOT, "src/shell/task-timeline/tail-cache.ts"))) return false;
  const hook = source("src/shell/task-timeline/useTaskTimeline.ts");
  const api = source("src/lib/task-timeline-api.ts");
  return /\bloaded\b/.test(hook) && /\bfromCache\b/.test(hook) && /turns/.test(api);
}

function entriesFromFixture(rows) {
  return rows.map((row) => ({
    cursor: `c:${row.seq}`,
    source: "native",
    program: "claude",
    session_id: "cts_94c2d42ca1514383a332c1f9b1be2811",
    created_at: row.created_at,
    frame: { ...row.frame, seq: row.seq },
    no_from: row.no_from,
    no_to: row.no_to,
  }));
}

function fixtureUserIds(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const frame = row.frame || {};
    if (frame.t !== "user_message" || typeof frame.message_id !== "string" || seen.has(frame.message_id)) continue;
    seen.add(frame.message_id);
    result.push({ id: frame.message_id, text: frame.text });
  }
  return result;
}

function runDiagnostic(name) {
  const loader = resolve(UI_ROOT, "tests/ts-extension-loader.mjs");
  const result = spawnSync(process.execPath, [
    "--expose-gc",
    "--experimental-strip-types",
    "--experimental-loader",
    loader,
    resolve(WAVE_ROOT, "diag", name),
    FIXTURE,
    UI_ROOT,
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${name} failed:\n${result.stderr || result.stdout}`);
  return `${result.stdout}\n${result.stderr}`;
}

test("O1 keeps each user message in sent order with its own message id", async (t) => {
  if (!timelineReady()) return t.skip("waiting for T1 timeline mapper, tail cache, and turns API");
  if (!existsSync(FIXTURE)) return t.skip("§7 fixture is not present on this host");
  const { mapTaskTimelineEntries } = await import("../src/shell/task-timeline/map.ts");
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const expected = fixtureUserIds(fixture);
  const firstPage = mapTaskTimelineEntries(entriesFromFixture(fixture.slice(0, 22)));
  const firstUsers = firstPage.filter((row) => row.role === "user");
  assert.deepEqual(firstUsers.slice(0, 2).map((row) => row.content), ["hi", "你是谁"]);
  assert.deepEqual(firstUsers.slice(0, 2).map((row) => row.meta?.client_message_id), expected.slice(0, 2).map((item) => item.id));

  const all = mapTaskTimelineEntries(entriesFromFixture(fixture));
  let previousIndex = -1;
  for (const item of expected.slice(0, 4)) {
    const index = all.findIndex((row, at) => at > previousIndex && row.role === "user" && row.meta?.client_message_id === item.id && row.content === item.text);
    assert.ok(index > previousIndex, `missing or out-of-order user row ${item.id}`);
    previousIndex = index;
  }
  assert.equal(new Set(all.filter((row) => row.role === "user").map((row) => row.meta?.client_message_id).filter(Boolean)).size,
    all.filter((row) => row.role === "user" && row.meta?.client_message_id).length,
    "a user message id must not be reused for another visible row");
});

test("O4 exposes a per-device tail cache and distinguishes cache from first server page", (t) => {
  if (!timelineReady()) return t.skip("waiting for T1 timeline mapper, tail cache, and turns API");
  const cache = source("src/shell/task-timeline/tail-cache.ts");
  const hook = source("src/shell/task-timeline/useTaskTimeline.ts");
  assert.match(cache, /localStorage/);
  assert.match(cache, /user/i);
  assert.match(cache, /task/i);
  assert.match(cache, /600/);
  assert.match(cache, /30/);
  assert.match(hook, /fromCache/);
  assert.match(hook, /loaded/);
  assert.match(hook, /fromCache\s*:\s*false|setFromCache\(/);
});

test("O5 pages by turns and merges reset/older pages without a visible wipe", (t) => {
  if (!timelineReady()) return t.skip("waiting for T1 timeline mapper, tail cache, and turns API");
  const api = source("src/lib/task-timeline-api.ts");
  const hook = source("src/shell/task-timeline/useTaskTimeline.ts");
  assert.match(api, /turns/);
  assert.match(api, /before/);
  assert.match(hook, /loadOlder/);
  assert.match(hook, /olderLoading/);
  assert.match(hook, /type === ["']reset["']|event\.type[^\n]*reset/);
  const resetAt = Math.max(hook.indexOf('event.type === "reset"'), hook.indexOf("event.type === 'reset'"));
  assert.ok(resetAt >= 0, "reset event handler is required");
  const resetBranch = hook.slice(resetAt, resetAt + 1800);
  assert.match(resetBranch, /getTaskTimeline|applyPage/);
  assert.doesNotMatch(resetBranch, /setEntries\(\[\]\)/, "reset must merge a fresh page without emptying the visible timeline first");
});

test("O7 keeps fixture mapping within the page performance and heap budgets", async (t) => {
  if (!timelineReady()) return t.skip("waiting for T1 timeline mapper, tail cache, and turns API");
  if (!existsSync(FIXTURE)) return t.skip("§7 fixture is not present on this host");
  const perfOutput = runDiagnostic("perf.mjs");
  const frameMatch = perfOutput.match(/one new committed frame[^:]*:\s*(\d+)\s*ms/);
  assert.ok(frameMatch, `perf diagnostic did not report the incremental frame cost:\n${perfOutput}`);
  assert.ok(Number(frameMatch[1]) <= 10, `incremental frame cost ${frameMatch[1]} ms exceeds 10 ms`);

  const heapOutput = runDiagnostic("heap.mjs");
  const heapMatch = heapOutput.match(/heap held after mapping[^:]*:\s*(\d+)\s*MB/);
  assert.ok(heapMatch, `heap diagnostic did not report retained heap:\n${heapOutput}`);
  assert.ok(Number(heapMatch[1]) <= 15, `retained heap ${heapMatch[1]} MB exceeds 15 MB`);

  const { createTaskTimelineProjectionCache, mapTaskTimelineEntries } = await import("../src/shell/task-timeline/map.ts");
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const entries = entriesFromFixture(fixture);
  const newest = entries.slice(-200);
  const older = entries.slice(-400, -200);
  const cache = createTaskTimelineProjectionCache();
  mapTaskTimelineEntries(newest, { cache });
  const start = performance.now();
  mapTaskTimelineEntries([...older, ...newest], { cache });
  const olderPageMs = performance.now() - start;
  assert.ok(olderPageMs <= 50, `older page merge took ${olderPageMs.toFixed(1)} ms, over 50 ms`);
});
