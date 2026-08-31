import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { dirtyAmong, measureOnCommittedTree } from "./helpers/clean-tree-baseline.mjs";

/**
 * §规范一 budget lock.
 *
 * 拦的缺陷只有一个：**求值的时候够不着隔壁工作表**，于是 `Sheet2!B3` 无论公式写得
 * 多对都塌成 `#REF!`（456 本工作簿语料里 21.0% 的公式带限定引用）。
 *
 * ----------------------------------------------------------------------------
 * W35 2026-08-31：判据过时，按 `_COMMON.md` 红线 4「保留原意图、改断言」重写。
 *
 * 原判据数的是**名字出现了几次**，不是**缺陷出现了几处**，两者并不等价：
 * `evaluateGridCell(rows, row, col, context)` 的第四个参数就是跨表解析面
 * （`GridFormulaContext.workbook` / `.sheetResolver`），带上它的调用**够得着隔壁表**。
 *
 * `[实测]` 同一棵干净检出上直接量（`/tmp/w35-probe-legacy-eval.mjs`）：
 *   evaluateGridCell(sheet1, 0, 0)                      => "#REF!"   ← 是缺陷
 *   evaluateGridCell(sheet1, 0, 0, {workbook, sheetName}) => 42       ← 不是缺陷
 *   evaluateGridCellInWorkbook(workbook, "Sheet1", 0, 0) => 42
 *
 * 于是原判据把 9 个调用点一视同仁，红在 `9 > 8`，而其中 5 处根本不是它要拦的东西。
 * 更要命的是 `@deprecated` 指的那条迁移路子**对其中两处不成立**：
 * `conditional-format.ts` 与 `data-validation.ts` 求的是一张**草稿表**（把翻译过的
 * 规则公式塞在正表后面一行再求值），那行不在工作簿里，`evaluateGridCellInWorkbook`
 * 只收工作簿里真实存在的表，接不了。照原判据，这两处永远迁不走，预算就永远卡着。
 *
 * ⇒ 改成数**缺陷**：只数「没有任何跨表解析面」的调用点。
 *   干净检出实测 4 处，**预算从 8 拧到 4**（往下拧，不是往上抬）。
 *   4 处逐个都是货真价实的 `Sheet2!B3 → #REF!` 现场，一处都没放过。
 *
 * 两条防漏，免得「带个 context」变成绕过去的口子：
 *   · 第四个参数必须**静态看得出**带 `workbook` 或 `sheetResolver`（对象字面量，
 *     或同文件里 `const` 绑的对象字面量）。看不出来的一律算缺陷。
 *   · 分类器自己有正反自检（本文件末尾），改松了当场红。
 */

const SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src",
);
const REPO_ROOT = path.resolve(SOURCE_ROOT, "..");

/**
 * 真缺陷：调用时**没有**任何跨表解析面。W35 2026-08-31 在干净检出实测 4 处。
 * 这个数只许改小。想让它变小就给调用点补上 workbook 上下文，或迁到
 * `evaluateGridCellInWorkbook`。
 */
const UNSAFE_BUDGET = 4;

/** 那 4 处在哪儿，让 reviewer 不用 grep 就看得见欠账。 */
const UNSAFE_BY_FILE = {
  "shell/doc-editors/GridWorkbookExport.ts": 1,
  "shell/doc-editors/grid-format/conditional-format.ts": 1,
  "shell/doc-editors/grid-structure.ts": 2,
};

/**
 * 带着跨表上下文、因而**不算缺陷**的调用点。登记出来是为了两件事：
 * 一，它们仍然用着 `@deprecated` 的名字，账要记着；
 * 二，谁哪天把上下文摘掉，这张表和上面那张会同时变，不会静悄悄从这边挪到那边。
 */
const CONTEXTUAL_BY_FILE = {
  "shell/doc-editors/GridWorkbookExport.ts": 3,
  "shell/doc-editors/grid-format/conditional-format.ts": 1,
  "shell/doc-editors/grid-format/data-validation.ts": 1,
};

/**
 * `_COMMON.md §7b⑪`：上面这两个数是在**哪一棵树**上量的。
 * 共享工作树上随时挂着别人未提交的改动，在那儿量出来的数标定的是一棵 git 里
 * 并不存在的树。下面「基线自检」那条用例会把这个 commit 的 `src/` 解出来重量一遍。
 */
const BASELINE_COMMIT = "acd81924da31c0be9b6d7035b9de3a4bca8a051c";

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/** 跨表解析面的两个字段名。带上任意一个，`Sheet2!B3` 就解得开。 */
const CROSS_SHEET_KEYS = ["workbook", "sheetResolver"];

/** 一个对象字面量里，静态看得出带跨表解析面吗？（展开语法也算，它是本仓的写法） */
function literalCarriesCrossSheet(node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  return node.properties.some((property) => {
    if (ts.isSpreadAssignment(property)) {
      return CROSS_SHEET_KEYS.some((key) => property.getText().includes(key));
    }
    const name = property.name && ts.isIdentifier(property.name)
      ? property.name.text
      : "";
    return CROSS_SHEET_KEYS.includes(name);
  });
}

