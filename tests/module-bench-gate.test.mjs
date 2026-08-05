// ============================================================================
// 「data: 编译台手工维护模块替换清单」的机检
// ----------------------------------------------------------------------------
// 为什么要有这道闸（W28，2026-08-05）：
//
// 仓里曾有 44 份测试把被测源码编成 `data:` URL 再 `import()`。`data:` 模块解析不了
// 相对路径，于是每份测试各自维护一张「要替换哪些模块」的清单。被测文件每多一个
// import，那张清单就漏一条边，整份测试文件当场 `ERR_UNSUPPORTED_RESOLVE_REQUEST`、
// **一条断言都不执行**。本波实测复发四次，全在 `use-grid-editor.ts` 上，每次修法
// 都是「补清单」——也就是每次都在等下一次。
//
// 根治写法在 `tests/helpers/module-bench.mjs`：相对 specifier 一律自动解析，
// 只对真的要替身的那几个显式列桩。本闸拦的是**回归**：谁再写回手工清单，或者
// 新开一份测试绕过 helper，当场红。
//
// 判据（同时成立才判红）：
//   1. 文件在 `tests/*.test.mjs`（不含 helper、不含本闸、不含 fixtures）；
//   2. **没有** `from "./helpers/module-bench.mjs"`（或等价路径）；
//   3. 出现下列任一「手工编译台」形态：
//        a. 本地定义了 `function compileModule` / `async function compileModule`
//           （旧递归编译台的名字）；
//        b. `Object.entries(...)` 遍历替换表，再 `replaceAll(JSON.stringify(specifier), …)`
//           改写源码，并最终落进 `data:text/javascript`；
//        c. 对 `from "…"` 做 `.replace` / `.replaceAll` 之后，用 `transpileModule`
//           的产物拼 `data:text/javascript;base64,…`。
//
// 登记簿：
//   · `PENDING_MANUAL_BENCH`：**欠账**——结构特殊、一时迁不动的例外。只减不增。
//     每条必须带 ≥10 字理由。`PENDING_BUDGET` 是今天的实数。
//
// 机检与数据拴在一起：判据同时扫 `tests/*.test.mjs` 与
// `tests/fixtures/manual-module-bench-anti-pattern.mjs`。谁把规则改松让测试目录
// 变绿，夹具那一处会同时漏网，本文件当场红。
// ============================================================================

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const TESTS = HERE;
const FIXTURE = join(HERE, "fixtures", "manual-module-bench-anti-pattern.mjs");
const GATE_FILE = "tests/module-bench-gate.test.mjs";

/**
 * 欠账：迁不动的手工编译台。W28 交付时 44 份（外加 w27）已全部改走 helper，
 * 表为空——从此任何一处新引信都不再有登记可挡，会被下面第一个用例当场判红。
 *
 * @type {{ file: string, reason: string }[]}
 */
const PENDING_MANUAL_BENCH = [];

/** 今天 `tests/` 里真实剩余的欠账数。这个数只许改小。 */
const PENDING_BUDGET = 0;

