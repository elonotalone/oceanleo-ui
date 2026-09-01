// 「用例静默不注册」的最后一段敞口 —— `_COMMON.md §7b⑫` 的余量。
// ----------------------------------------------------------------------------
// 这条闸守的不是某个产品行为，而是**读数本身的诚实性**，与 `suite-load-integrity`
// 同一族。那一份堵的是「整份文件没跑起来」（`§7b⑩`）与「跑的人没带 loader flag」；
// 这一份堵的是它们都抓不到的第三种：**文件跑起来了，但其中一段用例压根没注册**。
//
// 为什么危险：`node --test` 只报「跑了几条、红了几条」，从不报「本该有几条」。
// 一段用例静默消失，全量读数是**更漂亮的全绿**，没有任何信号。本波已经吃过一次：
// `W34` 逐份跑通后发现 35 条断言在 main 上一条都没执行，而 `W06`/`W12`/`W32`
// 三次全量都把它当成普通红放过了。
//
// ── 为什么不做「每份文件的例数账本」（`W47 ④` 的结论）────────────────────────
//
// `W34 R3` 提的根治形状是「本次执行例数 vs 上次入库例数」。`W34` 判它代价大于收益
// 并放弃，理由是要维护一份天天变的账本——**这个判断是对的**：2965 条用例、十几位
// owner 并发，任何人加一条用例都要回来改账本，第二天就会有人为了绿而顺手改数字，
// 于是账本退化成「跟着现实走」的记录，一条回归也拦不住。
//
// 但 `W34` 漏了一件事：**期望值不必存起来，可以从源码现推。**
// 顺着这条思路量了一遍（2026-09-01，全 `tests/*.test.mjs`）：
//   · 顶层 `test()` 共 2965 处；
//   · 落在 `if` / `try` / `&&` / `?:` 里的：**0 处**；
//   · 落在 `for` 里的：22 处——**全部余量都在这一类**。
// ⇒ 敞口不是「例数对不对」，而是「**表驱动注册的那张表会不会悄悄变空**」。
//   表一空，那批用例连注册都不注册，读数全绿。
//
// 所以这道闸判两件事，两件都不需要账本：
//   1. 顶层用例不许**有条件**注册（今天 0 处 ⇒ 直接零容忍，不留余量：
//      留余量的棘轮会空转，`§7b⑪c` 已经吃过三次）；
//   2. 表驱动注册**必须给那张表配一条长度正对照**，表变空当场红。
//
// ⚠️ 内联字面量（`for (const x of [ … ])`）豁免：它变空要肉眼可见地删掉几行，
// 不是「静默」。真危险的是**算出来的表**——`edit-bar-gesture-coverage` 的
// `PLUGIN_IDS` 是正则从另一份源码解析出来的，解析器一失灵表就空、13 条用例蒸发。
// 它今天有正对照，这道闸负责让它永远有。

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const SELF = "table-driven-registration-guard.test.mjs";

/** 注册用例的调用名。`test.skip` / `it.only` 这类后缀写法也要认。 */
const REGISTRAR = /^(test|it|describe)(\.\w+)?$/;

/**
 * 允许有条件注册的显式登记。**空清单 = 零容忍**，这是刻意的：
 * 2026-09-01 实测 0 处，留余量等于给下一次回归让路（`§7b⑪c` 的棘轮空转）。
 * 真有非条件注册不可的，登记进来并写理由 ≥10 字。
 */
const CONDITIONAL_ALLOWED = new Map();

function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) testFiles(abs, out);
    else if (entry.endsWith(".test.mjs") && entry !== SELF) out.push(abs);
  }
  return out;
}

