// 产物必须与它的源码同步 —— 「改了源码没重编」这一形态的第三道防线。
//
// 立这道闸的来由（2026-08-31）：
//   `src/theme/ui.css` 是 `npm run build:css` 的产物，不是手写文件；
//   而视觉闸刻意链产物（`page-template.mjs:27`）。于是「源码改了、产物没重编」
//   会让一整批闸去验十二天前的旧东西，正向跑全绿。
//   本波这个形态**已经复发三次**，每次都靠人发现、靠人补编：
//     1. `W01` 往 globals.css 写了 30 处动效 token，产物停在 08-19
//        ⇒ 六档时长全解析成 0s，`W01` 五条红 + `W04` 两条红同此一根因（父 agent 补编）。
//     2. 同一形态第二次，父 agent 再补编一次。
//     3. `V1` §4 报过、`W33` 量出确切差额（`W33-request.md R7`）：
//        缺 3 条真在用的规则（毛玻璃／投影／半透明卡片底）、多 5 条没人用的死规则
//        ⇒ 那几处观感在 31 个站上根本没生效。本份活（`W37`）补编。
//
// 三次都没有闸响，是因为**没有任何一道闸看得见这件事**：
//   读源码文本的闸只能证明「源码里写了」，读产物的闸只能证明「产物里有」，
//   两边各自为政，**谁也不问这两者是不是同一次构建的产物**。
//   （`04-release-checklist.md`「一条闸的弱点」记的是同一族问题的另一半。）
//
// 判在 `HEAD` 上，不判工作树（`_COMMON.md §7b⑪`／`§7b⑪b`）。理由有两条，都硬：
//   - 16 位 owner 同仓并发，工作树上常年挂着几十份别人的在途改动。照工作树判，
//     这条闸天天红，且红的是别人的半成品——那不是它该管的事。
//   - 发版要回答的问题本来就是「**main 上这棵树自洽吗**」。判 HEAD 正好是这个问题。
//
// ⚠️ 给后来改这个文件的人（`_COMMON.md §7b⑧`）：
//   Tailwind 的自动内容探测扫仓库根，`tests/` 也在扫描范围内，
//   **本文件里只要出现一个长得像工具类的词，它就会被编进产物**。
//   所以这里通篇不写任何真实类名：要报给人看的选择器一律**运行时从差异里打印**，
//   不作为字面量留在文件里。好在这条闸自己会兜住这件事——真写进来了，
//   下面那条「产物与 HEAD 的源码同步」会当场红，并把多出来的选择器指名道姓打出来。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { dirtyAmong, measureOnCommittedTree } from "./helpers/clean-tree-baseline.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** 两份产物：`ui.css` 整份是编译产出；`globals.css` 里有一段生成区被脚本 splice 进去。 */
const ARTIFACTS = ["src/theme/globals.css", "src/theme/ui.css"];

/**
 * 构建配方从 `package.json` 现读，不在这里抄一份。
 *
 * 抄一份的后果是：`build:css` 哪天改了配方，这条闸还在验旧配方，
 * 于是它验的是自己记着的那条命令，不是仓库真正在用的那条——又一个假绿通道。
 */
function buildRecipe() {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  return pkg.scripts?.["build:css"];
}

/** 在 `root` 那棵树上原样跑一次配方。`root` 不是 git 检出，`node_modules` 由调用方软链好。 */
function runBuild(root, recipe) {
  return spawnSync(recipe, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    // npm 跑脚本时会把 node_modules/.bin 塞进 PATH；这里不经 npm，自己补上。
    env: { ...process.env, PATH: `${join(root, "node_modules", ".bin")}:${process.env.PATH}` },
  });
}

/** 把一份压缩过的 CSS 拆成「一条规则一项」，好把差异定位到具体选择器。 */
function ruleChunks(css) {
  return css
    .split("}")
    .map((piece) => `${piece.trim()}}`)
    .filter((piece) => piece.length > 1);
}

/** 只回答「哪些规则少了 / 哪些规则多了」，不判色，判色留给调用方。 */
function ruleDelta(committed, rebuilt) {
  const left = new Set(ruleChunks(committed));
  const right = new Set(ruleChunks(rebuilt));
  const label = (chunk) => chunk.slice(0, chunk.indexOf("{") + 1).slice(0, 120);
  return {
    missing: [...right].filter((chunk) => !left.has(chunk)).map(label),
    dead: [...left].filter((chunk) => !right.has(chunk)).map(label),
  };
}