/**
 * 判断第四个参数够不够得着隔壁表。**看不出来就算够不着**——保守方向，
 * 宁可把一处安全调用误记成欠账，也不许「传个变量」就绕过这道闸。
 */
function crossSheetCapable(argument, sourceFile) {
  if (!argument) return false;
  if (literalCarriesCrossSheet(argument)) return true;
  if (!ts.isIdentifier(argument)) return false;
  // 同文件里 `const x = { ... }` 绑出来的对象，解一层。
  // `conditional-format.ts` 的 `formulaContext` 就是这个形状。
  let resolved = false;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === argument.text &&
      node.initializer &&
      literalCarriesCrossSheet(node.initializer)
    ) {
      resolved = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return resolved;
}

/**
 * 走 AST 而不是正则（`_COMMON.md §7b③`）：要看第四个参数，正则看不了。
 * 顺带天然排除了原来要手工排掉的两种形状——声明本身、以及文档注释里那个
 * 裸 `evaluateGridCell()`，AST 里它们压根不是调用表达式。
 *
 * @returns `{ unsafe, contextual }`，各是一串 `{ file, line }`。
 */
function classifySource(text, file) {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const unsafe = [];
  const contextual = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "evaluateGridCell"
    ) {
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const site = { file, line };
      if (crossSheetCapable(node.arguments[3], sourceFile)) contextual.push(site);
      else unsafe.push(site);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { unsafe, contextual };
}

function classifyLegacyCalls(absolutePath, root) {
  return classifySource(
    readFileSync(absolutePath, "utf8"),
    path.relative(root, absolutePath).split(path.sep).join("/"),
  );
}

/** 扫一棵 `src/`，把两类调用点各自按文件汇总。 */
function scanTree(root) {
  const unsafe = [];
  const contextual = [];
  for (const file of sourceFiles(root).sort()) {
    const found = classifyLegacyCalls(file, root);
    unsafe.push(...found.unsafe);
    contextual.push(...found.contextual);
  }
  return { unsafe, contextual };
}

const byFile = (sites) => {
  const counts = {};
  for (const site of sites) counts[site.file] = (counts[site.file] || 0) + 1;
  return counts;
};

const SCAN = scanTree(SOURCE_ROOT);

test("旧求值入口里「够不着隔壁表」的调用点只减不增", () => {
  const counts = byFile(SCAN.unsafe);
  assert.ok(
    SCAN.unsafe.length <= UNSAFE_BUDGET,
    `够不着隔壁表的调用点 ${SCAN.unsafe.length} > 预算 ${UNSAFE_BUDGET}：` +
      `这些位置上 Sheet2!B3 会塌成 #REF!。修法是把 workbook 上下文传进第四个参数，` +
      `或改用 evaluateGridCellInWorkbook。预算只许改小（红线 4）。` +
      `实测分布 ${JSON.stringify(counts)}` +
      (dirtyAmong(REPO_ROOT, ["src"]).length
        ? `｜注意：你这棵工作树的 src/ 是脏的，这个读数不是干净树读数`
        : ""),
  );
  assert.deepEqual(counts, UNSAFE_BY_FILE);
  assert.deepEqual(
    SCAN.unsafe.map((site) => `${site.file}:${site.line}`).sort(),
    [
      "shell/doc-editors/GridWorkbookExport.ts:132",
      "shell/doc-editors/grid-format/conditional-format.ts:447",
      "shell/doc-editors/grid-structure.ts:1583",
      "shell/doc-editors/grid-structure.ts:1608",
    ],
    "这 4 处就是今天真会把 Sheet2!B3 变成 #REF! 的地方",
  );
});

test("带跨表上下文的调用点也记着账：谁把上下文摘掉，两张表同时变", () => {
  assert.deepEqual(byFile(SCAN.contextual), CONTEXTUAL_BY_FILE);
});

test("P1 之后 grid-model.ts 一个旧入口调用点都不剩", () => {
  const found = classifyLegacyCalls(
    path.join(SOURCE_ROOT, "shell/doc-editors/grid-model.ts"),
    SOURCE_ROOT,
  );
  assert.equal(found.unsafe.length + found.contextual.length, 0);
});

test("旧入口仍然导出可用，且标了 @deprecated", () => {
  const body = readFileSync(
    path.join(SOURCE_ROOT, "shell/doc-editors/grid-formula.ts"),
    "utf8",
  );
  const marker = "export function evaluateGridCell(";
  assert.ok(body.includes(marker));
  const head = body.slice(0, body.indexOf(marker));
  const docComment = head.slice(head.lastIndexOf("/**"));
  assert.ok(
    docComment.includes("@deprecated"),
    "evaluateGridCell 紧邻的文档注释里必须留着 @deprecated",
  );
  assert.ok(
    docComment.includes("evaluateGridCellInWorkbook"),
    "@deprecated 必须指明改用哪个入口，否则读到的人不知道往哪迁",
  );
});

