// ============================================================================
// 动效 token 闸（W01 / motion-system.md §规范一）
// ----------------------------------------------------------------------------
// 靶子（01-verified-facts.md §2.3）：607 条裸 transition 对几十条显式时长，约 90%
// 的动效跑在 Tailwind 默认的同一档上。token 落地之后，「同层同档、跨层差一档」
// 才有地方被机检——这份文件就是那个地方。
//
// 锁七件事，每一件都写明「把它改回去会红在哪一条」：
//   1. THEME:GENERATED 区含 motion.ts 的每一条 token，值逐字相等；且阶梯的**形状**
//      （六档时长 / 五条曲线 / 三档位移 / 错峰两条）照规范锁死——只遍历导出数组会
//      让「删掉一条 token」静默变绿，形状断言就是补这个洞的；
//   2. --leo-ease-emphasis 逐字等于既有品牌曲线（W01.md P2 硬约束，改值不在本波范围）；
//   3. reduced-motion 区把六档时长 + 错峰两条 + 位移三条全部归零；
//   4. 同区载荷指示器四条**不归零**，且确实放慢、幅度确实减半；
//   5. --leo-ease-spring 有 @supports + var(--leo-ease-emphasis) 降级，且 linear()
//      的内容等于**现场重跑** springLinearStops() 的结果（这条同时证明它是生成的、
//      不是手写的——W01.md P2 明写「不许手写这串数字」）；
//   6. 品牌曲线字面量在 globals.css 里只出现 1 次（Done when「只剩一种写法」的机检形式）；
//   7. 生成区**外**（手写段）没有裸曲线、没有非零裸时长（红线 9）。
//
// 关于 6 的口径：01-verified-facts.md §2.3 把「同一条曲线两种写法」称为漂移签名。
// W01 重核订正过这条——源码里只有一种写法，短写法是 src/theme/ui.css 的 minifier
// 产物（signals/W01-journal.md 第 1 条）。所以判据落在源码计数上，不看编译产物。
// ============================================================================
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BRAND_EMPHASIS_CURVE,
  LOADING_INDICATOR_TOKENS,
  MOTION_AMPLITUDE_TOKENS,
  MOTION_DURATION_TOKENS,
  MOTION_EASING_TOKENS,
  MOTION_LOOP_TOKENS,
  MOTION_MOVE_TOKENS,
  MOTION_STAGGER_TOKENS,
  REDUCED_MOTION_LOOP,
  REDUCED_MOTION_ZEROED,
  SPRING_SOURCE,
  springLinearStops,
} from "../src/theme/motion.ts";

const CSS_PATH = fileURLToPath(new URL("../src/theme/globals.css", import.meta.url));
const START_MARKER = "/* THEME:GENERATED:START";
const END_MARKER = "/* THEME:GENERATED:END */";

const css = readFileSync(CSS_PATH, "utf8");
const startAt = css.indexOf(START_MARKER);
const endAt = css.indexOf(END_MARKER);

// 标记区找不到就没有任何后续断言是有意义的——先把这个前提本身判掉，
// 否则下面每一条都会在一个空字符串上「通过」。
assert.ok(startAt >= 0, `globals.css 里找不到 ${START_MARKER}`);
assert.ok(endAt > startAt, `globals.css 里找不到 ${END_MARKER}，或它排在 START 之前`);

const generated = css.slice(startAt, endAt);
const handWritten = css.slice(0, startAt) + css.slice(endAt + END_MARKER.length);

/** 取 `needle` 之后第一个平衡括号块（含 needle 本身）。 */
function blockAt(source, needle) {
  const head = source.indexOf(needle);
  if (head < 0) return null;
  const open = source.indexOf("{", head);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(head, i + 1);
    }
  }
  return null;
}

const reducedBlock = blockAt(generated, "@media (prefers-reduced-motion: reduce)");
assert.ok(reducedBlock, "生成区里没有 @media (prefers-reduced-motion: reduce) 块");

// 基准区 = 生成区减去 reduced-motion 块。不减掉的话，归零值会盖住基准值，
// 断言 1 会拿 0ms 去比 90ms。
const baseRegion = generated.replace(reducedBlock, "");

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 收集自定义属性声明。同名多次出现时保留最后一条（CSS 层叠语义）。 */
function customProperties(source) {
  const found = new Map();
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  for (const match of stripComments(source).matchAll(pattern)) {
    found.set(match[1], match[2].trim());
  }
  return found;
}

