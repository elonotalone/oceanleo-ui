// ============================================================================
// 焦点环预算锁：抑制了轮廓就必须把环补回来（W04，2026-08-31）
// ----------------------------------------------------------------------------
// 靶子（`01-verified-facts.md` §2.5 实测）：`oceanleo-ui/src` 里
// `outline-none` **140 处（69 文件）** 对 `focus-visible` **61 处（32 文件）**。
// 差额的含义很具体：**键盘用户按 Tab 时看不见自己在哪。** 屏幕上没有任何东西
// 指示焦点落点，人只能靠数按键次数猜。31 个租户站共用这一个包，所以这不是
// 「某个页面的小瑕疵」，是一条系统性的可达性缺口。
//
// **判据是 AST，不是 grep**，任务书写死了这一条，理由是文件级共现会同时犯两种错：
//   · 漏判：一个文件里有五个组件，A 组件补了环、B 组件没补，文件级看是「共现」，绿。
//   · 误判：注释里写着「不要用 outline-none」也会被 grep 数进去
//     （`_COMMON.md` §7b③：判「不存在」必须用 AST；W03 在 `2ff548b`、
//     W04 在 `button-primitive` 都各栽过一次）。
// 所以这里判的是**同一个元素的类名串**：把 `className` 表达式里能静态解析到的
// 字面量全部摊平——包括它引用的模块级类名常量（`cx(BASE_CLASS, …, FOCUS_RING)`
// 这种写法，环就在 `FOCUS_RING` 里，不摊平就会把 `src/ui/Button.tsx` 自己判红）。
//
// 两本登记簿，语义完全不同，不要混用：
//   · `INTENTIONAL_NO_RING`：**判断**——这里确实不需要环（元素根本不可聚焦，
//     或者焦点指示由别的机制给）。必须带 ≥10 字理由，且必须命中真实现场。
//   · `PENDING_FOCUS_RING`：**欠账**——存量，落在别人独占面上，W04 按红线 §2.1
//     不许动。**只减不增**：`PENDING_BUDGET` 是今天的实数，谁清掉一处就改小。
//
// 计数单位说明（对任务书的一处**显式收窄**，写进交付说明）：
// 任务书 P3 先写「统计文件数」，后又写「要判的是同一个元素的类名串上有没有补偿，
// 不是文件级的共现」。两句冲突时按后者，因为前者正是它要否掉的那种口径。
// 所以本文件的预算单位是**元素点位数**，不是文件数。
// ============================================================================

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

import { measureOnCommittedTree } from "./helpers/clean-tree-baseline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SRC = join(REPO, "src");
const FIXTURE = join(HERE, "fixtures", "focus-ring-fixture.tsx");

/**
 * 取下面那三本冻结账（`PENDING_BUDGET` / `FILE_BUDGET` / `W04_CLEARED_FILES`）
 * 时所在的 commit。**必须是一个真的 commit**，不是「我本机当时的样子」。
 * `3550ebc` = `W35` 接第二棒时的 `main`。
 *
 * ⚠️ 这四样是**一组**，改一个就要改其余的：本文件末尾那条基线自检会把这个 commit
 * 的树解出来重量一遍，三本账逐条对不上就当场红。理由见 `_COMMON.md §7b⑪`——
 * `W04` 原先那 37 是在共享工作树上量的，那棵树 git 里并不存在。
 */
const BASELINE_COMMIT = "3550ebc255dd0b21bd97cff5cbed2f6e6042f9fa";

// ---------------------------------------------------------------- 判据词汇

/**
 * 「把轮廓抑制掉」的类名。带任意变体前缀（`focus:` / `md:` / `group-hover:` …）都算。
 * `ring-0` / `ring-transparent` 也在内：环还在但看不见，与没有是同一件事。
 */
const SUPPRESSOR = /^(?:[\w-]+:)*(?:outline-none|outline-0|outline-hidden|ring-0|ring-transparent)$/;

