/**
 * W07 · V3-red-7 宿主侧辅闸：DeckHostedRoute 今天不发 selection-command。
 * 一旦有人加上去，信封必须带人类来源章，否则编辑器会把用户点击当成待审。
 *
 * 产品行为闸在 pptist-hosted（AGPL），本文件不 import 那边的函数名。
 *
 * 跑法：
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/deck-hosted-selection-origin.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

const hosted = readFileSync(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  "utf8",
);

// UC-6 §8.6（docs/architecture/oceanleo-untrusted-content-isolation.md）
// 违反后果：宿主往 Hosted 框发 selection-command 却不盖人类来源章，编辑器会把点击当待审；这是 postMessage 命令白名单的来源校验。
test("DeckHostedRoute 今天不发 selection-command；一旦发，信封必须带人类章", () => {
  const sends = [...hosted.matchAll(/type:\s*["']selection-command["']/g)];
  if (sends.length === 0) {
    assert.equal(sends.length, 0);
    return;
  }
  const hasStamp = /origin:\s*["'](user|human|l1|l2)["']/.test(hosted);
  assert.ok(
    hasStamp,
    "DeckHostedRoute 发了 selection-command，但源码里没有信封人类章。编辑器缺章一律送审（V3-red-7）。盖在信封顶层，不要盖在 command 里——宿主白名单会剥掉 command.origin。",
  );
});
