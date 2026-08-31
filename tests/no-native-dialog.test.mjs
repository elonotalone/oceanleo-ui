// ============================================================================
// 原生弹窗闸 —— `src/` 下不许再有 window.confirm / alert / prompt（W05，2026-08-31）
// ----------------------------------------------------------------------------
// 为什么必须 AST 判而不是 grep：`confirm` 是一个再普通不过的方法名。本仓里
// `rg -o 'confirm\(' src | wc -l` 回 7，而**真正的浏览器弹窗只有其中几处**；
// 另外那 4 处是第一方 API 自己叫 `confirm`：
//   - src/lib/fn-agent.ts          接口声明 `confirm(): Promise<…>` 与它的实现
//   - src/shell/FunctionAgentChat.tsx  `await session.confirm()` 与一个局部函数
// 任务书里「有 7 处 window.confirm」这个读数就是这么来的（父 agent 自己记为数错）。
// grep 分不开这两类，AST 分得开：只有「接收者是 window / globalThis / self」才算。
//
// 闸的形状是**清单锁**，不是「计数为 0」：
//   1. 扫出来的每一处都必须在 KNOWN_BLOCKED 里，否则当场红（新增即红）；
//   2. KNOWN_BLOCKED 里的每一条都必须**仍然扫得到**，否则也红。
// 第 2 条是为了让豁免不会烂在仓里：那一处被迁走之后，这份清单必须跟着删，
// 而不是留一条永远为真的例外。清单只减不增（与红线 9 的 PENDING_RAW_DURATION 同构）。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SRC = join(REPO, "src");

/** 接收者必须是这三个之一才算浏览器全局；`session.confirm()` 因此天然放过。 */
const GLOBAL_RECEIVERS = new Set(["window", "globalThis", "self"]);
const NATIVE_DIALOGS = new Set(["confirm", "alert", "prompt"]);

/**
 * 还没能迁走的原生弹窗。**每条都要写清为什么，以及解除条件。**
 *
 * **现在是空的。** 上一棒在这里挂过一条
 * `src/shell/InlineAdvancedWorkbenchShell.tsx`：当时那个文件带着另一位 owner
 * 未提交的重构，而重构 import 的 `./use-inline-advanced-panels` 在 git 里仍未跟踪，
 * 限定路径提交会让 main 出现一条指向不存在模块的 import（`_COMMON.md` §7b② 同型事故）。
 * 该文件已由 `1586f15` 收进库，挡路的理由随之消失，这一处也就迁成了 `ConfirmDialog`
 * ——于是按上面第 2 条规则把清单条目一并删掉，而不是留一条永远为真的例外。
 */
const KNOWN_BLOCKED = Object.freeze({});