/**
 * 把 `HEAD` 的树解出来，在那棵树上原样跑一次 `build:css`，回读两份产物。
 *
 * 走 `git archive`（`measureOnCommittedTree`）而不是在工作树里重编：
 * **一个字节都不碰工作树**，并发同事的在途改动既不会污染读数，也不会被这条闸弄坏。
 * 已实测：解出来的树不是 git 检出，Tailwind 的探测结果仍与真检出逐字节一致。
 */
function rebuildOnHead() {
  return measureOnCommittedTree({
    repo: REPO,
    commit: "HEAD",
    // 不限 pathspec：自动内容探测扫的是整棵树，只解一部分出来会编出一份更小的产物，
    // 那样比出来的差异是解包范围造成的，不是真的不同步。
    pathspecs: [],
    measure(root) {
      const read = () =>
        Object.fromEntries(
          ARTIFACTS.map((relative) => {
            const absolute = join(root, relative);
            return [relative, existsSync(absolute) ? readFileSync(absolute, "utf8") : null];
          }),
        );

      // 先读出 HEAD 里**已入库**的那两份产物，再在同一棵树上重编覆盖它们。
      // 两边都取自这棵解出来的树，工作树一个字节都没读——所以并发同事改了什么
      // （包括正在改 ui.css 本身）都不会让这条闸变色。
      const committed = read();
      symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"));
      const recipe = buildRecipe();
      const built = runBuild(root, recipe);
      return {
        recipe,
        status: built.status,
        stderr: (built.stderr || "").trim(),
        committed,
        rebuilt: read(),
      };
    },
  });
}

test("自检：差异比对器分得出「同步」与「不同步」", () => {
  // 「零命中是最贵的一类断言」（`_COMMON.md §6`）。这条闸的正向结论是一句
  // 「没有差异」，而一个坏掉的比对器给出的也正好是这句话。所以先拿一份
  // **已知答案**的输入验比对器本身，再让它去下结论。
  //
  // 这里读工作树上那份产物，只是要一份**够大的真 CSS 当素材**——
  // 它的内容不参与任何判决，判决全在下面那条、全部取自 HEAD 的树。
  const sample = readFileSync(join(REPO, "src/theme/ui.css"), "utf8");
  const chunks = ruleChunks(sample);
  assert.ok(
    chunks.length > 100,
    `产物只拆出 ${chunks.length} 条规则——拆分器坏了，不是「产物很小」`,
  );

  assert.deepEqual(
    ruleDelta(sample, sample),
    { missing: [], dead: [] },
    "同一份输入比出了差异，比对器本身就是坏的",
  );

  // 拿掉一条规则（按下标取，不写死任何类名），比对器必须指名道姓地报出来。
  const victim = chunks[Math.floor(chunks.length / 2)];
  const shortOne = chunks.filter((chunk) => chunk !== victim).join("");
  const delta = ruleDelta(shortOne, sample);
  assert.equal(delta.dead.length, 0, "只拿掉规则，不该比出「多余」");
  assert.equal(
    delta.missing.length,
    1,
    `拿掉一条规则，比对器应当只报 1 条缺失，实际报了 ${delta.missing.length} 条`,
  );
  assert.ok(
    victim.startsWith(delta.missing[0].slice(0, 40)),
    "比对器报出来的选择器与被拿掉的那条对不上，说明它定位错了",
  );
});

// ============================================================================
// 上面这条闸只回答「产物是不是这份源码编出来的」。它答不了另一半：
// **「这份源码」的范围对不对。**（`W44`，2026-09-01）
//
// 2026-08-31 之前，`_ui-input.css` 靠 Tailwind v4 的自动内容探测取范围，
// 而探测扫的是**仓库根**——`tests/`、`docs/`、`scripts/` 全在里面。
// 于是任何一道闸只要在注释、正则或反面样本清单里写下一个像工具类的词，
// 那个词就会被真的编成一条规则进产物；「产物里有没有这条规则」这类判据
// 从此永远绿，它验的是自己写的注释（`_COMMON.md §7b⑧`，`W30` 连撞三次，
// `W37` 量出确切差额：探测开着时多 31 个类名，**没有一个**来自 `src/`）。
//
// `7391d0d` 把入口改成 `source(none)` + 一份只含本包组件源码的白名单，堵掉了这条通道。
// 但**没有任何机器守着它继续关着**：谁把 `source(none)` 删掉、或往白名单里加一条
// `tests/` 路径，通道当场重开，而上面那条同步闸照样全绿（它比的是两次同配方的构建，
// 两边会一起多出那些假规则）。下面这条就是那台机器。
//
// 它不读构建输入的文本——读文本只能证明「今天这么写着」，
// 换个等价写法（改 glob、加第二条 `@source`、换 CLI 参数）就绕过去了。
// 它**用构建本身回答**：拿一个本次运行独有的合成工具类当探针，
// 放进 `src/` 必须编得出来（正对照），放进 `src/` 之外必须编不出来（判决）。
// 正对照不能省——「产物里没有它」也正是探针本身失效时的读数
// （`§7b③`：零命中是最贵的一类断言；`W44` 第一版探针就栽在这上面：
// 类名前面贴着全角标点，Tailwind 切不出候选词，两边都是零命中）。
// ============================================================================

