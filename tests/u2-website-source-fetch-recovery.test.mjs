import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hydrateWebsiteLocalSource,
  isTransientWebsiteSourceError,
  isWebsiteSourceGone,
  planWebsiteLocalSource,
} from "../src/shell/website-local/website-local-source.ts";
import { blankWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";

const SOURCE_URL = "/v1/artifact-renditions/access/tok-1";
const projectJson = JSON.stringify(blankWebsiteSource("恢复测试"));
const remotePlan = () =>
  planWebsiteLocalSource({
    artifactId: "45e0db0b-ed6a-4996-91c3-5e9f388d7f1d",
    artifact: { renditions: { source: { url: SOURCE_URL } } },
  });
const noDelay = () => 0;

test("website Edit retries a transient Failed to fetch instead of failing at once", async () => {
  const plan = remotePlan();
  assert.equal(plan.kind, "remote");
  let calls = 0;
  const loaded = await hydrateWebsiteLocalSource(
    plan,
    async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("Failed to fetch");
      return projectJson;
    },
    { delayMs: noDelay },
  );
  assert.equal(loaded.ok, true);
  assert.equal(calls, 3);
});

test("website Edit gives up after the bounded retries and keeps the original", async () => {
  let calls = 0;
  const loaded = await hydrateWebsiteLocalSource(
    remotePlan(),
    async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    },
    { delayMs: noDelay },
  );
  assert.equal(loaded.ok, false);
  assert.equal(calls, 3);
  assert.match(loaded.error, /Failed to fetch/);
  assert.match(loaded.error, /未改用空白稿覆盖原件/);
});

test("website Edit re-signs once on 410 and loads from the fresh address", async () => {
  const seen = [];
  const loaded = await hydrateWebsiteLocalSource(
    remotePlan(),
    async (url) => {
      seen.push(url);
      if (url === SOURCE_URL) throw new Error("媒体加载失败 HTTP 410");
      return projectJson;
    },
    {
      delayMs: noDelay,
      refreshUrl: async (gone) => {
        assert.equal(gone, SOURCE_URL);
        return "/v1/artifact-renditions/access/tok-2";
      },
    },
  );
  assert.equal(loaded.ok, true);
  assert.deepEqual(seen, [SOURCE_URL, "/v1/artifact-renditions/access/tok-2"]);
});

test("website Edit does not loop when the re-signed address is also gone", async () => {
  let refreshes = 0;
  const loaded = await hydrateWebsiteLocalSource(
    remotePlan(),
    async () => {
      throw new Error("媒体加载失败 HTTP 410");
    },
    {
      delayMs: noDelay,
      refreshUrl: async () => {
        refreshes += 1;
        return `/v1/artifact-renditions/access/fresh-${refreshes}`;
      },
    },
  );
  assert.equal(loaded.ok, false);
  assert.equal(refreshes, 1);
  assert.match(loaded.error, /410/);
});

test("deterministic failures are not retried", async () => {
  for (const failure of [
    new Error("媒体加载失败 HTTP 403"),
    new Error("媒体加载失败 HTTP 404"),
  ]) {
    let calls = 0;
    const loaded = await hydrateWebsiteLocalSource(
      remotePlan(),
      async () => {
        calls += 1;
        throw failure;
      },
      { delayMs: noDelay },
    );
    assert.equal(loaded.ok, false);
    assert.equal(calls, 1);
  }
  let parseCalls = 0;
  const invalid = await hydrateWebsiteLocalSource(
    remotePlan(),
    async () => {
      parseCalls += 1;
      return "<html>not a website-source</html>";
    },
    { delayMs: noDelay },
  );
  assert.equal(invalid.ok, false);
  assert.equal(parseCalls, 1);
});

test("an aborted load is neither retried nor refreshed", async () => {
  const abort = new AbortController();
  abort.abort();
  let calls = 0;
  const loaded = await hydrateWebsiteLocalSource(
    remotePlan(),
    async () => {
      calls += 1;
      throw new DOMException("aborted", "AbortError");
    },
    { delayMs: noDelay, signal: abort.signal },
  );
  assert.equal(loaded.ok, false);
  assert.equal(calls, 1);
});

test("5xx and 429 are transient; 410 is the expiry signal", () => {
  assert.equal(isTransientWebsiteSourceError(new TypeError("Failed to fetch")), true);
  assert.equal(isTransientWebsiteSourceError(new Error("媒体加载失败 HTTP 502")), true);
  assert.equal(isTransientWebsiteSourceError(new Error("媒体加载失败 HTTP 429")), true);
  assert.equal(isTransientWebsiteSourceError(new Error("媒体加载失败 HTTP 404")), false);
  assert.equal(isWebsiteSourceGone(new Error("媒体加载失败 HTTP 410")), true);
  assert.equal(isWebsiteSourceGone(new Error("媒体加载失败 HTTP 403")), false);
});

test("WebsiteLocalRoute wires gateway source re-sign and the abort signal", () => {
  const route = readFileSync(
    "src/shell/advanced-routes/WebsiteLocalRoute.tsx",
    "utf8",
  );
  assert.match(route, /refreshArtifactRendition\(/);
  assert.match(route, /\{ artifactId, revisionId \},\s*"source"/);
  assert.match(route, /refreshUrl:/);
  assert.match(route, /signal: abort\.signal,\s*\n\s*refreshUrl/);
});