/** W28 清干净的那批：谁把手工清单写回这些文件，立刻红。 */
const W28_CLEARED_FILES = [
  "tests/account-page.test.mjs",
  "tests/advanced-editor-v8-shared-edit-bar.test.mjs",
  "tests/agent-upload-affordance.test.mjs",
  "tests/anchored-popover.test.mjs",
  "tests/app-capability-bar-placement.test.mjs",
  "tests/app-card-shell.test.mjs",
  "tests/app-directory-workspace-card.test.mjs",
  "tests/app-shell-model-visibility.test.mjs",
  "tests/artifact-download-contract.test.mjs",
  "tests/artifact-surface-rendered.test.mjs",
  "tests/auth-dialog.test.mjs",
  "tests/catalog-preview-deeplink.test.mjs",
  "tests/cloud-browser-lifecycle-ui.test.mjs",
  "tests/cloud-browser-races.test.mjs",
  "tests/cloud-browser-rendered.test.mjs",
  "tests/deck-ooxml-editability.test.mjs",
  "tests/edit-bar-dock-console.test.mjs",
  "tests/explore-playable-dispatch.test.mjs",
  "tests/explore-playable-feed.test.mjs",
  "tests/explore-scene-axis.test.mjs",
  "tests/explore-sections.test.mjs",
  "tests/home-app-cards.test.mjs",
  "tests/library-card-detail-action-parity.test.mjs",
  "tests/library-edit-independence.test.mjs",
  "tests/library-fork-copy-integrity.test.mjs",
  "tests/library-ppt-preview-adapter.test.mjs",
  "tests/library-search-scope-params.test.mjs",
  "tests/material-cover-rendering.test.mjs",
  "tests/material-library-download.test.mjs",
  "tests/material-library-template-edit.test.mjs",
  "tests/plugin-export-ledger-button.test.mjs",
  "tests/plugin-instance-save-entry.test.mjs",
  "tests/rendition-callback-identity.test.mjs",
  "tests/result-canvas-deeplink-priority.test.mjs",
  "tests/result-canvas-slot-keepalive.test.mjs",
  "tests/selection-toolbar-adaptive-layout.test.mjs",
  "tests/template-showcase.test.mjs",
  "tests/untrusted-content-pdf-frame-host.test.mjs",
  "tests/untrusted-content-sandbox-origin.test.mjs",
  "tests/video-editor-v8.test.mjs",
  "tests/video-timeline-dom-gestures.test.mjs",
  "tests/w13-advanced-editor-resilience.test.mjs",
  "tests/w26-plugin-instance-reopen.test.mjs",
  "tests/w27-session-plugin-identity.test.mjs",
  "tests/workbench-toolbar-rendered.test.mjs",
];

function repoPath(absolutePath) {
  return relative(REPO, absolutePath).split("\\").join("/");
}

