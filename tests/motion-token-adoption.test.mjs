// W30 · 动效 token 普及闸
//
// `W01` 造了六档阶梯并留了一把「裸时长只减不增」的棘轮，`V1` 判它绿。
// 但 `V1` 的 A3 同时判红：阶梯只接进了约 6% 的交互点，
// 「阶梯造得对，但没有任何一位 owner 被派去接」。这道闸锁的就是**接线本身**。
//
// 三条判据：
//   1. 覆盖率棘轮 —— 已接六档的站点数只增不减，裸默认档站点数只减不增；
//   2. 豁免清单是显式的 —— 清单外出现裸时长就红，清单里的死条目也红；
//   3. reduced-motion 下六档降级为 0s，**且这一条判在产物上**。
//
// 第 3 条为什么判产物不判源文件：`_COMMON.md §7b⑥`。`src/theme/ui.css` 是
// `npm run build:css` 的产物，视觉闸链的是产物。`W01` 与 `W21` 各有一次改完
// 没重编，产物陈旧让六档时长全解析成 `0s`，`V1` 实测因此造出七条假红。
// 源文件对而产物错，这道闸必须红。

import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(REPO, "src");

// ---------------------------------------------------------------------------
// 棘轮基线（2026-08-31 W30 实测冻结）
// ---------------------------------------------------------------------------

/**
 * 已接六档的站点数下限。往下掉 = 有人把 token 换回了裸值。
 * 2026-08-31 W30 实测达成 409（本棒之前是 0）。
 *
 * 用**绝对条数**而不是百分比：16 位 owner 同仓并发，别人新增一处站点会让百分比
 * 无端下滑，撞 `_COMMON.md §8`「不许在别人半成品的工作树上给别人下判决」。
 * 绝对条数只在「已接的被摘掉」时才红，那才是真倒退。
 */
const ADOPTION_FLOOR = 409;

/**
 * 仍跑 Tailwind 默认档（裸 `transition`，一个时长都没有）的站点数上限。只减不增。
 * 2026-08-31 W30 实测 11，全部在两个当时被别人改脏、我按 §3b 没碰的文件里
 * （`src/pages/AuthDialog.tsx` 10 处、`src/shell/plugin-theme.tsx` 1 处）。
 * 这一条与上一条互为镜像：只有下限会漏掉「新写一堆裸 transition」。
 */
const BARE_DEFAULT_CEILING = 11;

/**
 * 显式豁免清单：允许继续携带**裸时长**的文件。（裸时长 = 时长工具类后面直接跟数字，
 * 或方括号里以数字开头。本文件刻意不写出完整字面量，理由见末尾那条自查用例。）
 *
 * 判等用 `Set.has(整条相对路径)`，**不是 `includes`、不是裸正则**——
 * `W28` 的教训：子串匹配会把「文件改名」判成「它还在」，于是清单永远绿。
 * 整名匹配下改名会让豁免失效并当场红，这是刻意的方向。
 */
const RAW_DURATION_EXEMPT = new Map([
  // 2026-08-31 W30 交卷时**清单为空**：射程内的 46 处裸时长已全部落档，一处不剩。
  // 空清单不是「判据没生效」——它让判据 2a 退化成最强的形式「一处裸时长都不许有」。
  // 反面验证 ② 往清单外塞一处裸值，当场红；见 verdicts/W30-delivery.md。
]);

/**
 * 结构性不在分母里的东西，写在这儿只为「说得出理由」，不参与计算：
 *
 * - **长循环动画**（`v-spin` / `v-shimmer` / `v-bounce-dot` / `v-pulse-dot`）：
 *   它们是 `animation` 不是 `transition`。`W01` 刻意让它们在 reduced-motion 下
 *   放慢一倍而**不归零**（`V1` 实测 1.4/2.8/2.4/3.2s），因为它们表达「系统还在做事」，
 *   归零会让用户以为卡死。见本文件最后一条用例，那条**正面锁住它们不许被归零**。
 * - **变体形式的「关掉过渡」**（`motion-reduce:` / `lg:` 前缀的 transition-非值）：
 *   没有时长可接。此处刻意不写出完整类名，理由见下面正对照用例里的注释。
 * - **业务词 `transition`**：视频转场、幻灯转场、状态机 `transition("failed")`、
 *   PPTX `<p:transition>`。扫描器靠「同串必须另有 Tailwind 工具类」把它们挡在外面。
 */
