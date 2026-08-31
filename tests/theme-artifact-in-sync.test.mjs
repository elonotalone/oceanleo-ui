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
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
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
      const built = spawnSync(recipe, {
        cwd: root,
        shell: true,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 64,
        // npm 跑脚本时会把 node_modules/.bin 塞进 PATH；这里不经 npm，自己补上。
        env: { ...process.env, PATH: `${join(root, "node_modules", ".bin")}:${process.env.PATH}` },
      });
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
