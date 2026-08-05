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
//   · 探针只认「动态库加载失败」这一种形态。浏览器起得来之后再失败的，是真失败，
//     一条都不会被 skip 掉。
// ============================================================================

import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const RUNBOOK = "docs/runbooks/oceanleo-ui-browser-tests.md";

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