/**
 * 「把焦点指示补回来」的类名：`focus-visible:` 或 `focus:` 前缀下的可见变化
 * （环、轮廓、投影、边框、底色、文字色）。
 *
 * `focus:` 也算，是刻意的：它比 `focus-visible:` 差（鼠标点击也会亮），但键盘用户
 * **确实**看得见自己在哪，而本判据要守的就是这一条。把它判红会逼人做与可达性无关的
 * 改写，那种红只会教人绕开判据。
 */
const COMPENSATION = /^(?:[\w-]+:)*(?:focus|focus-visible):(?:ring|outline|shadow|border|bg|text)-/;

const isSuppressor = (token) => SUPPRESSOR.test(token);
const isCompensation = (token) => COMPENSATION.test(token) && !isSuppressor(token);

// ---------------------------------------------------------------- AST 工具

function eachNode(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => eachNode(child, visit));
}

/** 模块级 `const NAME = …` 的初始化器表，供类名常量摊平时查。 */
function moduleConstants(sourceFile) {
  const table = new Map();
  eachNode(sourceFile, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      table.set(node.name.text, node.initializer);
    }
  });
  return table;
}

/**
 * 摊平一个表达式里所有能**静态**读到的类名 token。
 *
 * 会跟进标识符（模块级常量），因为 `cx(BASE_CLASS, VARIANT_CLASS[variant], FOCUS_RING)`
 * 这种写法里，环压根不在 `className` 的字面量上。跟进深度封顶并带访问集，
 * 免得互相引用的常量把扫描器转进死循环。
 *
 * 读不到的部分（函数返回值、外部 import 的常量、运行期拼接）就是读不到——
 * 判据只对**读得到**的部分下结论，这是它敢说「这里没有补偿」的前提。
 */
function classTokens(expression, constants, depth = 0, seen = new Set()) {
  const tokens = new Set();
  if (!expression || depth > 4) return tokens;
  const add = (text) => {
    for (const token of String(text).split(/\s+/)) if (token) tokens.add(token);
  };
  const walk = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node.text);
    else if (ts.isIdentifier(node) && constants.has(node.text) && !seen.has(node.text)) {
      const next = new Set(seen).add(node.text);
      for (const token of classTokens(constants.get(node.text), constants, depth + 1, next)) {
        tokens.add(token);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(expression);
  return tokens;
}

/** 元素点位的稳定登记键：文件 + 标签名。对行号漂移与顺序调整免疫。 */
const keyOf = (site) => `${site.file}::${site.tag}`;

function tally(sites) {
  const counts = new Map();
  for (const site of sites) counts.set(keyOf(site), (counts.get(keyOf(site)) || 0) + 1);
  return counts;
}

function tagNameOf(node) {
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) return node.tagName.getText();
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  return "?";
}

/**
 * 扫一份源码：返回抑制了轮廓却没补回环的元素点位。
 *
 * `repoRoot` 参数化是给末尾那条基线自检用的：它要拿**同一套口径**去量
 * `BASELINE_COMMIT` 解出来的另一棵树。两处口径分家的话自检就成了自说自话，
 * 而登记键（`file`）必须相对各自的仓根算，否则跨树对不上。
 */
function scanSource(absolutePath, repoRoot = REPO) {
  const text = readFileSync(absolutePath, "utf8");
  // 便宜的预筛：整份源码里连抑制词都没有就不必建 AST（627 个文件，省下大半 CPU）。
  if (!/outline-none|outline-0|outline-hidden|ring-0|ring-transparent/.test(text)) return [];

  const sourceFile = ts.createSourceFile(
    absolutePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const constants = moduleConstants(sourceFile);
  const file = relative(repoRoot, absolutePath).split("\\").join("/");
  const sites = [];

  const inspect = (tokens, tag, position) => {
    const suppressors = [...tokens].filter(isSuppressor);
    if (!suppressors.length) return;
    if ([...tokens].some(isCompensation)) return;
    sites.push({
      file,
      tag,
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      suppressors: suppressors.sort(),
    });
  };

  eachNode(sourceFile, (node) => {
    // ① JSX 元素的 className —— 主战场。
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || attribute.name.getText() !== "className") continue;
        const value = attribute.initializer;
        if (!value) continue;
        const expression = ts.isJsxExpression(value) ? value.expression : value;
        inspect(classTokens(expression, constants), tagNameOf(node), node.getStart(sourceFile));
      }
    }
    // ② 导出的类名常量 —— 它是给别的文件贴到元素上的**契约**
    //    （`edit-bar-surface.ts` 的 `EDIT_BAR_BUTTON_CLASS` 就是这一类）。
    //    消费方拿到的就是这一串，所以它自己必须是完整的。
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        if (!/CLASS|ClassName|_CLS$/i.test(declaration.name.text)) continue;
        inspect(
          classTokens(declaration.initializer, constants),
          `const ${declaration.name.text}`,
          declaration.getStart(sourceFile),
        );
      }
    }
  });
  return sites;
}

