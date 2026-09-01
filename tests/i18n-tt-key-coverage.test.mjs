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
  "video/packages/gallery-editor/src",
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
const PRE_EXISTING_GAPS = new Set([
  "0 = 一分都不许花",
  "3D checkpoint 正在保存，请稍后重试",
  "3D playblast 凭据已生成",
  "3D 场景尚未加载完成",
  "3D 导演 / Previs",
  "3D 导演命令失败",
  "3D 导演截图保存失败",
  "3D 导演截图凭据已生成",
  "3D 截图失败",
  "3D 查看器加载失败。",
  "3D 模型加载失败",
  "3D 模型地址无效",
  "3D 模型导入失败",
  "3D 模型导出失败",
  "3D 模型尚未加载完成",
  "3D 渲染器尚未就绪",
  "3D 纹理贴图素材",
  "3D 编辑器尚未就绪",
  "3D 视图截图",
  "3D 视图截图已下载",
  "3D 视图截图已保存到我的库",
  "3D 预演失败",
  "3D 预演已取消",
  "3×3 表格",
  "8 位配对码",
  "@ 某个成员：只让 TA 处理",
  "@ 谁（可多选）",
  "FOV、光圈与对焦距离会同步到 Three.js Bokeh 景深，并写入截图与 Playblast。GLB 仅保留相机语义，不包含栅格景深效果。",
  "HDR 环境图地址",
  "HDRI 环境光照素材",
  "IR 字节",
  "PBR 材质",
  "PBR 纹理槽",
  "PDF 加载失败",
  "PDF 处理失败",
  "PDF 批注",
  "PDF 批注读取失败",
  "PDF 本地草稿恢复失败",
  "PDF 第 {page} 页",
  "PDF 页面渲染失败",
  "PDF 预览引擎加载失败",
  "PPT 在线解析失败，可打开原文件。",
  "PPT 在线解析失败，正在显示结构化幻灯片快照。",
  "PPTX 导出失败",
  "PPTX 已导出，可在 PowerPoint 或兼容软件中继续使用",
  "Previs 截图",
  "Three.js 3D 编辑画布",
  "Three.js 场景",
  "Three.js 拥有可编辑场景；保存会导出新的自包含 GLB。",
  "URL 扩展名与服务器验证的真实素材类型不一致，已拒绝加入时间线",
  "X 轴",
  "X 轴类型",
  "Y 轴",
  "Y 轴类型",
  "agent 做过什么",
  "agent 在境内版暂未开放。",
  "agent 还没有请过人。",
  "checkpoint 期间音频状态已变化，本次操作未应用；最新状态仍保留",
  "prompt 卡片",
  "token 覆盖",
  "{axis} 轴细节",
  "{kind} 片段",
  "{n} 个 · 更新 {time}",
  "{n} 条等你确认",
  "{who} 接住了这段工作，人已经进来了。",
  "{words} 字 · {chars} 字符",
  "。每笔调用都可审计；使用自己的厂商 API key（BYOK）则不扣钱包。",
  "一个都没勾 = 哪个品类都不许，这是默认状态。",
  "一句话说清你卡在哪",
  "一级标题",
  "三级标题",
  "三角形",
  "上",
  "上一帧",
  "上一项音频编辑仍在安全处理，本次操作未应用，请稍后重试",
  "上传后图片直接落在当前页面，并保持可移动、缩放和替换。",
  "上传本地图片",
  "上传签名图片",
  "上方插入行",
  "上移一层",
  "下",
  "下一帧",
  "下方插入行",
  "下移一层",
  "下载 CSV",
  "下载 Markdown",
  "下载客户端后，客户端会显示一个配对码。请在下面输入该 8 位配对码。",
  "下载客户端后，客户端会显示一个配对码；在上方输入即可连接。",
  "下载截图",
  "不填就是面议，接手的人可以跟你谈。",
  "不属于任何项目",
  "不支持的文件类型（仅视频/音频/图片）",
  "不等于",
  "专家团加载出错了",
  "两端",
  "个板块",
  "中频",
  "二创",
  "二级标题",
  "云端浏览器",
  "交叉溶解",
  "产物",
  "亮度",
  "人民币",
  "仅可作组合成分",
  "从我的应用移除",
  "从这里重新开始",
  "从预制库选择",
  "代码块",
  "以上只是这份素材的封面图",
  "以后这类不用问我（只在这次会话里有效，刷新就恢复询问）",
  "仪表",
  "位置",
  "位置与变换",
  "低频",
  "作品、网站、任务交付物和上传文件统一保存在这里。",
  "你还没有把任何电脑连上来",
  "例：这份方案的落地排期我自己判断不了，想请人过一遍。",
  "便签",
  "便签 {number}",
  "保存 3D 副本失败",
  "保存 3D 截图失败",
  "保存 PDF 副本失败",
  "保存到我的库",
  "保存失败，请稍后重试。",
  "保存失败，请重试。",
  "保存批注修改",
  "保存新版本",
  "修改后的 GLB 已导出",
  "像素化",
  "允许云端下发",
  "先别改",
  "先在左侧选择或创建一个专家团，再来这里管理它的成员。",
  "先在画布中选中一个对象",
  "先选择线条类型，再在画布中调整长度、角度和样式。",
  "光圈 f/",
  "全文检索",
  "全部收回",
  "全部替换",
  "全部站点",
  "公开求助",
  "公开求助会出现在公开池里，愿意接的人可以接手。",
  "公式栏",
  "六边形",
  "共",
  "关掉之后，额度内的请求 agent 会直接发出去；但每一次都仍然会记在下面的时间线里。",
  "关着",
  "关着的时候，agent 一个人都请不动。打开之后它也只能在你划的额度和品类里动手。",
  "关键帧",
  "内部",
  "内部上方",
  "内部下方",
  "再点一次「确认卸掉」，才会从「我的」移除。",
  "再试一次",
  "分割",
  "分割线",
  "分支已创建，但工作会话暂未同步；本次任务仍会继续运行。",
  "分类轴",
  "列",
  "列表",
  "创建分支失败",
  "初始视频源无法解码或没有真实视频轨",
  "初始音频源无法解码",
  "删锚点",
  "删除列",
  "删除失败，请稍后重试。",
  "删除工作表",
  "删除当前母版",
  "删除当前页",
  "删除所选列",
  "删除所选对象",
  "删除所选批注",
  "删除所选行",
  "删除末列",
  "删除末行",
  "删除本页",
  "删除标注",
  "删除系列",
  "删除行",
  "删除表格",
  "删除轨道",
  "删除这个任务",
  "删除选区",
  "删除页面",
  "到此停止",
  "刷新安全地址并重试",
  "刻度文字色",
  "刻度间隔（留空自动）",
  "前移一页",
  "剪辑",
  "剪辑成品",
  "副本",
  "加 100 GB",
  "加密或损坏的 PDF 不会进入可标注状态，你的既有批注没有被丢弃。",
  "加载工作会话…",
  "加锚点",
  "动画时长",
  "动画片段",
  "动画速度",
  "包含文字",
  "升序",
  "半影",
  "单元格",
  "单笔最多花多少",
  "单选",
  "单选模式",
  "即 {amount}",
  "压缩音频解码后可能超过浏览器内存，请改用视频时间线处理长音频",
  "去底色",
  "双向箭头",
  "双栏",
  "反相",
  "发起方 agent：{ref}",
  "发起求助失败，请稍后重试。",
  "取不到这份素材的当前版本；下载与收藏暂不可用。",
  "取消置顶",
  "取消预演",
  "变换工具",
  "变速",
  "只有你勾选的内容会给对方看到，之后随时可以撤回。默认一条都不给。",
  "只有你指定的这个人能看到这次求助。",
  "只能按页浏览与标注，无法全文检索或复制文字。",
  "只许在这些品类里请人",
  "叫真人",
  "可独立下载",
  "可玩游戏",
  "可玩游戏 feed",
  "右",
  "右侧插入列",
  "合并单元格",
  "合并另一个 PDF 到末尾",
  "合并失败",
  "合并所选单元格",
  "同意这次请人",
  "后移一页",
  "向上飞入",
  "向前移动",
  "向右推进",
  "向后移动",
  "向左推进",
  "含加量包",
  "启用阴影",
  "吸附",
  "品类目录暂时读不到；没勾任何品类时 agent 请不动人。",
  "四级标题",
  "图例",
  "图例位置",
  "图例字号",
  "图例文字色",
  "图例样式",
  "图文数三联",
  "图片 URL",
  "图片上传失败",
  "图片图层",
  "图片宫格",
  "图片效果",
  "图片编辑画布",
  "图片说明",
  "图片调整",
  "图片质量",
  "图表 CSV 数据",
  "图表主视觉",
  "图表保存失败",
  "图表加要点",
  "图表数据",
  "图表源尚未成功载入；已阻止保存示例回退内容",
  "图表源尚未成功载入；已阻止修改示例回退内容",
  "图表编辑不可用",
  "图表预览",
  "圆点",
  "圆点箭头",
  "圆角矩形",
  "在右侧打开",
  "在左侧添加配图 URL",
  "在播放头处分割（S）",
  "在新标签打开",
  "在签名板中书写，可反复重画后插入幻灯片。",
  "在签名板书写，满意后插入为可缩放图层。",
  "在这里编辑文字、Markdown、HTML 或代码文本…",
  "场景尚未绑定",
  "场景树",
  "坐标轴",
  "垂直环绕",
  "基底",
  "基底视频轨不能删除",
  "基础色",
  "基础色纹理",
  "填充",
  "填入 →",
  "填满裁剪",
  "增加一列",
  "增加一行",
  "增加列",
  "增加行",
  "复制为新母版",
  "复制幻灯片",
  "复制页面",
  "复古",
  "大于",
  "如需调整，可在确认前补充说明",
  "姿态",
  "字幕内容",
  "字幕样式",
  "字符",
  "它用于场景环境与照明，不是 mesh 模型，因此不会发送给 model-viewer。",
  "它用于贴到模型表面，不是 mesh 模型，因此不会发送给 model-viewer。",
  "完整",
  "完整显示",
  "实时预览已就绪",
  "实线",
  "对方现在看不到这段对话里的任何内容。",
  "对方现在能看到的内容",
  "对方的用户名（handle）",
  "对比度",
  "对焦距离",
  "对象",
  "对象变换",
  "对象效果",
  "导入 CSV",
  "导入 GLB / glTF",
  "导入 GLB 后可选择并真实编辑场景子对象",
  "导入中…",
  "导入到输入框",
  "导入或替换音频",
  "导入文档",
  "导出 DOCX 失败",
  "导出 Markdown 失败",
  "导出 XLSX 失败",
  "导出与截图",
  "导出完成，已保存到我的库",
  "导出尺寸",
  "导出已取消",
  "导出新 GLB",
  "封面",
  "封面上传失败",
  "封面不可用",
  "封面信息不全",
  "封面导出失败",
  "封面导出失败：画布不可读取",
  "封面帧已设置",
  "封面还没就绪。",
  "将从所选消息之前创建新分支；原对话保持不变。",
  "小于",
  "小数位",
  "尚未载入矢量工程",
  "就这么改",
  "嵌入图片（单选）",
  "工作中",
  "工作会话快照格式无效，未自动覆盖操作台。",
  "工作模式",
  "工作簿",
  "工作簿导入失败",
  "工作簿网格",
  "工作表",
  "工作表名称",
  "左",
  "左侧插入列",
  "左右对比",
  "左图右文",
  "左文右图",
  "已从「我的」移除。",
  "已保存模板",
  "已制定计划",
  "已加 100 GB，钱从钱包里扣。",
  "已合并 {count} 页",
  "已回复",
  "已在当前页后添加空白页",
  "已处理的确认",
  "已导入",
  "已开启",
  "已恢复上次未同步的本地草稿",
  "已把上传的演示文稿接进编辑器，可以直接改了",
  "已授权类别",
  "已插入素材系列副本",
  "已撤销上一步",
  "已收回 {n} 条。",
  "已更新计划",
  "已替换为素材副本",
  "已有批注",
  "已添加",
  "已添加「{title}」",
  "已用",
  "已由人复核于 {at}",
  "已经发出求助，正在等真人接手。",
  "已经装到「我的」。",
  "已置顶",
  "已自动放行",
  "已装",
  "已选 {n} 条",
  "已选中，点一下取消",
  "已选择",
  "已通过编辑器历史应用素材",
  "已重做",
  "已静音",
  "平台一共有 {count} 个现成的活",
  "平行光",
  "幻灯片标题",
  "幻灯片正文",
  "幻灯片缩略图",
  "应用中…",
  "应用到所选区域",
  "应用增益",
  "应用效果链",
  "应用数据",
  "应用裁剪",
  "延迟",
  "开始游玩",
  "开玩",
  "开着",
  "引文",
  "引用块",
  "归属 app",
  "当前",
  "当前 App",
  "当前会话为只读状态。",
  "当前展示已验证的模型预览；编辑时会加载固定 revision 的完整模型。",
  "当前帧尚未解码完成，请稍后再试",
  "当前帧设为封面",
  "当前操作台状态无法保存为工作会话。",
  "当前标注",
  "当前段落",
  "当前渲染器无法预览该导演相机",
  "当前系列",
  "当前系列（单选）",
  "当前音频 revision 的恢复草稿缺少源文件；已阻止用静音占位替代",
  "当前音频 revision 缺少可验证的源文件；已阻止用静音占位替代",
  "当前页已删除",
  "当前页已旋转",
  "当前页面",
  "当前页面还没有独立对象",
  "当前预演能力不可用",
  "总开关是关的",
  "恢复源虽有正确音频签名，但没有浏览器可解码的音轨",
  "成员",
  "我的应用",
  "我的应用暂时加载失败。",
  "我的设备",
  "或使用图片地址",
  "截图上传失败",
  "截图中…",
  "截图到我的库",
  "截图已上传，但登记到我的库失败",
  "所选页面已提取并下载",
  "手写签名",
  "打开 {name}",
  "打开原始页面",
  "打开原文件",
  "打开原素材",
  "打开完整素材库",
  "批注",
  "批注内容",
  "批注已删除",
  "批注已更新",
  "批注已移动",
  "找谁",
  "把这段工作交给真人（你勾选的内容才会给对方看到）",
  "投影",
  "折线",
  "拆分合并单元格",
  "拉伸",
  "拉伸填满",
  "拍次",
  "拒绝",
  "拖动裁剪框，完成后点击上方属性栏“应用裁剪”",
  "拖画高亮批注",
  "拖节点四周圆点连到另一个节点 · 点节点看 prompt/工作 · 加成员点右上",
  "拖过网格选择初始行列；插入后可在属性栏继续增减。",
  "拖过网格选择行列，点击后插入可直接编辑的表格。",
  "指定某个人",
  "指定邀请",
  "指标卡",
  "按场景看",
  "按对象存储真实字节重新数一遍，比较慢",
  "按站点筛选（默认全部）",
  "换一个关键词或分类试试。",
  "换一个版本",
  "换成圆形",
  "换成方形",
  "授权公共素材库",
  "排序与筛选",
  "探索分类",
  "描边",
  "描边与圆角",
  "描边宽度",
  "提取本页",
  "提取页面失败",
  "提示框",
  "插入",
  "插入便签",
  "插入内容",
  "插入文字签名",
  "插入表格",
  "搜 agent…",
  "搜一搜，例如：简历",
  "搜索应用",
  "搜索预制 prompt…",
  "撤回失败，请稍后重试。",
  "撤回立即生效：收回之后，对方就再也读不到这一条。",
  "撤回这次求助",
  "撤销后这台电脑立刻不再接收任何任务，需要重新配对。",
  "撤销失败",
  "撤销设备",
  "播放位置",
  "播放动画",
  "播放失败",
  "播放头下没有可分割的片段",
  "播放时间",
  "操作失败，请稍后重试。",
  "擦除",
  "收回所选 {n} 条",
  "放大时间线",
  "效果",
  "散点",
  "数值轴",
  "数字格式",
  "数据标签",
  "数据标签样式",
  "数据类型",
  "数据表",
  "数据项",
  "整体配色",
  "整列",
  "整张工作表",
  "整段音频",
  "整行",
  "文件格式",
  "文字内容",
  "文字批注",
  "文字批注 {number}",
  "文字批注已添加到当前页",
  "文字排版",
  "文字轨",
  "文字间距",
  "文字颜色",
  "文本与 Markdown 编辑器",
  "文档块（单选）",
  "文档导入失败",
  "文档来源",
  "文档源尚未成功载入；已阻止修改空白回退内容",
  "文档源尚未成功载入；请刷新源或导入文件后再保存",
  "文档源尚未成功载入；请刷新源或导入文件后再操作",
  "文档编辑区",
  "文档编辑器",
  "新增工作表",
  "新增幻灯片",
  "新建 prompt 卡片",
  "新建一页",
  "新建拍次",
  "新建镜头",
  "新文字",
  "新标注",
  "方向键翻页 · Home/End 首末页 · Ctrl + / − 缩放 · Ctrl+Z 撤销",
  "无法创建工作会话，请稍后重试。",
  "无法显示 3D 模型",
  "无法识别 URL 素材类型，请使用视频、音频或图片直链",
  "旧",
  "时间线刻度",
  "时间线开始",
  "时间线是空的，没有可导出的内容",
  "时间线源仍在载入，请完成后再导入媒体",
  "时间线源尚未成功载入，不能从空回退内容截取封面",
  "时间线源尚未成功载入；已阻止保存空回退工程",
  "时间线源尚未成功载入；已阻止导出空回退工程",
  "时间线源尚未成功载入；请先恢复有效工程，已阻止修改空回退内容",
  "时间线草稿",
  "时间轴",
  "显示 X 轴",
  "显示 Y 轴",
  "显示刻度",
  "显示提示框",
  "显示网格线",
  "显示节点",
  "景深预览 / Playblast",
  "暂停动画",
  "暂无成员",
  "暂时无法预览",
  "曝光",
  "更多操作",
  "替换为",
  "替换模型",
  "最大值（留空自动）",
  "最小值（留空自动）",
  "有技能",
  "有真人接住了这段工作，人已经进来了。",
  "服务端渲染中…",
  "未命名 agent",
  "未命名元素",
  "未能读取表格内容。",
  "未选择区间",
  "未选择对象",
  "材质",
  "材质纹理已替换",
  "条件",
  "条件格式",
  "柱状",
  "标注",
  "标注内容",
  "标注放置模式",
  "标签旋转",
  "标题与正文",
  "样式",
  "格式",
  "格式模板",
  "模型已导入，可以编辑场景对象",
  "模型标注",
  "模型灯光",
  "模型相机",
  "模糊",
  "横向",
  "横向位置",
  "正交缩放",
  "正在上传 3D 模型…",
  "正在为你取回本站的可玩作品。",
  "正在保存…",
  "正在保存并新建",
  "正在保存模板",
  "正在刷新缩略图",
  "正在加载 3D 查看器…",
  "正在加载 3D 模型…",
  "正在加载 PDF…",
  "正在加载可玩作品…",
  "正在加载我的应用",
  "正在加载真实封面",
  "正在加载设备",
  "正在发起…",
  "正在取消导出…",
  "正在处理 PDF…",
  "正在处理音频…",
  "正在打开网站页面…",
  "正在打开这份素材…",
  "正在扣款…",
  "正在收回…",
  "正在改…",
  "正在核对…",
  "正在继续执行…",
  "正在解析 PPT…",
  "正在读取 Word 文档…",
  "正在读取…",
  "正在读取工作簿…",
  "正在载入完整 3D 模型…",
  "正在载入对象化图片画布…",
  "正在载入文档…",
  "正在载入演示文稿…",
  "正在载入素材…",
  "正在载入结构化图表…",
  "正在配对…",
  "此文档无文本层",
  "此文档无文本层，无法全文检索。",
  "步",
  "段落",
  "母版",
  "母版与版式",
  "母版名称",
  "母版字体",
  "母版强调色",
  "母版文字色",
  "母版背景",
  "每一次 agent 想请人都会记在这里，包括被挡住的。你可以推翻它的任何一个决定。",
  "每天最多花多少",
  "每次请人都先问我",
  "比较值",
  "水平环绕",
  "没有 3D 模型文件。",
  "没有匹配内容",
  "没有匹配的 agent",
  "没有匹配的 app，换个词试试",
  "没有可显示的文档正文。",
  "没有可显示的预览图。",
  "没有找到匹配的文字。",
  "没有符合筛选条件的行",
  "没能移除，请稍后再试；刚才的状态已恢复。",
  "没装上，请稍后再试；刚才的状态已恢复。",
  "法线纹理",
  "波形缩放",
  "波形重建失败；修改已安全保留",
  "浏览器无法创建 PDF 画布",
  "消息",
  "淡入",
  "淡入淡出",
  "淡出",
  "淡变",
  "添加中…",
  "添加副标题",
  "添加后会成为你的卡片，重新打开网站仍在；也会显示在 oceanleo.com/playground。",
  "添加后双击画布文字即可原地输入。",
  "添加标题",
  "添加正文",
  "添加相机",
  "添加空白页",
  "添加说明文字",
  "添加轨道",
  "添加运动关键帧",
  "清除所选区域规则",
  "清除搜索",
  "清除格式",
  "清除筛选",
  "游玩",
  "源字节",
  "满幅图",
  "滤镜调整",
  "漏斗",
  "演示文稿画布",
  "演示文稿编辑器",
  "演示文稿预览",
  "演讲者备注",
  "灯光强度",
  "灯光颜色",
  "点光源",
  "点击后直接添加到当前页面中央。",
  "点击图表后，标题、坐标轴、系列类型和颜色会出现在图表上方。",
  "点击模型或场景树选择对象 · 拖动空白处环绕",
  "点击模型放置",
  "点击模型放置标注",
  "点击模型表面放置标注",
  "点右上「＋ 成员」从 agent 里挑。",
  "点画布放置文字批注",
  "点线",
  "点节点看该成员的 prompt 与正在做的工作",
  "点赞",
  "照射距离",
  "片段",
  "片段属性",
  "片段时长",
  "片段时间",
  "版式",
  "状态",
  "环境与阴影",
  "环境光",
  "环境强度",
  "环境遮蔽纹理",
  "生成封面中…",
  "用 [方括号] 标出让用户替换的字段，如 [职业]；建议不超过 3 个。",
  "画布是空的。",
  "画布背景",
  "画面变换",
  "画面调色",
  "留空 = 先谈",
  "留空或 0 = agent 请不动任何要花钱的人。",
  "留空或 0 = 今天一次都不许自动请人。",
  "登录后即可使用我的库。",
  "登录后即可请真人来接手。",
  "登录后才能装到「我的」，请先登录。",
  "登录后才能设置 agent 能不能替你请人。",
  "百分比",
  "百炼/火山为官方价格页确定性解析，OpenRouter 为其官方 API 实时价。共收录",
  "相机光圈语义会保留，但当前运行时无法渲染景深：",
  "看第 {n} 个版本，共 {total} 个",
  "矢量",
  "确定从「我的应用」移除",
  "确认卸掉",
  "确认撤销",
  "移动",
  "移动到项目",
  "移除失败，应用已经放回来了，请重试。",
  "移除链接",
  "空格播放 · S 分割 · Delete 删除 · Ctrl+Z 撤销 · Ctrl+滚轮缩放",
  "空白",
  "空白 3D 场景",
  "空白 3D 场景 · 从左侧导入模型",
  "空白 3D 场景已就绪，请导入 GLB 或自包含 glTF 模型",
  "空白工作簿，选择单元格开始输入",
  "空白文档，开始输入内容",
  "空白演示文稿。添加或选中文字后点击“编辑文字”，也可按 Enter / F2。",
  "站内页面",
  "站点：{site}",
  "章节页",
  "笔触大小",
  "笔触颜色",
  "第 {page} 页",
  "等于",
  "等你确认",
  "等待渲染…",
  "筛到 {shown} / {total} 件",
  "筛选当前列",
  "签名板",
  "签名颜色",
  "管理已给出的内容",
  "粗糙度",
  "粗细",
  "粘贴 URL",
  "粘贴图片 URL",
  "精细调整当前图片，所有改动都可撤销。",
  "系列",
  "系列名称",
  "系列类型",
  "系列颜色",
  "素材入点",
  "素材分类",
  "素材加载中",
  "素材场景分区",
  "素材导入失败",
  "素材应用失败",
  "素材操作",
  "素材视图",
  "纵向",
  "纵向位置",
  "纹理上传失败",
  "纹理只支持 PNG 或 JPEG，以确保 GLB 可安全导出",
  "纹理替换失败",
  "线型",
  "线条宽度",
  "线条样式",
  "线条端点",
  "线条色",
  "线条颜色",
  "组织",
  "细线笔",
  "终点",
  "绑定当前姿态",
  "绘制",
  "继续加载",
  "编号",
  "编辑器相机",
  "编辑所选批注",
  "编辑版",
  "缩小时间线",
  "网格线颜色",
  "网页版",
  "网页端只能给设备下单。打开开关、放宽授权目录、配对新设备，这三件事只能在那台电脑上做。即使有人拿到你的账号，也改不了这三样，而且那台电脑上会留下记录。",
  "聚光灯",
  "背景图层",
  "自动旋转",
  "自发光纹理",
  "自由",
  "至少保留一个系列",
  "草稿上传失败",
  "草稿保存失败",
  "草稿已上传，但登记到我的库失败",
  "草稿已保存到我的库",
  "荧光笔",
  "菱形",
  "虚线",
  "行",
  "行数",
  "行距",
  "补充必须包含、需要避免、语气、受众或其它要求，生成时会一并交给 AI。",
  "表头",
  "表格单元格",
  "表格样式",
  "表格结构",
  "表格编辑器",
  "衰减",
  "被品类白名单挡住",
  "被金额上限挡住",
  "裁剪",
  "裁剪保留",
  "裁剪比例",
  "裁剪设置",
  "装到我的",
  "要合并的 PDF 过大，无法在浏览器内存中安全处理",
  "要我改吗？",
  "要点列表",
  "要给对方看的内容",
  "视野角",
  "视频源无法解码或没有真实视频轨，未加入时间线",
  "视频轨",
  "解锁",
  "解锁图片图层",
  "触发方式",
  "让 agent 替我请真人",
  "许可",
  "设备",
  "设备名称",
  "设备权限如何保护你",
  "设置页面比例、主题和整套演示的视觉基调。",
  "词数",
  "试听速度",
  "该工作会话可恢复，但站点尚未接入完整工作台渲染器。",
  "请什么样的人",
  "请先在波形上拖选一个区间",
  "请先在波形上拖选要处理的区间",
  "请先解锁图层，再使用橡皮擦",
  "请先选择一张图片，再调整滤镜。",
  "请在 HistoryDetail 传入 renderWorkspace(session)，复用本站实时 workspace runtime；共享包不会用通用聊天界面伪装当时的操作台。",
  "请点击模型表面…",
  "请真人接手",
  "请真人来接手这段工作",
  "请确认后继续。",
  "请输入 http(s) 链接",
  "请输入客户端显示的 8 位配对码",
  "请输入批注内容",
  "请输入标注内容",
  "请选择拍次",
  "读取已给出的内容失败。",
  "调整",
  "货架",
  "贴图轨",
  "起点",
  "跨站搜索，找到后直接装进「我的」。",
  "跳到第 {page} 页",
  "跳转到指定页",
  "跳页",
  "轨道",
  "转场时长",
  "转场（与前一片段）",
  "载入模型后显示节点",
  "输入 8 位配对码",
  "输入便签内容",
  "输入内容或以 = 开头的公式",
  "输入姓名",
  "输入文字",
  "输入标注，再点击模型表面放置",
  "输入标题",
  "输入正文",
  "边框",
  "边框宽度",
  "边框色",
  "过渡",
  "过渡时长",
  "近裁剪",
  "返回 App 目录",
  "返回列表",
  "返回普通历史",
  "还有更多可玩作品未载入。",
  "还没有选专家团",
  "这一件存的是文件字节，没有可直接显示的正文；下载原文件可以用对应的软件打开。",
  "这一条还没有热度数据。",
  "这一款还没有可玩地址。",
  "这个 3D 条目不是可加载的 GLB/已整包托管 glTF 模型。",
  "这个 PDF 的地址不在第一方渲染网关白名单内，已拒绝在免沙箱预览框中打开。",
  "这个专家团的数据有点问题，暂时打不开。你可以关闭后重试，或换一个专家团。",
  "这个时间段太短了，至少要 0.01 秒",
  "这个时间段就是整段音频，裁了等于没裁",
  "这个条目还没有可显示的内容。",
  "这个板块的素材正在充实中，稍后再来看看。",
  "这个类别下暂无模板",
  "这份 PDF 无法打开",
  "这份工作已在另一个页面更新。当前页面不会静默覆盖，请刷新后再继续。",
  "这份演示文稿没能打开",
  "这份素材没能应用到编辑器里，请重试。",
  "这张封面是占位图。",
  "这支组织还没有成员。",
  "这是一款可以直接玩的游戏，不用下载，也不用进编辑器。",
  "这是按对象存储真实字节数出来的。",
  "这是按库里登记的文件数出来的，点「重新核对」可按真实字节再数一遍。",
  "这条记录已归属项目",
  "这条记录没有可继续的对话。",
  "这次没买成，钱没有扣。请稍后再试。",
  "这款游戏暂时算不出可玩地址，所以现在还打不开。",
  "这段对话还没有可以交出去的内容；你也可以只写一句话请人来。",
  "这段工作已经和真人谈成合同了。",
  "进入动画",
  "进入项目",
  "远裁剪",
  "连接一台电脑",
  "连接设备",
  "适宽",
  "适配",
  "适页",
  "逆时针旋转 90°",
  "选中文字",
  "选中文字后，排版与颜色会直接出现在内容上方。",
  "选区效果链",
  "选区速度",
  "选区：{start} – {end}",
  "选择交付格式与清晰度；导出不会改变可编辑工程。",
  "选择后插入；颜色、描边和透明度可继续调整。",
  "选择和移动批注",
  "选择当前页后，旋转、排序、提取和删除会出现在页面上方。",
  "选择整张工作表",
  "选择文字层级，插入后可在画布中直接改字。",
  "选择本地图片",
  "选择笔触后，直接在整张幻灯片上按住并拖动。",
  "选择线型后插入；可继续移动、旋转和调整长度。",
  "选择绘制或擦除，随后直接在画布上拖动。",
  "选择颜色后插入，双击便签即可原地编辑文字。",
  "选择颜色后插入；双击便签文字即可编辑。",
  "透明度",
  "速度",
  "重做失败",
  "重新核对",
  "重新载入",
  "重置滤镜",
  "重置相机",
  "重置视角",
  "重置调整",
  "重设封面帧（已设置）",
  "金属度",
  "金属度/粗糙度纹理",
  "钢笔",
  "铺满",
  "链接素材",
  "锁定图层",
  "锚点",
  "锥角",
  "键入或上传",
  "键入签名",
  "镜头",
  "镜头 mm",
  "镜头距离",
  "间距",
  "阴影",
  "阴影强度",
  "阴影柔和",
  "降序",
  "隐藏节点",
  "雷达",
  "需要你确认",
  "静止姿态",
  "静音",
  "音量增益",
  "音频加载失败",
  "音频导入失败",
  "音频工程操作日志无效或超过安全上限，保存已阻止；当前状态仍保留",
  "音频工程格式无效",
  "音频文件超过 128MB 安全上限",
  "音频本地草稿恢复失败",
  "音频波形加载失败",
  "音频源",
  "音频源上传失败",
  "音频源无法解码，未加入时间线",
  "音频源虽有正确容器签名，但没有浏览器可解码的音轨",
  "音频解码后过大，请改用视频时间线处理长音频",
  "音频轨",
  "音频还没载入，没法裁剪",
  "音频还没载入，没法调音量",
  "音频选区",
  "页面",
  "页面内容",
  "页面布局",
  "页面标题",
  "页面正文",
  "页面级设置不占用对象属性栏。",
  "页面背景",
  "页面过渡",
  "页面顺序已更新",
  "顶部图层先渲染；点击可在画布中选中。",
  "项目记录不会显示在普通历史中，请从项目工作空间继续查看。",
  "顺时针旋转 90°",
  "预算面议",
  "预览「{title}」",
  "预览显示前 300 行、60 列；下载原文件可查看全部内容。",
  "颜色",
  "颜色与高亮",
  "饱和度",
  "首行为表头",
  "马克笔",
  "高亮",
  "高亮 {number}",
  "高亮已添加到当前页",
  "高亮批注",
  "高频",
  "黑场",
  "黑白",
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
 */
const UNREFERENCED_GAP_CEILING = 2;
const UNREFERENCED_GAP_KNOWN = [
  // `tt(entry.label)` 间接引用，AST 扫不到；仍在屏幕上，仍缺译文。
  "保存到我的库",
  "调整",
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