/** 探针文件的名字。只存在于 `git archive` 解出来的临时树里，不会进仓。 */
const PROBE_STEM = "__source-scope-probe";

/**
 * 造一个本次运行独有的工具类。
 *
 * 用合成的度数而不是任何现成类名，为的是两件事：
 *   - 本文件里不留真类名字面量（`§7b⑧`，这条闸自己就是最容易犯的地方）；
 *   - 「产物里没有它」这句话不会因为撞上某个真在用的类而变得没意义。
 */
function scopeProbe(degrees) {
  return { candidate: `rotate-[${degrees}deg]`, declaration: `rotate:${degrees}deg` };
}

/** 在 `src/` 里找一份一定被白名单扫到的组件源码，正对照探针放它旁边。 */
function anyComponentSourceDir(root) {
  const queue = [join(root, "src")];
  while (queue.length) {
    const dir = queue.shift();
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (entries.some((entry) => entry.isFile() && entry.name.endsWith(".tsx"))) return dir;
    for (const entry of entries) if (entry.isDirectory()) queue.push(join(dir, entry.name));
  }
  return null;
}

/**
 * 判决面：`src/` 之外、探测开着时**确实会被扫到**的四类地方。
 *
 * 这四个不是随手挑的，是 `W44` 摊开那 31 个假规则时数出来的真实出处分布：
 * 26 条来自 `tests/`、2 条来自 `scripts/`、1 条来自 `docs/`；根目录一条没有，
 * 但它是「明天新开一个顶层文件就又漏进来」那一类，所以一起钉住。
 */
const OUTSIDE_SRC_PROBES = [
  join("tests", `${PROBE_STEM}.mjs`),
  join("docs", `${PROBE_STEM}.md`),
  join("scripts", `${PROBE_STEM}.mjs`),
  `${PROBE_STEM}.md`,
];

