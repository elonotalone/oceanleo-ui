// ============================================================================
// 闸：UI 原语只许有一份实现（W03 P4/P6）
// ----------------------------------------------------------------------------
// 为什么要有这道闸
//
// 门户 `oceanleo` 的 `app/_components/ui.tsx` 曾是本仓 `src/ui/index.tsx` 的
// **整份复制品**（380 行），而且抄的时候把 `createPortal` 抄丢了。后果不是「样式不一致」
// 这种审美问题：没有 portal 的 `Modal` 会被祖先的 `overflow` / `transform` 裁切，
// 遮罩盖不住侧边栏。更要命的是同一个 app 里 `components/OrgWorkflowBoard.tsx`
// 又是直接 `from "@oceanleo/ui/ui"` 的 —— 于是门户**同时跑着两套 Modal**，
// 一套有 portal、一套没有，谁修了哪套全凭运气。
//
// W03 把复制品收成 32 行纯转发。这道闸锁住的是「收完之后不会再漂回去」：
// 复制品这种缺陷不会以「改坏了一行」的形态回来，它以「有人赶时间又抄了一份」
// 的形态回来，而那种改动在 code review 里长得像新功能。
//
// 判据一律走 AST，不走 grep（`_COMMON.md` §7b③：判「不存在」必须用 AST）。
// 这份文件自己的注释里就写满了 `export function Modal` 一类的反例字样，
// 用正则扫全文会被自己的说明文字判红 —— `overlay-motion.test.mjs` 已经栽过一次
// （见 `2ff548b`：闸被 `src/ui/index.tsx:66` 注释里引的反例判红）。
// ============================================================================

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const R1_ROOT = join(HERE, "..");
const SHARED_UI = join(R1_ROOT, "src", "ui", "index.tsx");

// 门户仓在本仓外。**故意不写整条绝对路径字面量**：
// `w25-tests-out-of-repo-paths.test.mjs` 那道闸要求仓外夹具显式登记，而它的登记表
// 在那份文件里，不在 W03 的独占面上（红线 1）。`/root/projects` 本身**已经登记过**，
// 登记理由原文就是「探测同级仓是否存在用的目录前缀」—— 这里用的正是那个用法：
// 从已登记的前缀拼出兄弟仓，并在仓缺席时优雅跳过（与 `deck-packs` /
// `material-cover-rendering` 两份跨仓对账判据同一套做法）。
const SIBLING_REPOS = "/root/projects";
const R2_ROOT = join(SIBLING_REPOS, "oceanleo");
const R2_FORWARDER = join(R2_ROOT, "app", "_components", "ui.tsx");
const R2_SCAN_DIRS = ["app", "components"];

/** 共享包里 UI 原语的唯一出口子路径。门户只许从这里取。 */
const SHARED_SPECIFIER = "@oceanleo/ui/ui";

const R2_PRESENT = existsSync(R2_FORWARDER);
const skipIfNoR2 = R2_PRESENT
  ? false
  : `门户仓不在本机（${relative(SIBLING_REPOS, R2_ROOT)}），跨仓对账跳过`;

function parse(path, text) {
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".ts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}

async function parseFile(path) {
  return parse(path, await readFile(path, "utf8"));
}

const lineOf = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

const modifiersOf = (node) =>
  ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];

const isExported = (node) =>
  modifiersOf(node).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/**
 * 一份源码导出的**值**名字集合。类型导出不算 —— `export type ButtonProps` 之类
 * 编译后一个字节都不剩，拿它比对「实现在哪」是把噪声当信号。
 */
function exportedValueNames(sourceFile) {
  const names = new Set();
  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.isTypeOnly) continue;
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const spec of stmt.exportClause.elements) {
          if (!spec.isTypeOnly) names.add(spec.name.text);
        }
      }
      continue;
    }
    if (!isExported(stmt)) continue;
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      if (stmt.name) names.add(stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    }
  }
  return names;
}

/**
 * 一份源码里「这是实现，不是转发」的证据。
 * 空数组 = 纯转发。任何一条命中都说明有人开始在这里写实现了。
 */
