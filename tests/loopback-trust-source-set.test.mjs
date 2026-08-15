// W12 —— 「网页永远不许直连本机」这条红线的源码集合防线。
//
// 路径只许是「网页 → 云端 → 已配对设备」。网页一旦能直连 loopback，
// `oceanleo.com` 上任何一个 XSS 就等于在用户电脑上执行代码。
//
// 硬规则（改坏任意一条都必须让本文件变红）：
//   1. 生产语义：`NODE_ENV=production` 下，四个信任判断一律拒绝本机地址；
//   2. 与 flag 无关的第二道门：页面自身不在 loopback 上时也一律拒绝
//      —— 这一条保证即使有人把 NODE_ENV 翻掉，线上页面仍到不了用户本机；
//   3. 源码集合：`src/api`、`src/facades`、`src/pages`、`src/shell`、`src/lib`
//      （V1 用的那个搜索空间）里不得出现任何未过硬门的本机允许分支。
//
// 白名单只有 V1 明确判定「不算残留」的那几类命中，逐条写明理由，且不含任何
// 目录级豁免。

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// chart 的网关是模块级常量，必须在 import 之前钉成 loopback：
// 「网关解析到本机」正是 V1 给的证伪场景，钉不成就测不到那条分支。
process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL = "http://localhost:8000";

const { isTrustedEditorOrigin } = await import(
  pathToFileURL(join(REPO, "src/shell/editor-protocol.ts")).href
);
const { validAssetUrl } = await import(
  pathToFileURL(join(REPO, "src/shell/editor-protocol-validation.mjs")).href
);
const { trustedArtifactMediaUrl } = await import(
  pathToFileURL(join(REPO, "src/shell/image-editor/editor-persistence.ts")).href
);
const { ChartSourceError, resolveChartSource } = await import(
  pathToFileURL(join(REPO, "src/shell/chart-editor/chart-source.ts")).href
);

// ---------------------------------------------------------------------------
// 页面身份与构建常量的替身
// ---------------------------------------------------------------------------

function setPage(origin) {
  const url = new URL(origin);
  const location = { hostname: url.hostname, origin: url.origin, href: `${url.origin}/` };
  for (const name of ["location", "window"]) {
    Object.defineProperty(globalThis, name, {
      value: name === "location" ? location : { location },
      configurable: true,
      writable: true,
    });
  }
}

function setBuild(mode) {
  process.env.NODE_ENV = mode;
}

const CHART_ITEM = {
  id: "w12-loopback-fixture",
  key: "w12-loopback-fixture",
  title: "loopback fixture",
  meta: {
    editor_manifest: {
      schema: "oceanleo.editor-manifest.v1",
      id: "chart-editor",
      version: 1,
      capabilities: ["load", "mutate", "save", "reopen"],
      source: {
        kind: "url",
        format: "echarts-option+json",
        url: "/v1/assets/library/w12-loopback-fixture/editor-source",
      },
    },
  },
};

const LOOPBACK_ORIGINS = [
  "http://localhost",
  "http://localhost:8000",
  "http://127.0.0.1",
  "http://127.0.0.1:3000",
];

function chartResolvesToLoopback() {
  try {
    const source = resolveChartSource(CHART_ITEM);
    return source.kind === "url" && /^http:\/\/localhost:8000\//.test(source.requestUrl);
  } catch (caught) {
    if (caught instanceof ChartSourceError) return false;
    throw caught;
  }
}

// ---------------------------------------------------------------------------
// 1 生产语义：本机地址一律拒绝
// ---------------------------------------------------------------------------

test("生产构建里没有任何一条通往本机的信任分支", () => {
  setBuild("production");
  // 连页面自己都在 loopback 上，也就是对这条分支最有利的处境。
  setPage("http://localhost");

  for (const origin of LOOPBACK_ORIGINS) {
    assert.equal(
      isTrustedEditorOrigin(origin),
      false,
      `生产构建仍把 ${origin} 认作受信任 editor origin`,
    );
    assert.equal(
      validAssetUrl(`${origin}/asset.png`),
      false,
      `生产构建仍接受本机资产 URL ${origin}/asset.png`,
    );
    assert.equal(
      trustedArtifactMediaUrl(`${origin}/upload.png`),
      false,
      `生产构建仍把 ${origin}/upload.png 当作已托管 URL`,
    );
  }
  assert.equal(
    chartResolvesToLoopback(),
    false,
    "生产构建仍能把 chart source 解析到本机网关并发出请求",
  );
});

