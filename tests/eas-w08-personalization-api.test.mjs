// 个性化网关客户端（editors-and-shell-0924 W08）：
// 404/405 是「还没启用」，不是某条记忆丢了；失败只给码；字数按 Unicode 字符算。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w08-personalization-api.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const {
  countChars,
  getPersonalization,
  updatePersonalization,
  listMemories,
  importMemories,
  getMemoryImportPrompt,
} = await import(
  await compileModule("src/lib/personalization-api.ts", {
    "./auth/client": dataModule(`
      export async function accessToken() { return globalThis.__w08Token; }
    `),
    "./auth/config": dataModule(`
      export const GATEWAY_BASE = "https://gw.test";
    `),
  })
);

function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withFetch(handler, fn) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return handler(url, init || {}, calls);
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = previous;
    })
    .then((result) => ({ result, calls }));
}

test("countChars 按字符数：一个表情算 1，不是 2", () => {
  assert.equal(countChars("a".repeat(1500)), 1500);
  assert.equal(countChars("🙂"), 1);
  assert.equal(countChars("🙂".repeat(1500)), 1500);
});

test("没登录只回 signed_out，不发请求", async () => {
  globalThis.__w08Token = "";
  const previous = globalThis.fetch;
  let hit = 0;
  globalThis.fetch = async () => {
    hit += 1;
    return jsonResponse(200, {});
  };
  try {
    const res = await getPersonalization();
    assert.deepEqual(res, { ok: false, error: "signed_out", status: 401 });
    assert.equal(hit, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("GET /v1/personalization 404 是 not_available", async () => {
  globalThis.__w08Token = "t";
  const { result, calls } = await withFetch(() => jsonResponse(404, { detail: "missing" }), () =>
    getPersonalization(),
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "not_available");
  assert.equal(result.status, 404);
  assert.equal(calls[0].url, "https://gw.test/v1/personalization");
});

test("PATCH /v1/personalization 只发补丁；瘦回执仍算成功", async () => {
  globalThis.__w08Token = "t";
  const { result, calls } = await withFetch(() => jsonResponse(200, {}), () =>
    updatePersonalization({ memory_enabled: false }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data, null);
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(JSON.parse(calls[0].init.body).memory_enabled, false);
});

test("listMemories 只收下能认的行；缺字段不把整页打白", async () => {
  globalThis.__w08Token = "t";
  const { result } = await withFetch(
    () =>
      jsonResponse(200, {
        items: [
          { id: "a", content: "先给结论", kind: "preference", enabled: false, use_count: 3 },
          { content: "没有 id 的脏行" },
          { id: "b", content: "在深圳" },
        ],
      }),
    () => listMemories(),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].enabled, false);
  assert.equal(result.data[0].use_count, 3);
  assert.equal(result.data[1].kind, "fact");
  assert.equal(result.data[1].enabled, true);
});

test("POST /v1/memories/import 405 是 not_available；200 收下 imported / skipped", async () => {
  globalThis.__w08Token = "t";
  const missing = await withFetch(() => jsonResponse(405, { detail: "method" }), () =>
    importMemories("一段回答"),
  );
  assert.equal(missing.result.ok, false);
  assert.equal(missing.result.error, "not_available");

  const { result, calls } = await withFetch(
    () =>
      jsonResponse(200, {
        imported: 2,
        skipped: [{ content: "重复", reason: "duplicate" }, { reason: 1 }],
      }),
    () => importMemories("一段回答"),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    imported: 2,
    skipped: [
      { content: "重复", reason: "duplicate" },
      { content: "", reason: "" },
    ],
  });
  assert.equal(calls[0].url, "https://gw.test/v1/memories/import");
});

test("import-prompt 认 prompt / text 两种回执", async () => {
  globalThis.__w08Token = "t";
  const a = await withFetch(() => jsonResponse(200, { prompt: "  发给别的 AI  " }), () =>
    getMemoryImportPrompt("zh"),
  );
  assert.equal(a.result.data, "  发给别的 AI  ");
  assert.match(a.calls[0].url, /lang=zh$/);

  const b = await withFetch(() => jsonResponse(200, { text: "另一段" }), () =>
    getMemoryImportPrompt("en"),
  );
  assert.equal(b.result.data, "另一段");
});