// ---------------------------------------------------------------------------
// 分类器自检：正反两面都钉住
//
// 上面那条预算从 8 拧到 4，靠的是「第四个参数带跨表解析面就不算缺陷」这条判定。
// 判定要是失灵，预算 4 就成了一句空话——所以在这儿把它两个方向都验一遍。
// 判据与数据拴在一起（形状抄 `effect-tt-dependency.test.mjs`）。
// ---------------------------------------------------------------------------

test("分类器自检：够不着隔壁表的写法必须被判成缺陷", () => {
  const cases = [
    ["三参数裸调用", "evaluateGridCell(rows, r, c);"],
    ["第四参数是空对象", "evaluateGridCell(rows, r, c, {});"],
    ["第四参数只有 namedRanges，够不着别的表", "evaluateGridCell(rows, r, c, { namedRanges });"],
    ["第四参数是看不透的变量", "const ctx = makeCtx();\nevaluateGridCell(rows, r, c, ctx);"],
    ["第四参数是函数调用", "evaluateGridCell(rows, r, c, buildContext());"],
  ];
  for (const [why, source] of cases) {
    const found = classifySource(source, "probe.ts");
    assert.equal(found.unsafe.length, 1, `${why}：应判成缺陷，实测没判`);
    assert.equal(found.contextual.length, 0, `${why}：不该算成带上下文`);
  }
});

test("分类器自检：带跨表解析面的写法不许被误伤", () => {
  const cases = [
    ["对象字面量带 workbook", "evaluateGridCell(rows, r, c, { workbook, sheetName });"],
    ["对象字面量带 sheetResolver", "evaluateGridCell(rows, r, c, { sheetResolver });"],
    [
      "条件展开（本仓 conditional-format / data-validation 的写法）",
      "evaluateGridCell(rows, r, c, { ...(ctx.workbook ? { workbook: ctx.workbook } : {}) });",
    ],
    [
      "同文件 const 绑的对象字面量",
      "const formulaContext = { workbook: ctx.workbook };\nevaluateGridCell(rows, r, c, formulaContext);",
    ],
  ];
  for (const [why, source] of cases) {
    const found = classifySource(source, "probe.ts");
    assert.equal(found.contextual.length, 1, `${why}：应算带上下文，实测没算`);
    assert.equal(found.unsafe.length, 0, `${why}：被误判成缺陷了`);
  }
});

test("分类器自检：声明本身与文档注释里的名字都不许被数进来", () => {
  const source = [
    "/** 值模式默认用 `evaluateGridCell()` 求值。 */",
    "export function evaluateGridCell(rows, row, col, context = {}) {",
    "  return inner(rows, row, col, context);",
    "}",
    "// 长名字不是它：",
    "evaluateGridCellTyped(rows, r, c);",
    "evaluateGridCellInWorkbook(wb, 'S1', r, c);",
  ].join("\n");
  const found = classifySource(source, "probe.ts");
  assert.deepEqual([found.unsafe.length, found.contextual.length], [0, 0]);
});

// ---------------------------------------------------------------------------
// 基线自检（`_COMMON.md §7b⑪` / `W33 R5`）
// ---------------------------------------------------------------------------

test("基线自检：两个数字与 BASELINE_COMMIT 那棵干净树逐字对得上", () => {
  const measured = measureOnCommittedTree({
    repo: REPO_ROOT,
    commit: BASELINE_COMMIT,
    pathspecs: ["src"],
    measure: (root) => {
      const scanned = scanTree(path.join(root, "src"));
      return {
        unsafe: byFile(scanned.unsafe),
        contextual: byFile(scanned.contextual),
        files: sourceFiles(path.join(root, "src")).length,
      };
    },
  });
  assert.ok(measured.ok, `拿不到干净树读数就判红，不许跳过：${measured.reason}`);
  // 正对照：解出来的树得像样，别拿一棵空树凑过这一关。
  assert.ok(
    measured.value.files > 400,
    `${BASELINE_COMMIT} 的 src/ 只解出 ${measured.value.files} 份源码，这棵树不对`,
  );
  assert.deepEqual(
    measured.value.unsafe,
    UNSAFE_BY_FILE,
    `UNSAFE_BY_FILE 写的是 ${JSON.stringify(UNSAFE_BY_FILE)}，但 ${BASELINE_COMMIT} 的` +
      `**干净检出**上实测 ${JSON.stringify(measured.value.unsafe)}。` +
      `两种可能：(a) 这个分布是在脏工作树上量的——那就换一棵干净树重量；` +
      `(b) 欠账已经清掉了但 BASELINE_COMMIT 没跟着换——两个要一起改。`,
  );
  assert.deepEqual(measured.value.contextual, CONTEXTUAL_BY_FILE);
  assert.equal(
    Object.values(measured.value.unsafe).reduce((sum, n) => sum + n, 0),
    UNSAFE_BUDGET,
    "UNSAFE_BUDGET 与干净树实测处数对不上",
  );
});
