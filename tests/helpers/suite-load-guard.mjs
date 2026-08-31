// 「整份文件没跑起来」必须自报家门 —— `_COMMON.md §7b⑩` 的机检形状。
// ----------------------------------------------------------------------------
// 病在哪（2026-08-31，W32 报出、W33 分类、W34 量清）
//
// 一份测试文件在**加载期**就炸掉时，`node --test` 把它记成「1 条失败」——
// 与「这份文件里有一条断言判红」在计数上**逐字相同**。于是：
//
//   - `rendition-callback-identity.test.mjs` 在 `W06`／`W12`／`W32` 三次全量里
//     都被当成「其它面 1 条红」放过，真相是它三次都一条断言没执行；
//   - `W33-request R2` 报的 4 条红，`W34` 逐份跑通后是
//     19 + 4 + 4 + 8 = **35 条断言，今天在 main 上一条都没执行**。
//
// 账面代价是 4，真实代价是 35，且这 35 条保护的东西**完全没有守卫**。
// 更麻烦的是它会叠层：`W34` 实测，CSS 那条根因修掉之后底下还压着
// `next/navigation` 桩缺 `useRouter` —— node 只报它撞到的第一个，
// **修掉一层不等于跑起来了**。
//
// 这条闸不修任何一个根因，它只干一件事：**让这个形态不再伪装成 1 条红**。
// 下次再有文件加载期就炸，它会在那份文件的输出里指名道姓喊出来。
//
// ----------------------------------------------------------------------------
// 判据形状（`W34` 实测，Node v22.22.2）
//
// `node --test` 给每份测试文件单开一个子进程，`--import` 的模块在子进程里
// 先于测试文件跑（`NODE_TEST_CONTEXT=child-v8`，`process.argv[1]` 就是那份文件）。
// 三种形态在两个进程事件上分得干干净净：
//
//     形态                    退出码    beforeExit
//     加载期就炸（整份没跑）     ≠ 0      **不触发**
//     真有断言判红              ≠ 0        触发
//     全绿                       0         触发
//
// 加载期炸掉时进程是被 ESM 链接错误直接终结的，事件循环从没轮空过，
// 于是 `beforeExit` 不触发而 `exit` 照常触发 —— **这两个事件的差就是判据**。
// 它不碰 `node:test`、不改任何源码、正常跑时一个字节都不输出。
//
// ----------------------------------------------------------------------------
// 另外三条路都试过，都不能用（`W34` 实测，写在这里省得后人再踩）
//
//   1. `diagnostics_channel` 的 `test:*` 频道：在 child-v8 子进程里**一条都不发**
//      （订阅 11 个频道，实测 0 事件）。父进程能收到，但父进程**根本不跑 `--import`**
//      （同样实测：钩子只在两个子进程里出现过），所以那条路是断的。
//   2. 在 `--import` 里 `import { after } from "node:test"` 注册根钩子：加载失败时
//      退出码从 1 顶成 **7**（内部异常处理器自己也炸了），`exit` 处理器再也不触发。
//      在这个位置上动 `node:test` 不安全。
//   3. ⚠️ `module.registerHooks()` 装 `load` 钩子改写入口源码：**整个测试套当场全绿**。
//      实测三份文件——含一份加载期就炸的、一份真有断言红的——**全部报 `ok`，`fail 0`**。
//      这是本仓已知最快的一条假绿通道。**别碰。**
//
// ⚠️ 给后来改这个文件的人（`_COMMON.md §7b⑧`）：Tailwind 的自动内容探测扫仓库根，
// `tests/` 也在扫描范围内。`W37` 实测产物里真有从**判据里的正则**和**文档里的占位符**
// 编出来的规则。所以这份文件里不写正则字面量、不写方括号占位符、不写长得像工具类的词。

import { readFileSync } from "node:fs";

/** 喊话用的机器标记。`tests/suite-load-integrity.test.mjs` 直接 import 它来判，不许两处各抄一份。 */
export const LOAD_FAILURE_MARKER = "OCEANLEO-TEST-FILE-DID-NOT-RUN";

