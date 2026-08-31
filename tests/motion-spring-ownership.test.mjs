/**
 * 弹簧原语的归属闸。`docs/architecture/motion-system.md` §手势点清单 是
 * **唯一允许 import `src/lib/motion/` 的文件名单**，多一个当场判红。
 *
 * 为什么这道闸不在 `architecture:check` 里：域边界规则表
 * `src/architecture/domain-boundaries.ts` 不在 W02 的独占面上（红线 1）。
 * 判红效果是等价的——都是提交前必跑的机检——差别只在报错文案由谁给。
 * 规则表哪天要加这条，把下面的 ALLOWED 搬过去即可。
 *
 * 判定一律走 TypeScript AST + 路径解析，**不用 grep**：`_COMMON.md` §7b ③
 * 记了三次 grep 判依赖判错的事故，其中一次就发生在本任务上一棒
 * （`git grep -l edit-bar-surface` 命中的是注释，不是 import）。
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SRC = join(REPO, "src");
const MOTION_DIR = join(SRC, "lib", "motion");

/**
 * 本波允许 import 弹簧的文件。清单共 10 项（见规范），本波只落地第 1、2 项，
 * 其余 8 项是**目标态、未迁**——硬迁会撞别人的独占面（W02.md §禁区）。
 * 迁一个就往这里加一行，加不上说明那次迁移没走清单，正是本闸要拦的。
 */
const ALLOWED = new Set([
  "src/shell/edit-bar-dock-controller.tsx",
  "src/shell/FloatingContextToolbar.tsx",
]);

/**
 * 白名单里**必须真的 import** 的那些。与 `ALLOWED` 分开，因为两者管的事不同：
 * `ALLOWED` 是许可（谁被允许 import），这里是在岗证明（原语真的还接着）。
 *
 * 清单第 2 项 `FloatingContextToolbar.tsx` 只在许可里、不在这里。实现比规范写它
 * 时的设想更收敛：全部 `transform` 写入都集中进了控制器的 `paintMotion()`
 * （`motion-compositor-only.test.mjs` 的「paintMotion 是编辑栏唯一的 transform
 * 写入点」正是在锁这件事），浮层只提供 ghost/live 两层结构与 ref，因此没有理由
 * import 弹簧。为了让本闸变绿去加一行假 import，反而会把那道闸弄红。
 * 它的在岗证明改由下面那条 ref 接线用例来给。
 */
const REQUIRED_IMPORTERS = ["src/shell/edit-bar-dock-controller.tsx"];

/** 清单里但本波未迁的 8 项。只用来把「未迁」与「漏登记」区分开。 */
const NOT_MIGRATED_YET = [
  "src/shell/SplitWorkspace.tsx",
  "src/shell/video-editor/TimelineArea.tsx",
  "src/shell/doc-editors/DeckStage.tsx",
  "src/shell/media-editors/PdfStage.tsx",
  "src/shell/image-editor/fabric-controller-core.ts",
  "src/shell/LeoAssistant.tsx",
  "src/shell/ExplorePlayableFeed.tsx",
  // 第 10 项在 R5 design 仓，不在本仓，本闸扫不到也不该扫。
];

const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".mjs",
  ".js",
  "/index.ts",
  "/index.tsx",
  "/index.mjs",
  "/index.js",
];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** 相对 specifier → 仓内绝对路径。解析不到给 null（裸包名一律 null）。 */
function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function walkSources(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__snapshots__") {
        continue;
      }
      walkSources(path, found);
      continue;
    }
    if (/\.(ts|tsx|mts|mjs|js)$/.test(entry.name)) found.push(path);
  }
  return found;
}

/**
 * 一份文件里所有静态 import / re-export 的 specifier（含 `import type`）。
 *
 * 动态 `import()` 也算：`await import("../lib/motion")` 同样是一条依赖，
 * 只是延迟发生，绕过本闸就等于绕过整份规范。
 */