function typeScriptFilesUnder(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) typeScriptFilesUnder(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function scanTree(dir, repoRoot = REPO) {
  const scannedFiles = typeScriptFilesUnder(dir).sort();
  const sites = [];
  for (const file of scannedFiles) sites.push(...scanSource(file, repoRoot));
  return { sites, scannedFiles: scannedFiles.length };
}

// ---------------------------------------------------------------- 登记簿

function registrationProblem(entry) {
  if (!entry || typeof entry.reason !== "string") return "缺少 reason 字段";
  if (entry.reason.trim().length < 10) return "reason 少于 10 个字，等于没登记";
  if (typeof entry.file !== "string" || !entry.file) return "缺少 file 字段";
  if (typeof entry.tag !== "string" || !entry.tag) return "缺少 tag 字段";
  return "";
}

/**
 * 判断：这里确实不需要焦点环。
 *
 * 空着不是疏忽。W04 逐类看过存量，没有一处够格：几乎所有 `outline-none` 都贴在
 * 真能聚焦的元素上（button / a / input / [tabindex]），少数贴在容器上的也因为
 * 容器本身带 `tabIndex`。将来真有（例如焦点指示由父容器统一给），
 * 登记形状 `{ file, tag, reason }`，理由要写清**用户靠什么看见焦点**。
 */
const INTENTIONAL_NO_RING = [];

/**
 * 欠账：存量点位，落在别人的独占面上，W04 按红线 §2.1 不许动。
 * **只减不增。** 数字是 W04 2026-08-31 自己量的（见 `PENDING_BUDGET`）。
 *
 * 这里刻意**不逐条列出**几百个点位：登记簿要能读、能维护，一份几百行的名单
 * 没有人会读，只会变成橡皮图章。真正挡住回归的是下面三条：
 *   · 总数只减不增（`PENDING_BUDGET`）；
 *   · W04 已清干净的文件必须保持零（`W04_CLEARED_FILES`）；
 *   · 单个文件里的点位数不许变多（`FILE_BUDGET`）。
 * 第三条是关键：没有它，「总数不增」可以靠别处清一处、这里加一处糊弄过去。
 */
const PENDING_OTHER_OWNERS = [];

/**
 * 今天 `src/` 里真实剩余的点位数。**这个数只许改小。**
 *
 * `[实测]` W04 2026-08-31：**37 处，散在 25 个文件**。
 *
 * 这个数与 `01-verified-facts.md` §2.5 的「`outline-none` 140 处 / 69 文件对
 * `focus-visible` 61 处 / 32 文件」不是一回事，别拿来对账：
 *   · 那两个是**词频**（grep 数出来的 token 出现次数），本数是**元素点位**；
 *   · 140 里绝大多数元素**同串上就补了环**，本判据放过它们——那正是它该做的；
 *   · 反过来，本判据还会算上词频看不见的两类：`ring-0` / `ring-transparent`
 *     这种「环还在但看不见」，以及导出的类名契约常量。
 * 两个口径量的是不同的东西，37 才是「键盘用户真的会丢失位置」的点位数。
 */
const PENDING_BUDGET = 37;

/**
 * W04 本轮负责、已经清干净的文件：谁把没补偿的 `outline-none` 放回这些文件，立刻红。
 * 这五个是本波 P1/P2 的全部产物与迁移目标。
 */
const W04_CLEARED_FILES = [
  "src/ui/Button.tsx",
  "src/shell/AdvancedStageControls.tsx",
  "src/shell/AdvancedWorkspaceActionBar.tsx",
  "src/shell/AppCapabilityBar.tsx",
  "src/shell/plugin-chrome/PluginChromeEditBarButton.tsx",
];

/**
 * 每个文件今天的点位数上限。只减不增，防止「总数不变、内部对冲」。
 * `[实测]` W04 2026-08-31，合计 37。清空一个文件就把它整条删掉。
 */
const FILE_BUDGET = new Map([
  ["src/pages/MyDatabasePage.tsx", 2],
  ["src/shell/AdvancedFontPicker.tsx", 1],
  ["src/shell/AdvancedStructuredEditors.tsx", 3],
  ["src/shell/AiRecommendBox.tsx", 1],
  ["src/shell/AppMarket.tsx", 1],
  ["src/shell/AppShell.tsx", 1],
  ["src/shell/CloudBrowserPanel.tsx", 1],
  ["src/shell/FileLibrary.tsx", 2],
  ["src/shell/HomePromptModals.tsx", 1],
  ["src/shell/LibraryLayout.tsx", 1],
  ["src/shell/Playground.tsx", 1],
  ["src/shell/SelectionToolbarNumberControl.tsx", 1],
  ["src/shell/cloud-browser-history-view.tsx", 2],
  ["src/shell/doc-editors/DeckCreationPanels.tsx", 1],
  ["src/shell/doc-editors/DeckElementContent.tsx", 1],
  ["src/shell/doc-editors/DeckLegacySlideLayout.tsx", 2],
  ["src/shell/doc-editors/DeckPresenterView.tsx", 3],
  ["src/shell/doc-editors/DeckStage.tsx", 2],
  ["src/shell/doc-editors/GridStage.tsx", 3],
  ["src/shell/image-editor/FabricImageCreationPanels.tsx", 2],
  ["src/shell/media-editors/Model3DControls.tsx", 1],
  ["src/shell/media-editors/Model3DDirectorPanel.tsx", 1],
  ["src/shell/media-editors/Model3DStage.tsx", 1],
  ["src/shell/video-editor/VideoTimelineStage.tsx", 1],
  // W03 的面（`ui/index.tsx`）。W04 不许动，已写进 `signals/W04-request.md`。
  ["src/ui/index.tsx", 1],
]);

// ---------------------------------------------------------------- 用例

const { sites: srcSites } = scanTree(SRC);
const fixtureSites = scanSource(FIXTURE);

test("欠账只减不增：抑制了轮廓又没补回环的点位总数不得超过预算", () => {
  assert.ok(
    srcSites.length <= PENDING_BUDGET,
    `实测剩余 ${srcSites.length} 处，预算 ${PENDING_BUDGET} 处。\n`
      + "预算只许改小，不许为了判绿改大（红线 4）。\n"
      + "新增一处的修法：在同一个元素的类名串上补 focus-visible:ring-2 与环色，"
      + "或者干脆别写 outline-none。\n"
      + `头十处：\n${srcSites.slice(0, 10).map((s) => `  ${s.file}:${s.line} <${s.tag}> ${s.suppressors}`).join("\n")}`,
  );
});

test("不许内部对冲：单个文件的点位数不得超过它今天的数", () => {
  const actual = tally(srcSites);
  const perFile = new Map();
  for (const [key, count] of actual) {
    const file = key.split("::")[0];
    perFile.set(file, (perFile.get(file) || 0) + count);
  }
  const grown = [];
  for (const [file, count] of perFile) {
    const budget = FILE_BUDGET.get(file);
    if (budget === undefined) grown.push(`${file}：新文件冒出 ${count} 处，登记里没有它`);
    else if (count > budget) grown.push(`${file}：实测 ${count} 处，登记 ${budget} 处`);
  }
  assert.deepEqual(
    grown, [],
    "有文件的欠账变多了。总数不增可以靠别处清一处、这里加一处糊弄过去，这条挡的就是那个。",
  );
});

test("W04 清干净的五个文件必须保持零欠账", () => {
  const regressed = srcSites
    .filter((site) => W04_CLEARED_FILES.includes(site.file))
    .map((site) => `${site.file}:${site.line} <${site.tag}> ${site.suppressors}`);
  assert.deepEqual(
    regressed, [],
    "W04 建的原语或迁过的工作台 chrome 里又出现了没有补偿的 outline-none",
  );
});

test("登记必须带得出 ≥10 字理由，空登记与敷衍登记不算", () => {
  for (const entry of [...INTENTIONAL_NO_RING, ...PENDING_OTHER_OWNERS]) {
    assert.equal(registrationProblem(entry), "", `${entry.file} 的登记不合格`);
  }
  // 校验器本身：空登记、短理由必须被拒，否则上面那一圈等于没查。
  assert.notEqual(registrationProblem({ file: "x", tag: "button" }), "");
  assert.notEqual(registrationProblem({ file: "x", tag: "button", reason: "不用" }), "");
  assert.notEqual(registrationProblem({ tag: "button", reason: "这里根本聚焦不到" }), "");
  assert.equal(
    registrationProblem({ file: "x", tag: "button", reason: "焦点指示由父容器统一给" }),
    "",
  );
});

test("白名单不许留假登记：登记的位置必须仍然是真实现场", () => {
  const live = new Set(srcSites.map(keyOf));
  for (const entry of INTENTIONAL_NO_RING) {
    assert.ok(live.has(keyOf(entry)), `${keyOf(entry)} 已不是真实现场，这条是空占位，删掉它`);
  }
});

test("判据器自证：词表真的认得出抑制与补偿，也真的不误伤", () => {
  // 零命中是最贵的一类断言（`_COMMON.md` §6）：先证明判据本身能命中。
  for (const token of [
    "outline-none", "outline-0", "outline-hidden", "ring-0", "ring-transparent",
    "focus:outline-none", "md:outline-none", "focus-visible:outline-none",
  ]) {
    assert.equal(isSuppressor(token), true, `${token} 应被判为抑制`);
  }
  for (const token of [
    "focus-visible:ring-2", "focus-visible:outline-2", "focus:ring-2",
    "focus-visible:shadow-md", "focus-visible:border-blue-500",
    "focus-visible:ring-[var(--awb-accent)]/45",
  ]) {
    assert.equal(isCompensation(token), true, `${token} 应被判为补偿`);
  }
  // `focus-visible:outline-none` 既像补偿又是抑制，必须只算抑制。
  assert.equal(isCompensation("focus-visible:outline-none"), false);
  assert.equal(isCompensation("focus-visible:ring-0"), false);
  // 无关类名一个都不许误伤。
  for (const token of ["h-11", "rounded-full", "hover:bg-red-500", "outline-offset-2", "ring-2"]) {
    assert.equal(isSuppressor(token), false, `${token} 被误判成抑制了`);
    assert.equal(isCompensation(token), false, `${token} 被误判成补偿了`);
  }
});

test("摊平能跟进模块级常量：环写在别的常量里也算数（否则 Button.tsx 会被误判）", () => {
  // `src/ui/Button.tsx` 的 className 是 `cx(BASE_CLASS, …, FOCUS_RING)`，
  // `outline-none` 与补偿环都在 `FOCUS_RING` 这一个常量里，字面量上一个字都没有。
  // 扫描器要是不跟进标识符，本仓最合规的那份文件会成为第一个被判红的。
  const button = scanSource(join(REPO, "src/ui/Button.tsx"));
  assert.deepEqual(
    button, [],
    "跟进模块级常量失效了：Button.tsx 的环在 FOCUS_RING 常量里，摊平不到就会误判",
  );
});

test("反面用例：fixture 里该红的红、该绿的绿", () => {
  const flagged = fixtureSites.map((site) => site.tag).sort();
  assert.deepEqual(
    flagged,
    ["button", "const STRAY_CLASS", "input"],
    `fixture 判红的点位不对（实测 ${JSON.stringify(flagged)}）：判据被改松或改严了。\n`
      + "该红的三处：裸 outline-none 的 button、只有 outline-0 的 input、"
      + "导出却没带补偿的类名常量。\n"
      + "该绿的三处：同串里补了 focus-visible:ring-2 的、补了 focus:ring-2 的、"
      + "环藏在模块常量里的。",
  );
});

test("基线自检：三本冻结账与 BASELINE_COMMIT 那棵干净树逐字对得上", () => {
  const probe = measureOnCommittedTree({
    repo: REPO,
    commit: BASELINE_COMMIT,
    pathspecs: ["src"],
    // 扫描面全在本仓 `src/` 之内，解到 /tmp 不会塌（helper 头注释里那条跨仓警告
    // 说的是 `i18n-tt-key-coverage` 那一类，本闸不适用）。
    measure: (root) => {
      const measured = scanTree(join(root, "src"), root);
      const byFile = new Map();
      for (const site of measured.sites) byFile.set(site.file, (byFile.get(site.file) ?? 0) + 1);
      return { total: measured.sites.length, scannedFiles: measured.scannedFiles, byFile };
    },
  });
  // 拿不到就判红，不许 skip：`_COMMON.md §7b⑩` 说的就是「没跑起来」被当成绿。
  assert.ok(probe.ok, `基线自检跑不起来 ⇒ 没人在守「基线取自干净检出」这件事。${probe.reason}`);

  // 正对照：先证明我确实扫到了那棵树，而不是在空目录上轻松通过。
  assert.ok(
    probe.value.scannedFiles >= 400,
    `在 ${BASELINE_COMMIT.slice(0, 7)} 的树上只扫到 ${probe.value.scannedFiles} 个 ts/tsx，` +
      "src/ 的规模应当在 600 上下——解包范围不对，这条自检等于没跑",
  );

  assert.equal(
    probe.value.total,
    PENDING_BUDGET,
    `PENDING_BUDGET 写的是 ${PENDING_BUDGET}，但 ${BASELINE_COMMIT.slice(0, 7)} 的` +
      `**干净检出**上实测 ${probe.value.total} 处。\n` +
      "三种可能：(a) 这个预算是在脏工作树上量的——换一棵干净树重量；\n" +
      "(b) 债还掉了而没人收紧预算——棘轮会空转，把预算拧到实测值；\n" +
      "(c) 预算已经拧下去了但 BASELINE_COMMIT 没跟着换——两个要一起改。",
  );

  // `FILE_BUDGET` 是「不许内部对冲」那条的全部依据，它自己必须也取自干净检出：
  // 逐文件对账，否则总数对得上而分布错了照样能糊过去。
  const mismatched = [];
  for (const [file, count] of [...probe.value.byFile].sort()) {
    const budget = FILE_BUDGET.get(file);
    if (budget !== count) mismatched.push(`${file}：干净检出 ${count} 处，登记 ${budget ?? "无"}`);
  }
  for (const file of [...FILE_BUDGET.keys()].sort()) {
    if (!probe.value.byFile.has(file)) mismatched.push(`${file}：干净检出上已清零，登记还留着`);
  }
  assert.deepEqual(
    mismatched,
    [],
    `FILE_BUDGET 与 ${BASELINE_COMMIT.slice(0, 7)} 的干净检出对不上。\n` +
      "清零的文件要整条删掉，数变小的要改小；这本账只减不增。",
  );

  // `W04_CLEARED_FILES` 声称的是「这五个文件已经清干净」。那句话也得在干净检出上成立，
  // 否则它保护的是一个只在某人工作树里存在过的状态。
  const notActuallyClear = W04_CLEARED_FILES.filter((file) => probe.value.byFile.has(file));
  assert.deepEqual(
    notActuallyClear,
    [],
    "W04_CLEARED_FILES 里有文件在干净检出上其实还带着欠账 —— 这份清单当初是脏树读数",
  );
});

test("反面用例：同一个文件里补了环的那几处一个都不许被判红", () => {
  // 这条就是「文件级共现」判法过不去的那一关：fixture 一个文件里既有补了的也有没补的，
  // grep 看这个文件是「共现」，会把没补的那三处全放过去。
  const lines = fixtureSites.map((site) => site.line);
  assert.equal(new Set(lines).size, fixtureSites.length, "同一行被重复登记了");
  assert.ok(
    fixtureSites.length === 3,
    `fixture 应判红 3 处，实测 ${fixtureSites.length} 处——文件级共现的口径会判成 0 处`,
  );
});