function parse(abs) {
  return ts.createSourceFile(
    abs,
    readFileSync(abs, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
}

/**
 * 走一遍语法树，把「注册用例的调用」按它外面套着什么归类。
 *
 * ⚠️ 遇到 `test(…)` 就**不再往里走**：回调体里的 `if` 是运行期的分支，
 * 与「这条用例注不注册」无关。混为一谈会把几百条正常用例判红，闸随即被人关掉。
 * 同理，函数体内的注册按外层是否有条件算——顶层调用一个会注册用例的函数，
 * 那个函数体里的 `if` 仍然是注册期的条件，所以 `fn` 不清空 guard 栈而是入栈。
 */
function classify(sourceFile) {
  const conditional = [];
  const looped = [];

  const visit = (node, guards, loopSource) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile);
      if (REGISTRAR.test(callee)) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        if (guards.length) conditional.push({ line, callee, guard: guards.join(">") });
        else if (loopSource) looped.push({ line, callee, source: loopSource });
        return;
      }
    }

    let nextGuards = guards;
    let nextLoop = loopSource;
    if (ts.isIfStatement(node)) nextGuards = [...guards, "if"];
    else if (ts.isTryStatement(node)) nextGuards = [...guards, "try"];
    else if (ts.isConditionalExpression(node)) nextGuards = [...guards, "?:"];
    else if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.getText(sourceFile);
      if (op === "&&" || op === "||" || op === "??") nextGuards = [...guards, op];
    } else if (ts.isForOfStatement(node)) {
      nextLoop = node.expression.getText(sourceFile).split("\n")[0].trim();
    } else if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      nextLoop = "(非 for-of 的循环)";
    }

    ts.forEachChild(node, (child) => visit(child, nextGuards, nextLoop));
  };

  ts.forEachChild(sourceFile, (child) => visit(child, [], null));
  return { conditional, looped };
}

/** 这个标识符的 `.length` 有没有被某条 `assert.*` 断言过（跨行也认，走语法树不走正则）。 */
function hasLengthControl(sourceFile, ident) {
  const needle = new RegExp(`\\b${ident}\\.length\\b`);
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      /^assert\b/.test(node.expression.getText(sourceFile)) &&
      node.arguments.some((arg) => needle.test(arg.getText(sourceFile)))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

const SCAN = testFiles(TESTS_DIR).map((abs) => {
  const sourceFile = parse(abs);
  return { rel: relative(TESTS_DIR, abs), sourceFile, ...classify(sourceFile) };
});

test("正对照：扫描器确实看见了这套测试，而不是在空目录上轻松通过", () => {
  // 下面两条判据在「一个文件都没扫到」时会双双通过。先证明扫到了。
  assert.ok(
    SCAN.length >= 200,
    `只扫到 ${SCAN.length} 份测试文件（本仓 200+）。目录取错了，下面两条等于没跑`,
  );
  const registrations = SCAN.reduce(
    (sum, f) => sum + f.conditional.length + f.looped.length,
    0,
  );
  const loopFiles = SCAN.filter((f) => f.looped.length > 0);
  assert.ok(
    loopFiles.length >= 5,
    `全仓只认出 ${loopFiles.length} 份带表驱动注册的文件（2026-09-01 实测 7 份）。` +
      "语法树走法被改坏了，判据 2 会空转全绿",
  );
  assert.ok(
    registrations >= 20,
    `分类器一共只认出 ${registrations} 处注册。它至少要认出那 22 处表驱动注册`,
  );
});

test("判据 1：顶层用例不许有条件注册——注册期的 if / try / && / ?: 一处都不许有", () => {
  const offenders = [];
  for (const file of SCAN) {
    for (const hit of file.conditional) {
      if (CONDITIONAL_ALLOWED.has(`${file.rel}:${hit.line}`)) continue;
      offenders.push(`${file.rel}:${hit.line} ${hit.callee}() 套在 ${hit.guard} 里`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "这些用例是**有条件注册**的：条件不成立时它们连注册都不注册，\n" +
      "而 node --test 只报「跑了几条」，从不报「本该有几条」⇒ 读数会是更漂亮的全绿。\n" +
      `${offenders.join("\n")}\n` +
      "改法：把条件搬进用例体内（用 assert 判红，或用 t.skip 显式跳过并写清理由），\n" +
      "注册本身必须无条件。真有例外，登记进 CONDITIONAL_ALLOWED 并写理由。",
  );
});

test("判据 2：表驱动注册的那张表，必须配一条长度正对照", () => {
  const offenders = [];
  for (const file of SCAN) {
    const seen = new Set();
    for (const hit of file.looped) {
      // 内联字面量不在射程：它变空要肉眼可见地删掉几行，不是「静默」。
      if (!/^[A-Za-z_$][\w$]*$/.test(hit.source)) continue;
      if (seen.has(hit.source)) continue;
      seen.add(hit.source);
      if (!hasLengthControl(file.sourceFile, hit.source)) {
        offenders.push(`${file.rel}:${hit.line} ← ${hit.source}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "这些用例是按一张**命名表**注册的，而没有任何断言在管那张表有多长：\n" +
      `${offenders.join("\n")}\n` +
      "表一旦变空（尤其是从源码解析出来的表——解析器失灵就是空表），\n" +
      "这一批用例连注册都不注册，全量读数反而更绿。\n" +
      "改法：在同一份文件里加一条 `assert.equal(表.length, N)` 的清单自检。",
  );
});
