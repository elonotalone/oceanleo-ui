// ============================================================================
// 闸：源码里每一条 `tt()` key 都要在 16 个非中文词典里有译文
// ----------------------------------------------------------------------------
// 为什么要有这道闸（2026-08-31）
//
// `useUI()` 的回退规则是「未命中就原样返回中文原文」（见 src/i18n/ui/useUI.ts）。
// 这条规则让缺译文**永远不会崩，也永远不会报错**——它只是把中文印在外国用户脸上。
// 中文站看不出来，跑不出异常，类型也拦不住，于是缺口能一路活到线上。
//
// 插件统一改造那一波真实出过的样子：视频画布顶栏那排投影切换写着
//
//     节点图  分镜  导演台  时间线  History
//
// 五个标签四个是中文一个是英文。**混排比整屏中文更难被发现**——整屏中文一眼知道是没接
// i18n，混排看着像「这一条还没来得及翻」，而实际原因是相邻的键有译文、这一条没有。
//
// 静态扫源码是唯一能证明「没有下一条」的办法，所以这道闸：
//
//   1. 统一外壳（`src/shell/plugin-chrome/`）与三个 extracted 插件（同级仓）——**零容忍**。
//      这一波的键必须 16 语齐全，没有白名单，缺一条当场红。
//   2. 全仓 + 同级仓的历史缺口——**只许变短**。开波之前 `src/shell/` 的编辑器内部
//      （media-editors / doc-editors / video-editor / image-editor / chart-editor）
//      本来就有一大片没进词典；这一波不顺手翻完它们，但也不许再长出新的。
//
// 关于同级仓：三个 extracted 插件的源码不在本仓里，路径靠**仓根往上一级**推，
// 不写死绝对路径（`w25-tests-out-of-repo-paths.test.mjs` 那道闸就是为这个立的）。
// 谁的机器上没有这些同级仓，对应的根**跳过**而不是判红——少扫几个根只会让缺口集合变小，
// 而第 2 条判的是「⊆ 基线」，子集判据在少扫时依然成立，不会假绿成「基线可以随便删」。
// ============================================================================

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

// `messages/index.ts` 用的是无扩展名的相对 import（`./zh`），Node 的 ESM 解析器不认。
// `pnpm test` 靠 package.json 里的 `--experimental-loader` 补上；但这份判据要能被单独
// `node --experimental-strip-types --test` 跑起来（sandbox 里 pnpm test 会因删 node_modules 中止）。
// 所以自己把同一个 loader 注册一遍，再动态 import 词典 —— 静态 import 会被提升到注册之前。
register("./ts-extension-loader.mjs", import.meta.url);

const { LOCALES } = await import("../src/i18n/config.ts");
const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
const { PLUGIN_CHROME_COPY_SOURCE } = await import(
  "../src/i18n/ui/messages/plugin-chrome-copy-base.ts"
);
const { EDITOR_PANELS_COPY_SOURCE } = await import(
  "../src/i18n/ui/messages/editor-panels-copy-base.ts"
);
const { FOLLOW_THROUGH_SOURCE } = await import(
  "../src/i18n/ui/messages/follow-through-copy.ts"
);
const { TASK_PAGE_PACK_SOURCE } = await import(
  "../src/i18n/ui/messages/task-page-pack-copy.ts"
);

/**
 * 本波自己落的词典。下面三条结构自检（16 语齐全 / key 等于值 / 占位符不丢 /
 * 非中日韩 han=0）对**每一册**都跑一遍。
 *
 * `W43 2026-09-01 [实测]`：这三条原来只认 `plugin-chrome`，于是
 * `editor-panels` 那 204 条新词典**一条结构自检都没过过**——它当时靠的全是
 * `Record<Exclude<Locale,"zh">, …>` 那个类型和跑批脚本，判据这边是空的。
 * 「按册名写死一个 import」就是这么漏的：加册的人不会想到回来改判据。
 */
const WAVE_DICTIONARIES = [
  ["plugin-chrome", PLUGIN_CHROME_COPY_SOURCE],
  ["editor-panels", EDITOR_PANELS_COPY_SOURCE],
  ["follow-through", FOLLOW_THROUGH_SOURCE],
  ["task-page-pack", TASK_PAGE_PACK_SOURCE],
];

/** zh 不算：中文站未命中时回退中文原文，本来就是对的，不构成缺口。 */
const TRANSLATED_LOCALES = LOCALES.filter((locale) => locale !== "zh");

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * 同级仓的公共父目录。从仓根往上推，避免任何机器专属的绝对路径。
 *
 * ----------------------------------------------------------------------------
 * W35 2026-08-31 `[实测]`：单靠「往上推一级」有一个洞，本波已经踩到了。
 *
 * `_COMMON.md §7b⑪` 要求「冻数字必须在干净检出上取」，于是大家都
 * `git worktree add --detach /tmp/xxx` 出一棵干净树来跑。可 worktree 一挪到 `/tmp`，
 * 这里推出来的 `SIBLING_ROOT` 就跟着变成 `/tmp/`，**五个同级仓一个都不在场**，
 * 跨仓扫描面整个塌掉：
 *
 *   在 /root/projects/oceanleo-ui  →  五个同级仓全在场，判出真缺口
 *                                     （website-views.ts 缺 16 语）
 *   在 /tmp/w35-clean（同一 commit）→  一个都不在场，只剩本仓 plugin-chrome 的 17 条，
 *                                     先撞上取样下限而红，**真缺口反而被挡在后面看不见**
 *
 * 两处都红，条数还一样，所以光看红的条数根本发现不了。
 *
 * ⇒ linked worktree 里要按**主工作树**的位置推同级仓，而不是按自己所在的目录。
 *   `git rev-parse --git-common-dir` 指向主仓的 `.git`，它的上一级就是主仓根。
 *   拿不到 git（浅解包、非 git 检出）就退回原来的推法。
 */
