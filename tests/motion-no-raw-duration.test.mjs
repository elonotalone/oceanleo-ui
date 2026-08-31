// ============================================================================
// 存量裸时长预算锁 —— 棘轮（W01 P5 / 红线 9「只减不增」）
// ----------------------------------------------------------------------------
// 这道闸不负责改存量：那 47 处分散在十几位 owner 的独占面上。它只负责一件事——
// **让新增当场红**。
//
// 棘轮由三条断言组成，缺一条闸门就是假的：
//   A. 实测计数 <= PENDING_RAW_DURATION —— 挡新增。
//   B. PENDING_RAW_DURATION <= FROZEN_HIGH_WATER_MARK —— 挡「把预算锁的数字调大一位」。
//      没有 B，任何人只要把 motion.ts 里的数字改大，A 就永远绿——那样反面验证 ③ 是假的。
//   C. 基线自检（本文件末尾，W35 补）—— 高水位线必须与 `BASELINE_COMMIT` 那棵
//      **干净检出**上的实测值逐字相等。没有 C，B 只挡得住「把数字调大」，
//      挡不住「债早还完了、闸却还松着 46 格」——那正是 W35 逮到的现场。
//
// 为什么 A/B 留不等号而 C 要精确相等：16 位 owner 同仓并发，别人降债会让 A 无端变红，
// 撞 _COMMON.md §8「不许在别人半成品的工作树上给别人下判决」，所以 A/B 只管新增。
// 但**松弛必须有人盯着**：C 把「今天的真值」钉在一个可复现的 commit 上，
// 债还完而没人收紧闸的时候，由 C 当场判红。
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
//   2026-08-31 W01 实测：46 处 / 20 个文件；src/ 内联 transition: …ms（非 CSS）0 处。
//   2026-08-31 W35 在干净检出 3550ebc 上重量：**0 处**（W30 把那 46 处全落了档）。
//
// ⚠️ 这三个排除项现在还兜住了 `_COMMON.md §7b⑧` 那个洞（W37 实测）：Tailwind 的自动
//   内容探测把**本文件的注释与正对照样本**编成了产物里的真规则——`src/theme/ui.css`
//   里此刻就躺着 `.duration-150` / `.duration-200` / `.duration-\[240ms\]`，
//   以及由上面那条正则字面量生成的 `.duration-\[0-9\]`。
//   本闸排除了 ui.css，所以**不会**因此假绿；但那四条垃圾规则确实进了 31 个租户的产物。
//   清掉它要动本文件的字面量，而已入库产物与 build:css 有逐字节比对闸（`1db443d`），
//   两者必须同一笔改——跨到 W37 的面上了，已写进 `signals/W35-request.md`。
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
import { measureOnCommittedTree } from "./helpers/clean-tree-baseline.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const EXCLUDED = new Set(["theme/ui.css", "theme/globals.css", "theme/motion.ts"]);

// ---------------------------------------------------------------------------
// 棘轮基线（`_COMMON.md §7b⑪b`：冻数字必须写清取值那一刻的 commit）
//
// ⚠️ `FROZEN_HIGH_WATER_MARK` 与 `BASELINE_COMMIT` 是**一组**，改一个就要改另一个：
// 末尾那条「基线自检」会把 `BASELINE_COMMIT` 的树解出来重量一遍，对不上当场红。
// ---------------------------------------------------------------------------

/**
 * 取高水位线时所在的 commit。**必须是一个真的 commit**，不是「我本机当时的样子」。
 * `3550ebc` = `W35` 接第二棒时的 `main`。
 */
const BASELINE_COMMIT = "3550ebc255dd0b21bd97cff5cbed2f6e6042f9fa";

/**
 * 高水位线。**只许往下调。**
 *
 * `[实测]` W35 2026-08-31 在 `BASELINE_COMMIT` 的**干净检出**上量：**0 处**。
 *
 * W01 P5 建闸时冻的是 46（当时确有 46 处存量），`W30` 把射程内那 46 处全部落了档
 * （`motion-token-adoption` 的 `RAW_DURATION_EXEMPT` 空清单就是那件事的另一面），
 * **但没人回来把这条高水位线往下拧**。于是它在「实测 0 / 上限 46」的状态下停了一整波：
 * 断言 A 与断言 B 都绿，可谁往调用点里塞 46 处 `duration-200` 都照样全绿——
 * 棘轮空转了 46 格。这正是 `_COMMON.md §7b⑪` 那个病的另一种发作方式：
 * 数字本身没错过，**错在债还完了而闸没跟着收紧**。
 *
 * ⇒ 46 → 0。零基线让断言 A 退化成最强的形式：**调用点里一处裸时长都不许有**。
 * 这与 `motion-token-adoption` 的空豁免清单口径完全一致，两道闸不再互相矛盾。
 */
