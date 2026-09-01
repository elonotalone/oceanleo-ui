// 「共享包发版滞后于源码」—— 本波头号形态的第五次，今天没有任何闸看着。
// ----------------------------------------------------------------------------
// 本波贯穿始终的形态是：**源码侧做完了，但把它送到用户手上的最后一步没有执行者。**
// 已经出现八次（barrel 漏两行、`ui.css` 陈旧两次、路由未申报挂载位、共享包停在旧 tag、
// 接线躺在工作树、`GridProject` 盛不下 recalc 戳、图标被引用却未入库）。
// `W28` 为其中两类立了闸，`W44`/`W37` 为产物那类立了闸。**这一类还没有。**
//
// 为什么它比看起来严重：三个插件仓（`design` / `website` / `video`）是按 **git tag**
// 装共享包的 —— `"@oceanleo/ui": "github:elonotalone/oceanleo-ui#v0.215.0"`。
// 所以「main 上有」不等于「下游装得到」。`9550c45` 之后加的四条 `plugin-*` 子路径
// 在 tag 的 tarball 里**一条都没有**，于是三仓的 `plugin-*` import 全部解析不到，
// 那批被裁定「跨仓在途、免责」的 typecheck 红，根子全在这一个 tag 上。
//
// ⚠️ 而且**光打 tag 不够**：树上与 tag 上的 `version` 今天都是 `0.215.0`，
// 版本号不变，下游 `npm install` 根本不会去取新的。发版必须连 `version` 一起 bump。
//
// ── 这道闸判什么 ──────────────────────────────────────────────────────────
//
// 「树上有、最新 tag 上没有」的那批 exports 子路径，必须与下面的登记表**逐条相等**。
// 两个方向都红：
//   · 有人在 tag 之后**新加**一条 exports 又没登记 ⇒ 红。这是第九次复发的入口，
//     也是这道闸真正要拦的东西。
//   · 发版完成、tag 追上之后，登记表变成死条目 ⇒ 红，逼着来清。
//     （`_COMMON.md §7b⑪c` 的棘轮空转，本波已经吃过三次；清单必须配反向断言。）
//
// ⚠️ 这道闸**不判「今天该不该发版」**——发版是操作员触发的决策，不是判据能替人做的。
// 它只保证：欠着的这笔债是**显式**的，而且不会在无人察觉时变大。

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/**
 * 已入库、但**最新 tag 的 tarball 里没有**的 exports 子路径。
 *
 * `v0.216.0` 已追上树上的 exports。再有人在 tag 之后加子路径、忘了发版，
 * 下面那条正向断言会把新路径报出来。
 */
const UNRELEASED_EXPORTS = Object.freeze([]);

function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

/** 最新的 `vX.Y.Z` tag。按版本号排序，不按时间——时间序会被补打的旧 tag 骗到。 */
function latestVersionTag() {
  const listed = git("tag", "--list", "v*", "--sort=-v:refname").split("\n");
  return listed.find((line) => /^v\d+\.\d+\.\d+$/.test(line.trim()))?.trim() ?? "";
}

function manifestAt(tag) {
  return JSON.parse(git("show", `${tag}:package.json`));
}

const TREE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const TAG = latestVersionTag();

test("正对照：最新 tag 取得到，两边的 exports 表都读得出内容", () => {
  // 下面那条判据在「tag 读不出来 ⇒ 两边都是空表」时会静静通过。先证明读到了。
  assert.ok(
    TAG,
    "仓里一个 vX.Y.Z 形状的 tag 都找不到。" +
      "下游三仓是按 tag 装共享包的，取不到 tag 就无从判断它们装到的是什么 ⇒ 这道闸等于没跑",
  );
  assert.ok(
    Object.keys(TREE.exports ?? {}).length >= 30,
    `树上的 exports 表只有 ${Object.keys(TREE.exports ?? {}).length} 条，读法不对`,
  );
  assert.ok(
    Object.keys(manifestAt(TAG).exports ?? {}).length >= 30,
    `${TAG} 上的 exports 表读出来太少，读法不对`,
  );
});

test("共享包的 tag 落后于源码：欠着的那批子路径必须逐条登记，不许悄悄变长", () => {
  const tagged = new Set(Object.keys(manifestAt(TAG).exports ?? {}));
  const missing = Object.keys(TREE.exports ?? {})
    .filter((key) => !tagged.has(key))
    .sort();

  assert.deepEqual(
    missing,
    [...UNRELEASED_EXPORTS].sort(),
    `树上有、而最新 tag ${TAG} 的 tarball 里没有的 exports 子路径是：\n` +
      `  ${missing.join("\n  ") || "（无）"}\n` +
      `登记表写的是：\n  ${[...UNRELEASED_EXPORTS].join("\n  ") || "（空）"}\n\n` +
      "· 实际比登记多 ⇒ 有人在 tag 之后新加了 exports。**下游三仓装不到它**，\n" +
      "  那边的 import 会解析不到，而本仓所有判据都是绿的（本波已复发八次的形态）。\n" +
      "  要么发版，要么把它登记进 UNRELEASED_EXPORTS 让这笔债显式存在。\n" +
      "· 登记比实际多 ⇒ 已经发版了，把登记表清空。\n" +
      "  ⚠️ 顺带确认 version 也 bump 了：树上与 tag 上版本号相同的话，\n" +
      "  下游 npm install 不会去取新的，打了 tag 也等于没发。",
  );
});