// ---------------------------------------------------------------------------
// 2 与 flag 无关的第二道门：页面自身不在 loopback 上就一律拒绝
// ---------------------------------------------------------------------------

test("NODE_ENV 被翻成非 production，线上页面依然到不了本机", () => {
  setBuild("development");
  setPage("https://oceanleo.com");

  for (const origin of LOOPBACK_ORIGINS) {
    assert.equal(isTrustedEditorOrigin(origin), false, `${origin} 被 oceanleo.com 页面信任了`);
    assert.equal(validAssetUrl(`${origin}/asset.png`), false, `${origin} 资产 URL 被接受了`);
    assert.equal(trustedArtifactMediaUrl(`${origin}/upload.png`), false, `${origin} 回执被接受了`);
  }
  assert.equal(
    chartResolvesToLoopback(),
    false,
    "oceanleo.com 页面仍能把 chart source 解析到本机网关",
  );
});

test("第一方与不可信 origin 的既有判定没有被这道门改坏", () => {
  setBuild("production");
  setPage("https://oceanleo.com");
  assert.equal(isTrustedEditorOrigin("https://oceanleo.com"), true);
  assert.equal(isTrustedEditorOrigin("https://oceanleo.app"), false);
  assert.equal(validAssetUrl("https://asset.oceanleo.com/a.png"), true);
  assert.equal(validAssetUrl(undefined), true);
  assert.equal(validAssetUrl("ftp://oceanleo.com/a.png"), false);
});

// ---------------------------------------------------------------------------
// 3 断言不是空的：本机开发下这几条分支确实还活着
// ---------------------------------------------------------------------------

test("本机开发（页面自身在 loopback、非 production 构建）仍然放行", () => {
  setBuild("development");
  setPage("http://localhost");
  assert.equal(isTrustedEditorOrigin("http://localhost"), true);
  assert.equal(validAssetUrl("http://localhost/asset.png"), true);
  assert.equal(trustedArtifactMediaUrl("http://localhost/upload.png"), true);
  assert.equal(chartResolvesToLoopback(), true);
});

// ---------------------------------------------------------------------------
// 4 源码集合：五个目录里不得有未过硬门的本机允许分支
// ---------------------------------------------------------------------------

/** V1 用的搜索空间，逐字照用，不扩大成全树。 */
const SEARCH_ROOTS = [
  "src/api",
  "src/facades",
  "src/pages",
  "src/shell",
  "src/lib",
];

const LOOPBACK_PATTERN =
  /localhost|127\.0\.0\.1|0\.0\.0\.0|::1\b|wss?:\/\/|__TAURI__|tauri:\/\/|createServer\(/;

/** 硬门所在的四份文件：本机分支只许出现在它们的 gate 区块里。 */
const GATED_FILES = [
  "src/shell/editor-protocol.ts",
  "src/shell/editor-protocol-validation.mjs",
  "src/shell/chart-editor/chart-source.ts",
  "src/shell/image-editor/editor-persistence.ts",
];

/**
 * 白名单。每条必须限定到**具体行的用途**（`match` / `fn` / `commentOnly`），
 * 不许出现只写文件名或目录的整体豁免。
 */
const ALLOWLIST = [
  {
    file: "src/lib/image-ai-edit.ts",
    match: "fallbackOrigin",
    reason:
      "无 location 时的 URL 解析 fallback（V1 判定不算残留）：只用于把相对路径解析成绝对 URL，不是信任判断，也不发请求。",
  },
  {
    file: "src/lib/auth/config.ts",
    commentOnly: true,
    reason:
      "文档注释，说明 localhost 与预览域的 cookie 一律 host-only，是拒绝语义的说明，不是代码分支。",
  },
  {
    file: "src/shell/chart-editor/chart-source.ts",
    fn: "privateNetworkHostname",
    reason:
      "拒绝逻辑（V1 判定不算残留）：命中即判为私网/本机地址并拒绝，与放行无关。",
  },
];

function sourceFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.d\.(ts|mts)$/.test(entry.name)) continue;
      if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(entry.name)) found.push(path);
    }
  };
  walk(join(REPO, root));
  return found;
}