const FROZEN_HIGH_WATER_MARK = 0;

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

/**
 * 扫一棵 `src/` 树。**按 root 参数化**，因为末尾那条基线自检要拿同一套口径去量
 * `BASELINE_COMMIT` 解出来的另一棵树——两处口径分家的话，自检就变成了自说自话。
 *
 * 一次读盘同时喂两道闸（时长与曲线）。src/ 是 700 上下个文件，读两遍纯属浪费——
 * _COMMON.md §7 的 IO 纪律对测试同样成立。
 */
function scanTree(srcRoot) {
  const scanned = walk(srcRoot)
    .map((absolute) => path.relative(srcRoot, absolute).split(path.sep).join("/"))
    .filter((relative) => !EXCLUDED.has(relative))
    .sort();

  const perFile = new Map();
  const rawCurveFiles = [];
  let total = 0;
  for (const relative of scanned) {
    const source = readFileSync(path.join(srcRoot, relative), "utf8");
    const matches = source.match(rawDurationPattern());
    if (matches?.length) {
      perFile.set(relative, matches.length);
      total += matches.length;
    }
    if (!relative.startsWith("theme/") && source.includes("cubic-bezier")) rawCurveFiles.push(relative);
  }
  return { scanned, perFile, rawCurveFiles, total };
}

const { scanned, perFile, rawCurveFiles, total } = scanTree(SRC_ROOT);

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
    `PENDING_RAW_DURATION = ${PENDING_RAW_DURATION}，高于在 ${BASELINE_COMMIT.slice(0, 7)} ` +
      `的干净检出上冻结的高水位线 ${FROZEN_HIGH_WATER_MARK}。` +
      "把预算调大等于拆掉闸门——要新增动效请改用 token（红线 9）。",
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

// ---------------------------------------------------------------------------
// 断言 C · 基线自检：高水位线必须取自**干净检出**（`_COMMON.md §7b⑪`）
// ---------------------------------------------------------------------------

test("基线自检：高水位线与 BASELINE_COMMIT 那棵干净树逐字对得上", () => {
  const probe = measureOnCommittedTree({
    repo: REPO,
    commit: BASELINE_COMMIT,
    pathspecs: ["src"],
    // 扫描面全在本仓 `src/` 之内，解到 /tmp 不会塌（helper 头注释里那条跨仓警告
    // 说的是 `i18n-tt-key-coverage` 那一类，本闸不适用）。
    measure: (root) => {
      const measured = scanTree(path.join(root, "src"));
      return {
        scannedFiles: measured.scanned.length,
        total: measured.total,
        worst: [...measured.perFile].sort((left, right) => right[1] - left[1]).slice(0, 5),
      };
    },
  });
  // 拿不到就判红，不许 skip：`_COMMON.md §7b⑩` 说的就是「没跑起来」被当成绿。
  assert.ok(probe.ok, `基线自检跑不起来 ⇒ 没人在守「基线取自干净检出」这件事。${probe.reason}`);

  // 正对照：先证明我确实扫到了那棵树，而不是在空目录上轻松通过。
  // 零基线的闸尤其需要这一条——空目录上「实测 0」与真值 0 长得一模一样。
  assert.ok(
    probe.value.scannedFiles >= 400,
    `在 ${BASELINE_COMMIT.slice(0, 7)} 的树上只扫到 ${probe.value.scannedFiles} 个文件，` +
      "src/ 的规模应当在 700 上下——解包范围不对，这条自检等于没跑",
  );

  assert.equal(
    probe.value.total,
    FROZEN_HIGH_WATER_MARK,
    `FROZEN_HIGH_WATER_MARK 写的是 ${FROZEN_HIGH_WATER_MARK}，但 ` +
      `${BASELINE_COMMIT.slice(0, 7)} 的**干净检出**上实测 ${probe.value.total} 处` +
      `（${probe.value.worst.map(([f, n]) => `${f}(${n})`).join(", ") || "无"}）。\n` +
      "三种可能：(a) 高水位线是在脏工作树上量的——换一棵干净树重量；\n" +
      "(b) 存量债还完了，闸没跟着收紧——把 motion.ts 的 PENDING_RAW_DURATION 与\n" +
      "    这里的高水位线一起拧到实测值，棘轮才不会空转（W35 逮到的就是这一种：\n" +
      "    实测 0 而上限 46，谁塞 46 处裸时长都全绿）；\n" +
      "(c) 线已经拧下去了但 BASELINE_COMMIT 没跟着换——两个要一起改。",
  );
});
