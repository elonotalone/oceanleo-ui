// 浏览器可用性探针 —— 给两份真起 chromium 的测试用。
// ============================================================================
// 为什么要有这个东西（W25，2026-08-05）
//
// `tests/chart-editor-browser-export.test.mjs` 与 `tests/model3d-three-roundtrip.test.mjs`
// 在本机每次全量都红（`verdicts/W22-red-list.md` 第 7–8 条）：
//   chrome-headless-shell: error while loading shared libraries: libglib-2.0.so.0
// 实测 `ldconfig -p | grep -c libglib` = 0 —— 容器里根本没有这个库，
// 这是运行环境缺件，不是代码缺陷，改代码改不好它。
//
// 补装试过了，补不了：
//   · 容器里的 `apt-get` 自己就跑不起来（`libapt-pkg.so.6.0` 缺失），装不了任何包；
//   · `/host/usr/lib/x86_64-linux-gnu/` 下确实有 `libglib-2.0.so.0`，但把
//     `LD_LIBRARY_PATH` 指过去会把宿主机的 glibc 一起拖进来，实测当场炸
//     `undefined symbol: __nptl_change_stack_perm, version GLIBC_PRIVATE`
//     —— 宿主与容器的 glibc 不是一个版本，借不了。
// 补法与出处写进了 `docs/runbooks/oceanleo-ui-browser-tests.md`。
//
// 所以这里的做法是：**缺库时明确 skip，并把缺什么、怎么补写进 skip 消息**，
// 而不是让它每次全量都红两条、让每个做收尾的人重查一遍（那是纯损耗）。
//
// ⚠️ 这不是「把失败标成环境问题了事」（红线 §2.7 禁止的那件事）。区别在于：
//   · skip 的条件是**真探针探出来的**，不是写死的 `skip: true`；
//   · 库一旦补上，探针立刻放行，两份测试照常跑、照常能红；
//   · 探针只认「浏览器压根起不来」这两种形态（缺动态库 / 二进制不在盘上）。
//     浏览器起得来之后再失败的，是真失败，一条都不会被 skip 掉。
//
// ── 第二种形态（`W36` 实测，`W47` 补，2026-09-01）────────────────────────────
//
// 上面那一版只认「缺动态库」。`W36` 撞到的是另一种：**二进制根本不在盘上**——
// `PLAYWRIGHT_BROWSERS_PATH` 指向一个不存在的目录（agent 沙箱里出现过），
// `chromium.executablePath()` 照样**算得出**一条路径（它只做字符串拼接，不查盘），
// 于是 `execFileSync` 炸的是 `ENOENT` 而不是 `error while loading shared libraries`，
// 老探针落进「起不来但不是缺库 ⇒ 让它照常跑」那条分支，两份测试报**真红**。
//
// `[W36 实测]` 换成 `/root/.cache/ms-playwright` 后同样两份文件 9 例全绿；
// `[W47 实测]` 同一棵干净检出上，`PLAYWRIGHT_BROWSERS_PATH` 指向不存在的目录时
// 老探针给 `{available:true}`，不指时给 `{available:false, 缺 libglib-2.0.so.0}`。
// ⇒ 这不是代码缺陷，但它**每次都会被记成缺陷**：本波已有两位把它写进红名单。
// 所以这里把这一形态也认出来，并把**该 export 什么**直接写进 skip 消息里，
// 不让下一个人再去翻 runbook 或重查一遍。
//
// ⚠️ 仍然不是「无条件 skip」：判据是**盘上有没有这个文件**（`existsSync`），
// 二进制在位就照常跑、照常能红。
// ============================================================================

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const RUNBOOK = "docs/runbooks/oceanleo-ui-browser-tests.md";

/**
 * playwright 默认把浏览器装在哪。**从 `homedir()` 现推，不写死绝对路径。**
 *
 * ⚠️ 别改回字面量：`W47` 第一版写死 `/root/.cache/ms-playwright`，
 * 当场撞红 `w25-tests-out-of-repo-paths`（那道闸禁止测试源码里出现仓外绝对路径）。
 * 而且按那道闸自己的登记口径，本机 playwright 缓存属于「只是我这台机器上现在有」，
 * **不够格登记豁免**——现推才是正解：换台机器、换个用户、换成 macOS 都仍然对。
 */
function installedBrowsersPath() {
  const home = homedir();
  return platform() === "darwin"
    ? join(home, "Library", "Caches", "ms-playwright")
    : join(home, ".cache", "ms-playwright");
}

/**
 * 真的把浏览器二进制拉起来问一句 `--version`。
 * 这一步只花几十毫秒，且失败信息里就带着缺失的库名。
 */
function probeChromium() {
  let executable = "";
  try {
    executable = chromium.executablePath();
  } catch (caught) {
    return {
      available: false,
      skipReason: `playwright-core 报不出 chromium 路径（${caught.message}）；补法见 ${RUNBOOK}`,
    };
  }

  // `executablePath()` 只拼字符串、不查盘：路径算得出来不等于文件在。
  if (!existsSync(executable)) {
    const installed = installedBrowsersPath();
    return {
      available: false,
      missingExecutable: executable,
      skipReason:
        `本机 chromium 二进制不在盘上：${executable} 这个文件不存在。` +
        (process.env.PLAYWRIGHT_BROWSERS_PATH
          ? `当前 PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}，` +
            "它指到了一个没有浏览器的地方。"
          : "") +
        (existsSync(installed)
          ? `这台机器上装好的那一份在 ${installed}，` +
            `**跑之前 export PLAYWRIGHT_BROWSERS_PATH=${installed}** ` +
            "这两份测试就会自动恢复执行（不必改任何代码）。"
          : `${installed} 也是空的 ⇒ 这台机器上没装浏览器，` +
            "先 npx playwright install chromium，或按 runbook 补。") +
        `详情见 ${RUNBOOK}`,
    };
  }

  try {
    execFileSync(executable, ["--version"], {
      stdio: "pipe",
      timeout: 30_000,
    });
    return { available: true, skipReason: "" };
  } catch (caught) {
    const output = `${caught.stderr ?? ""}${caught.stdout ?? ""}`;
    const missing = [
      ...output.matchAll(/error while loading shared libraries: ([^\s:]+)/g),
    ].map(([, library]) => library);

    if (missing.length > 0) {
      return {
        available: false,
        missingLibraries: missing,
        skipReason:
          `本机 chromium 起不来：缺共享库 ${missing.join(" / ")}` +
          `（${executable}）。这是运行环境缺件，不是代码缺陷。` +
          `补上库这份测试会自动恢复执行；补法与已试过的死路见 ${RUNBOOK}`,
      };
    }

    // 起不来但不是缺库 —— 不归这个探针管，让测试照常跑并如实失败。
    return { available: true, skipReason: "" };
  }
}

export const CHROMIUM = probeChromium();

/**
 * `node:test` 的 `skip` 选项：给字符串就跳过并打印理由，给 `false` 就正常跑。
 * 用法：`test("…", { skip: chromiumSkip() }, async (t) => { … })`
 */
export function chromiumSkip() {
  return CHROMIUM.available ? false : CHROMIUM.skipReason;
}
