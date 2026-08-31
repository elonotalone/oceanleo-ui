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

import { measureOnCommittedTree } from "./helpers/clean-tree-baseline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const TESTS = HERE;
const FIXTURE = join(HERE, "fixtures", "manual-module-bench-anti-pattern.mjs");
const GATE_FILE = "tests/module-bench-gate.test.mjs";

/**
 * 取 `PENDING_BUDGET` 与 `W28_CLEARED_FILES` 时所在的 commit。
 * `3550ebc` = `W35` 接第二棒时的 `main`。
 *
 * ⚠️ 这道闸的扫描面是 `tests/`，而 `tests/` 在共享工作树上**常年挂着别人的在途文件**
 * （W35 取值这一刻就有三份别人未提交的 `*.test.mjs` 躺在里面）。
 * 于是它比一般的闸更需要这条自检，两个方向都有洞：
 *   · 别人未提交的 WIP 里带一处手工编译台 ⇒ 本闸红在别人半成品上（撞 `_COMMON.md §8`）；
 *   · 别人未提交的改动恰好抹掉一处 ⇒ 本闸绿，而 `HEAD` 上那处还在（`§7b⑪` 原病）。
 * 末尾那条自检判的是 `BASELINE_COMMIT` 的树，**与谁的工作树都无关**。
 */
const BASELINE_COMMIT = "3550ebc255dd0b21bd97cff5cbed2f6e6042f9fa";

/**
 * 欠账：迁不动的手工编译台。W28 交付时 44 份（外加 w27）已全部改走 helper，
 * 表为空——从此任何一处新引信都不再有登记可挡，会被下面第一个用例当场判红。
 *
 * @type {{ file: string, reason: string }[]}
 */
const PENDING_MANUAL_BENCH = [];

/** 今天 `tests/` 里真实剩余的欠账数。这个数只许改小。 */
const PENDING_BUDGET = 0;

/**
 * W28 清干净的那批：谁把手工清单写回这些文件，立刻红。
 *
 * `[实测]` W35 2026-08-31 用下面那条基线自检对账，摘掉了 4 条**死登记**——
 * 文件早就不在 `tests/` 里了，那几条从此永远绿：
 *   `plugin-export-ledger-button` / `plugin-instance-save-entry` /
 *   `w26-plugin-instance-reopen` / `w27-session-plugin-identity`。
 * `git log --diff-filter=D` 查明四份都是**删除**（`280e5c2` / `1d17586` 清插件时代残留），
 * **不是改名**——现存 `tests/` 里没有任何近名替代。所以摘掉它们不削弱闸门：
 * 不存在的文件本来就违规不了。改名的情形处理方式相反，见自检那条的报错文案。
 */
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
  "tests/workbench-toolbar-rendered.test.mjs",
];

function repoPath(absolutePath, repoRoot = REPO) {
  return relative(repoRoot, absolutePath).split("\\").join("/");
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

function scanTestFile(absolutePath, repoRoot = REPO) {
  const text = readFileSync(absolutePath, "utf8");
  const file = repoPath(absolutePath, repoRoot);
  if (file === GATE_FILE) return null;
  if (usesModuleBenchHelper(text)) return null;
  const shapes = manualBenchShapes(text);
  if (shapes.length === 0) return null;
  return { file, shapes };
}

function listTestFiles(testsDir = TESTS) {
  return readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join(testsDir, name))
    .sort();
}

/**
 * 扫一棵 `tests/` 树。**按 root 参数化**，因为末尾那条基线自检要拿同一套口径去量
 * `BASELINE_COMMIT` 解出来的另一棵树——两处口径分家的话自检就变成了自说自话。
 */
function scanTests(testsDir = TESTS, repoRoot = REPO) {
  const files = listTestFiles(testsDir);
  return {
    present: new Set(files.map((file) => repoPath(file, repoRoot))),
    scannedFiles: files.length,
    violations: files.map((file) => scanTestFile(file, repoRoot)).filter(Boolean),
  };
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

const liveViolations = scanTests().violations;

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

test("基线自检：预算与 W28 清单在 BASELINE_COMMIT 那棵干净树上同样成立", () => {
  const probe = measureOnCommittedTree({
    repo: REPO,
    commit: BASELINE_COMMIT,
    pathspecs: ["tests"],
    // 扫描面全在本仓 `tests/` 之内，解到 /tmp 不会塌（helper 头注释里那条跨仓警告
    // 说的是 `i18n-tt-key-coverage` 那一类，本闸不适用）。
    measure: (root) => scanTests(join(root, "tests"), root),
  });
  // 拿不到就判红，不许 skip：`_COMMON.md §7b⑩` 说的就是「没跑起来」被当成绿。
  assert.ok(probe.ok, `基线自检跑不起来 ⇒ 没人在守「基线取自干净检出」这件事。${probe.reason}`);

  // 正对照：先证明我确实扫到了那棵树。零基线的闸尤其需要这一条——
  // 空目录上「实测 0 处违规」与真值 0 长得一模一样。
  assert.ok(
    probe.value.scannedFiles >= 200,
    `在 ${BASELINE_COMMIT.slice(0, 7)} 的树上只扫到 ${probe.value.scannedFiles} 份 *.test.mjs，` +
      "本仓的规模应当在 300 上下——解包范围不对，这条自检等于没跑",
  );

  assert.deepEqual(
    probe.value.violations.map((site) => `${site.file} [${site.shapes.join(",")}]`),
    [],
    `${BASELINE_COMMIT.slice(0, 7)} 的**干净检出**上还有手工编译台，而 PENDING_BUDGET 写着 ` +
      `${PENDING_BUDGET}。\n` +
      "上面那条业务断言是照工作树判的，绿只能说明「你这棵树上没有」——\n" +
      "别人未提交的改动恰好抹掉一处，它就会替 HEAD 上真实存在的欠账背书（_COMMON.md §7b⑪）。",
  );

  // `W28_CLEARED_FILES` 声称「这批已改走 helper」。那句话必须在**干净检出**上成立，
  // 而且这批文件得**真的还在**：文件一旦改名或删除，那条登记就永远绿，
  // 等于清单上的橡皮图章（W28 自己在豁免清单上栽过同一跤，见它的整名匹配注释）。
  // 判 `BASELINE_COMMIT` 的树而不是工作树——照工作树判，别人未提交的新增/删除
  // 都会替这份清单说话。
  const vanished = W28_CLEARED_FILES.filter((file) => !probe.value.present.has(file));
  assert.deepEqual(
    vanished,
    [],
    `这些文件已经不在 ${BASELINE_COMMIT.slice(0, 7)} 的 tests/ 里了，登记却还留着 ⇒ 永远绿。\n` +
      "先用 `git log --diff-filter=D -- <路径>` 分清是哪一种：\n" +
      "  · 删除（功能没了）⇒ 把这几条从清单里摘掉，它们已无可保护；\n" +
      "  · 改名 ⇒ **保护是静默丢掉的**，把新名字换进来，别直接删。",
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