const STRUCTURALLY_OUT_OF_SCOPE = Object.freeze([
  "long-loop animations (animation, not transition)",
  "variant-prefixed transition disablers",
  "domain-word `transition`",
]);

// ---------------------------------------------------------------------------
// 扫描器
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = ["src/theme", "src/i18n"];

const TW_TRANSITION =
  /^transition(-(all|colors|opacity|transform|shadow|\[[^\]]*\]))?$/;
/** 六档阶梯的 Tailwind 任意值写法，两种都认。 */
const LADDER_DURATION =
  /^duration-(\[var\(--leo-dur-[1-6]\)\]|\(--leo-dur-[1-6]\))$/;
/** 裸时长：时长工具类后面直接跟数字，或方括号里以数字开头。 */
const RAW_DURATION = /^duration-(\[?[0-9])/;
/** 同串里出现任意一个才认定这是 className 串，而不是自然语言或业务枚举值。 */
const TW_COTOKEN =
  /^([a-z-]+:)*(flex|grid|block|inline-flex|hidden|absolute|relative|fixed|sticky|rounded|border|shadow|opacity|truncate|overflow|cursor|select|outline|ring|backdrop|group|peer|pointer-events)(-[a-z0-9./[\]()#,%_-]+)?$|^([a-z-]+:)*(w|h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|text|bg|font|leading|tracking|z|top|left|right|bottom|inset|min|max|space|items|justify|self|col|row|translate|scale|rotate|duration|ease|delay|animate|size|basis|shrink|grow|order|aspect|object|whitespace|break|list|align|placeholder|caret|accent|fill|stroke|from|via|to|divide|decoration|underline|uppercase|lowercase|capitalize|antialiased|contrast|blur|brightness|saturate|invert|sepia|grayscale)-/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(abs);
  }
  return out;
}

/**
 * 抽出文件里所有字符串字面量的内容。跳过注释；模板插值 `${…}` 整体折成一个空格
 * ——插值里是表达式不是类名，但它两侧的类名仍属于同一个 className 串。
 */
function stringLiterals(source) {
  const out = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c !== '"' && c !== "'" && c !== "`") {
      i++;
      continue;
    }
    const quote = c;
    const start = i++;
    let text = "";
    while (i < source.length) {
      const d = source[i];
      if (d === "\\") {
        text += " ";
        i += 2;
        continue;
      }
      if (quote === "`" && d === "$" && source[i + 1] === "{") {
        let depth = 1;
        i += 2;
        while (i < source.length && depth > 0) {
          if (source[i] === "{") depth++;
          else if (source[i] === "}") depth--;
          i++;
        }
        text += " ";
        continue;
      }
      if (d === quote) {
        i++;
        break;
      }
      text += d;
      i++;
    }
    out.push({ text, line: source.slice(0, start).split("\n").length });
  }
  return out;
}