function resolveSiblingRoot() {
  const fallback = fileURLToPath(new URL("../../", import.meta.url));
  const probe = spawnSync(
    "git",
    ["-C", REPO_ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) return fallback;
  const commonDir = probe.stdout.trim();
  if (!commonDir) return fallback;
  // `<主仓根>/.git` → 主仓根 → 它的父目录就是同级仓的公共父目录。
  const mainRepoRoot = path.dirname(commonDir);
  if (!mainRepoRoot || mainRepoRoot === ".") return fallback;
  return path.join(mainRepoRoot, "..") + path.sep;
}

const SIBLING_ROOT = resolveSiblingRoot();

const OWN_ROOTS = ["src"];

/** 三个 extracted 插件 + 插件画廊宿主。缺哪个跳哪个。 */
const SIBLING_ROOTS = [
  "design/packages/gallery-editor/src",
  "website/front/packages/gallery-editor/src",
  "website/front/components/site-editor",
  "oceandino/plugin-gallery",
];

/** 统一外壳本体。这一波的零容忍面，和同级仓一起判。 */
const UNIFIED_CHROME = path.join(REPO_ROOT, "src", "shell", "plugin-chrome") + path.sep;

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
]);

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, acc);
    } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function existingRoot(base, relative) {
  const full = path.join(base, relative);
  try {
    return statSync(full).isDirectory() ? full : null;
  } catch {
    return null;
  }
}

/** 只有含汉字的 key 需要译文；`tt("·")`、`tt("PDF")` 这种不算。 */
function needsTranslation(key) {
  return /[\u4e00-\u9fff]/.test(key);
}

/**
 * `useUI()` 查表前会先把中文原文收敛一遍（“文件库”并进“我的库”、“灵感”查“模板”那张表）。
 * 判缺口必须走同一套规范化，否则会把已经有译文的键误判成缺。口径见 src/i18n/ui/useUI.ts。
 */
function lookupKeyOf(zh) {
  const canonical = zh
    .replaceAll("文件库", "我的库")
    .replaceAll("檔案庫", "我的库")
    .replaceAll("檔案库", "我的库");
  return /灵感|靈感/.test(canonical)
    ? canonical.replaceAll("灵感", "模板").replaceAll("靈感", "模板")
    : canonical;
}

/**
 * `tt(cond ? "A" : "B")`、`tt(x ?? "A")` 也是静态可解的：把每个分支的字面量都收上来。
 * `resolved:false` 表示还有分支解不出来（典型是 `tt(view.label)`），那一处记进 dynamic。
 */
function literalBranches(node) {
  if (ts.isParenthesizedExpression(node)) return literalBranches(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { resolved: true, values: [node.text] };
  }
  if (ts.isConditionalExpression(node)) {
    const whenTrue = literalBranches(node.whenTrue);
    const whenFalse = literalBranches(node.whenFalse);
    return {
      resolved: whenTrue.resolved && whenFalse.resolved,
      values: [...whenTrue.values, ...whenFalse.values],
    };
  }
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    const left = literalBranches(node.left);
    const right = literalBranches(node.right);
    return {
      resolved: left.resolved && right.resolved,
      values: [...left.values, ...right.values],
    };
  }
  return { resolved: false, values: [] };
}

/**
 * 统一外壳契约把中文原文放进**数据表**，由 `PluginChromeFrame` 统一过 `tt(view.label)`：
 *
 *   const CANVAS_VIEWS: PluginChromeView[] = [{ id: "graph", label: "节点图" }, …]
 *
 * 声明侧在插件仓，渲染侧在这里，扫调用处永远看不见「节点图」。顶栏那排中英混排就出在
 * 这个缝里——所以声明侧也要扫。
 */
const CONTRACT_LABEL_PROPS = new Set(["label", "busyLabel", "unavailableReason"]);

