/**
 * R9 · 「Umo」专业页必须露出 Umo 自己的顶部工具栏（V2-P-tabs 第 5 条 FAIL 的闸）。
 *
 * 用户看到的事：点第二行「Umo」，进来的是一个只有底栏、没有功能区的 Umo。
 * 根因：宿主 `pushInit` 先发 `set-mode`/`hide-chrome`（且写死默认普通模式）再发
 * `init`，而 umo-hosted 收到 `init` 会重置回普通模式 → 工具栏收起。
 *
 * 判据分两层：
 *   ① 信封层：`buildRichDocInitEnvelope` 接受 `mode`，专业页时 `init.mode === "pro"`。
 *   ② 结构层：`RichDocHostedRoute.pushInit` 里 `init` 必须排在 `set-mode` 之前，
 *      且 `set-mode`/`hide-chrome` 不再引用 `DEFAULT_EDITOR_MODE` 或字面 `toolbar: true`。
 *
 * 跑法：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/rich-doc-hosted-pro-toolbar.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildRichDocInitEnvelope } from "../src/shell/doc-editors/rich-doc-hosted-embed.ts";

test("UC-NONE · init 信封带上宿主当前页的 mode；缺省仍是普通", () => {
  const pro = buildRichDocInitEnvelope("inst-1", {
    content: {},
    readOnly: false,
    mode: "pro",
  });
  assert.equal(pro.type, "init");
  assert.equal(pro.mode, "pro");
  const dflt = buildRichDocInitEnvelope("inst-1", { content: {}, readOnly: true });
  assert.equal(dflt.mode, "normal");
});

test("UC-NONE · RichDocHostedRoute.pushInit：init 在前，模式跟当前页走", () => {
  const src = readFileSync(
    new URL("../src/shell/advanced-routes/RichDocHostedRoute.tsx", import.meta.url),
    "utf8",
  );
  const start = src.indexOf("const pushInit = useCallback(");
  assert.ok(start > 0, "找不到 pushInit");
  const end = src.indexOf("}, [", start);
  const body = src.slice(start, end);
  const initAt = body.indexOf("buildRichDocInitEnvelope(");
  const setModeAt = body.indexOf("buildSetModeMessage(");
  const hideAt = body.indexOf("buildHideChromeMessage(");
  assert.ok(initAt > 0 && setModeAt > 0 && hideAt > 0, "三条消息都要在");
  assert.ok(initAt < setModeAt, "init 必须先于 set-mode（Umo 收 init 会重置模式）");
  assert.ok(initAt < hideAt, "init 必须先于 hide-chrome");
  assert.ok(
    !body.includes("DEFAULT_EDITOR_MODE"),
    "pushInit 不许写死默认模式，专业页要发 pro",
  );
  assert.ok(
    !/toolbar:\s*true/.test(body),
    "pushInit 不许无条件藏 Umo 工具栏",
  );
});
