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
import { isHostedEditorOrigin } from "../src/shell/hosted-editor-origins.ts";
import {
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "../src/shell/editor-sandbox-origin.ts";
import { buildEditorEmbedUrl } from "../src/shell/editor-protocol.ts";

const route = readFileSync("src/shell/advanced-routes/DeckRoute.tsx", "utf8");
const hosted = readFileSync(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  "utf8",
);

/**
 * 托管分支实际指向的那个 origin，从源文件里读出来再交给**生产函数**判。
 * 不自写解析器复述白名单：白名单的事实源是 `hosted-editor-origins.ts`。
 */
function hostedOriginFromSource() {
  const match = hosted.match(
    /DECK_HOSTED_EMBED_ORIGIN\s*=\s*"(https:\/\/[a-z0-9.-]+)"/,
  );
  return match ? match[1] : "";
}

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

// ── 以下五条是 V1-red-2 的修复闸 ─────────────────────────────────────────
// 这条闸原来钉的是「不许出现 iframe」，理由是宿主白名单没放行。
// 白名单在 W01 `b0056b9` / A-24 就放行了（下面第一条用生产函数复核），
// 于是那条断言从此在保护一块说明面 —— 一个错误的产品态。现在翻成正向：
// **翻 flag 的人必须看见幻灯片画布，不是一段解释。**

test("翻 flag 的人看见的是幻灯片画布：新核分支挂真 iframe", () => {
  assert.match(hosted, /<iframe/, "新核分支没有 iframe，用户看不到画布");
  assert.match(
    hosted,
    /available:\s*true/,
    "适配器仍报 available: false，壳会按「这件不可用」渲染",
  );
  assert.doesNotMatch(
    hosted,
    /尚未放行/,
    "还在写「宿主尚未放行」，但生产函数说已经放行了",
  );
  // iframe 的 src 必须来自构造出来的地址，不是写死的字符串。
  assert.match(hosted, /<iframe[\s\S]{0,400}?src=\{src\}/);
});

test("iframe 指向的 origin 过生产白名单（不自写解析器）", () => {
  const origin = hostedOriginFromSource();
  assert.equal(origin, "https://slides.oceanleo.app");
  assert.equal(isHostedEditorOrigin(origin), true);
  assert.equal(isTrustedEmbedEditorBase(origin), true);
  // 反例走同一个生产函数，确认它不是恒真。
  assert.equal(isHostedEditorOrigin("https://evil.oceanleo.app"), false);
  assert.equal(isHostedEditorOrigin("https://slides.oceanleo.app.evil.com"), false);
  // 地址真能拼出来，且 origin 没被拼歪。
  const url = new URL(
    buildEditorEmbedUrl(origin, {
      instanceId: "dk-gate",
      hostOrigin: "https://oceanleo.com",
      assetTitle: "闸",
      assetKind: "deck",
    }),
  );
  assert.equal(url.origin, origin);
  assert.equal(url.searchParams.get("editor"), "1");
});

test("沙箱档次由生产函数决定，且不带同源权限", () => {
  const origin = hostedOriginFromSource();
  const sandbox = embedEditorFrameSandbox(origin);
  assert.ok(sandbox.includes("allow-scripts"), "连脚本都不给，编辑器跑不起来");
  assert.ok(
    !sandbox.includes("allow-same-origin"),
    "六件 Hosted 拿到了同源权限，域隔离白做了",
  );
  // 源文件必须用那个函数算沙箱，不许自己写一串。
  assert.match(hosted, /embedEditorFrameSandbox\(/);
  assert.match(hosted, /<iframe[\s\S]{0,400}?sandbox=\{frameSandbox\}/);
  assert.doesNotMatch(
    hosted,
    /sandbox="[^"]*allow-same-origin/,
    "沙箱串被写死并放开了同源",
  );
});

test("普通模式收起内核自带的工具栏与面板（R3：默认普通模式）", () => {
  assert.match(hosted, /DEFAULT_EDITOR_MODE/, "初始模式没有走契约默认档");
  assert.match(hosted, /buildHideChromeMessage\(/);
  // 普通模式两项都收；专业模式两项都放。写死 true / false 都是错的。
  const hits = hosted.match(/mode === "normal"/g) || [];
  assert.ok(hits.length >= 2, `hide-chrome 没有按模式取值（命中 ${hits.length} 处）`);
  assert.match(hosted, /next === "normal"/, "切模式时没有跟着重发 hide-chrome");
});

test("握手要发 init，否则编辑器一条能力都不报", () => {
  // 只发 open-asset：文档进得去，但 tools-manifest / selection / history 都不来，
  // agent 的接口面是空的。init 与 open-asset 两条缺一不可。
  assert.match(hosted, /type: "init"/, "从不发 init ⇒ 编辑器不报 tools-manifest");
  assert.match(hosted, /type: "open-asset"/, "从不发 open-asset ⇒ 打开的是空白演示");
});

test("agent 的改动要经过这一页点头才落地（契约 v2 §3.3）", () => {
  assert.match(
    hosted,
    /"review-proposal"/,
    "宿主侧不收提案，编辑器发了也没人接",
  );
  assert.match(hosted, /buildReviewDecisionMessage\(/, "收了提案却回不了裁决");
  assert.match(hosted, /"accept"/);
  assert.match(hosted, /"reject"/);
});

test("新核分支里没有 PPTist 的源码痕迹（AGPL 红线）", () => {
  assert.doesNotMatch(hosted, /from ['"]@\/(types|store|hooks|configs)\//);
  assert.doesNotMatch(hosted, /defineStore|storeToRefs/);
  // 正例：确认确实读到了内容（§6：零命中先验工具）。
  assert.ok(hosted.includes("DeckHostedRoute"));
});