function collectContractLabels(source, sourceFile, sink) {
  const declaresContract = /PluginChrome(View|Action|Panel)/.test(source);
  const rendersLabel = /\btt\(\s*[A-Za-z_$][\w$.?[\]]*\.(label|busyLabel|unavailableReason)\b/.test(
    source,
  );
  if (!declaresContract && !rendersLabel) return;
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      CONTRACT_LABEL_PROPS.has(node.name.text) &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      const key = node.initializer.text;
      if (needsTranslation(key)) sink(key);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/** 一份源码里所有绑定成 UI 翻译函数的名字（约定名 `tt` 之外的别名）。 */
function translatorNames(sourceFile) {
  const names = new Set(["tt"]);
  const memberCallees = new Set();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      const typeText = node.type?.getText(sourceFile) ?? "";
      if (typeText.includes("UITranslate") && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
      const init = node.initializer;
      if (
        init &&
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === "useUI" &&
        ts.isIdentifier(node.name)
      ) {
        names.add(node.name.text);
      }
      if (
        init &&
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === "useRef" &&
        ts.isIdentifier(node.name) &&
        /translate|tt|ui/i.test(node.name.text)
      ) {
        memberCallees.add(`${node.name.text}.current`);
      }
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const property = (element.propertyName ?? element.name).getText(sourceFile);
          // `t` 不收：next-intl 的 `t` 走命名空间 key，不是「中文原文即 key」那一套。
          if (/^(tt|translate|uiTranslate|translateUi)$/.test(property)) {
            if (ts.isIdentifier(element.name)) names.add(element.name.text);
          }
        }
      }
    }
    if (ts.isParameter(node) && node.type?.getText(sourceFile).includes("UITranslate")) {
      if (ts.isIdentifier(node.name)) names.add(node.name.text);
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) names.add(element.name.text);
        }
      }
    }
    if (
      (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) &&
      node.type?.getText(sourceFile).includes("UITranslate")
    ) {
      names.add(node.name.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { names, memberCallees };
}

function scan(roots) {
  const keys = new Map();
  const contractLabels = new Map();
  const dynamic = [];
  const aliases = new Map();
  let scanned = 0;

  const addKey = (target, key, file) => {
    const lookup = lookupKeyOf(key);
    if (!target.has(lookup)) target.set(lookup, new Set());
    target.get(lookup).add(file);
  };

  for (const root of roots) {
    for (const file of walk(root)) {
      let source;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (!/useUI|UITranslate|\btt\(|PluginChrome/.test(source)) continue;
      scanned += 1;
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      collectContractLabels(source, sourceFile, (key) => {
        addKey(contractLabels, key, file);
        addKey(keys, key, file);
      });

      const { names, memberCallees } = translatorNames(sourceFile);
      const visit = (node) => {
        if (ts.isCallExpression(node) && node.arguments.length > 0) {
          let callee = null;
          if (ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
            callee = node.expression.text;
          } else if (ts.isPropertyAccessExpression(node.expression)) {
            const full = node.expression.getText(sourceFile);
            if (memberCallees.has(full) || node.expression.name.text === "tt") callee = full;
          }
          if (callee) {
            aliases.set(callee, (aliases.get(callee) ?? 0) + 1);
            const branches = literalBranches(node.arguments[0]);
            for (const value of branches.values) {
              if (needsTranslation(value)) addKey(keys, value, file);
            }
            if (!branches.resolved) {
              dynamic.push({
                file: path.relative(SIBLING_ROOT, file),
                line:
                  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                text: node.getText(sourceFile).slice(0, 120).replace(/\s+/g, " "),
              });
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return { keys, contractLabels, dynamic, aliases, scanned };
}

const ROOTS = [
  ...OWN_ROOTS.map((relative) => existingRoot(REPO_ROOT, relative)),
  ...SIBLING_ROOTS.map((relative) => existingRoot(SIBLING_ROOT, relative)),
].filter(Boolean);

const PRESENT_SIBLINGS = SIBLING_ROOTS.filter((relative) =>
  existingRoot(SIBLING_ROOT, relative),
);

const SCAN = scan(ROOTS);

function missingLocalesFor(key) {
  return TRANSLATED_LOCALES.filter((locale) => {
    const value = UI_MESSAGES[locale][key];
    return value == null || value === "";
  });
}

function inUnifiedWave(files) {
  return [...files].some(
    (file) =>
      file.startsWith(UNIFIED_CHROME) ||
      PRESENT_SIBLINGS.some((relative) =>
        file.startsWith(path.join(SIBLING_ROOT, relative) + path.sep),
      ),
  );
}

function report(entries) {
  return entries
    .map(([key, files]) => {
      const where = [...files].map((file) => path.relative(SIBLING_ROOT, file)).sort()[0];
      return `${key} → 缺 ${missingLocalesFor(key).join(",")}（${where}）`;
    })
    .sort();
}

// ---------------------------------------------------------------------------
// 0 取样面本身没有塌
// ---------------------------------------------------------------------------

test("扫描面覆盖本仓与在场的同级仓，且真的扫到了东西", () => {
  assert.ok(
    ROOTS.some((root) => root.startsWith(path.join(REPO_ROOT, "src"))),
    "本仓 src/ 都没扫到，这道闸等于没跑",
  );
  assert.ok(SCAN.scanned > 200, `只扫到 ${SCAN.scanned} 份带 tt() 的源码，取样疑似失效`);
  assert.ok(SCAN.keys.size > 1500, `只收到 ${SCAN.keys.size} 条 tt() key，取样疑似失效`);
  assert.ok(SCAN.aliases.has("tt"), "连约定名 tt 都没扫到，AST 走歪了");
});

test("跨仓扫描面没有因为换了目录而静默塌掉", () => {
  // 为什么单立一条：上面那条取样下限今天**碰巧**拦住了塌掉的扫描面（本仓自己只有 17 条，
  // 下限是 20）。这是运气，不是判据——`plugin-chrome/` 再多加四条 key，塌掉的扫描面
  // 就能过下限，于是三个 extracted 插件一条都不扫、这道闸照样全绿。
  // `[实测]` W35：同一 commit 在 /tmp 的 worktree 上跑，`website-views.ts` 缺 16 语
  // 那条真缺口就是这么消失的。
  //
  // 判「在不在场」而不是判「有几个」：谁的机器上真没装某个同级仓，那是环境，跳过是对的；
  // 但**一个都不在场**只可能是路径推歪了——本仓与 oceandino 是同一台机器上一起检出的。
  const expected = SIBLING_ROOTS.map((relative) => path.join(SIBLING_ROOT, relative));
  assert.ok(
    PRESENT_SIBLINGS.length > 0,
    "五个同级仓一个都不在场，跨仓扫描面塌了。\n"
      + `推出来的公共父目录：${SIBLING_ROOT}\n`
      + `按它找过：\n${expected.map((dir) => `  ${dir}`).join("\n")}\n`
      + "最常见的原因是这棵树是 `git worktree add /tmp/...` 出来的：worktree 一挪走，"
      + "「仓根往上一级」就推到 /tmp 去了。把 worktree 建在仓的同级目录再跑。",
  );
});

test("声明侧的外壳契约标签也在扫描面里（顶栏中英混排就漏在这个缝）", () => {
  // `tt(view.label)` 在渲染处解不出字面量，必须从 PluginChromeView 的声明侧收。
  assert.ok(
    SCAN.contractLabels.size > 0,
    "一条 PluginChromeView/Action/Panel 的 label 都没收到，声明侧扫描失效",
  );
  for (const key of ["视图切换", "编辑栏"]) {
    assert.ok(SCAN.keys.has(key), `统一外壳的「${key}」不在扫描面里，取样漂了`);
  }
});

// ---------------------------------------------------------------------------
// 1 统一外壳 + 三个 extracted 插件：零容忍
// ---------------------------------------------------------------------------

test("统一外壳与在场同级插件用到的 tt() key，16 个语种一条不缺", () => {
  const waveKeys = [...SCAN.keys].filter(([, files]) => inUnifiedWave(files));
  // 取样下限跟着在场的仓走：只有本仓时，`shell/plugin-chrome/` 自己就有二十几条；
  // 五个同级仓都在时应该是两百多条。缺仓的人跳过多出来的那部分，而不是判红。
  const floor = PRESENT_SIBLINGS.length === SIBLING_ROOTS.length ? 100 : 20;
  assert.ok(
    waveKeys.length > floor,
    `这一波只取到 ${waveKeys.length} 条 key，取样失效（在场同级仓：${
      PRESENT_SIBLINGS.join(", ") || "无"
    }）。同级仓的公共父目录推成了 ${SIBLING_ROOT}${
      PRESENT_SIBLINGS.length
        ? ""
        : "——一个同级仓都不在场。若这是一棵 git worktree，先确认 " +
          "`git rev-parse --git-common-dir` 指得对；再不行就把 worktree 建在仓的同级目录再跑，" +
          "别放 /tmp（W35 2026-08-31 实测：放 /tmp 会让跨仓扫描面整个塌掉）"
    }`,
  );
  const uncovered = waveKeys.filter(([key]) => missingLocalesFor(key).length > 0);
  assert.deepEqual(
    report(uncovered),
    [],
    "统一外壳这一波不许有缺口：少一条，外国用户的顶栏就中英混排",
  );
});

test("本波词典 16 语齐全、中文站 key 等于值、插值占位符不丢", () => {
  for (const [册, source] of WAVE_DICTIONARIES) {
    const keys = Object.values(source);
    assert.ok(keys.length > 0, `${册} 一条 key 都没有，词典的 import 大概换了名字`);
    for (const key of keys) {
      assert.equal(
        UI_MESSAGES.zh[key],
        key,
        `中文站 key 必须等于值（中文原文即 key）：${册} ${key}`,
      );
      const placeholders = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      for (const locale of TRANSLATED_LOCALES) {
        const value = UI_MESSAGES[locale][key];
        assert.ok(value, `${locale} 缺译文：${册} ${key}`);
        assert.deepEqual(
          [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(),
          placeholders,
          `${locale} 的译文丢了插值占位符：${册} ${key}`,
        );
      }
    }
  }
});

test("本波词典不许把中文原样抄进非中日语种", () => {
  // 繁体与日文允许出现汉字（「画板」「動画」这类简繁/中日同形才是对的），其余 13 语一个都不许有。
  const HAN = /[\u4e00-\u9fff]/;
  const leaked = [];
  for (const [册, source] of WAVE_DICTIONARIES) {
    for (const key of Object.values(source)) {
      for (const locale of TRANSLATED_LOCALES) {
        if (locale === "zh-TW" || locale === "ja" || locale === "ko") continue;
        const value = UI_MESSAGES[locale][key];
        if (HAN.test(value)) leaked.push(`${册} ${locale}: ${key} → ${value}`);
      }
    }
  }
  assert.deepEqual(leaked.sort(), [], "非中日韩语种的译文里出现了汉字，等于没译");
});

/**
 * `W43 2026-09-01 [实测]`：上面那条只拦「非中日韩档里出现汉字」，
 * 拦不住**日韩档整条照抄中文原文**——`ja` 抄一整句中文，汉字检查是放过的，
 * 而日文读者看到的就是一句中文。
 *
 * 短的共用汉字词是正常的，整句照抄不是：`平均` 在日文里就写作 `平均`，
 * `主軸（左）` 也一样。判「短词」用两条：汉字 ≤6 个，且不含句子级标点。
 *
 * ⚠️ **`zh-TW` 刻意不在这条里面**，这是缩小后的承诺，不是漏掉：
 * 简繁同形的整句太常见了——第一版把 `zh-TW` 也判进来，当场红在
 * `plugin-chrome zh-TW: 正在解析 PSD…` 上，而 `正在解析` 四个字简繁**本来就同形**，
 * 那是一条正确的繁体译文，不是充数。要真正验繁体，需要的是
 * 「简体独有字符一个都不许出现」那种字表检查，跟这条不是同一条判据；
 * 靠「整条相同」去猜只会制造假红，而假红比假绿更隐蔽（`_COMMON §7b⑪b`）。
 */
test("日韩档不许整条照抄中文原文（短的共用汉字词除外）", () => {
  const HAN = /[\u4e00-\u9fff]/;
  const SENTENCE_PUNCTUATION = /[，。、；：？！「」…]/;
  const isSharedVocabulary = (text) =>
    [...text].filter((ch) => HAN.test(ch)).length <= 6 && !SENTENCE_PUNCTUATION.test(text);
  const copied = [];
  for (const [册, source] of WAVE_DICTIONARIES) {
    for (const key of Object.values(source)) {
      if (isSharedVocabulary(key)) continue;
      for (const locale of ["ja", "ko"]) {
        if (UI_MESSAGES[locale][key] === key) copied.push(`${册} ${locale}: ${key}`);
      }
    }
  }
  assert.deepEqual(
    copied.sort(),
    [],
    "日韩档把整条中文原文照抄了一遍——那是充数，不是译文",
  );
});

// ---------------------------------------------------------------------------
// 2 全仓历史缺口：只许变短
// ---------------------------------------------------------------------------

/**
 * 开波之前就缺译文的 key。**这张表只能变短。**
 *
 * ⚠️ **本闸刻意不接 `tests/helpers/clean-tree-baseline.mjs`**（`W35` 定夺，R5）。
 * 别的冻了数字的闸都接了那个 helper 来自证「基线取自干净检出」，这一道不能接：
 * `measureOnCommittedTree()` 把树 `git archive` 到 `os.tmpdir()`，而本闸的扫描面
 * **跨出本仓**（五个同级仓）。解到 `/tmp` 之后邻居一个都不在场，扫描面会**静默塌掉**，
 * 于是量出来的基线比真值小——接了反而会冻下一个错的数。
 * `[实测]` 同一 commit `acd8192`：在仓真实位置判出 `website-views.ts` 的真缺口，
 * 在 `/tmp/w35-clean` 的 worktree 上则塌到只剩 17 条 key、红在「取样失效」，
 * 真缺口被挡在后面看不见。两处都红、条数还一样，光看条数发现不了。
 *
 * 替代保护（同样是机检，不靠纪律）：
 *   · `SIBLING_ROOT` 按 `git rev-parse --git-common-dir` 推**主工作树**，
 *     linked worktree 挪到哪里都找得回同级仓；
 *   · 「跨仓扫描面没有因为换了目录而静默塌掉」那条用例——一个同级仓都不在场就判红；
 *   · 「历史基线不许留死条目」那条——补齐了译文的 key 必须从这张表里删掉。
 * 详见 helper 头部那段跨仓警告。
 *
 * 它们几乎全在 `src/shell/` 的编辑器内部（media-editors / doc-editors / video-editor /
 * image-editor / chart-editor），是插件统一改造之前就欠下的；这一波只补统一外壳与
 * extracted 插件，不顺手翻完这一片。但新加的中文一律要有译文——**新键落不进这张表**，
 * 缺了当场红。
 */
// W6 2026-11-03: remove five now fully translated keys (including 已置顶),
// plus 当前 App (renamed to 所有素材 in 6bc474ee) and 打开原始页面 (removed in bc511644).
// The new 所有素材 wording remains subject to the strict missing-translation gate; no exemption was added.
const PRE_EXISTING_GAPS = new Set([
  "0 = 一分都不许花",
  "PDF 加载失败",
  "URL 扩展名与服务器验证的真实素材类型不一致，已拒绝加入时间线",
  "agent 做过什么",
  "agent 在境内版暂未开放。",
  "agent 还没有请过人。",
  "prompt 卡片",
  "{n} 条等你确认",
  "{words} 字 · {chars} 字符",
  "一个都没勾 = 哪个品类都不许，这是默认状态。",
  "一级标题",
  "三级标题",
  "上",
  "上移一层",
  "下",
  "下移一层",
  "不属于任何项目",
  "不支持的文件类型（仅视频/音频/图片）",
  "专家团加载出错了",
  "两端",
  "二创",
  "二级标题",
  "从我的应用移除",
  "从预制库选择",
  "以上只是这份素材的封面图",
  "以后这类不用问我（只在这次会话里有效，刷新就恢复询问）",
  "位置",
  "保存到我的库",
  "保存失败，请稍后重试。",
  "保存失败，请重试。",
  "先别改",
  "先在左侧选择或创建一个专家团，再来这里管理它的成员。",
  "全部替换",
  "关掉之后，额度内的请求 agent 会直接发出去；但每一次都仍然会记在下面的时间线里。",
  "关着的时候，agent 一个人都请不动。打开之后它也只能在你划的额度和品类里动手。",
  "删除列",
  "删除行",
  "删除表格",
  "删除这个任务",
  "剪辑成品",
  "单笔最多花多少",
  "发起方 agent：{ref}",
  "取不到这份素材的当前版本；下载与收藏暂不可用。",
  "只许在这些品类里请人",
  "可玩游戏",
  "可玩游戏 feed",
  "同意这次请人",
  "品类目录暂时读不到；没勾任何品类时 agent 请不动人。",
  "图片 URL",
  "图片上传失败",
  "图片图层",
  "图片编辑画布",
  "在新标签打开",
  "基底视频轨不能删除",
  "填入 →",
  "增加列",
  "增加行",
  "字符",
  "对象",
  "导出 DOCX 失败",
  "导出 Markdown 失败",
  "导出已取消",
  "封面上传失败",
  "封面不可用",
  "封面信息不全",
  "封面导出失败",
  "封面导出失败：画布不可读取",
  "封面帧已设置",
  "封面还没就绪。",
  "就这么改",
  "嵌入图片（单选）",
  "工作中",
  "工作会话快照格式无效，未自动覆盖操作台。",
  "工作模式",
  "已保存模板",
  "已导入",
  "已添加「{title}」",
  "已由人复核于 {at}",
  "已自动放行",
  "已选中，点一下取消",
  "开始游玩",
  "开玩",
  "归属 app",
  "当前",
  "当前帧尚未解码完成，请稍后再试",
  "当前操作台状态无法保存为工作会话。",
  "当前段落",
  "总开关是关的",
  "我的应用",
  "我的应用暂时加载失败。",
  "打开 {name}",
  "打开完整素材库",
  "把这段工作交给真人（你勾选的内容才会给对方看到）",
  "拖动裁剪框，完成后点击上方属性栏“应用裁剪”",
  "拖节点四周圆点连到另一个节点 · 点节点看 prompt/工作 · 加成员点右上",
  "授权公共素材库",
  "探索分类",
  "描边宽度",
  "搜 agent…",
  "搜一搜，例如：简历",
  "搜索应用",
  "搜索预制 prompt…",
  "播放头下没有可分割的片段",
  "操作失败，请稍后重试。",
  "文字轨",
  "文档块（单选）",
  "文档导入失败",
  "文档源尚未成功载入；已阻止修改空白回退内容",
  "文档源尚未成功载入；请刷新源或导入文件后再保存",
  "文档源尚未成功载入；请刷新源或导入文件后再操作",
  "文档编辑区",
  "文档编辑器",
  "新建 prompt 卡片",
  "新文字",
  "无法识别 URL 素材类型，请使用视频、音频或图片直链",
  "时间线是空的，没有可导出的内容",
  "时间线源仍在载入，请完成后再导入媒体",
  "时间线源尚未成功载入，不能从空回退内容截取封面",
  "时间线源尚未成功载入；已阻止保存空回退工程",
  "时间线源尚未成功载入；已阻止导出空回退工程",
  "时间线源尚未成功载入；请先恢复有效工程，已阻止修改空回退内容",
  "时间线草稿",
  "暂时无法预览",
  "替换为",
  "未命名 agent",
  "格式",
  "正在为你取回本站的可玩作品。",
  "正在保存并新建",
  "正在保存模板",
  "正在刷新缩略图",
  "正在加载可玩作品…",
  "正在加载我的应用",
  "正在加载真实封面",
  "正在取消导出…",
  "正在改…",
  "正在载入对象化图片画布…",
  "每一次 agent 想请人都会记在这里，包括被挡住的。你可以推翻它的任何一个决定。",
  "每天最多花多少",
  "每次请人都先问我",
  "没有匹配的 agent",
  "没有匹配的 app，换个词试试",
  "浏览器无法创建 PDF 画布",
  "添加后会成为你的卡片，重新打开网站仍在；也会显示在工作台。",
  "清除格式",
  "游玩",
  "点右上「＋ 成员」从 agent 里挑。",
  "点节点看该成员的 prompt 与正在做的工作",
  "点赞",
  "片段",
  "用 [方括号] 标出让用户替换的字段，如 [职业]；建议不超过 3 个。",
  "画布是空的。",
  "留空或 0 = agent 请不动任何要花钱的人。",
  "留空或 0 = 今天一次都不许自动请人。",
  "登录后即可使用我的库。",
  "登录后才能设置 agent 能不能替你请人。",
  "确定从「我的应用」移除",
  "移动到项目",
  "移除失败，应用已经放回来了，请重试。",
  "移除链接",
  "空白文档，开始输入内容",
  "等你确认",
  "筛到 {shown} / {total} 件",
  "素材分类",
  "素材加载中",
  "素材场景分区",
  "素材导入失败",
  "素材应用失败",
  "线条宽度",
  "草稿上传失败",
  "草稿保存失败",
  "草稿已上传，但登记到我的库失败",
  "补充必须包含、需要避免、语气、受众或其它要求，生成时会一并交给 AI。",
  "表格单元格",
  "被品类白名单挡住",
  "被金额上限挡住",
  "要我改吗？",
  "让 agent 替我请真人",
  "该工作会话可恢复，但站点尚未接入完整工作台渲染器。",
  "请在 HistoryDetail 传入 renderWorkspace(session)，复用本站实时 workspace runtime；共享包不会用通用聊天界面伪装当时的操作台。",
  "请输入 http(s) 链接",
  "调整",
  "货架",
  "边框宽度",
  "边框色",
  "返回 App 目录",
  "还有更多可玩作品未载入。",
  "还没有选专家团",
  "这一条还没有热度数据。",
  "这一款还没有可玩地址。",
  "这个专家团的数据有点问题，暂时打不开。你可以关闭后重试，或换一个专家团。",
  "这个条目还没有可显示的内容。",
  "这个板块的素材正在充实中，稍后再来看看。",
  "这个类别下暂无模板",
  "这份工作已在另一个页面更新。当前页面不会静默覆盖，请刷新后再继续。",
  "这份素材没能应用到编辑器里，请重试。",
  "这张封面是占位图。",
  "这支组织还没有成员。",
  "这是一款可以直接玩的游戏，不用下载，也不用进编辑器。",
  "这条记录没有可继续的对话。",
  "这款游戏暂时算不出可玩地址，所以现在还打不开。",
  "选中文字",
  "链接素材",
  "间距",
  "阴影",
  "音频轨",
  "预览「{title}」",
  "（没有给出理由）",
  "＋ 创建 agent",
  "＋ 成员",
]);


test("全仓 tt() key 的缺口只在历史基线之内，没有长出新的", () => {
  const uncovered = [...SCAN.keys].filter(
    ([key]) => missingLocalesFor(key).length > 0 && !PRE_EXISTING_GAPS.has(key),
  );
  assert.deepEqual(
    report(uncovered),
    [],
    "有新文案没补译文。useUI() 未命中会原样返回中文原文——不会崩，只会把中文印在外国用户脸上",
  );
});

test("历史基线不许留死条目：已经补上译文的要从表里删掉", () => {
  const healed = [...PRE_EXISTING_GAPS].filter(
    (key) => SCAN.keys.has(key) && missingLocalesFor(key).length === 0,
  );
  assert.deepEqual(
    healed.sort(),
    [],
    "这些 key 已经 16 语齐全了，请从 PRE_EXISTING_GAPS 里删掉，别再给下一次留豁免",
  );
});

/**
 * 上面那条只抓「补好了却还留着豁免」的死条目，抓不到另一种：
 * **key 本身已经没有任何 `tt()` 调用点了**，于是它永远不会进 `SCAN.keys`、
 * 永远不参与判定，白白挂在表上抬着预算。`_COMMON §7b⑪c` 的「棘轮空转」同族。
 *
 * `W43 2026-09-01 [实测]`：这样的条目当时有 12 条。逐条查过之后**只摘了 10 条**，
 * 因为两种情形处置相反（`§7b⑪c` 说的就是这个）：
 *
 *   · 10 条是**真删除**——全部随 `ec16165`「delete AdvancedImageEditor dead code」消失，
 *     `git show --name-status --find-renames=40%` 显示该 commit 在 `src` 下只有一个
 *     `D src/shell/AdvancedImageEditor.tsx`，没有改名。同族概念的新说法
 *     （`顺时针旋转 90°` `逆时针旋转 90°` `黑白`）本来就各自登记着，摘掉不削弱闸门。
 *   · 2 条**不是死的，是扫描面看不见**：`保存到我的库`（`doc-family-commands.ts` 三处
 *     `label:` 字面量）与 `调整`（`selection-inspector-groups.ts:176` 三元表达式），
 *     它们经 `tt(entry.label)` 在渲染时才进 `tt()`，AST 扫的是 `tt()` 的**字面量实参**，
 *     所以扫不到。这两条**今天仍然印在用户脸上且仍然没译**，摘掉就是把已知欠账
 *     从账本上擦掉。留着，并在这里写明为什么留。
 *
 * ⇒ 所以这条是棘轮而不是「必须为 0」：上限只许往下调。
 *   下一个人把 `tt(x.label)` 那条间接引用也补上译文之后，回来把这两条一起摘掉、上限调到 0。
 *
 * `X9 2026-09-06 [实测]`：合流 HEAD 上死登记涨到 5 条，逐条查 `git log -S`：
 *   · `无法创建工作会话，请稍后重试。`——`ba484b4` 把那两个 `setError(… tt(…))` 分支整段删了
 *     （改走 `workspace.ensureActive`），没有改名 ⇒ 真删除，摘。
 *   · `此文档无文本层`——`6e7d022`（X3）删掉了 PdfStage 画布顶部那条通栏，也就是它唯一的
 *     `tt()` 调用点；剩下 `use-pdf-reader-machine.ts` 里 `message: "此文档无文本层"` 一个裸字面量，
 *     经 `adapter.status` / `failure.message` 送出去时**根本不经过 `tt()`**（不是间接引用，
 *     是漏译的另一类缺陷，已写进 X9 日志「发现但未处理」）⇒ 作为 tt key 是真删除，摘。
 *   · `只能按页浏览与标注，无法全文检索或复制文字。`——同一个 commit 把它与上一条**合并改名**成
 *     `此文档无文本层，只能按页浏览与标注，无法全文检索或复制文字。`，交给 `adapter.notices`，
 *     由 `PluginChromeNotices` 经 `tt(notice.message)` 渲染 ⇒ 改名 + 间接引用：登记换成新串，
 *     并按上面的规则进 `UNREFERENCED_GAP_KNOWN`（仍印在用户脸上、仍没译）。
 *   上限因此 2 → 3：不是放松，是把 X3 新造出来的一条**已知未译**记进账本而不是擦掉。
 *   给这条合并文案补齐 16 语（或改回 `tt()` 字面量）之后，回来摘掉它、把上限调回 2。
 */
/**
 * `U3 2026-09-07 [实测]`：`1280214`「core-swap:delete grid」删掉旧表格核
 * （GridStage / GridContextToolbar / use-grid-editor）之后，这里一度有 49 条死登记，
 * 46 条是表格串。处置分三类，逐条 `git grep -F 'tt("…")' <commit>~1 -- src` 核过：
 *
 *   · **27 条改走 Univer 舞台并补齐 16 语**（上方插入行 / 删除所选列 / 数据类型 / 小数位 /
 *     人民币 / 百分比 / 数字格式 / 排序与筛选 / 条件格式 / 工作簿 / 导出 XLSX 失败 / 编辑版 …）：
 *     `facade-commands.ts` 的 `gridUniverCommandLabel()` 是 `tt(command.label)` 声明侧，
 *     `stage-plan.ts` / `document-actions.ts` / `GridUniverStage.tsx` 直接 `tt("…")`，
 *     译文落在 `editor-panels-copy-*`「表格 · Univer 舞台」一节。它们由第 9 条从基线摘掉。
 *   · **20 条随旧核真删除**（公式栏 / 删除工作表 / 包含文字 / 合并失败 / 工作簿导入失败 /
 *     工作簿网格 / 工作表 / 工作表名称 / 整列 / 整张工作表 / 整行 / 没有符合筛选条件的行 /
 *     空白工作簿，选择单元格开始输入 / 输入内容或以 = 开头的公式 / 选择整张工作表 /
 *     不等于 / 大于 / 小于 / 等于 / 表格编辑器）：唯一的 `tt()` 调用点全在被删的三个文件里，
 *     `git grep` HEAD 的 `src` 下没有同名字面量，或只剩**不经 `tt()`** 的另类残留——
 *     `等于`/`不等于`/`大于`/`小于` 在 `grid-format/conditional-format.ts` 的
 *     `describeConditionalRule()` 与 `data-validation.ts` 的 `OPERATOR_TEXT`（Univer 侧
 *     只用 `toolbar-bridge` 的 `numberFormatPatternForPreset`，这两张表已经没有消费方上屏），
 *     `表格编辑器` 在 `doc-family-formats.ts` 的 `DOC_FAMILY_EDITOR_NAMES`（拼进导入报错句，
 *     整句不过 `tt()`，与 X9 的 `此文档无文本层` 同一类漏译缺陷，已写进 U3 日志「发现但未处理」）。
 *     按 X9 的口径：作为 tt key 是真删除，摘。上限不动。
 *   · 检查器组名回到旧 GridContextToolbar 的组 id（grid-rows / grid-columns / grid-data /
 *     grid-conditional / grid-validation），`selection-inspector-groups.ts` 的 presentation
 *     label（行操作 / 列操作 / 排序与筛选 / 条件格式）经 `tt(entry.label)` 上屏，
 *     也一并补了 16 语——它们本来就不在基线里，属于顺手堵上的间接引用。
 */
/**
 * `R5 2026-10-30 [实测]`：死登记涨到 199 条（PDF 编辑器换核、旧 task-host 删除等之后没人回来摘）。
 * 逐条在 src + 五个同级根里 grep 带引号的同名字面量：
 *   · 168 条一处都没有 ⇒ 真删除，摘（含 R5 本波改写掉的 `已处理的确认`，旧 `此文档无文本层…` 合并串也已无字面量）；
 *   · 31 条仍以声明侧字面量存在（doc-family-commands / selection-inspector-groups / model3d、
 *     design-selection-controls、site-editor 的 label 表等）⇒ 按上面的规则不摘，记进 KNOWN。
 *   另有 12 条 AgentChat / AgentTranscriptBubble 历史缺口已在 computer-task-workspace-copy.ts 补齐 16 语，由第 9 条摘掉。
 * 上限 3 → 31 不是放松：是把原先藏在 199 条里的已知间接引用逐条记账；给它们补齐译文后回来往下调。
 */
const UNREFERENCED_GAP_CEILING = 18;
const UNREFERENCED_GAP_KNOWN = [
  // 声明侧标签（`label:` 字面量 / 文案表），渲染时经 `tt(entry.label)` 这类间接引用进 tt()，AST 扫不到；
  // 仍在屏幕上，仍缺译文。R5 2026-10-30 逐条 grep 过：每条在 src 或同级仓里仍有同名带引号字面量。
  "一级标题",
  "三级标题",
  "上",
  "上移一层",
  "下",
  "下移一层",
  "两端",
  "二级标题",
  "位置",
  "描边宽度",
  "浏览器无法创建 PDF 画布",
  "片段",
  "线条宽度",
  "调整",
  "边框宽度",
  "边框色",
  "间距",
  "阴影",
];

test("历史基线不许挂着已经没有调用点的死登记（棘轮，只减不增）", () => {
  const unreferenced = [...PRE_EXISTING_GAPS].filter((key) => !SCAN.keys.has(key)).sort();
  assert.ok(
    unreferenced.length <= UNREFERENCED_GAP_CEILING,
    `PRE_EXISTING_GAPS 里有 ${unreferenced.length} 条已经没有任何 tt() 调用点（上限 ${UNREFERENCED_GAP_CEILING}）：\n` +
      `${unreferenced.map((key) => `  ${key}`).join("\n")}\n` +
      "摘之前逐条确认是**删除**还是**改名**：删除可以直接摘；" +
      "改名要把登记换成新串，否则那处文案从此没人守。" +
      "若它只是被 tt(x.label) 这类间接引用（扫描面看不见），别摘——把它加进 UNREFERENCED_GAP_KNOWN 并写明理由。",
  );
  assert.deepEqual(
    unreferenced,
    [...UNREFERENCED_GAP_KNOWN].sort(),
    "已知的间接引用清单和实测对不上：要么有新的死登记长出来，要么这两条已经能被扫到了（那就把上限调到 0）",
  );
});