const baseProperties = customProperties(baseRegion);
const reducedProperties = customProperties(reducedBlock);

/** 动效命名空间。`--leo-d-*`（配色）与站点语义变量不在其内。 */
const MOTION_NAMESPACE = /^--leo-(?:dur-|ease-|move-|stagger|loop-|bounce-|pulse-)/;

const LADDER_TOKENS = [
  ...MOTION_DURATION_TOKENS,
  ...MOTION_EASING_TOKENS,
  ...MOTION_MOVE_TOKENS,
  ...MOTION_STAGGER_TOKENS,
  ...MOTION_LOOP_TOKENS,
  ...MOTION_AMPLITUDE_TOKENS,
];

function timeToSeconds(name, raw) {
  const match = /^(\d*\.?\d+)(ms|s)$/.exec(raw);
  assert.ok(match, `${name} 的值 ${raw} 不是时间字面量`);
  return match[2] === "ms" ? Number(match[1]) / 1000 : Number(match[1]);
}

function pxToNumber(name, raw) {
  const match = /^(\d*\.?\d+)px$/.exec(raw);
  assert.ok(match, `${name} 的值 ${raw} 不是 px 字面量`);
  return Number(match[1]);
}

test("生成区逐字含 motion.ts 的每一条 token，且阶梯形状照规范", () => {
  // 形状先判。只遍历导出数组的话，「从 motion.ts 删掉 --leo-dur-3」会让循环少跑
  // 一圈然后通过——反面验证 ① 就假了。形状取自 motion-system.md §规范一 本身
  // （六档 / 五条 / 三档 / 两条），不是抄一份值清单。
  assert.deepEqual(
    MOTION_DURATION_TOKENS.map((token) => token.name),
    ["--leo-dur-1", "--leo-dur-2", "--leo-dur-3", "--leo-dur-4", "--leo-dur-5", "--leo-dur-6"],
    "规范是六档时长阶梯，名字必须是 --leo-dur-1..6",
  );
  assert.deepEqual(
    MOTION_EASING_TOKENS.map((token) => token.name),
    ["--leo-ease-standard", "--leo-ease-decelerate", "--leo-ease-accelerate", "--leo-ease-emphasis"],
    "规范是五条曲线：这四条 + 走 @supports 的 --leo-ease-spring",
  );
  assert.deepEqual(
    MOTION_MOVE_TOKENS.map((token) => token.name),
    ["--leo-move-xs", "--leo-move-sm", "--leo-move-md"],
    "规范是三档位移",
  );
  assert.deepEqual(
    MOTION_STAGGER_TOKENS.map((token) => token.name),
    ["--leo-stagger", "--leo-stagger-max"],
    "规范是错峰两条",
  );

  for (const token of LADDER_TOKENS) {
    assert.ok(
      MOTION_NAMESPACE.test(token.name),
      `${token.name} 不在 --leo- 动效命名空间里（红线 8：不许新增第四套前缀）`,
    );
    assert.equal(
      baseProperties.get(token.name),
      token.value,
      `${token.name} 在 THEME:GENERATED 区里的值与 motion.ts 不一致；` +
        `token 手改 globals.css 无效，改 motion.ts 后跑 npm run build:themes`,
    );
  }

  // 反向：生成区里不许有 motion.ts 之外的动效变量。手改生成区会被下一次
  // build:themes 抹掉，留着只会让人以为它生效了。
  const declared = new Set(LADDER_TOKENS.map((token) => token.name));
  declared.add("--leo-ease-spring"); // 由 @supports 两段落，不在 LADDER_TOKENS 里
  const orphans = [...baseProperties.keys()].filter(
    (name) => MOTION_NAMESPACE.test(name) && !declared.has(name),
  );
  assert.deepEqual(orphans, [], "生成区出现了 motion.ts 没有导出的动效变量");
});

test("--leo-ease-emphasis 逐字等于既有品牌曲线", () => {
  // 这一处**故意**把字面量抄在测试里：W01.md P2 的硬约束就是「逐字等于」，
  // 判据与数据源各持一份才能在改值时对撞。改品牌曲线不在本波范围。
  assert.equal(BRAND_EMPHASIS_CURVE, "cubic-bezier(0.21, 1.02, 0.73, 1)");
  assert.equal(baseProperties.get("--leo-ease-emphasis"), "cubic-bezier(0.21, 1.02, 0.73, 1)");
});

