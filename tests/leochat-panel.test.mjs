// LeoChat 小窗栏目标签与整页地址（W01）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { isLeoChatPagePath, leoChatPageHref, parseLeoChatTab } from "../src/shell/leochat/leochat-links.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");

globalThis.__leoChatPanelReact = React;

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

const { LeoChatTabs } = await import(
  await compileModule("src/shell/leochat/LeoChatTabs.tsx", {
    "../../i18n/ui/useUI": uiStub,
  }),
);

test("LeoChatTabs：三个标签的文字、角标只在大于 0 时出现", () => {
  const html = renderToStaticMarkup(
    React.createElement(LeoChatTabs, {
      active: "inbox",
      onSelect() {},
      badges: { inbox: 3, people: 0, bay: 100 },
    }),
  );
  assert.match(html, /聊天/);
  assert.match(html, /联系人/);
  assert.match(html, /LeoBay/);
  assert.match(html, />3</);
  assert.match(html, /99\+/);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-view="people"[^>]*>[\s\S]*?>0</);
});

test("LeoChatTabs：locked 的标签点了走 onLocked", () => {
  const tabs = src("shell/leochat/LeoChatTabs.tsx");
  assert.match(tabs, /locked\?\.includes\(tab\.id\)/);
  assert.match(tabs, /onLocked\?\.\(\)/);
});

test("leoChatPageHref 与 parseLeoChatTab、isLeoChatPagePath 的输入输出", () => {
  assert.equal(leoChatPageHref({ tab: "inbox" }), "/leochat?tab=inbox");
  assert.equal(leoChatPageHref({ tab: "inbox", conversationId: "c1" }), "/leochat?tab=inbox&im=c1");
  assert.equal(leoChatPageHref({ tab: "people", conversationId: "c1" }), "/leochat?tab=people");
  assert.equal(leoChatPageHref({ tab: "bay", bay: "demand:abc" }), "/leochat?tab=bay&bay=demand%3Aabc");
  assert.equal(parseLeoChatTab("?tab=inbox"), "inbox");
  assert.equal(parseLeoChatTab("?tab=people"), "people");
  assert.equal(parseLeoChatTab("?tab=bay"), "bay");
  assert.equal(parseLeoChatTab("?tab=nope"), null);
  assert.equal(parseLeoChatTab(""), null);
  assert.equal(isLeoChatPagePath("/leochat"), true);
  assert.equal(isLeoChatPagePath("/leochat/"), true);
  assert.equal(isLeoChatPagePath("/en/leochat"), true);
  assert.equal(isLeoChatPagePath("/bay"), true);
  assert.equal(isLeoChatPagePath("/library"), false);
  assert.equal(isLeoChatPagePath("/bays"), false);
});
