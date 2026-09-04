/**
 * W08 · 双核 flag 在 `RichDocRoute` 上的接线，以及托管 iframe 契约。
 *
 * 跑法（必须带 package.json `test` 那串 flag，`_COMMON.md` §7b⑫）：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/rich-doc-core-swap.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EDITOR_CORE_SPECS,
  resolveEditorCore,
} from "../src/shell/editor-core-flags.ts";
import { isTrustedEmbedEditorBase } from "../src/shell/editor-sandbox-origin.ts";
import { EDITOR_PROTOCOL } from "../src/shell/editor-protocol.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  RICHDOC_HOSTED_EMBED_ORIGIN,
  buildRichDocEmbedUrl,
  buildRichDocInitEnvelope,
  canBuildRichDocEmbedUrl,
  richDocHostedEmbedBase,
} from "../src/shell/doc-editors/rich-doc-hosted-embed.ts";

const route = readFileSync("src/shell/advanced-routes/RichDocRoute.tsx", "utf8");
const hosted = readFileSync(
  "src/shell/advanced-routes/RichDocHostedRoute.tsx",
  "utf8",
);

test("richdoc 在换核台账里登记的是 Umo Editor、owner 是 W08、iframe 托管", () => {
  assert.deepEqual(EDITOR_CORE_SPECS.richdoc, {
    nextCore: "Umo Editor",
    owner: "W08",
    hosting: "hosted",
  });
});

test("默认走旧核 —— 用户侧零影响（§10 第 3 条）", () => {
  assert.equal(resolveEditorCore("richdoc"), "legacy");
});

test("显式 override 才切到新核", () => {
  assert.equal(resolveEditorCore("richdoc", "next"), "next");
  assert.equal(resolveEditorCore("richdoc", "legacy"), "legacy");
});

test("flag 只在路由顶层判一次，不写进组件（flag 纪律 1）", () => {
  const hits = route.match(/resolveEditorCore\(/g) || [];
  assert.equal(hits.length, 1, `resolveEditorCore 出现 ${hits.length} 次，应恰好 1 次`);
  const dispatchIndex = route.indexOf("export function RichDocRoute(");
  const legacyIndex = route.indexOf("function RichDocLegacyRoute(");
  const callIndex = route.indexOf("resolveEditorCore(");
  assert.ok(dispatchIndex > 0 && legacyIndex > dispatchIndex);
  assert.ok(callIndex > dispatchIndex && callIndex < legacyIndex);
});

test("新核单独 lazy —— 翻 flag 前它的模块图不进本 chunk", () => {
  assert.match(route, /lazy\(\(\) =>\s*import\("\.\/RichDocHostedRoute"\)/);
  assert.doesNotMatch(
    route,
    /^import .*RichDocHostedRoute.*from/m,
    "新核被静态 import 了，两套核会进同一个 chunk",
  );
});

test("旧核代码保留，没被删（§10 第 3 条）", () => {
  assert.match(route, /function RichDocLegacyRoute\(/);
  for (const kept of ["useRichDocEditor", "RichDocStage", "RichDocContextToolbar"]) {
    assert.ok(route.includes(kept), `旧核的 ${kept} 不见了`);
  }
});

test("旧核下载菜单有转公众号排版，且不改 doc-family 格式表", () => {
  assert.match(route, /richdoc-wechat-layout/);
  assert.match(route, /转公众号排版/);
  assert.doesNotMatch(route, /DOC_FAMILY_DOWNLOAD_FORMATS\.richdoc\.push/);
});

test("新核分支嵌入 docs.oceanleo.app iframe，并走契约 v2", () => {
  assert.match(hosted, /<iframe/);
  assert.ok(hosted.includes("docs.oceanleo.app"));
  assert.match(hosted, /buildSetModeMessage/);
  assert.match(hosted, /buildHideChromeMessage/);
  assert.match(hosted, /buildRichDocInitEnvelope/);
  assert.match(hosted, /acceptEditorFrameMessage/);
  assert.match(hosted, /recovery-snapshot/);
  assert.match(
    hosted,
    /snapshot\?\.payload/,
    "recovery-snapshot 必须取出 payload，不能把 {revision,payload} 整包当正文",
  );
  assert.doesNotMatch(hosted, /postMessage\([^)]+,\s*['"]\*['"]/);
});

test("新核分支不静态拉旧核 Tiptap（flag 纪律 1）", () => {
  assert.doesNotMatch(hosted, /use-rich-doc-editor/);
  assert.doesNotMatch(hosted, /from ["']@tiptap\//);
  assert.doesNotMatch(hosted, /RichDocStage|RichDocContextToolbar|useRichDocEditor/);
  assert.ok(hosted.includes("RichDocHostedRoute"));
});

test("默认普通模式，set-mode 是唯一开关", () => {
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(hosted, /DEFAULT_EDITOR_MODE/);
  assert.match(hosted, /buildSetModeMessage/);
});

test("docs.oceanleo.app 已在 embed 白名单，能拼出 URL", () => {
  assert.equal(RICHDOC_HOSTED_EMBED_ORIGIN, "https://docs.oceanleo.app");
  assert.equal(richDocHostedEmbedBase(), "https://docs.oceanleo.app");
  assert.equal(richDocHostedEmbedBase("https://evil.example"), "https://docs.oceanleo.app");
  assert.equal(canBuildRichDocEmbedUrl("https://docs.oceanleo.app"), true);
  assert.equal(isTrustedEmbedEditorBase("https://docs.oceanleo.app"), true);
  const url = buildRichDocEmbedUrl({
    instanceId: "rd-test-1",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "备忘",
  });
  assert.match(url, /^https:\/\/docs\.oceanleo\.app\//);
  assert.match(url, /embed=1/);
  assert.match(url, /instance=rd-test-1/);
  assert.match(url, /host=https%3A%2F%2Foceanleo.com/);
});

test("init 信封是 oceanleo.editor.v1，带只读标记，没有第三种 mode", () => {
  const envelope = buildRichDocInitEnvelope("rd-test-1", {
    content: { type: "doc", content: [] },
    readOnly: true,
    title: "旧稿",
  });
  assert.equal(envelope.protocol, EDITOR_PROTOCOL);
  assert.equal(envelope.protocol, "oceanleo.editor.v1");
  assert.equal(envelope.type, "init");
  assert.equal(envelope.readOnly, true);
  assert.equal(envelope.mode, "normal");
  assert.equal(envelope.instanceId, "rd-test-1");
});

test("Hosted 六件不拿同源沙箱（W08-request R2）", () => {
  assert.doesNotMatch(hosted, /allow-same-origin/);
});