function implementationEvidence(sourceFile) {
  const found = [];
  const note = (node, what) => found.push(`:${lineOf(sourceFile, node)} ${what}`);
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      note(node, "JSX");
    } else if (ts.isFunctionDeclaration(node)) {
      note(node, `函数声明 ${node.name?.text ?? "(匿名)"}`);
    } else if (ts.isClassDeclaration(node)) {
      note(node, `类声明 ${node.name?.text ?? "(匿名)"}`);
    } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      note(node, "函数表达式");
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^use[A-Z]/.test(node.expression.text)
    ) {
      note(node, `React hook ${node.expression.text}()`);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

/** 转发口：每条 `export … from "…"` 的来源。本地 `export {}` 记为 null。 */
function reExportSources(sourceFile) {
  const sources = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    if (stmt.isTypeOnly) continue;
    sources.push(
      stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
        ? stmt.moduleSpecifier.text
        : null,
    );
  }
  return sources;
}

async function r2SourceFiles() {
  const files = [];
  for (const dir of R2_SCAN_DIRS) {
    const root = join(R2_ROOT, dir);
    if (!existsSync(root)) continue;
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(tsx|ts)$/.test(entry.name)) continue;
      if (/\.d\.ts$/.test(entry.name)) continue;
      files.push(join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  return files;
}

// ---------------------------------------------------------------------------

test("门户那份 ui.tsx 只转发，不许有实现", { skip: skipIfNoR2 }, async () => {
  const forwarder = await parseFile(R2_FORWARDER);
  assert.deepEqual(
    implementationEvidence(forwarder),
    [],
    "门户的 app/_components/ui.tsx 又长出实现了。这个文件的全部价值就是让 10 个既有 " +
      "import 点原样能用，实现只许有共享包那一份 —— 复制品当初就是这么来的，" +
      "而且抄丢了 createPortal，没有 portal 的 Modal 会被祖先的 overflow/transform 裁切。",
  );
});

test("门户的导出全部来自共享包那个子路径", { skip: skipIfNoR2 }, async () => {
  const forwarder = await parseFile(R2_FORWARDER);
  const sources = reExportSources(forwarder);
  assert.ok(sources.length > 0, "一条 re-export 都没有，这个文件已经不是转发口了");
  assert.deepEqual(
    [...new Set(sources)],
    [SHARED_SPECIFIER],
    `门户只许从 ${SHARED_SPECIFIER} 取 UI 原语；出现别的来源（或本地 export {}）` +
      "就是第二个事实源在成形",
  );
});

test("门户的导出集合 ⊆ 共享包 src/ui/index.tsx 的导出集合", { skip: skipIfNoR2 }, async () => {
  const shared = exportedValueNames(await parseFile(SHARED_UI));
  const portal = exportedValueNames(await parseFile(R2_FORWARDER));

  assert.ok(portal.size > 0, "门户一个原语都没导出，转发口是空的");
  const missing = [...portal].filter((name) => !shared.has(name)).sort();
  assert.deepEqual(
    missing,
    [],
    "门户转发了共享包并不导出的名字 —— 要么共享包删了导出而门户没跟上（门户当场构建失败），" +
      "要么有人在门户那边偷偷加了本地实现再转发出去",
  );
});

test("门户仓里没有第二份 UI 原语实现", { skip: skipIfNoR2 }, async () => {
  const shared = exportedValueNames(await parseFile(SHARED_UI));
  const duplicates = [];
  for (const file of await r2SourceFiles()) {
    if (file === R2_FORWARDER) continue;
    const sourceFile = await parseFile(file);
    for (const name of exportedValueNames(sourceFile)) {
      if (!shared.has(name)) continue;
      // 只有**自己声明**了同名原语才算复制品；`export { Modal } from "@oceanleo/ui/ui"`
      // 这种再转发一手不算 —— 它指向的还是同一份实现。
      const declaresItself = sourceFile.statements.some((stmt) => {
        if (ts.isExportDeclaration(stmt)) return false;
        if (!isExported(stmt)) return false;
        if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
          return stmt.name?.text === name;
        }
        if (ts.isVariableStatement(stmt)) {
          return stmt.declarationList.declarations.some(
            (decl) => ts.isIdentifier(decl.name) && decl.name.text === name,
          );
        }
        return false;
      });
      if (declaresItself) duplicates.push(`${relative(R2_ROOT, file)} → ${name}`);
    }
  }
  assert.deepEqual(
    duplicates.sort(),
    [],
    "门户里又出现了与共享包同名的本地原语实现。共享包的一行改动本该同时出现在 31 个站上，" +
      "多一份复制品就多一处收不到改动的地方 —— 这正是 W03 P4 收掉的那个缺陷。",
  );
});

