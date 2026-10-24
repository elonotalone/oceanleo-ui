import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const ui = dataModule('export function useUI(){return (text)=>text;}');
const toolbar = await import(await compileModule("src/shell/skills/kit/ConfigToolbar.tsx", {
  "../../../i18n/ui/useUI": ui,
}));
const chrome = await import(await compileModule("src/shell/collection-chrome.tsx", {
  "../i18n/ui/useUI": ui,
}));

test("settings toolbar renders the existing collection search and pill actions", () => {
  let query = "";
  const search = { value: "mail", placeholder: "搜索", onChange: (value) => { query = value; } };
  const markup = renderToStaticMarkup(React.createElement(toolbar.ConfigToolbar, { search }));
  const reference = renderToStaticMarkup(React.createElement(chrome.CollectionSearchField, search));
  const inputClass = (html) => html.match(/<input[^>]*class="([^"]+)"/)[1];
  assert.equal(inputClass(markup), inputClass(reference));
  assert.match(markup, /padding-left:36px/);
  assert.match(markup, /h-9.*rounded-xl/);
  assert.match(markup, /focus:ring-2/);
  assert.match(markup, /min-h-11/);
  // The shared search owns event extraction; toolbar forwards the callback unchanged.
  assert.match(read("shell/skills/kit/ConfigToolbar.tsx"), /onChange=\{search.onChange\}/);
  search.onChange("calendar");
  assert.equal(query, "calendar");
  assert.ok(toolbar.CONFIG_PRIMARY_BUTTON_CLASS.startsWith(chrome.COLLECTION_ACTION_BTN_PRIMARY));
  assert.ok(toolbar.CONFIG_TOOLBAR_BUTTON_CLASS.startsWith(chrome.COLLECTION_ACTION_BTN_GHOST));
  assert.match(toolbar.CONFIG_PRIMARY_BUTTON_CLASS, /before:-inset-y-1/);
  assert.match(toolbar.CONFIG_PRIMARY_BUTTON_CLASS, /focus-visible:outline/);
  assert.match(toolbar.CONFIG_PRIMARY_BUTTON_CLASS, /disabled:opacity-50/);
});

test("nested skill and connector forms match existing settings field dimensions and focus", () => {
  const reference = read("pages/settings/personalization/parts.tsx");
  for (const path of ["shell/skills/manager/ImportDialogs.tsx", "shell/CreateSkillModal.tsx", "shell/SkillPromptPanel.tsx"]) {
    const source = read(path);
    for (const token of ["rounded-lg", "px-3 py-2", "text-[14px]", "focus:border-sky-500", "focus:ring-2 focus:ring-sky-100"]) {
      assert.ok(reference.includes(token));
      assert.ok(source.includes(token), `${path}: ${token}`);
    }
    assert.doesNotMatch(source, /import.*pages\/settings/);
  }
  assert.match(read("pages/plugins/ConnectorsSection.tsx"), /className=\{FIELD\}/);
  assert.doesNotMatch(read("pages/settings/SettingsHub.tsx"), /SPLIT_PLUGIN_TABS.includes\(active\?\.id/);
});