function specifiersOf(file) {
  const parsed = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function importsMotion(file) {
  return specifiersOf(file).some((specifier) => {
    const target = resolveSpecifier(file, specifier);
    return Boolean(target) && target.startsWith(`${MOTION_DIR}/`);
  });
}

test("只有 §手势点清单 里的文件 import 得了 src/lib/motion/", () => {
  const files = walkSources(SRC);
  // 正对照：先证明扫描本身能看见东西。零命中是最贵的一类断言
  // （`_COMMON.md` §6），少了这一步「一个违规都没有」和「扫描根本没跑」
  // 在输出上长得一模一样。
  assert.ok(
    files.length > 200,
    `src/ 只扫到 ${files.length} 份源码，扫描范围不对`,
  );

  const importers = files
    // 原语目录自己的文件当然互相 import，不在管辖范围内。
    .filter((file) => !file.startsWith(`${MOTION_DIR}/`))
    .filter((file) => importsMotion(file))
    .map((file) => relative(REPO, file))
    .sort();

  // 正对照之二：在岗证明。少了它，本闸会在弹簧被整个拆掉之后依旧全绿——
  // 那时它测的是「没有人违规」，而不是「原语还接着」。
  for (const expected of REQUIRED_IMPORTERS) {
    assert.ok(
      importers.includes(expected),
      `${expected} 应当 import 弹簧原语，实际没有：弹簧从手势点上掉线了`,
    );
  }

  const unlisted = importers.filter((file) => !ALLOWED.has(file));
  assert.deepEqual(
    unlisted,
    [],
    `这些文件 import 了弹簧原语但不在 §手势点清单 的本波名单里：${unlisted.join("、")}\n` +
      `要么把它加进 motion-system.md §手势点清单 与本文件的 ALLOWED，` +
      `要么它就不该自己写手势动效。`,
  );
});

test("未迁的 8 个手势点仍是目标态，不许假装已迁", () => {
  // 这条不是在拦违规，是在**记账**：本波只落地清单第 1、2 项，
  // 其余的还在用各自的手写动效。哪天有人迁了却忘了登记，上面那条会判红；
  // 哪天有人把文件删了或改名了，这条会判红，提醒去改规范的清单。
  const missing = NOT_MIGRATED_YET.filter(
    (file) => !isFile(join(REPO, file)),
  );
  assert.deepEqual(
    missing,
    [],
    `§手势点清单 里这些文件已经不存在了，清单该更新：${missing.join("、")}`,
  );

  const migrated = NOT_MIGRATED_YET.filter((file) =>
    importsMotion(join(REPO, file)),
  );
  assert.deepEqual(
    migrated,
    [],
    `${migrated.join("、")} 已经接了弹簧，请把它从 NOT_MIGRATED_YET 挪进 ALLOWED`,
  );
});

test("清单第 2 项的在岗证明：浮层把控制器的形变 ref 挂到了 DOM 上", () => {
  // 它不 import 弹簧（理由见 REQUIRED_IMPORTERS 的注释），所以「原语还接着」
  // 这件事只能从它实际承担的职责上验：ghost 层与 live 层的 ref 都取自控制器。
  // 少了任何一个，收缩/展开就退回本任务开工前那个「瞬间 DOM 切换、没有形变」。
  const morphRefs = ["morphGhostRef", "morphLiveRef"];
  const file = join(REPO, "src/shell/FloatingContextToolbar.tsx");
  assert.ok(isFile(file), "清单第 2 项不在了，规范 §手势点清单 该更新");

  const parsed = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const accessed = new Set();
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node)) accessed.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  // 正对照：先证明扫描真的看见了这份文件的属性访问，否则「一个都不缺」与
  // 「AST 根本没走进去」在输出上长得一样（`_COMMON.md` §6）。
  assert.ok(
    accessed.size > 5,
    `只扫到 ${accessed.size} 个属性访问，AST 扫描没生效`,
  );

  const missing = morphRefs.filter((ref) => !accessed.has(ref));
  assert.deepEqual(
    missing,
    [],
    `浮层不再挂这些 ref：${missing.join("、")}——形变层断了，` +
      `收缩/展开会退回瞬间 DOM 切换`,
  );
});
