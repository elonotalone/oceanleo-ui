// 「整份文件没跑起来」这一形态必须自报家门 —— `_COMMON.md §7b⑩` 的看门人。
// ----------------------------------------------------------------------------
// 这条闸守的不是某个产品行为，而是**读数本身的诚实性**。
//
// 一份测试文件在加载期炸掉时，`node --test` 把它记成「1 条失败」，
// 与「有一条断言判红」在计数上逐字相同。本波的代价已经量出来了：
// `W33-request R2` 账面 4 条红，`W34` 逐份跑通后是 19+4+4+8 = **35 条断言，
// 今天在 main 上一条都没执行**，而它们保护的东西完全没有守卫。
// 同一形态在 `W06`／`W12`／`W32` 三次全量里被当成普通红放过。
//
// 喊话的钩子在 `tests/helpers/suite-load-guard.mjs`，经 `--import` 进每个子进程。
// 这份文件负责三件事：
//   1. 钩子确实分得清三种形态（该响的响、**不该响的不响**）；
//   2. 「1 条红」这层伪装确实存在——把它钉成判据，node 哪天改了报法我们会知道；
//   3. 这一趟跑测试的人**带齐了 `package.json` 里的 flag**（`§7b⑫`），
//      否则钩子根本没被 `--import` 进来，上面两条验的都是空气。
//
// 判据素材全在 `tests/fixtures/load-guard/`，故意做坏的四份 + 对照两份。
// 它们叫 `.fixture.mjs` 不叫 `.test.mjs`，所以不会被全量的 `tests/*.test.mjs` 收走。
//
// ⚠️ 给后来改这个文件的人（`_COMMON.md §7b⑧`）：`tests/` 在 Tailwind 自动内容探测的
// 扫描范围里，判据里的正则与占位符会被编成产物里的真规则（`W37` 实测 37 条）。
// 这份文件因此不写正则字面量，也不写方括号占位符。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LOAD_FAILURE_MARKER } from "./helpers/suite-load-guard.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const FIXTURES = "tests/fixtures/load-guard";

/**
 * 跑法从 `package.json` 的 `test` 脚本现读，不在这里抄一份。
 *
 * 抄一份的后果与 `theme-artifact-in-sync` 那条一样：仓里哪天换了 loader，
 * 这条闸还在验旧跑法，于是它验的是自己记着的那串 flag，不是仓库真正在用的那串。
 * 顺带这也让下面 `§7b⑫` 那条判据有了唯一的事实来源。
 */
function harnessTokens() {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  const script = pkg.scripts?.test;
  assert.ok(script, "package.json 里没有 test 脚本——跑法改名了，这条闸得跟着改");
  // 按空格拆，不用正则：`tests/` 在 Tailwind 的扫描范围里（`§7b⑧`）。
  const tokens = script.split(" ").filter(Boolean);
  assert.equal(tokens[0], "node", `test 脚本不是以 node 开头：${script}`);
  // 末尾那个文件通配符换成我们自己的判据素材，其余 flag 原样带上。
  return tokens.slice(1).filter((token) => !token.includes("*"));
}

/** 用仓库真正的跑法跑一份判据素材，把它的完整输出交回来。 */
function runFixture(name) {
  // ⚠️ 必须把 `NODE_TEST_CONTEXT` 摘掉再 spawn（`W34` 实测，又一条假绿通道）：
  // 这份闸自己是跑在 `node --test` 的子进程里的，环境里带着 `NODE_TEST_CONTEXT=child-v8`。
  // 原样继承下去，孙进程会以为自己也是某个 runner 的子进程，**改用 V8 序列化上报、
  // 不再吐 TAP，退出码一律给 0** —— 于是这条闸看到的每一份判据素材都「绿且无输出」，
  // 四条断言会齐刷刷地假绿。摘掉它，孙进程才按独立 runner 走 TAP。
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  const done = spawnSync(process.execPath, [...harnessTokens(), `${FIXTURES}/${name}`], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
    env,
  });
  // 子进程的 stderr 会被 node 转发进父进程的 stdout（当 `#` 注释），
  // 但两边都收着，判据不依赖它落在哪一股里。
  const output = `${done.stdout || ""}\n${done.stderr || ""}`;
  return {
    status: done.status,
    output,
    shouted: output.includes(LOAD_FAILURE_MARKER),
    /** TAP 结尾的计数行，例如 `# tests 3`。取不到给 null。 */
    counter(field) {
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith(`# ${field} `)) continue;
        const value = Number(trimmed.slice(`# ${field} `.length).trim());
        return Number.isFinite(value) ? value : null;
      }
      return null;
    },
  };
}