test("自查：构建输入只许扫本包的组件源码——`src/` 之外的注释不许编成规则", () => {
  const recipe = buildRecipe();
  assert.ok(recipe, "package.json 里没有 build:css 脚本——配方改名了，这条闸得跟着改");

  // 每次运行换一批度数。失败时把它们打进报错里，好照着复现。
  const seed = randomInt(100_000, 999_999);

  const probe = measureOnCommittedTree({
    repo: REPO,
    commit: "HEAD",
    pathspecs: [],
    measure(root) {
      symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"));
      const artifact = join(root, "src/theme/ui.css");
      const componentDir = anyComponentSourceDir(root);
      if (!componentDir) return { componentDir: null };

      // ① 正对照：探针放进白名单覆盖的目录，必须编得出来。
      //    这一步验的是探针本身——它是不是个合法工具类、注入的写法切不切得出候选词。
      const control = scopeProbe(seed);
      const controlFile = join(componentDir, `${PROBE_STEM}.tsx`);
      writeFileSync(controlFile, `export const probe = "${control.candidate}";\n`, "utf8");
      const controlBuild = runBuild(root, recipe);
      const controlCss = controlBuild.status === 0 ? readFileSync(artifact, "utf8") : "";
      rmSync(controlFile, { force: true });

      // ② 判决：同一个手法，换到 `src/` 之外的四处，一处都不许编出来。
      const outside = OUTSIDE_SRC_PROBES.map((relativePath, index) => {
        const probeUtility = scopeProbe(seed + 1 + index);
        const file = join(root, relativePath);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `// ${probeUtility.candidate}\n`, "utf8");
        return { relativePath, ...probeUtility };
      });
      const outsideBuild = runBuild(root, recipe);
      const outsideCss = outsideBuild.status === 0 ? readFileSync(artifact, "utf8") : "";

      return {
        componentDir: componentDir.slice(root.length + 1),
        control: {
          ...control,
          status: controlBuild.status,
          stderr: (controlBuild.stderr || "").trim(),
        },
        controlHit: controlCss.includes(control.declaration),
        outsideStatus: outsideBuild.status,
        outsideStderr: (outsideBuild.stderr || "").trim(),
        leaked: outside.filter((one) => outsideCss.includes(one.declaration)),
      };
    },
  });

  // 拿不到读数就判红，不许静默跳过（`_COMMON.md §7b⑩`）。
  assert.ok(probe.ok, `解不出 HEAD 的树，这条自查没能跑起来：${probe.reason}`);
  const seen = probe.value;
  assert.ok(seen.componentDir, "HEAD 的树里一个 .tsx 都找不到——探针没处放，这条自查等于没跑");
  assert.equal(
    seen.control.status,
    0,
    `放了一个探针进 ${seen.componentDir} 就把构建跑挂了：\n${seen.control.stderr}`,
  );
  assert.equal(seen.outsideStatus, 0, `第二次重编失败，这条自查没跑完：\n${seen.outsideStderr}`);

  assert.ok(
    seen.controlHit,
    `探针自检没过：\`${seen.control.candidate}\` 放进 ${seen.componentDir} 重编后，` +
      "产物里找不到它。\n" +
      "⇒ 下面那条「`src/` 之外编不出来」这次什么都没证明——两边都是零命中。\n" +
      "先修探针（是不是白名单的 glob 变了、或这个合成类名 Tailwind 不认），再看判决。\n",
  );

  assert.deepEqual(
    seen.leaked.map((one) => one.relativePath),
    [],
    "构建输入又在扫 `src/` 之外的东西了——那条假绿通道重开了。\n" +
      seen.leaked
        .map((one) => `      ${one.relativePath} 里的 \`${one.candidate}\` 编进了产物`)
        .join("\n") +
      "\n\n这意味着：从现在起，任何一道闸只要在注释、正则或反面样本清单里写下一个\n" +
      "像工具类的词，那个词就会真的变成产物里的一条规则。于是「产物里有没有这条\n" +
      "规则」这类判据会永远绿——它验的是判据自己写的注释，不是组件真用了什么。\n" +
      "（`W30` 在自己的判据文件上连撞三次；`W37` 量出探测开着时产物多 31 个类名，\n" +
      "没有一个来自 `src/`；`7391d0d` 才把它关掉。）\n\n" +
      "修法：`src/theme/_ui-input.css` 的入口必须是 `@import \"tailwindcss\" source(none);`，\n" +
      "`@source` 白名单里只许有本包自己的组件源码路径。**往里加一条测试或文档路径，\n" +
      "就是把这条通道重新打开。**\n" +
      `（本次探针度数从 ${seed} 起，照着改 _ui-input.css 就能手工复现。）\n`,
  );
});

test("产物与 HEAD 的源码同步：在 HEAD 上重跑 build:css，结果必须逐字节一致", () => {
  const probe = rebuildOnHead();
  // 拿不到读数就判红，不许静默跳过（`_COMMON.md §7b⑩`）。
  assert.ok(probe.ok, `解不出 HEAD 的树，这条闸没能跑起来：${probe.reason}`);

  const { recipe, status, stderr } = probe.value;
  assert.ok(recipe, "package.json 里没有 build:css 脚本——配方改名了，这条闸得跟着改");
  assert.equal(status, 0, `在 HEAD 的干净树上跑 \`${recipe}\` 就失败了：\n${stderr}`);

  const hint =
    "\n修法：`npm run build:css`，然后把产物一起提交。\n" +
    "（产物是构建出来的，不许手改——手改的下一次重编就没了。）\n" +
    "这个形态本波已经是第三次；前两次都是人发现、人补编的，所以才有了这条闸。\n";

  for (const relative of ARTIFACTS) {
    const rebuilt = probe.value.rebuilt[relative];
    const committed = probe.value.committed[relative];
    assert.ok(rebuilt !== null, `HEAD 的树上重编后没有 ${relative}——构建没产出它`);
    assert.ok(committed !== null, `${relative} 没有入库——产物必须跟着源码一起进 main`);
    if (committed === rebuilt) continue;

    const { missing, dead } = ruleDelta(committed, rebuilt);
    const dirty = dirtyAmong(REPO, ["src/theme", "src", "scripts"]);
    assert.fail(
      `${relative} 与 HEAD 上的源码不同步。\n` +
        `  少了 ${missing.length} 条真在用的规则：\n${missing.map((s) => `      ${s}`).join("\n")}\n` +
        `  多了 ${dead.length} 条已经没人用的规则：\n${dead.map((s) => `      ${s}`).join("\n")}\n` +
        hint +
        (dirty.length
          ? `\n注：这条闸判的是 HEAD，与你工作树上这 ${dirty.length} 份改动无关。\n`
          : ""),
    );
  }
});
