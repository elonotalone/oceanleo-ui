// W03（oceanleo-bay R4-FEED）：未登录逛信息流时，空列表不要画成网络错误。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function abortErr(message = "Aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function httpStub(body) {
  return dataModule(`
    export class BayApiError extends Error {
      constructor(message, status, code = null) {
        super(message);
        this.name = "BayApiError";
        this.status = status;
        this.code = code;
      }
    }
    export async function bayGet(path, opts) {
      ${body}
    }
  `);
}

async function loadFeed(bayGetBody) {
  return import(
    await compileModule("src/lib/bay/feed.ts", {
      "./http": httpStub(bayGetBody),
    })
  );
}

async function loadHttp(authedSource) {
  return import(
    await compileModule("src/lib/bay/http.ts", {
      "../agent": dataModule(`export async function authed() { ${authedSource} }`),
      "../auth/config": dataModule(`export const GATEWAY_BASE = "https://api.dev.oceanleo.com";`),
    })
  );
}

test("匿名 200 空列表：normalize 后无条目、无错误", async () => {
  const feed = await loadFeed(`
    if (!opts || opts.anonymous !== true) throw new Error("feed must be anonymous");
    return { items: [], next_cursor: null };
  `);
  const page = await feed.fetchBayFeed();
  assert.deepEqual(page, { items: [], next_cursor: null });
});

test("401 / 403：信息流当成空列表，不抛", async () => {
  for (const status of [401, 403]) {
    const feed = await loadFeed(`
      throw new BayApiError("${status === 401 ? "未登录" : "禁止"}", ${status});
    `);
    const page = await feed.fetchBayFeed();
    assert.deepEqual(page, { items: [], next_cursor: null }, String(status));
    assert.equal(feed.classifyBayFeedCaught({ status }), "empty", `classify ${status}`);
    assert.equal(feed.isBayFeedAuthMiss({ status }), true, `auth miss ${status}`);
  }
});

test("AbortError 与被替换的请求：不把上一枪写成错误", async () => {
  const feed = await loadFeed(`
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  `);
  await assert.rejects(() => feed.fetchBayFeed(), (error) => error instanceof Error && error.name === "AbortError");
  const aborted = abortErr();
  assert.equal(feed.classifyBayFeedCaught(aborted), "ignore");
  assert.equal(feed.classifyBayFeedCaught(aborted, { aborted: true }), "ignore");
  assert.equal(feed.classifyBayFeedCaught({ status: 0, message: "网络错误，请稍后再试。" }, { stale: true }), "ignore");
  assert.equal(feed.classifyBayFeedCaught({ status: 0, message: "网络错误，请稍后再试。" }, { aborted: true }), "ignore");
});

test("匿名 bayGet：abort 保持 AbortError，不改写成网络错误", async () => {
  const http = await loadHttp(`return { ok: false, error: "未登录", status: 401 };`);
  const already = new AbortController();
  already.abort();
  await assert.rejects(
    () => http.bayGet("/v1/talent/bay/feed?kind=all", { anonymous: true, signal: already.signal }),
    (error) => error instanceof Error && error.name === "AbortError",
  );

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw abortErr();
  };
  try {
    await assert.rejects(
      () => http.bayGet("/v1/talent/bay/feed?kind=all", { anonymous: true, signal: new AbortController().signal }),
      (error) => error instanceof Error && error.name === "AbortError" && error.message !== "网络错误，请稍后再试。",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("useBayFeed 用分类函数消化 401/403/abort", () => {
  const text = readFileSync(join(REPO, "src/shell/bay/shell/use-bay-data.ts"), "utf8");
  assert.match(text, /classifyBayFeedCaught/);
  assert.match(text, /action === "ignore"/);
  assert.match(text, /action === "empty"/);
  assert.match(text, /bayFeedErrorText/);
  assert.doesNotMatch(text, /setError\(errorText\(caught\)\)/);
});

test("useBayFeed：页面 demand→接口 needs，其余→supply", () => {
  const text = readFileSync(join(REPO, "src/shell/bay/shell/use-bay-data.ts"), "utf8");
  assert.match(text, /filter\.kind === "demand" \? "needs" : "supply"/);
  assert.match(text, /fetchBayFeed\(\{ kind, category, q \}/);
});