/** 判据素材里写了多少处用例登记（数源码文本，不推断）。 */
function declaredIn(name) {
  const source = readFileSync(join(REPO, FIXTURES, name), "utf8");
  return source.split("test(").length - 1;
}

// ---------------------------------------------------------------------------

test("§7b⑫ 这一趟跑测试带齐了 package.json 里的 flag", () => {
  // 这条要排在最前面。少了那串 flag，`suite-load-guard` 根本没被 `--import` 进来，
  // 底下两条判据验的全是空气——而它们照样会绿（`W33` 实测的第七种假绿）。
  const running = new Set(process.execArgv);
  // `--test` 只出现在父进程的命令行上，子进程的 execArgv 里没有它，不参与比对。
  // flag 的**取值**也要比（`--import` 指到别处去了同样是没带齐），所以不筛 `--` 开头。
  const missing = harnessTokens().filter(
    (token) => token !== "--test" && !running.has(token),
  );

  assert.deepEqual(
    missing,
    [],
    `这一趟少带了 flag：${missing.join(" ")}\n` +
      `  当前 execArgv：${process.execArgv.join(" ")}\n` +
      "  裸 `node --test <文件>` 会让整段测试静默不注册（`_COMMON.md §7b⑫`）：\n" +
      "  它连一条红都不记，只是少几行绿，例数对不上时先怀疑这个。\n" +
      "  照 package.json 里 test 脚本那串原样带上再跑。",
  );
});

test("该响：三种加载期死法，闸每一种都指名道姓喊出来", () => {
  // 三份判据素材覆盖 `W34` 在 main 上实测到的三种形状：
  // 缺具名导出（`useRouter`、`startOauthSignIn`、`grid-model` 六个名字都是这一形状）、
  // specifier 解析不到（CSS 那条）、顶层就抛。
  for (const name of [
    "missing-named-export.fixture.mjs",
    "unresolvable-specifier.fixture.mjs",
    "throws-at-load.fixture.mjs",
  ]) {
    const run = runFixture(name);
    assert.notEqual(run.status, 0, `${name} 应当是红的，实际退出码 ${run.status}`);
    assert.ok(
      run.shouted,
      `${name} 整份没跑起来，闸却没喊话——这个形态又变回「1 条普通红」了。\n` +
        `完整输出：\n${run.output}`,
    );
    assert.ok(
      run.output.includes(name),
      `闸喊了话，但没说是哪份文件——喊了等于没喊。\n完整输出：\n${run.output}`,
    );
  }
});

test("不该响：真有断言判红的文件，闸一个字都不许喊", () => {
  // `_COMMON.md §7b⑨`：反面验证要验的是「不该响时不响」。
  // 闸要是把普通红也标成「整份没跑起来」，从此没人再信它喊的话，
  // 那比不设这条闸更坏。
  const run = runFixture("assertion-failure.fixture.mjs");
  assert.notEqual(run.status, 0, "这份素材本来就该红");
  assert.equal(
    run.counter("tests"),
    2,
    "这份素材的两条用例都该真的跑起来（一绿一红）",
  );
  assert.equal(run.counter("fail"), 1, "它应当正好红 1 条");
  assert.equal(
    run.shouted,
    false,
    `闸把「一条断言判红」误标成了「整份没跑起来」。\n完整输出：\n${run.output}`,
  );
});

test("不该响：全绿的文件，闸一个字都不许喊", () => {
  const run = runFixture("healthy.fixture.mjs");
  assert.equal(run.status, 0, `对照素材本该全绿，实际退出码 ${run.status}`);
  assert.equal(run.counter("pass"), 2, "两条用例都该绿");
  assert.equal(
    run.shouted,
    false,
    `闸在一份全绿的文件上喊了话。\n完整输出：\n${run.output}`,
  );
});

test("这层伪装确实存在：登记了 3 处用例的文件，账面上只记 1 条红", () => {
  // 把病本身钉成判据。这条不是在验我们的钩子，是在验**node 的报法**——
  // 哪天 node 改成「加载失败单独一类」，这条会红，那时这条闸就可以退休了。
  // 在那之前，它是「为什么要有这条闸」的现场证据。
  const name = "missing-named-export.fixture.mjs";
  const declared = declaredIn(name);
  assert.equal(declared, 3, `判据素材被人改过：它现在登记了 ${declared} 处用例，不是 3 处`);

  const run = runFixture(name);
  assert.equal(
    run.counter("tests"),
    1,
    "node 对加载期就炸的文件不再只记 1 条了——报法变了，这条闸的说辞要跟着更新",
  );
  assert.equal(run.counter("fail"), 1, "同上：报法变了");
  assert.equal(
    run.counter("pass"),
    0,
    "加载期就炸的文件不该有任何绿",
  );
});
