// ============================================================================
// W4 —— `/v1/library/search` 的站级作用域参数转发（合同 §3.2、D9）
// ----------------------------------------------------------------------------
// 参数名由 W5（消费端）与 W7（后端）共锁在合同 §3.2，`searchArtifactLibrary` 是唯一
// 的出口：它用 `URLSearchParams` 自建 query，认不出来的 key 会被直接丢掉。W5 侧已经
// 在传这三个 key 了，这里锁死它们真的到得了 URL，且**不传时请求逐字不变**。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "typescript";

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileModule(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

const artifactClientUrl = await compileModule("src/shell/artifact-client.ts", {
  "../lib/auth/client": dataModule(
    `export async function accessToken() { return "scope-params-token"; }`,
  ),
  "../lib/auth/config": dataModule(
    `export const GATEWAY_BASE = "https://api.test";`,
  ),
  "./artifact-contract": pathToFileURL(
    resolve("src/shell/artifact-contract.ts"),
  ).href,
  "./library-data": pathToFileURL(resolve("src/shell/library-data.ts")).href,
});
const { searchArtifactLibrary } = await import(artifactClientUrl);

/** 记下请求 URL；响应故意给一个空的 public envelope，本文件只关心 query。 */
function captureSearchUrl() {
  const seen = [];
  globalThis.fetch = async (input) => {
    seen.push(new URL(String(input)));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        schema: "oceanleo.library.v1",
        scope: "public",
        items: [],
        total: 0,
      }),
    };
  };
  return seen;
}

test("§3.2 的三个作用域参数原名到达 /v1/library/search", async () => {
  const seen = captureSearchUrl();

  const result = await searchArtifactLibrary({
    query: "海报",
    artifactTypes: "single_file_image,model_3d",
    originSiteKey: "image",
    originAppId: "poster",
    limit: 24,
  });

  assert.equal(result.ok, true, result.error);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].pathname, "/v1/library/search");
  assert.deepEqual(Object.fromEntries(seen[0].searchParams), {
    limit: "24",
    q: "海报",
    artifactTypes: "single_file_image,model_3d",
    originSiteKey: "image",
    originAppId: "poster",
  });
  // 逐字核对合同 §3.2 的拼写：改名会让 W5/W7 两侧同时哑掉，必须在这里就炸。
  for (const key of ["artifactTypes", "originSiteKey", "originAppId"]) {
    assert.ok(seen[0].searchParams.has(key), `${key} 没到 URL`);
  }
  // 单值的老 `artifactType` 与多值的新 `artifactTypes` 不得互相顶替。
  assert.equal(seen[0].searchParams.has("artifactType"), false);
});

test("三个参数都不传时，请求与本轮之前逐字一致（回归保护）", async () => {
  const seen = captureSearchUrl();

  await searchArtifactLibrary({ query: "海报", limit: 24 });
  await searchArtifactLibrary({
    query: "海报",
    limit: 24,
    // 空串 / undefined 都算「没传」，不许退化成 `originSiteKey=`。
    artifactTypes: "",
    originSiteKey: "   ",
    originAppId: undefined,
  });

  const expected = { limit: "24", q: "海报" };
  assert.deepEqual(Object.fromEntries(seen[0].searchParams), expected);
  assert.deepEqual(Object.fromEntries(seen[1].searchParams), expected);
  assert.equal(seen[0].search, seen[1].search);
});

test("单类型老调用点不受影响，artifactType 仍按原样发", async () => {
  const seen = captureSearchUrl();

  await searchArtifactLibrary({ artifactType: "model_3d", limit: 12 });

  assert.deepEqual(Object.fromEntries(seen[0].searchParams), {
    limit: "12",
    artifactType: "model_3d",
  });
});