test("闸真的扫到了门户那棵树，不是空转", { skip: skipIfNoR2 }, async () => {
  const files = await r2SourceFiles();
  assert.ok(files.length > 50, `只扫到 ${files.length} 份门户源码，像是没走进目录`);
  assert.ok(
    files.some((file) => relative(R2_ROOT, file) === join("app", "_components", "auth-modal.tsx")),
    "门户 app/_components 下的文件不在扫描范围里，这道闸就白加了",
  );
});

// ---------------------------------------------------------------------------
// 反面用例：证明上面那四条不是恒真的。
// 没有这一段，「全绿」只说明判据没在看，不说明门户是干净的。

test("反面用例：复制品的三种回归形态，判据都当场抓得住", () => {
  const asFile = (code) => parse("probe.tsx", code);

  // 形态一：有人把实现写回转发口。
  const reimplemented = asFile(
    [
      '"use client";',
      "export function Modal({ children }: { children: unknown }) {",
      "  return <div className=\"fixed inset-0\">{children}</div>;",
      "}",
    ].join("\n"),
  );
  assert.notDeepEqual(implementationEvidence(reimplemented), [], "写回实现却没被抓到");
  assert.ok(
    implementationEvidence(reimplemented).some((hit) => hit.includes("函数声明 Modal")),
    "抓到了但没指出是哪个原语",
  );

  // 形态二：转发口改指别处 —— 第二个事实源就是这么开始的。
  const rerouted = asFile('export { Modal } from "./local-modal";');
  assert.deepEqual(reExportSources(rerouted), ["./local-modal"]);
  assert.notDeepEqual(reExportSources(rerouted), [SHARED_SPECIFIER]);

  // 形态三：整份抄一遍放到别的文件里（`declaresItself` 那条走的就是这个判法）。
  const copy = asFile(
    ["export const Segmented = 1;", "export function SkeletonLine() {}"].join("\n"),
  );
  assert.deepEqual([...exportedValueNames(copy)].sort(), ["Segmented", "SkeletonLine"]);

  // 而真正的转发**不许**被这三条误伤 —— 否则这道闸只是个噪声源。
  const honest = asFile(
    ['"use client";', `export { Modal, Segmented } from "${SHARED_SPECIFIER}";`].join("\n"),
  );
  assert.deepEqual(implementationEvidence(honest), []);
  assert.deepEqual(reExportSources(honest), [SHARED_SPECIFIER]);
  assert.deepEqual([...exportedValueNames(honest)].sort(), ["Modal", "Segmented"]);
});

test("反面用例：判据读的是代码不是注释", () => {
  // 这份文件顶部的注释里就写着 `export function Modal` 那串字样。
  // 用正则扫全文的写法会被它判红；AST 不会。
  const commentOnly = parse(
    "probe.tsx",
    [
      "// 反例：不要再写 export function Modal() { return <div />; } 了",
      '/* 也不要 export const Select = () => <span />; */',
      'export { Modal, Select } from "@oceanleo/ui/ui";',
    ].join("\n"),
  );
  assert.deepEqual(
    implementationEvidence(commentOnly),
    [],
    "注释里的反例被当成了实现，这道闸会在每次有人写清楚「原先错在哪」时误伤",
  );
  assert.deepEqual([...exportedValueNames(commentOnly)].sort(), ["Modal", "Select"]);

  // 同样的代码真写成语句时必须被抓住 —— 证明上面那条绿不是因为判据失灵。
  const real = parse("probe.tsx", "export function Modal() { return <div />; }");
  assert.notDeepEqual(implementationEvidence(real), []);
});

test("反面用例：类型导出不参与比对，值导出参与", () => {
  const mixed = parse(
    "probe.tsx",
    [
      'export { Button, type ButtonProps } from "./Button";',
      'export type { Only } from "./types";',
      "export const BUTTON_DEFAULT_SIZE = 1;",
      "export interface NotAValue { a: 1 }",
    ].join("\n"),
  );
  assert.deepEqual(
    [...exportedValueNames(mixed)].sort(),
    ["BUTTON_DEFAULT_SIZE", "Button"],
    "类型导出混进了值集合，会让 ⊆ 比对被编译后不存在的名字带偏",
  );
});
