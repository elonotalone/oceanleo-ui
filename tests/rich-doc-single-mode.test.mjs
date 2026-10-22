/**
 * W04 (native-editors wave): the rich document editor has ONE native Tiptap
 * mode. No Pro page, no Umo shell iframe, no mode switch. Stored documents
 * written by the removed Umo face still open through the native read path.
 *
 *   node --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     --test tests/rich-doc-single-mode.test.mjs
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { parseRichDocNativeJson } from "../src/shell/doc-editors/rich-doc-model.ts";

const route = readFileSync("src/shell/advanced-routes/RichDocRoute.tsx", "utf8");

test("the hosted Umo modules are gone", () => {
  for (const gone of [
    "src/shell/advanced-routes/RichDocHostedRoute.tsx",
    "src/shell/advanced-routes/richdoc-pro-source.ts",
    "src/shell/doc-editors/rich-doc-hosted-embed.ts",
    "src/shell/doc-editors/RichDocHostedContextToolbar.tsx",
  ]) {
    assert.equal(existsSync(gone), false, `${gone} must stay deleted`);
  }
});

test("RichDocRoute is single-mode: no Hosted import, mode switch, Pro page, or iframe", () => {
  assert.doesNotMatch(route, /RichDocHosted/);
  assert.doesNotMatch(route, /richdoc-pro-source/);
  assert.doesNotMatch(route, /usePluginMode|PluginModeSwitchGate|useModeSwitchReady/);
  assert.doesNotMatch(route, /resolveEditorCore/);
  assert.doesNotMatch(route, /mode:\s*\{/);
  assert.doesNotMatch(route, /pages:\s*\{/);
  assert.doesNotMatch(route, /proLabel|["']pro["']/);
  assert.doesNotMatch(route, /<iframe/);
  assert.match(route, /export function RichDocRoute\(/);
  assert.match(route, /useRichDocEditor/);
});

test("no rich-doc source file embeds a third-party editor shell", () => {
  const dirs = [
    ["src/shell/doc-editors", /^(RichDoc|rich-doc|use-rich-doc)/],
    ["src/shell/advanced-routes", /^RichDoc/],
  ];
  for (const [dir, pattern] of dirs) {
    for (const name of readdirSync(dir).filter((n) => pattern.test(n))) {
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const text = readFileSync(`${dir}/${name}`, "utf8");
      assert.doesNotMatch(text, /<iframe/, `${dir}/${name} must not render an iframe`);
      assert.doesNotMatch(text, /docs\.oceanleo\.app/, `${dir}/${name}`);
    }
  }
});

test("documents stored by the removed Umo face still open natively", () => {
  const body = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "旧 Umo 稿" }] }],
  };
  for (const stored of [
    { format: "umo.tiptap.v1", title: "t", content: body },
    { schema: "tiptap-json@1", version: 1, data: body },
  ]) {
    const parsed = parseRichDocNativeJson(JSON.stringify(stored));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.json.content[0].content[0].text, "旧 Umo 稿");
  }
});
