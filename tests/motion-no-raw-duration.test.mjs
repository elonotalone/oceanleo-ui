// ============================================================================
// 存量裸时长预算锁 —— 棘轮（W01 P5 / 红线 9「只减不增」）
// ----------------------------------------------------------------------------
// 这道闸不负责改存量：那 47 处分散在十几位 owner 的独占面上。它只负责一件事——
// **让新增当场红**。
//
// 棘轮由两条断言组成，缺一条闸门就是假的：
//   A. 实测计数 <= PENDING_RAW_DURATION —— 挡新增。
//   B. PENDING_RAW_DURATION <= 47      —— 挡「把预算锁的数字调大一位」。
//      47 是 2026-08-31 实测冻结的高水位线，**写死在这里**。没有 B，任何人只要把
//      motion.ts 里的数字改大，A 就永远绿——那样反面验证 ③ 是假的。
//
// 为什么不做成精确相等：16 位 owner 同仓并发，别人降债（W04 正在把一批按钮迁到
// 原语）会让精确相等无端变红，撞 _COMMON.md §8「不许在别人半成品的工作树上给别人
// 下判决」。允许留松弛，闸门只管新增。债还完之后由后来人把 47 往下调。
//
// 计数口径（与 src/theme/motion.ts 的注释是同一套，改一边必须改另一边）：
//   正则：\bduration-\[?[0-9]   覆盖 `duration-150` 与任意值 `duration-[240ms]`
//   范围：src/ 全部，排除三个**非调用点**的文件——
//         · src/theme/ui.css      tailwind --minify 的编译产物，里面是
//                                 .duration-150{} 这类工具类**定义**
//         · src/theme/globals.css token 落地处自己
//         · src/theme/motion.ts   token 数据源自己
//   最后一条是建闸时实测出来的：闸门原本会把**自己的说明文字**算进预算。
//   P5 给 PENDING_RAW_DURATION 写口径注释，里面举了 `duration-150` /
//   `duration-[240ms]` / `duration-200` 三个例子，计数当场从 47 涨到 50。
//   把定义处排除掉是与另外两个文件同一条理由，不是为了让判据变绿：排除后实测
//   46，比原基线还低一处；红线 9 管的是调用点，token 源码里根本不出 className。
//   2026-08-31 实测：46 处 / 20 个文件；src/ 内联 transition: …ms（非 CSS）0 处。
//
// _COMMON.md §7b③：计数类断言必须先验正则本身，工具错误在本波已经出现三次。
// 下面第一条 test 就是那次验证，它跑在合成样本上，不依赖任何人的在途文件。
// ============================================================================
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PENDING_RAW_DURATION } from "../src/theme/motion.ts";

/** 2026-08-31 冻结的高水位线。**只许往下调。** */
const FROZEN_HIGH_WATER_MARK = 46;

const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const EXCLUDED = new Set(["theme/ui.css", "theme/globals.css", "theme/motion.ts"]);

function rawDurationPattern() {
  return /\bduration-\[?[0-9]/g;
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const scanned = walk(SRC_ROOT)
  .map((absolute) => path.relative(SRC_ROOT, absolute).split(path.sep).join("/"))
  .filter((relative) => !EXCLUDED.has(relative))
  .sort();

// 一次读盘同时喂两道闸（时长与曲线）。src/ 是 627 个文件，读两遍纯属浪费——
// _COMMON.md §7 的 IO 纪律对测试同样成立。
const perFile = new Map();
const rawCurveFiles = [];
let total = 0;
for (const relative of scanned) {
  const source = readFileSync(path.join(SRC_ROOT, relative), "utf8");
  const matches = source.match(rawDurationPattern());
  if (matches?.length) {
    perFile.set(relative, matches.length);
    total += matches.length;
  }
  if (!relative.startsWith("theme/") && source.includes("cubic-bezier")) rawCurveFiles.push(relative);
}

test("正对照：计数用的正则本身是对的", () => {
  // 合成样本，不依赖任何人的在途文件——正对照本身不该是别人改一行就变红的东西。
  const sample = [
    'className="transition duration-150 ease-out"', // 命中
    'className="duration-[240ms]"', // 命中：任意值
    "const duration = 150;", // 不命中：没有 `duration-`
    'className="duration-none"', // 不命中：后面不是数字
    'className="fadeduration-150"', // 不命中：\b 挡住词中匹配
  ].join("\n");

  assert.equal(sample.match(rawDurationPattern())?.length, 2, "正则匹配到的不是预期的那两处");
});

test("正对照：扫描确实走到了 src/，不是在空集合上通过", () => {
  // 计数为 0 有两种成因：债还完了，或者路径写错 / 遍历坏了。后者会让预算锁
  // 静默失效——本波已经栽过三次工具错误当事实的跟头，这里把它判掉。
  assert.ok(
    scanned.length >= 400,
    `只扫到 ${scanned.length} 个文件，src/ 的规模应当在 600 上下；遍历大概率坏了`,
  );
  assert.ok(
    scanned.includes("shell/AppShell.tsx"),
    "扫描结果里没有 shell/AppShell.tsx，路径解析可疑",
  );
  for (const excluded of EXCLUDED) {
    assert.ok(!scanned.includes(excluded), `${excluded} 是非调用点，应当被排除`);
  }
});

test("断言 A：裸时长只减不增", () => {
  const worst = [...perFile.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([file, count]) => `${file} (${count})`)
    .join(", ");

  assert.ok(
    total <= PENDING_RAW_DURATION,
    `裸时长实测 ${total} 处（${perFile.size} 个文件），超过预算 ${PENDING_RAW_DURATION}。\n` +
      `新写的动效时长要从 --leo-dur-* token 取（红线 9），不许写 duration-200。\n` +
      `命中最多的：${worst}`,
  );
});

test("断言 B：预算锁的数字只许往下调", () => {
  assert.ok(
    PENDING_RAW_DURATION <= FROZEN_HIGH_WATER_MARK,
    `PENDING_RAW_DURATION = ${PENDING_RAW_DURATION}，高于 2026-08-31 冻结的高水位线 ` +
      `${FROZEN_HIGH_WATER_MARK}。把预算调大等于拆掉闸门——要新增动效请改用 token；` +
      "存量债还完之后，把 motion.ts 与这里的高水位线一起往下调。",
  );
});

test("裸曲线不许出现在 src/theme 之外（红线 9 的曲线一侧）", () => {
  // 2026-08-31 实测基线为 0：cubic-bezier 只出现在 src/theme/（motion.ts 的
  // token 值、globals.css 的生成区、ui.css 的编译产物），组件里一处都没有。
  // 与时长同样是棘轮，只是基线恰好是零。仲裁 A-2 已给出正确写法：
  // var(--leo-ease-standard)，且不写 fallback 原始值。
  assert.deepEqual(
    rawCurveFiles,
    [],
    "这些文件里写了裸曲线，应当改用 --leo-ease-* token（值见 src/theme/motion.ts）",
  );
});