test("reduced-motion 把六档时长、错峰两条、位移三条全部归零", () => {
  const zeroed = new Set(REDUCED_MOTION_ZEROED.map((token) => token.name));
  const mustBeZero = [...MOTION_DURATION_TOKENS, ...MOTION_STAGGER_TOKENS, ...MOTION_MOVE_TOKENS];

  for (const token of mustBeZero) {
    assert.ok(zeroed.has(token.name), `${token.name} 没有进 REDUCED_MOTION_ZEROED`);
  }

  for (const token of REDUCED_MOTION_ZEROED) {
    assert.match(token.value, /^0(ms|px)$/, `${token.name} 的降级值 ${token.value} 不是零`);
    assert.equal(
      reducedProperties.get(token.name),
      token.value,
      `${token.name} 在 reduced-motion 区里没有归零`,
    );
  }
});

test("reduced-motion 下载荷指示器四条不归零：放慢一倍、幅度减半", () => {
  // motion-system.md 点名的例外。它们表达「系统还在做事」，归零会让用户以为
  // 界面卡死——那不是无障碍，那是故障。
  assert.deepEqual(
    [...LOADING_INDICATOR_TOKENS],
    ["--leo-loop-spin", "--leo-loop-shimmer", "--leo-loop-bounce-dot", "--leo-loop-pulse-dot"],
    "载荷指示器就是规范点名的这四条",
  );

  const zeroed = new Set(REDUCED_MOTION_ZEROED.map((token) => token.name));
  const degraded = new Map(REDUCED_MOTION_LOOP.map((token) => [token.name, token.value]));

  for (const name of LOADING_INDICATOR_TOKENS) {
    assert.ok(!zeroed.has(name), `${name} 是载荷指示器，不许进归零表`);

    const before = timeToSeconds(name, baseProperties.get(name));
    const after = timeToSeconds(name, reducedProperties.get(name));
    assert.ok(after > 0, `${name} 在 reduced-motion 下被停掉了（值 ${after}s）`);
    assert.ok(
      after > before,
      `${name} 在 reduced-motion 下应当变慢，实测 ${before}s → ${after}s`,
    );
    assert.equal(degraded.get(name), reducedProperties.get(name), `${name} 的降级值与 CSS 不一致`);
  }

  // 幅度减半。转圈不在此列——它没有几何幅度，「降幅」对它等于停转。
  for (const token of MOTION_AMPLITUDE_TOKENS) {
    const before = pxToNumber(token.name, baseProperties.get(token.name));
    const after = pxToNumber(token.name, reducedProperties.get(token.name));
    assert.ok(after > 0, `${token.name} 在 reduced-motion 下被归零了，幅度归零等于停掉动画`);
    assert.ok(after < before, `${token.name} 的幅度应当变小，实测 ${before}px → ${after}px`);
  }
});

test("--leo-ease-spring 是生成的：@supports 降级 + linear() 可现场复算", () => {
  // 降级值只能在基准 :root 里看。整个基准区的声明表是「后者胜出」的层叠语义，
  // 拿它去查会取到 @supports 里的 linear(…)，那正是要与之区分的另一段。
  const baseRoot = blockAt(baseRegion, ":root");
  assert.ok(baseRoot, "生成区里没有基准 :root 块");
  assert.equal(
    customProperties(baseRoot).get("--leo-ease-spring"),
    "var(--leo-ease-emphasis)",
    "不支持 linear() 时要降级到品牌曲线；且按仲裁 A-2 不写 fallback 原始值",
  );

  // 用完整条件串定位，不要只找 "@supports"：生成区上方的注释里就提到了它
  // （「第五条 --leo-ease-spring 见下方 @supports」），只找前缀会切在注释上。
  const SUPPORTS_RULE = "@supports (animation-timing-function: linear(0, 1))";
  const supportsBlock = blockAt(baseRegion, SUPPORTS_RULE);
  assert.ok(supportsBlock, `缺 ${SUPPORTS_RULE} 特性查询`);

  const declaration = /--leo-ease-spring:\s*linear\(([^;]*)\);/.exec(supportsBlock);
  assert.ok(declaration, "@supports 块里没有 --leo-ease-spring: linear(…)");

  // 这一条同时证明两件事：数字是算出来的（不是手写的），以及改参数会连带改结果。
  assert.equal(
    declaration[1],
    springLinearStops(),
    "linear() 的内容与现场重跑 springLinearStops() 不一致；" +
      "改了 SPRING_SOURCE 就要跑 npm run build:themes 重算",
  );

  // 空产物同样能让上面那条通过，所以另判一次「它确实是一串 stop」。
  assert.ok(
    declaration[1].split(",").length >= 10,
    `linear() 只有 ${declaration[1].split(",").length} 个 stop，不像是采样简化的产物`,
  );

  // 参数原样留档供后人复算（W01.md P2）。注释丢了就等于这串数字重新变成手写的。
  const provenance = generated.slice(0, generated.indexOf(SUPPORTS_RULE));
  for (const [key, value] of [
    ["stiffness", SPRING_SOURCE.stiffness],
    ["damping", SPRING_SOURCE.damping],
    ["mass", SPRING_SOURCE.mass],
    ["velocity", SPRING_SOURCE.velocity],
  ]) {
    assert.ok(
      provenance.includes(`${key}: ${value}`),
      `CSS 注释里缺生成参数 ${key}: ${value}，后人无法复算`,
    );
  }
});

