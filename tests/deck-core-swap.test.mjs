/**
 * W07 · 双核 flag 在 `DeckRoute` 上的接线判据。
 *
 * 跑法（原样带上 package.json `test` 脚本那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/deck-core-swap.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITOR_CORE_SPECS,
  resolveEditorCore,
} from "../src/shell/editor-core-flags.ts";

const route = readFileSync("src/shell/advanced-routes/DeckRoute.tsx", "utf8");
const hosted = readFileSync(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  "utf8",
);

test("deck 在换核台账里登记的是 PPTist、owner 是 W07、iframe 托管", () => {
  assert.deepEqual(EDITOR_CORE_SPECS.deck, {
    nextCore: "PPTist",
    owner: "W07",
    hosting: "hosted",
  });
});

test("默认走旧核 —— 用户侧零影响（§10 第 3 条）", () => {
  // 没有 window、没有环境变量覆盖时必须是 legacy。
  assert.equal(resolveEditorCore("deck"), "legacy");
});

test("显式 override 才切到新核", () => {
  assert.equal(resolveEditorCore("deck", "next"), "next");
  assert.equal(resolveEditorCore("deck", "legacy"), "legacy");
});

test("flag 只在路由顶层判一次，不写进组件（flag 纪律 1）", () => {
  const hits = route.match(/resolveEditorCore\(/g) || [];
  assert.equal(hits.length, 1, `resolveEditorCore 出现 ${hits.length} 次，应恰好 1 次`);
  // 那一次必须在分发口里，不在 legacy 组件体内。
  const dispatchIndex = route.indexOf("export function DeckRoute(");
  const legacyIndex = route.indexOf("function DeckLegacyRoute(");
  const callIndex = route.indexOf("resolveEditorCore(");
  assert.ok(dispatchIndex > 0 && legacyIndex > dispatchIndex, "分发口应在 legacy 组件之前");
  assert.ok(
    callIndex > dispatchIndex && callIndex < legacyIndex,
    "resolveEditorCore 不在分发口内",
  );
});

test("新核单独 lazy —— 翻 flag 前它的模块图不进本 chunk（flag 纪律 1）", () => {
  assert.match(route, /lazy\(\(\) =>\s*import\("\.\/DeckHostedRoute"\)/);
  // 反面：不许静态 import 新核。
  assert.doesNotMatch(
    route,
    /^import .*DeckHostedRoute.*from/m,
    "新核被静态 import 了，两套核会进同一个 chunk",
  );
});

test("旧核代码保留，没被删（§10 第 3 条：换核期间旧核不删）", () => {
  assert.match(route, /function DeckLegacyRoute\(/);
  // 旧核那一堆自研引擎的 import 必须还在。
  for (const kept of ["useDeckEditor", "DeckStage", "DeckPresenterView"]) {
    assert.ok(route.includes(kept), `旧核的 ${kept} 不见了`);
  }
});

test("宿主侧未放行前，新核分支不渲染必然握手失败的 iframe", () => {
  // 与其给用户一块白板，不如说清楚为什么。R1/R2 落地后这条要跟着改。
  assert.doesNotMatch(hosted, /<iframe/, "宿主白名单未放行就挂了 iframe");
  assert.match(hosted, /available: false/);
  assert.ok(
    hosted.includes("slides.oceanleo.app"),
    "说明面没有指出这一件挂在哪个 origin",
  );
});

test("新核分支里没有 PPTist 的源码痕迹（AGPL 红线）", () => {
  assert.doesNotMatch(hosted, /from ['"]@\/(types|store|hooks|configs)\//);
  assert.doesNotMatch(hosted, /defineStore|storeToRefs/);
  // 正例：确认确实读到了内容（§6：零命中先验工具）。
  assert.ok(hosted.includes("DeckHostedRoute"));
});
