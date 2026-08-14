// ============================================================================
// 「provider 所有的翻译函数进了 effect 依赖，而这个 effect 又在体内写 state」的机检
// ----------------------------------------------------------------------------
// 为什么要有这道闸（W20，2026-08-05）：
//
// W13 在 `dcc0a7d` 修掉的加载死循环有两条引信。第一条是每渲染新建的回调字面量，已修。
// 第二条是 `useUI()` 返回的 `tt`：它是 locale provider 所有的函数。V5 用基线源码做过
// 决定性实验——固定住回调与 `item`、只让 `tt` 每渲染换一次身份，加载跑了 11 次并自锁
// （`loads=11 LOOP`）；把 `tt` 也固定住就是 `loads=1`。
//
// **今天不发作。** `I18nProvider` 已经 `useMemo`，各站也不传 `messages`，所以 `tt` 的
// 身份实际是稳的。这道闸拦的是**回归**：任何一个站哪天不记忆化 messages，或者有人在
// provider 里加一层没记忆化的包装，所有「依赖带 tt + 体内写 state」的 effect 会同时
// 变成自锁循环。这是陷阱，不是正在发的故障——判词别写过头。
//
// 判据（三个条件同时成立才判红）：
//   1. 是 `useEffect` / `useLayoutEffect`（`useMemo` / `useCallback` 不算：它们只是
//      重算，不会自己起跑；全仓 119 处带 tt 的 memo/callback 里 89 处体内也写 state，
//      一处都不许误伤）；
//   2. 依赖数组里出现 provider 所有的翻译函数（`tt` / `t` / `translate`），**且**这个
//      名字不是空依赖 `useCallback` 包出来的恒定身份（W13 在
//      `src/shell/doc-editors/use-grid-editor.ts:410-419` 定下的解法，那种写法是安全的）；
//   3. effect 体内调用了 state 写入（裸标识符 `setXxx(...)`，排除 `setTimeout` /
//      `setInterval` / `setImmediate` 这类计时器）。
//
// 两本登记簿，语义完全不同，不要混用：
//   · `LANGUAGE_RERUN_WHITELIST`：**判断**——这里确实应该按语言重跑。必须带 ≥10 字
//     理由，且必须命中真实现场（登记了一个已经不存在的位置也判红，防止假登记留着占位）。
//   · `PENDING_OTHER_OWNERS`：**欠账**——落在别人独占面上、W20 按红线 §2.3 不许动的
//     位置。只减不增：`PENDING_BUDGET` 是今天的实数，谁清掉一处就把这个数改小。
//
// 机检与数据拴在一起：判据函数同时扫 `src/` 与 `tests/fixtures/`，
// 反面用例就在 fixture 里。谁把规则改松让 `src/` 变绿，fixture 那两处会同时漏网，
// 本文件当场红。
//
// 纯静态分析（TypeScript AST），不开浏览器。
// ============================================================================

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SRC = join(REPO, "src");
const FIXTURE = join(HERE, "fixtures", "tt-effect-dependency-fixture.tsx");

/** provider 所有的翻译函数在本仓的全部叫法。 */
const PROVIDER_TRANSLATE_NAMES = new Set(["tt", "t", "translate"]);
/** 长得像 state 写入、其实是计时器的全局函数。 */
const TIMER_NOT_STATE = new Set(["setTimeout", "setInterval", "setImmediate"]);
const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"]);
const MEMO_HOOKS = new Set(["useMemo", "useCallback"]);

// ---------------------------------------------------------------- 判据实现

function calleeName(call) {
  const target = call.expression;
  if (ts.isIdentifier(target)) return target.text;
  if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.name)) {
    return target.name.text;
  }
  return "";
}

/** 空依赖 `useCallback` 绑出来的名字：身份恒定，进依赖数组是安全的（W13 的解法）。 */
function stableCallbackNames(sourceFile) {
  const stable = new Set();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      calleeName(node.initializer) === "useCallback" &&
      node.initializer.arguments.length >= 2 &&
      ts.isArrayLiteralExpression(node.initializer.arguments[1]) &&
      node.initializer.arguments[1].elements.length === 0
    ) {
      stable.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return stable;
}

function stateWritesIn(node) {
  const writes = new Set();
  const visit = (child) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
      const name = child.expression.text;
      if (/^set[A-Z]/.test(name) && !TIMER_NOT_STATE.has(name)) writes.add(name);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...writes].sort();
}