/** `[loopback-dev-gate:begin] … :end]` 区块的行号范围（1 起）。 */
function gateRanges(lines) {
  const ranges = [];
  let open = null;
  lines.forEach((line, index) => {
    if (line.includes("[loopback-dev-gate:begin]")) open = index + 1;
    else if (line.includes("[loopback-dev-gate:end]") && open !== null) {
      ranges.push([open, index + 1]);
      open = null;
    }
  });
  assert.equal(open, null, "gate 区块只有 begin 没有 end");
  return ranges;
}

/** 一个顶层函数体的行号范围（1 起）：从签名行到第一条顶格 `}`。 */
function functionRange(lines, name) {
  const start = lines.findIndex((line) => line.startsWith(`function ${name}(`));
  assert.notEqual(start, -1, `找不到函数 ${name}`);
  const end = lines.findIndex((line, index) => index > start && line === "}");
  assert.notEqual(end, -1, `函数 ${name} 没有顶格结束`);
  return [start + 1, end + 1];
}

function inRanges(line, ranges) {
  return ranges.some(([from, to]) => line >= from && line <= to);
}

test("五个目录里的每一处本机命中，都要么在硬门里、要么在白名单里", () => {
  const unjustified = [];

  for (const root of SEARCH_ROOTS) {
    for (const path of sourceFiles(root)) {
      const rel = relative(REPO, path).split("\\").join("/");
      const lines = readFileSync(path, "utf8").split("\n");
      const gates = gateRanges(lines);
      const allowed = ALLOWLIST.filter((entry) => entry.file === rel);
      const fnRanges = allowed
        .filter((entry) => entry.fn)
        .map((entry) => functionRange(lines, entry.fn));

      lines.forEach((line, index) => {
        if (!LOOPBACK_PATTERN.test(line)) return;
        const lineNumber = index + 1;
        if (inRanges(lineNumber, gates)) return;
        if (inRanges(lineNumber, fnRanges)) return;
        const trimmed = line.trim();
        const isComment =
          trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
        if (
          allowed.some(
            (entry) =>
              (entry.match && line.includes(entry.match)) ||
              (entry.commentOnly && isComment),
          )
        ) {
          return;
        }
        unjustified.push(`${rel}:${lineNumber}: ${trimmed.slice(0, 120)}`);
      });
    }
  }

  assert.deepEqual(
    unjustified,
    [],
    `以下命中既不在 [loopback-dev-gate] 硬门里，也没有白名单理由：\n${unjustified.join("\n")}`,
  );
});

test("四份文件的硬门确实是硬门，白名单也没有整体豁免", () => {
  for (const rel of GATED_FILES) {
    const text = readFileSync(join(REPO, rel), "utf8");
    const gates = gateRanges(text.split("\n"));
    assert.equal(gates.length, 1, `${rel} 的 loopback 硬门不是唯一一处`);
    const block = text.split("\n").slice(gates[0][0] - 1, gates[0][1]).join("\n");
    // 构建期常量：生产 bundle 里被替换成字面量，分支构建期不可达。
    assert.match(block, /process\.env\.NODE_ENV === "production"/, `${rel} 缺构建期常量门`);
    // 与 flag 无关的第二道门：页面自身必须也在 loopback 上。
    assert.match(block, /globalThis\.location\?\.hostname/, `${rel} 缺页面自身 origin 门`);
    assert.match(text, /localDevLoopbackOpen\(\)/, `${rel} 的分支没有调用硬门`);
  }

  for (const entry of ALLOWLIST) {
    assert.ok(
      entry.match || entry.fn || entry.commentOnly,
      `白名单条目 ${entry.file} 是整文件/整目录豁免`,
    );
    assert.ok(entry.reason && entry.reason.length > 20, `白名单条目 ${entry.file} 没写清理由`);
    assert.ok(
      !GATED_FILES.includes(entry.file) || entry.fn === "privateNetworkHostname",
      `白名单不许覆盖硬门文件 ${entry.file} 的允许分支`,
    );
  }
  assert.ok(ALLOWLIST.length <= 4, "白名单变长了，逐条复核理由");
});