/**
 * 只在「`node --test` 为某份测试文件开的子进程」里挂钩子。
 * 父进程、以及任何别的 `--import` 用法，一律不管。
 */
function testFileUnderRunner() {
  if (!process.env.NODE_TEST_CONTEXT) return null;
  const entry = process.argv[1];
  if (typeof entry !== "string" || !entry.endsWith(".mjs")) return null;
  return entry;
}

/**
 * 名字左边紧挨着的字符会不会把它并成另一个标识符。
 *
 * 用字符集合而不是正则：这份文件在 `tests/` 底下，Tailwind 的自动内容探测会把
 * 判据里的正则编成产物里的真规则（`_COMMON.md §7b⑧`，`W37` 实测到 37 条）。
 */
const IDENTIFIER_CHARS = new Set(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$.",
);

/**
 * 这份文件的源码里写了多少处用例登记。
 *
 * 报的是**源码文本里的事实**（数了多少个 `test(` / `it(` 调用），不是推断出来的
 * 断言数 —— 加载期就炸的文件没有「执行过的用例数」这种东西可报。
 * 数不出来就不报这一句，宁可少说也不许编一个数字出来。
 *
 * 必须同步：它在 `exit` 处理器里被调用，那里排不了任何异步工作。
 */
function declaredRegistrations(file) {
  try {
    const source = readFileSync(file, "utf8");
    let count = 0;
    for (const name of ["test", "it"]) {
      const needle = `${name}(`;
      for (let at = 0; at < source.length; ) {
        const found = source.indexOf(needle, at);
        if (found === -1) break;
        at = found + 1;
        // 前面紧挨着标识符字符的不算（`subtest(`、`await it(` 要区分得开）。
        if (found > 0 && IDENTIFIER_CHARS.has(source[found - 1])) continue;
        count += 1;
      }
    }
    return count;
  } catch {
    return null;
  }
}

const entryFile = testFileUnderRunner();

if (entryFile) {
  // 事件循环轮空过一次 = 这份文件至少走完了加载、`node:test` 的收尾也跑过了。
  let drained = false;
  process.on("beforeExit", () => {
    drained = true;
  });

  process.on("exit", (code) => {
    if (code === 0 || drained) return;

    // 到这里说明：进程非正常收场，且事件循环从没轮空 —— 整份文件没跑完。
    const shown = entryFile.includes("/tests/")
      ? `tests/${entryFile.split("/tests/").pop()}`
      : entryFile;

    // 例数这句是加分项，取不到就不说 —— 不让它挡住必须喊出来的那段话。
    const declared = declaredRegistrations(entryFile);
    const countLine = declared
      ? `这份文件的源码里写着 ${declared} 处 test()/it() 登记，本次执行到的是 0 处。`
      : null;

    // 分隔线不用 `#`：TAP 会把子进程 stderr 当注释转发，行内的 `#` 会被转义成 `\#`。
    const rule = "=".repeat(12);

    const lines = [
      "",
      `${rule} ${LOAD_FAILURE_MARKER} ${shown} ${rule}`,
      "这份文件在跑完之前就整个死掉了，同一份文件里那段报错**不是某一条断言判红**。",
      "账面上它只占「1 条红」，实际是这份文件里的断言**一条都没执行**",
      "—— 它保护的东西现在完全没有守卫（`_COMMON.md §7b⑩`）。",
      ...(countLine ? [countLine] : []),
      "",
      "怎么办：先让它**真的跑起来（出例数）**，再谈它是绿是红。",
      "注意根因会叠层：node 只报它撞到的第一个，修掉一层不等于跑起来了，",
      "必须实测到真的出例数为止（`W34` 在这一份上连撞两层）。",
      `${rule} ${LOAD_FAILURE_MARKER} ${shown} ${rule}`,
      "",
    ];

    process.stderr.write(`${lines.join("\n")}\n`);
  });
}