/**
 * 扫一份源码，返回 { violations, memoSites, stableMemoSites }。
 *
 * `stableMemoSites` 是**依赖里带着翻译函数、但那个名字是空依赖 `useCallback` 包出来的
 * 恒定身份**的 memo/callback。它们与 `memoSites` 合起来才是「带 tt 的 memo/callback」
 * 这一整群现场：W25 把 10 个文件改成 ref + 恒定包装之后，这一群里有一部分从
 * `memoSites` 挪到了这里（2026-08-14 实测 106 + 8 = 114 处，其中 86 处体内写 state）。
 * 分开报是为了让下限判据能对着**整群**断言，而不是对着「还没被恒定包装的那一部分」——
 * 后者会被每一次正当的修复推低，逼人反复调小下限，下限也就不再证明任何事。
 */
function scanSource(absolutePath) {
  const text = readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const stable = stableCallbackNames(sourceFile);
  const file = relative(REPO, absolutePath).split("\\").join("/");
  const violations = [];
  const memoSites = [];
  const stableMemoSites = [];

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const hook = calleeName(node);
      const isEffect = EFFECT_HOOKS.has(hook);
      const isMemo = MEMO_HOOKS.has(hook);
      if (
        (isEffect || isMemo) &&
        node.arguments.length >= 2 &&
        ts.isArrayLiteralExpression(node.arguments[1])
      ) {
        const deps = node.arguments[1].elements.map((el) => el.getText(sourceFile));
        const translateDeps = deps.filter((dep) =>
          PROVIDER_TRANSLATE_NAMES.has(dep),
        );
        const providerDeps = translateDeps.filter((dep) => !stable.has(dep));
        if (translateDeps.length) {
          const writes = stateWritesIn(node.arguments[0]);
          const line =
            sourceFile.getLineAndCharacterOfPosition(
              node.arguments[1].getStart(sourceFile),
            ).line + 1;
          const site = { file, line, hook, providerDeps, deps, writes };
          if (isMemo && providerDeps.length) memoSites.push(site);
          else if (isMemo) stableMemoSites.push({ ...site, translateDeps });
          else if (providerDeps.length && writes.length) violations.push(site);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { violations, memoSites, stableMemoSites };
}

function typeScriptFilesUnder(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) typeScriptFilesUnder(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function scanTree(dir) {
  const violations = [];
  const memoSites = [];
  const stableMemoSites = [];
  for (const file of typeScriptFilesUnder(dir).sort()) {
    const found = scanSource(file);
    violations.push(...found.violations);
    memoSites.push(...found.memoSites);
    stableMemoSites.push(...found.stableMemoSites);
  }
  return { violations, memoSites, stableMemoSites };
}

/** 登记键：文件 + 命中的 provider 依赖名。对行号漂移与改名重构免疫。 */
const keyOf = (site) => `${site.file}::${site.providerDeps.join("+")}`;

/** 登记必须带得出理由：空登记、敷衍登记一律不算。 */
function registrationProblem(entry) {
  if (!entry || typeof entry.reason !== "string") return "缺少 reason 字段";
  if (entry.reason.trim().length < 10) return "reason 少于 10 个字，等于没登记";
  return "";
}

function tally(sites) {
  const counts = new Map();
  for (const site of sites) counts.set(keyOf(site), (counts.get(keyOf(site)) || 0) + 1);
  return counts;
}

// ---------------------------------------------------------------- 登记簿

/**
 * 判断：这里确实应该按语言重跑。
 * 空着不是疏忽——W20 逐处判过 13 个现场，没有一处是「服务端按语言返回不同内容」，
 * 所以没有一处够格登记。将来真有（例如按 Accept-Language 取服务端文案），
 * 登记形状见下面注释，理由必须写清楚「为什么必须重发请求」。
 *
 * { file: "src/...", providerDeps: ["tt"], reason: "≥10 字的理由" }
 */
const LANGUAGE_RERUN_WHITELIST = [];

/**
 * 欠账：落在别人独占面上的同族缺陷，登记它的 owner 按 `_COMMON.md` 红线 §2.3 不许动。
 * **只减不增。**
 *
 * 2026-08-05 W25 交付时清空：W20 报出的 11 处已全部有人真修掉，一处不剩。
 *   · `geo-map-editor/use-geo-map-workbench.ts` —— W19 在 `62d7c0f` 里清掉（装载
 *     effect 改依赖空依赖 `useCallback` 包出的 `translate`）；
 *   · 其余 10 处（`chart-editor/`、`media-editors/` 八份、`use-embed-editor-messages.ts`）
 *     —— W25 本轮逐处改成 ref + 恒定包装。
 *
 * 空表是有意义的：从此任何一处新引信都不再有登记可挡，会被上面第一个用例当场判红。
 */
const PENDING_OTHER_OWNERS = [];

/**
 * 今天 `src/` 里真实剩余的欠账数。这个数只许改小。
 * W20 交付时实测 11；W19 清掉 1 处、W25 清掉 10 处之后实测 0。
 */
const PENDING_BUDGET = 0;

/** W20 本轮清干净的 11 个文件：谁把 tt 放回这些 effect 的依赖里，立刻红。 */
const W20_CLEARED_FILES = [
  "src/pages/ModelCapabilityMarket.tsx",
  "src/shell/ArtifactLibrary.tsx",
  "src/shell/HistoryMasterDetail.tsx",
  "src/shell/HistoryRowActions.tsx",
  "src/shell/ModelPicker.tsx",
  "src/shell/SkillPromptPanel.tsx",
  "src/shell/TeamRosterModal.tsx",
  "src/shell/cloud-browser-interaction.ts",
  "src/shell/library-viewers.tsx",
  "src/shell/video-editor/use-video-timeline.ts",
  "src/shell/workbench-embed.tsx",
];

// ---------------------------------------------------------------- 用例

const srcScan = scanTree(SRC);
const fixtureScan = scanSource(FIXTURE);

test("src 里每一处「effect 依赖带 tt 且体内写 state」都必须有登记", () => {
  const registered = new Set([
    ...LANGUAGE_RERUN_WHITELIST.map(keyOf),
    ...PENDING_OTHER_OWNERS.map(keyOf),
  ]);
  const stray = srcScan.violations.filter((site) => !registered.has(keyOf(site)));
  assert.deepEqual(
    stray.map((site) => `${site.file}:${site.line} deps=[${site.providerDeps}] writes=${site.writes}`),
    [],
    "新出现的引信：locale provider 一旦不记忆化，这个 effect 会自锁。"
      + "要么把翻译移出 effect（存中文原文、渲染时再翻，或按 W13 的 ref + 空依赖 useCallback 包一层），"
      + "要么在 LANGUAGE_RERUN_WHITELIST 里写明为什么该按语言重跑。",
  );
});

test("同一个文件里冒出第二处引信也拦得住（按登记条数核对）", () => {
  const actual = tally(srcScan.violations);
  const allowed = tally([...LANGUAGE_RERUN_WHITELIST, ...PENDING_OTHER_OWNERS]);
  for (const [key, count] of actual) {
    assert.ok(
      count <= (allowed.get(key) || 0),
      `${key} 实测 ${count} 处，登记只有 ${allowed.get(key) || 0} 处`,
    );
  }
});

test("欠账只减不增：剩余处数不得超过 PENDING_BUDGET", () => {
  assert.ok(
    srcScan.violations.length <= PENDING_BUDGET,
    `实测剩余 ${srcScan.violations.length} 处，预算 ${PENDING_BUDGET} 处；`
      + "预算只许改小，不许为了判绿改大。",
  );
});

test("登记必须带得出 ≥10 字理由，空登记与敷衍登记不算", () => {
  for (const entry of [...LANGUAGE_RERUN_WHITELIST, ...PENDING_OTHER_OWNERS]) {
    assert.equal(registrationProblem(entry), "", `${entry.file} 的登记不合格`);
  }
  // 校验器本身：空登记、短理由必须被拒，否则上面那一圈等于没查。
  assert.notEqual(registrationProblem({ file: "x" }), "");
  assert.notEqual(registrationProblem({ file: "x", reason: "" }), "");
  assert.notEqual(registrationProblem({ file: "x", reason: "该重跑" }), "");
  assert.equal(registrationProblem({ file: "x", reason: "服务端按语言返回不同正文" }), "");
});

test("白名单不许留假登记：登记的位置必须仍然是真实现场", () => {
  const live = new Set(srcScan.violations.map(keyOf));
  for (const entry of LANGUAGE_RERUN_WHITELIST) {
    assert.ok(
      live.has(keyOf(entry)),
      `${keyOf(entry)} 已经不是真实现场了，这条白名单是空占位，删掉它`,
    );
  }
});

test("W20 清干净的 11 个文件必须保持零引信", () => {
  const regressed = srcScan.violations
    .filter((site) => W20_CLEARED_FILES.includes(site.file))
    .map((site) => `${site.file}:${site.line}`);
  assert.deepEqual(regressed, [], "W20 已清掉的位置又把 tt 放回依赖了");
});

test("反面用例：fixture 里那两处必须被判红", () => {
  const flagged = fixtureScan.violations.map((site) => site.writes.join(","));
  assert.equal(
    fixtureScan.violations.length,
    2,
    `fixture 应判红 2 处，实测 ${fixtureScan.violations.length} 处：判据被改松了`,
  );
  assert.deepEqual(flagged.sort(), ["setCopy", "setMessage"]);
});

test("正面用例：fixture 里 useMemo / useCallback 带 tt 一处都不许误伤", () => {
  const memoHooks = fixtureScan.memoSites.map((site) => site.hook).sort();
  assert.deepEqual(memoHooks, ["useCallback", "useMemo"]);
  // 其中 useCallback 那处体内确实写 state —— 正是全仓 89 处的形状，仍然不判红。
  assert.ok(
    fixtureScan.memoSites.some((site) => site.writes.length > 0),
    "fixture 里应有一处 useCallback 带 tt 且体内写 state",
  );
});

test("正面用例：真实仓里那批 useMemo / useCallback 带 tt 全过", () => {
  // 「带翻译函数的 memo/callback」这一整群 = 依赖里还写着 tt 的（`memoSites`）
  // ＋ 依赖里那个名字已经是空依赖 `useCallback` 包出的恒定身份的（`stableMemoSites`）。
  const allMemoSites = [...srcScan.memoSites, ...srcScan.stableMemoSites];
  const writing = allMemoSites.filter((site) => site.writes.length > 0);
  // 实数下限（W20 实测：memo/callback 119 处，其中 89 处体内写 state；
  // 2026-08-14 实测 114 / 86，其中 8 处已被恒定包装）。
  // 写成下限而不是等号，是为了不让无关重构天天来改这个数；但它足以证明扫描器
  // 确实看见了这批现场——看不见的话下限过不去，「不误伤」就成了空话。
  //
  // 这两个数原本是对着 `memoSites` 单独写的，于是 W25 把 10 个文件改成
  // ref ＋ 恒定包装（那正是本机检推荐的修法）之后，其中 8 处从 `memoSites` 移出，
  // 实测掉到 106 < 110，判据当场红——被推低的原因是**正当修复**，不是扫描器失明。
  // 按 `_COMMON10.md` §红线 1(a) 改判据的取值口径（对整群断言，两个数一个字没改小），
  // 而不是把下限调小：下限要证明的是「这批现场扫描器都看见了」，
  // 不是「还有多少处没被修好」。
  assert.ok(
    allMemoSites.length >= 110,
    `memo/callback 带 tt 只扫到 ${allMemoSites.length} 处`,
  );
  assert.ok(writing.length >= 80, `其中体内写 state 的只扫到 ${writing.length} 处`);
  // 恒定包装那一部分必须真的在：它既是 W13/W25 修法仍然活着的实证，也证明上面那条
  // 下限不是靠「把口径放宽到一个空集合」凑过去的。
  assert.ok(
    srcScan.stableMemoSites.length > 0,
    "一处恒定包装都没扫到：要么修法被回退了，要么 stable 判定失灵了",
  );
  const leaked = srcScan.violations.filter((site) => MEMO_HOOKS.has(site.hook));
  assert.deepEqual(leaked, [], "useMemo / useCallback 被当成 effect 判红了");
});

test("白名单确实能登记：登记后这一处不再判红，另一处照红", () => {
  const registered = new Set(
    [{ file: relative(REPO, FIXTURE).split("\\").join("/"), providerDeps: ["tt"] }].map(keyOf),
  );
  // fixture 两处的 providerDeps 都是 ["tt"]，同键；用 writes 区分登记的是哪一处。
  const suppressed = fixtureScan.violations.filter(
    (site) => registered.has(keyOf(site)) && site.writes.includes("setCopy"),
  );
  const remaining = fixtureScan.violations.filter(
    (site) => !suppressed.includes(site),
  );
  assert.equal(suppressed.length, 1);
  assert.deepEqual(remaining.map((site) => site.writes), [["setMessage"]]);
});

test("W13 的稳定包装不许被误判成引信", () => {
  const stableWrapperFlagged = fixtureScan.violations.some((site) =>
    site.providerDeps.includes("translate"),
  );
  assert.equal(
    stableWrapperFlagged,
    false,
    "空依赖 useCallback 包出来的 translate 身份恒定，判红它等于逼人退回原样",
  );
});
