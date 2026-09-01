// ============================================================================
// 浏览器探针本身的诚实性 —— 它必须只在「浏览器压根起不来」时 skip
// ----------------------------------------------------------------------------
// 为什么要有这一份（`W47`，2026-09-01）
//
// `tests/chromium-availability.mjs` 决定另外两份真起浏览器的判据
// （`chart-editor-browser-export` / `model3d-three-roundtrip`）这一次跑不跑。
// 探针一旦松掉，那两份就**永远 skip**：账面上不红，实际上图表导出与 3D 往返
// 从此没有守卫。这正是本波最贵的那一课的另一张脸——闸看不见自己被关掉了。
//
// 所以这份判据双向钉住探针：
//
//   · 浏览器**不在**（二进制不在盘上 / 缺动态库）⇒ 必须 skip，
//     而且理由里要有**可以照着敲的那一行**（该 export 什么）；
//   · 浏览器**在位且起得来** ⇒ 必须放行，`chromiumSkip()` 给 `false`，
//     那两份测试照常跑、照常能红。
//
// 第二个方向不是读源码猜的：这里在临时目录里造一个**假的、真能执行的**
// chromium 二进制，放到 `executablePath()` 算出来的那个位置上，
// 让探针在子进程里重新跑一遍。假二进制起得来 ⇒ 探针必须放行。
// ⇒ 「不许无条件 skip」这条红线因此有了机检形状，不再只靠人读代码。
//
// 环境事实（`[W47 实测]`，干净检出 `f4996ba`）：
//   · 不设 `PLAYWRIGHT_BROWSERS_PATH` ⇒ 二进制在
//     `/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`，
//     起不来，缺 `libglib-2.0.so.0` ⇒ 探针判不可用（老探针也认得这一种）。
//   · 把它指向一个不存在的目录 ⇒ 老探针给 `{available:true}`，两份测试报**真红**
//     （`W36` 撞到的就是这一种，被两位同事记成了缺陷）。
// ============================================================================

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { CHROMIUM, chromiumSkip } from "./chromium-availability.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/**
 * 在**子进程**里按给定环境重新加载一次探针，把它的判决读回来。
 *
 * 必须开子进程：探针在模块顶层就跑完了（`export const CHROMIUM = probeChromium()`），
 * 同一个进程里改环境变量再 import 拿到的是缓存。
 *
 * `NODE_TEST_CONTEXT` 显式清掉（`_COMMON.md §7b⑭`）：子进程里跑的不是 node:test，
 * 但继承这个变量会让 node 换一套输出口径，读回来的 JSON 就不干净了。
 */
function probeUnder(env) {
  const child = { ...process.env, ...env };
  delete child.NODE_TEST_CONTEXT;
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      'const m = await import("./tests/chromium-availability.mjs");' +
        "process.stdout.write(JSON.stringify(m.CHROMIUM));",
    ],
    {
      cwd: REPO,
      encoding: "utf8",
      env: child,
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(output);
}

test("探针与 skip 开关是同一个事实的两面（没有第二条判定路径）", () => {
  // 「无条件 skip」最省事的写法就是让 `chromiumSkip()` 不再看探针。
  // 这一条钉住两者的对应关系：可用 ⇒ `false`（放行）；不可用 ⇒ 一段非空理由。
  assert.equal(typeof CHROMIUM.available, "boolean");
  if (CHROMIUM.available) {
    assert.equal(
      chromiumSkip(),
      false,
      "浏览器可用，chromiumSkip() 却仍在返回一个 skip 理由 —— 闸被关掉了",
    );
  } else {
    assert.equal(typeof chromiumSkip(), "string");
    assert.ok(
      chromiumSkip().length > 0,
      "判成不可用却给了一段空理由，全量上只会看到一条没有来由的 skip",
    );
  }
});