function scan() {
  const sites = [];
  const files = walk(SRC);
  let scannedFiles = 0;
  for (const abs of files) {
    const rel = relative(REPO, abs).split("\\").join("/");
    if (EXCLUDED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
    scannedFiles++;
    const source = readFileSync(abs, "utf8");
    if (!source.includes("transition")) continue;
    for (const lit of stringLiterals(source)) {
      const tokens = lit.text.split(/\s+/).filter(Boolean);
      if (!tokens.some((t) => TW_COTOKEN.test(t))) continue;
      const transitions = tokens.filter((t) => TW_TRANSITION.test(t));
      if (transitions.length === 0) continue;
      // 定档只看**无变体前缀**的时长。`active:duration-…` 说的是「按下时」那一档，
      // 它不能替基础态定档。
      // 反面验证 ① 实测过这个洞：把基础态换回裸值，而同串里仍带着按下态那一档的
      // 阶梯值，早先的实现把整个站点判成「已接档」，十条判据一条都没红。
      const allDurations = tokens.filter((t) =>
        t.replace(/^([a-z-]+:)+/, "").startsWith("duration-"),
      );
      const baseDurations = allDurations.filter((t) => !/:/.test(t));
      const kind = baseDurations.some((d) => LADDER_DURATION.test(d))
        ? "ladder"
        : baseDurations.some((d) => RAW_DURATION.test(d))
          ? "raw"
          : "bareDefault";
      // 裸时长的判定与定档分开：**任何**位置（含变体前缀）的裸时长都算违规。
      const rawTokens = allDurations.filter((t) =>
        RAW_DURATION.test(t.replace(/^([a-z-]+:)+/, "")),
      );
      for (const t of transitions) {
        sites.push({ file: rel, line: lit.line, utility: t, kind, durations: allDurations, rawTokens });
      }
    }
  }
  return { sites, scannedFiles };
}

const { sites, scannedFiles } = scan();
const ladder = sites.filter((s) => s.kind === "ladder");
const raw = sites.filter((s) => s.kind === "raw");
const bareDefault = sites.filter((s) => s.kind === "bareDefault");
const summary = () =>
  `站点 ${sites.length}（接档 ${ladder.length} / 裸时长 ${raw.length} / 默认档 ${bareDefault.length}），` +
  `覆盖率 ${((ladder.length / sites.length) * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// 正对照：先证明扫描器本身没坏（`_COMMON.md §7b③`，本波工具错误已出现三次）
// ---------------------------------------------------------------------------

test("正对照：扫描器确实走到了 src，且没有在空集合上假通过", () => {
  assert.ok(scannedFiles >= 400, `只扫到 ${scannedFiles} 个文件，范围不对`);
  assert.ok(sites.length >= 300, `只找到 ${sites.length} 个过渡站点，扫描器多半坏了`);
  // 试点文件必须在结果里，且它的八处全部接了档
  const pilot = sites.filter((s) => s.file === "src/ui/index.tsx");
  assert.ok(pilot.length >= 6, `src/ui/index.tsx 只找到 ${pilot.length} 个站点`);
  assert.equal(
    pilot.filter((s) => s.kind !== "ladder").length,
    0,
    `src/ui/index.tsx 应当全部接档，实际漏了 ${JSON.stringify(pilot.filter((s) => s.kind !== "ladder"))}`,
  );
});

test("正对照：分类规则对合成样本判得对（不是靠运气）", () => {
  const classify = (text) => {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (!tokens.some((t) => TW_COTOKEN.test(t))) return "not-a-classname";
    if (!tokens.some((t) => TW_TRANSITION.test(t))) return "no-transition";
    const all = tokens.filter((t) => t.replace(/^([a-z-]+:)+/, "").startsWith("duration-"));
    const base = all.filter((t) => !/:/.test(t));
    if (base.some((d) => LADDER_DURATION.test(d))) return "ladder";
    if (base.some((d) => RAW_DURATION.test(d))) return "raw";
    return "bareDefault";
  };
  const rawTokensOf = (text) =>
    text
      .split(/\s+/)
      .filter((t) => t.replace(/^([a-z-]+:)+/, "").startsWith("duration-"))
      .filter((t) => RAW_DURATION.test(t.replace(/^([a-z-]+:)+/, "")));
  // ⚠️ 样例一律用拼接，**不许在本文件里写出完整的类名字面量**。
  // Tailwind v4 的自动内容探测扫的是仓库根（不止 `@source` 那一行），`tests/` 也在里面。
  // 实测两次：先是样例里的类名字面量被编进了产物，改成拼接后又发现
  // **解释这件事的那条注释本身**（里面照抄了那个类名）还在被提取。
  // 两次都在产物里凭空多出规则，31 个站跟着背。
  // ⇒ 连注释里也不许写出完整类名。形状同 `W01-delivery.md §2c`：
  //   闸门把自己的说明文字算进了预算。
  const D = "duration-";
  assert.equal(classify(`rounded-lg transition ${D}[var(--leo-dur-2` + ")]"), "ladder");
  assert.equal(classify(`rounded-lg transition ${D}(--leo-dur-3` + ")"), "ladder");
  assert.equal(classify(`rounded-lg transition ${D}15` + "0"), "raw");
  assert.equal(classify(`rounded-lg transition ${D}[240m` + "s]"), "raw");
  assert.equal(classify("rounded-lg transition hover:bg-whit" + "e"), "bareDefault");
  // 自然语言与业务枚举值不许被算成 CSS 站点
  assert.equal(classify("Effets sonores de transition"), "not-a-classname");
  assert.equal(classify("transition"), "not-a-classname");

  // 反面验证 ① 抓到的洞：变体前缀上的阶梯值**不许**替基础态定档。
  const masked = `rounded-lg transition ${D}20` + "0 " + `active:${D}[var(--leo-dur-1` + ")]";
  assert.equal(classify(masked), "raw", "基础态是裸值就该判 raw，不许被 active: 那一档盖过去");
  assert.equal(rawTokensOf(masked).length, 1);
  // 反过来：变体前缀上的裸值也要被 2a 抓住，尽管它不参与定档
  const variantRaw = `rounded-lg transition ${D}[var(--leo-dur-2` + ")] " + `hover:${D}30` + "0";
  assert.equal(classify(variantRaw), "ladder");
  assert.equal(rawTokensOf(variantRaw).length, 1, "hover: 上的裸时长同样违规");
});

// ---------------------------------------------------------------------------
// 判据 1 · 覆盖率棘轮
// ---------------------------------------------------------------------------

test("判据 1a：已接六档的站点数只增不减", () => {
  assert.ok(
    ladder.length >= ADOPTION_FLOOR,
    `接档站点从 ${ADOPTION_FLOOR} 掉到 ${ladder.length}——有人把 token 换回了裸值。${summary()}`,
  );
});

test("判据 1b：仍跑 Tailwind 默认档的站点数只减不增", () => {
  const byFile = new Map();
  for (const s of bareDefault) byFile.set(s.file, (byFile.get(s.file) ?? 0) + 1);
  const worst = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  assert.ok(
    bareDefault.length <= BARE_DEFAULT_CEILING,
    `裸默认档站点从 ${BARE_DEFAULT_CEILING} 涨到 ${bareDefault.length}。${summary()}\n` +
      `命中最多的文件：${worst.map(([f, n]) => `${f}(${n})`).join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 判据 2 · 豁免清单必须显式
// ---------------------------------------------------------------------------

test("判据 2a：清单外不许出现裸时长", () => {
  // 判的是 `rawTokens` 而不是 `kind === "raw"`：挂在变体前缀上的裸时长
  // （悬停态写死毫秒那种）同样违规，但它不参与定档，落不进 `raw` 桶。
  const offenders = sites.filter(
    (s) => s.rawTokens.length > 0 && !RAW_DURATION_EXEMPT.has(s.file),
  );
  assert.equal(
    offenders.length,
    0,
    `这些站点写了裸时长又不在豁免清单里（红线 9）：\n` +
      offenders
        .map((s) => `  ${s.file}:${s.line} [${s.utility}] ${s.rawTokens.join(",")}`)
        .join("\n"),
  );
});

test("判据 2b：豁免清单里不许有死条目", () => {
  const filesWithRaw = new Set(sites.filter((s) => s.rawTokens.length > 0).map((s) => s.file));
  const dead = [...RAW_DURATION_EXEMPT.keys()].filter((f) => !filesWithRaw.has(f));
  assert.equal(
    dead.length,
    0,
    `豁免清单里这些条目已经没有裸时长了（债还完就该从清单删掉，` +
      `留着会让下一次真的回归被静静豁免掉）：\n${dead.map((f) => `  ${f}`).join("\n")}`,
  );
});

test("判据 2c：豁免机制本身有效——清单确实在过滤，不是空转", () => {
  // 清单当前为空，2a/2b 都会「因为没有裸时长」而轻松变绿。
  // 这条用合成数据证明过滤逻辑真的按整名判等：**清单里的放过、清单外的抓住、
  // 改过名的不再被放过**（`W28` 的教训：`includes`/裸正则会把改名判成「还在」）。
  const exempt = new Map([["src/demo/Kept.tsx", "理由"]]);
  const synthetic = [
    { file: "src/demo/Kept.tsx" },
    { file: "src/demo/Other.tsx" },
    { file: "src/demo/Kept.tsx.bak" },
    { file: "prefix/src/demo/Kept.tsx" },
  ];
  const caught = synthetic.filter((s) => !exempt.has(s.file)).map((s) => s.file);
  assert.deepEqual(caught, ["src/demo/Other.tsx", "src/demo/Kept.tsx.bak", "prefix/src/demo/Kept.tsx"]);
  assert.ok(STRUCTURALLY_OUT_OF_SCOPE.length >= 3);
});

// ---------------------------------------------------------------------------
// 判据 3 · reduced-motion 降级，**判在产物上**
// ---------------------------------------------------------------------------

const PRODUCT = readFileSync(join(SRC, "theme/ui.css"), "utf8");

/** 从压缩产物里取出 `@media (prefers-reduced-motion: reduce)` 里那段 `:root{…}`。 */
function reducedMotionRootBlock() {
  const marker = /prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{([^}]*)\}/;
  const m = PRODUCT.match(marker);
  assert.ok(m, "产物里找不到 reduced-motion 的 :root 降级段——多半是没跑 build:css");
  return m[1];
}

test("判据 3a：产物里六档时长在 reduced-motion 下全部归零", () => {
  const block = reducedMotionRootBlock();
  for (let n = 1; n <= 6; n++) {
    const m = block.match(new RegExp(`--leo-dur-${n}:\\s*([^;]+)`));
    assert.ok(m, `产物的 reduced-motion 段里没有 --leo-dur-${n}`);
    assert.match(
      m[1].trim(),
      /^0m?s$/,
      `--leo-dur-${n} 在 reduced-motion 下是 ${m[1].trim()}，应当是 0s`,
    );
  }
});

test("判据 3b：载荷指示器四条**不**归零（归零会让用户以为卡死）", () => {
  const block = reducedMotionRootBlock();
  for (const name of ["spin", "shimmer", "bounce-dot", "pulse-dot"]) {
    const m = block.match(new RegExp(`--leo-loop-${name}:\\s*([^;]+)`));
    assert.ok(m, `产物的 reduced-motion 段里没有 --leo-loop-${name}`);
    const seconds = Number.parseFloat(m[1]);
    assert.ok(
      Number.isFinite(seconds) && seconds > 0,
      `--leo-loop-${name} 在 reduced-motion 下是 ${m[1].trim()}，不许归零`,
    );
  }
});

test("自查：本文件不许写出可被 Tailwind 提取的完整类名（连注释里也不许）", () => {
  // Tailwind v4 的自动内容探测扫的是仓库根，`tests/` 也在里面。
  // 本棒实测**三次**在产物 `src/theme/ui.css` 里凭空多出规则：
  // 先是用例里的样例字面量，再是解释这件事的注释，第三次是另一条注释里举的例子。
  // 每一次都让 31 个站白背几条死规则。⇒ 用这条自查钉住。
  //
  // 根治要改 `src/theme/_ui-input.css`（`source(none)` 或 `@source not`），
  // 那不是 W30 的独占面，已写进 signals/W30-request.md。
  const self = readFileSync(new URL(import.meta.url), "utf8");
  const forbidden = new RegExp(
    ["durat", "ion-"].join("") + "(\\[?\\d|\\(--leo|\\[var)|" + ["trans", "ition-none"].join(""),
    "g",
  );
  const hits = self.match(forbidden) ?? [];
  assert.equal(
    hits.length,
    0,
    `本文件里有 ${hits.length} 处完整类名字面量（${[...new Set(hits)].join(", ")}），` +
      `它们会被编进产物。请拆成拼接，或改用描述性说法。`,
  );
});

test("判据 3c：产物不陈旧——源码引用的每一个阶梯工具类都已编译进 ui.css", () => {
  const referenced = new Set();
  for (const s of ladder) {
    for (const d of s.durations) {
      const m = d.match(/--leo-dur-([1-6])/);
      if (m) referenced.add(m[1]);
    }
  }
  assert.ok(referenced.size > 0, "一个阶梯工具类都没扫到，判据本身失效了");
  const missing = [...referenced].filter(
    (n) => !PRODUCT.includes(`duration-\\[var\\(--leo-dur-${n}\\)\\]`),
  );
  assert.deepEqual(
    missing,
    [],
    `源码用了 --leo-dur-${missing.join("/")} 的 Tailwind 任意值，产物里却没有对应规则。\n` +
      `⇒ 改完源码没跑 \`npm run build:css\`（_COMMON.md §7b⑥，本波已复发两次）。\n` +
      `产物陈旧时六档时长会全部解析成 0s，界面看上去像动效被关掉了。`,
  );
});