function scriptKindFor(file) {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/**
 * 一份源码里所有「浏览器原生弹窗」调用。
 *
 * 认两种形态：`window.confirm(…)` 与 `window["confirm"](…)`。
 * 不认的（也就是第一方 API）：裸调用 `confirm(x)`、成员调用 `session.confirm()`、
 * 接口/类里名叫 `confirm` 的声明——它们的接收者都不是浏览器全局。
 */
export function findNativeDialogCalls(sourceText, fileName = "probe.ts") {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
  const hits = [];

  const record = (node, name) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    hits.push({ name, line: line + 1 });
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        GLOBAL_RECEIVERS.has(callee.expression.text) &&
        NATIVE_DIALOGS.has(callee.name.text)
      ) {
        record(node, callee.name.text);
      } else if (
        ts.isElementAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        GLOBAL_RECEIVERS.has(callee.expression.text) &&
        callee.argumentExpression &&
        ts.isStringLiteralLike(callee.argumentExpression) &&
        NATIVE_DIALOGS.has(callee.argumentExpression.text)
      ) {
        record(node, callee.argumentExpression.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return hits;
}

function sourceFilesUnder(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

// ------------------------------------------------------------------ 判据自测
//
// 零命中是最贵的一类断言（`_COMMON.md` §6）：先用**确定存在的形状**证明这个探测器
// 真的会响，再去信它在 `src/` 上的读数。少了这一步，探测器写错时会安静地全绿。

test("探测器对四种真弹窗形态都会响（正面自测，证明它不是恒返回空）", () => {
  const positives = [
    ['window.confirm("走吗");', "confirm"],
    ['globalThis.alert("炸了");', "alert"],
    ['self.prompt("名字");', "prompt"],
    ['window["confirm"]("下标写法也算");', "confirm"],
    ["if (!window.confirm(tt(\"确定？\"))) return;", "confirm"],
  ];
  for (const [code, name] of positives) {
    const hits = findNativeDialogCalls(code);
    assert.equal(hits.length, 1, `没抓到：${code}`);
    assert.equal(hits[0].name, name, `抓到了但认错了名字：${code}`);
  }
});

test("探测器放过所有第一方 `confirm`（反面自测，证明它不是恒返回命中）", () => {
  const negatives = [
    "const outcome = await session.confirm();",
    "onConfirm={(always) => void confirm(always)}",
    "interface Session { confirm(): Promise<Outcome | null>; }",
    "class S { async confirm() { return null; } }",
    "const confirm = () => true; confirm();",
    "// window.confirm 只是注释里提到它",
    '/* ConfirmDialog: replaces window.confirm */',
    'const s = "window.confirm(" ; void s;',
    "editor.window.confirm();", // 接收者是 editor.window，不是全局
    "window.confirmSomethingElse();",
  ];
  for (const code of negatives) {
    const hits = findNativeDialogCalls(code, "probe.tsx");
    assert.equal(
      hits.length,
      0,
      `误伤了第一方写法：${code}（抓到 ${JSON.stringify(hits)}）`,
    );
  }
});

test("探测器在仓里那 4 处真的第一方 `confirm` 上一处都不响", () => {
  // 这两份文件是「grep 会误伤、AST 不会」的活样本，见文件头的说明。
  for (const rel of ["src/lib/fn-agent.ts", "src/shell/FunctionAgentChat.tsx"]) {
    const full = join(REPO, rel);
    const text = readFileSync(full, "utf8");
    // 先证明这份文件里确实有 `confirm` 这个词，否则「零命中」是白跑的。
    assert.ok(
      /\bconfirm\s*\(/.test(text),
      `${rel} 里没有 confirm( —— 样本失效，这条自测等于没跑`,
    );
    const hits = findNativeDialogCalls(text, rel);
    assert.deepEqual(
      hits,
      [],
      `${rel} 的第一方 confirm 被误判成原生弹窗：${JSON.stringify(hits)}`,
    );
  }
});

// ------------------------------------------------------------------ 全 src 闸

test("`src/` 下没有清单外的 window.confirm / alert / prompt", () => {
  const offenders = new Map();
  for (const file of sourceFilesUnder(SRC)) {
    const hits = findNativeDialogCalls(readFileSync(file, "utf8"), file);
    if (hits.length) offenders.set(relative(REPO, file), hits);
  }

  const unexpected = [...offenders.entries()]
    .filter(([rel]) => !Object.hasOwn(KNOWN_BLOCKED, rel))
    .map(([rel, hits]) => `${rel}:${hits.map((hit) => hit.line).join(",")}`);

  assert.deepEqual(
    unexpected,
    [],
    "新的原生弹窗进仓了。浏览器弹窗会阻塞主线程、样式不可控、移动端尤其糟；" +
      `请改用 src/ui 的 ConfirmDialog（W05）。命中：${unexpected.join(" / ")}`,
  );

  for (const [rel, expected] of Object.entries(KNOWN_BLOCKED)) {
    const hits = offenders.get(rel) ?? [];
    assert.equal(
      hits.length,
      expected,
      `KNOWN_BLOCKED 里的 ${rel} 读数变了（清单写 ${expected}，实测 ${hits.length}）。` +
        "迁走了就把它从清单里删掉——留着一条永远为真的例外，闸就烂了。",
    );
  }
});

test("清单只减不增：豁免一条都不许长出来", () => {
  // 这一条是给未来的人看的：想加一条豁免，先在这里把数字改掉，
  // 于是「为什么又多了一处原生弹窗」必须在 diff 里被解释一次。
  assert.equal(
    Object.keys(KNOWN_BLOCKED).length,
    0,
    "原生弹窗的豁免清单变长了。W05 交卷时是空的（3 处全部迁成 ConfirmDialog），" +
      "新增任何一条都要在交付说明里定责。",
  );
});