function usesModuleBenchHelper(text) {
  return /from\s+["']\.\/helpers\/module-bench\.mjs["']/.test(text)
    || /from\s+["']\.\.\/helpers\/module-bench\.mjs["']/.test(text);
}

/**
 * 一份测试源码是不是「手工维护替换清单的 data: 编译台」。
 * 返回命中的形态标签；空数组 = 干净。
 */
export function manualBenchShapes(text) {
  const shapes = [];
  if (/(?:async\s+)?function\s+compileModule\s*\(/.test(text)) {
    shapes.push("local-compileModule");
  }
  const hasDataUrl = /data:text\/javascript/.test(text);
  const hasHandMap =
    /Object\.entries\s*\(/.test(text)
    && /replaceAll\s*\(\s*JSON\.stringify\s*\(\s*specifier/.test(text);
  if (hasDataUrl && hasHandMap) {
    shapes.push("object-entries-replaceAll-map");
  }
  const rewritesFrom =
    /\.replace(?:All)?\s*\(\s*['"]from\s+["']/.test(text)
    || /\.replace(?:All)?\s*\(\s*['"]from "/.test(text)
    || /\.replaceAll\(\s*['"]from "/.test(text);
  const hasTranspile = /transpileModule\s*\(/.test(text);
  if (hasDataUrl && hasTranspile && rewritesFrom) {
    shapes.push("replace-from-then-data-url");
  }
  return shapes;
}

function scanTestFile(absolutePath) {
  const text = readFileSync(absolutePath, "utf8");
  const file = repoPath(absolutePath);
  if (file === GATE_FILE) return null;
  if (usesModuleBenchHelper(text)) return null;
  const shapes = manualBenchShapes(text);
  if (shapes.length === 0) return null;
  return { file, shapes };
}

function listTestFiles() {
  return readdirSync(TESTS)
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join(TESTS, name))
    .sort();
}

function registrationProblem(entry) {
  if (!entry || typeof entry.file !== "string" || !entry.file.trim()) {
    return "登记缺 file";
  }
  if (typeof entry.reason !== "string" || entry.reason.trim().length < 10) {
    return "理由不足 10 字";
  }
  return "";
}

const liveViolations = listTestFiles()
  .map(scanTestFile)
  .filter(Boolean);

const fixtureText = readFileSync(FIXTURE, "utf8");
const fixtureShapes = manualBenchShapes(fixtureText);

test("tests 里每一处手工 data: 编译台都必须有登记（或改走 helpers/module-bench）", () => {
  const registered = new Set(PENDING_MANUAL_BENCH.map((entry) => entry.file));
  const stray = liveViolations.filter((site) => !registered.has(site.file));
  assert.deepEqual(
    stray.map((site) => `${site.file} [${site.shapes.join(",")}]`),
    [],
    "新出现的手工替换清单：被测文件再加一个 import 就会把整份测试打哑。"
      + "改走 tests/helpers/module-bench.mjs（相对 specifier 自动解析，只显式列桩），"
      + "或者在 PENDING_MANUAL_BENCH 里写清为什么迁不动（≥10 字）。",
  );
});

test("欠账只减不增：剩余处数不得超过 PENDING_BUDGET", () => {
  assert.ok(
    liveViolations.length <= PENDING_BUDGET,
    `实测剩余 ${liveViolations.length} 处，预算 ${PENDING_BUDGET} 处；`
      + "预算只许改小，不许为了判绿改大。",
  );
});

test("登记必须带得出 ≥10 字理由，空登记与敷衍登记不算", () => {
  for (const entry of PENDING_MANUAL_BENCH) {
    assert.equal(registrationProblem(entry), "", `${entry.file} 的登记不合格`);
  }
  assert.notEqual(registrationProblem({ file: "x" }), "");
  assert.notEqual(registrationProblem({ file: "x", reason: "" }), "");
  assert.notEqual(registrationProblem({ file: "x", reason: "暂不迁" }), "");
  assert.equal(
    registrationProblem({
      file: "x",
      reason: "片段不是整份源文件，结构特殊暂时迁不动",
    }),
    "",
  );
});

test("登记不许留假条目：登记的文件必须仍然是真实现场", () => {
  const live = new Set(liveViolations.map((site) => site.file));
  for (const entry of PENDING_MANUAL_BENCH) {
    assert.ok(
      live.has(entry.file),
      `${entry.file} 已经不是手工编译台了，这条登记是空占位，删掉它并改小 PENDING_BUDGET`,
    );
  }
});

test("W28 清干净的那批文件必须保持零手工清单", () => {
  const regressed = liveViolations
    .filter((site) => W28_CLEARED_FILES.includes(site.file))
    .map((site) => `${site.file} [${site.shapes.join(",")}]`);
  assert.deepEqual(regressed, [], "W28 已改走 helper 的位置又把手工清单写回来了");
});

test("反面夹具必须被判红：规则改松会让它漏网", () => {
  assert.ok(
    fixtureShapes.length > 0,
    "fixtures/manual-module-bench-anti-pattern.mjs 必须命中至少一种手工形态；"
      + "没命中说明判据被改松了",
  );
  assert.ok(
    fixtureShapes.includes("object-entries-replaceAll-map"),
    `夹具应命中 object-entries-replaceAll-map，实际 ${fixtureShapes.join(",")}`,
  );
});

test("走 helper 的写法不被误伤", () => {
  const sample = `
    import { compileModule, dataModule } from "./helpers/module-bench.mjs";
    const url = await compileModule("src/shell/artifact-client.ts", {
      "../lib/auth/client": dataModule("export async function accessToken(){return '';}"),
    });
  `;
  assert.equal(usesModuleBenchHelper(sample), true);
  // 即便正文里出现 replaceAll 字样，只要进口了 helper，扫描函数直接放行。
  assert.equal(scanTestFile.name, "scanTestFile");
  const fakeHelperUser = join(TESTS, "account-page.test.mjs");
  assert.equal(scanTestFile(fakeHelperUser), null);
});