test("globals.css 引用的每一条动效 token 都有定义，没有悬空 var()", () => {
  // 建闸时实测出来的洞：从 motion.ts 删掉 --leo-dur-3 之后，手写段的
  // `.v-scale-in { animation: v-scale-in var(--leo-dur-3) … }` 仍然指着它。
  // CSS 对未定义变量是静默的——动画会在 31 个站上无声失效，没有任何报错。
  // 上面的阶梯形状断言只护得住六档时长；这一条从消费侧兜住全部动效 token。
  const defined = new Set([...baseProperties.keys()].filter((name) => MOTION_NAMESPACE.test(name)));
  defined.add("--leo-ease-spring");

  const referenced = new Set();
  for (const match of stripComments(css).matchAll(/var\(\s*(--leo-[a-z0-9-]+)/gi)) {
    if (MOTION_NAMESPACE.test(match[1])) referenced.add(match[1]);
  }

  assert.ok(referenced.size > 0, "一处 var(--leo-…) 都没找到，正则或取值范围可疑");
  assert.deepEqual(
    [...referenced].filter((name) => !defined.has(name)).sort(),
    [],
    "这些动效变量被引用了却没有定义；CSS 对未定义变量静默失效，31 个站上不会报错",
  );
});

test("品牌曲线在 globals.css 里只剩一种写法（源码计数 = 1）", () => {
  const literal = BRAND_EMPHASIS_CURVE.replace(/[.()]/g, (char) => `\\${char}`);
  const occurrences = css.match(new RegExp(literal, "g")) ?? [];
  assert.equal(
    occurrences.length,
    1,
    `品牌曲线应当只在 token 定义处出现 1 次，实测 ${occurrences.length} 次；` +
      "多出来的那几处要改成 var(--leo-ease-emphasis)",
  );
});

test("手写段没有裸曲线、没有非零裸时长（红线 9）", () => {
  const source = stripComments(handWritten);

  assert.equal(
    (source.match(/cubic-bezier/g) ?? []).length,
    0,
    "手写段出现了裸 cubic-bezier，应当改用 --leo-ease-* token",
  );

  // 注释里提到曲线是允许的（globals.css:701 就记着第六条曲线归并到哪儿去了），
  // 所以上面先 stripComments 再判——别误伤那条留档。
  const timed = /(?<![\w-])(?:animation|transition)(?:-duration|-delay)?\s*:\s*([^;{}]+)/gi;
  const offenders = [];
  for (const match of source.matchAll(timed)) {
    for (const literal of match[1].matchAll(/(?<![\w.#-])(\d*\.?\d+)(ms|s)(?![\w-])/g)) {
      // 零是允许的：`animation-delay: 0ms` 里的零不表达档位，换成 token 反而
      // 会让「不延迟」依赖一个可被改动的变量。
      if (Number(literal[1]) !== 0) offenders.push(match[0].trim());
    }
  }
  assert.deepEqual(offenders, [], "手写段出现了非零裸时长，应当改用 --leo-dur-* / --leo-loop-* token");
});