test("浏览器不在盘上：判不可用，且理由里有可以照着敲的那一行", () => {
  // `W36` 撞到的那一种。老探针在这里给 `{available:true}`，两份测试报真红。
  const bogus = mkdtempSync(resolve(tmpdir(), "W47-no-browsers-"));
  try {
    const verdict = probeUnder({ PLAYWRIGHT_BROWSERS_PATH: bogus });
    assert.equal(
      verdict.available,
      false,
      "浏览器二进制不在盘上，探针却放行了 —— 那两份测试会报一条环境假红，" +
        "而下一个人要重新查一遍它为什么红（本波已经查过两遍）",
    );
    assert.match(
      verdict.skipReason,
      /PLAYWRIGHT_BROWSERS_PATH=\/root\/\.cache\/ms-playwright/,
      "skip 理由里没有那一行可以照着敲的 export —— 提示不可操作等于没有提示",
    );
    assert.match(
      verdict.skipReason,
      /不在盘上|不存在/,
      "skip 理由没说清缺的是什么（是缺库还是二进制没装？处置完全不同）",
    );
  } finally {
    rmSync(bogus, { recursive: true, force: true });
  }
});

test("浏览器在位且起得来：探针必须放行（这不是无条件 skip）", () => {
  // 造一个假的、**真能执行**的 chromium，放到 `executablePath()` 算出来的位置上。
  // 探针只问「起不起得来」，所以假二进制足够走完它那条路径。
  const home = mkdtempSync(resolve(tmpdir(), "W47-fake-browsers-"));
  try {
    const expected = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'const { chromium } = await import("playwright-core");' +
          "process.stdout.write(chromium.executablePath());",
      ],
      {
        cwd: REPO,
        encoding: "utf8",
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: home },
        timeout: 120_000,
      },
    ).trim();
    assert.ok(
      expected.startsWith(home),
      `PLAYWRIGHT_BROWSERS_PATH 没有决定二进制位置（算出来的是 ${expected}）——` +
        "playwright-core 换了取法，这一条要跟着重写",
    );

    mkdirSync(dirname(expected), { recursive: true });
    writeFileSync(expected, "#!/bin/sh\necho 'Chromium 999.0.0.0'\n", "utf8");
    chmodSync(expected, 0o755);

    const verdict = probeUnder({ PLAYWRIGHT_BROWSERS_PATH: home });
    assert.deepEqual(
      { available: verdict.available, skipReason: verdict.skipReason },
      { available: true, skipReason: "" },
      "浏览器起得来，探针却判不可用 —— 那两份判据被永久关掉了，" +
        "而账面上只是两条 skip，没人会发现",
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("起得来之后再失败的，是真失败，探针一条都不许吞", () => {
  // 探针唯一的活是回答「浏览器压根起不来吗」。二进制在、也能执行，
  // 但 `--version` 返回非零（真正坏掉的浏览器）时它**不许**把这一形态也 skip 掉——
  // 那就变成「浏览器坏了 ⇒ 判据自动闭嘴」，比没有判据更危险。
  const home = mkdtempSync(resolve(tmpdir(), "W47-broken-browser-"));
  try {
    const expected = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'const { chromium } = await import("playwright-core");' +
          "process.stdout.write(chromium.executablePath());",
      ],
      {
        cwd: REPO,
        encoding: "utf8",
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: home },
        timeout: 120_000,
      },
    ).trim();
    mkdirSync(dirname(expected), { recursive: true });
    // 非零退出，且 stderr 里**没有**动态库那句话。
    writeFileSync(
      expected,
      "#!/bin/sh\necho 'chromium: something else went wrong' >&2\nexit 3\n",
      "utf8",
    );
    chmodSync(expected, 0o755);

    const verdict = probeUnder({ PLAYWRIGHT_BROWSERS_PATH: home });
    assert.equal(
      verdict.available,
      true,
      "浏览器在盘上、能执行，只是自己出错，探针却把这一形态也 skip 掉了 —— " +
        "那两份判据从此在「浏览器坏了」的时候自动闭嘴",
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("本机此刻的判决如实记一笔（读数会变，判据不写死它）", () => {
  // 不断言「本机一定不可用」：库补上之后那样写会立刻假红。
  // 只断言两件事对得上，并把当前读数打出来，全量日志里就有一份现场快照。
  const executable = (() => {
    try {
      return chromium.executablePath();
    } catch {
      return "<playwright-core 报不出路径>";
    }
  })();
  console.log(
    `[W47] 本机 chromium 判决：available=${CHROMIUM.available}` +
      ` executable=${executable}` +
      (CHROMIUM.available ? "" : `\n  理由：${CHROMIUM.skipReason}`),
  );
  assert.equal(CHROMIUM.available, chromiumSkip() === false);
});
