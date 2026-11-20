import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { LOCALES } from "../src/i18n/config.ts";
import * as shared from "../src/i18n/ui/messages/shell-overhaul-copy-shared.ts";

const directory = new URL("../src/i18n/ui/messages/", import.meta.url);

// Execute the actual module and expose its private tables only in this test VM.
// This checks raw row lengths, before Object.fromEntries can silently drop data.
function tables(file, names) {
  const text = readFileSync(new URL(file, directory), "utf8");
  const js = ts.transpileModule(`${text}\nexports.__tables = { ${names} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(js, { exports, require(specifier) {
    if (specifier === "../../config") return { LOCALES };
    if (specifier === "./shell-overhaul-copy-shared") return shared;
    throw Error(`Unexpected copy dependency: ${specifier}`);
  } });
  return JSON.parse(JSON.stringify(exports.__tables));
}

const positional = [
  ["bay-library-copy.ts", "keys", "rows"],
  ["build-1103-gap-copy.ts", "SOURCE", "ALL_TRANSLATIONS"],
  ["editor-overhaul-copy-w12.ts", "TRANSCRIPT_KEYS", "TRANSCRIPT_ROWS"],
  ["editor-overhaul-copy-w13.ts", "KEYS", "ROWS"],
  ["export-copy.ts", "source", "translations"],
  ["library-preview-copy.ts", "keys", "translations"],
  ["local-browser-wave-copy.ts", "keys", "rows"],
  ["program-access-repair-copy.ts", "keys", "rows"],
  ["pw-va-copy.ts", "PW_VA_SOURCE", "rows"],
  ["pw-vb-copy.ts", "ZH", "ROWS"],
  ["uf1-missing-copy-a.ts", "keys", "rows"],
  ["uf1-missing-copy-b.ts", "keys", "rows"],
  ["uf1-missing-copy-c.ts", "keys", "rows"],
  ["ui-followup-profile-copy.ts", "source", "rows"],
];

function rowLengths(file, rows, expected) {
  for (const [locale, values] of Object.entries(rows)) {
    assert.equal(values.length, expected, `${file}: ${locale} row length`);
    assert.ok(values.every(value => typeof value === "string" && value.trim()), `${file}: ${locale} nonempty translations`);
  }
}

for (const [file, keys, rows] of positional) {
  test(`positional copy length: ${file}`, () => {
    const data = tables(file, `${keys}, ${rows}`);
    rowLengths(file, data[rows], data[keys].length);
    const variables = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const [locale, values] of Object.entries(data[rows])) {
      data[keys].forEach((key, index) => assert.deepEqual(variables(values[index]), variables(key), `${file}: ${locale}: ${key} variables`));
    }
  });
}

test("positional tuples, factory rows and fixed-index additions have complete columns", () => {
  const media = tables("collab-media-copy.ts", "ORDER, TRANSLATIONS");
  rowLengths("collab-media-copy.ts", media.TRANSLATIONS, media.ORDER.length);
  const editor = tables("editor-overhaul-copy-w09.ts", "ROW_LOCALES, ROWS");
  rowLengths("editor-overhaul-copy-w09.ts", editor.ROWS, editor.ROW_LOCALES.length + 1);
  const facets = tables("w3-l5d-copy.ts", "ROWS");
  rowLengths("w3-l5d-copy.ts", facets.ROWS, 3);
  const auth = tables("device-experience-copy.ts", "AUTH");
  rowLengths("device-experience-copy.ts", auth.AUTH, 3);
  const game = tables("editor-overhaul-copy-w15.ts", "ITERATION_STATUS_COPY");
  rowLengths("editor-overhaul-copy-w15.ts", game.ITERATION_STATUS_COPY, 2);
  const access = tables("task-access-status-copy.ts", "text");
  rowLengths("task-access-status-copy.ts", access.text, 2);
  const remote = tables("remote-desktop-copy.ts", "TOOLBAR_LABELS, TRANSPORT_COPY, WEBRTC_COPY");
  rowLengths("remote-desktop-copy.ts toolbar", remote.TOOLBAR_LABELS, 5);
  rowLengths("remote-desktop-copy.ts transport", remote.TRANSPORT_COPY, 2);
  rowLengths("remote-desktop-copy.ts webrtc", remote.WEBRTC_COPY, 5);
  // row() itself checks each factory call's length. Also check the raw argument arrays.
  const source = readFileSync(new URL("pw-u3-copy.ts", directory), "utf8");
  const parsed = ts.createSourceFile("pw-u3-copy.ts", source, ts.ScriptTarget.Latest, true);
  const { SOURCE } = tables("pw-u3-copy.ts", "SOURCE");
  let count = 0;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === "row") {
      assert.equal(node.arguments[0].elements.length, Object.keys(SOURCE).length);
      count++;
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(count, LOCALES.length - 1);
});

for (const file of readdirSync(directory).filter(file => /^sw-.*-copy\.ts$/.test(file))) {
  test(`keyed wave copy covers every key in every locale: ${file}`, async () => {
    const module = await import(new URL(file, directory));
    const copy = Object.values(module).find(value => typeof value === "function");
    const reference = Object.keys(copy("zh")).sort();
    assert.ok(reference.length > 0);
    for (const locale of LOCALES) {
      const values = copy(locale);
      assert.deepEqual(Object.keys(values).sort(), reference, `${file}: ${locale} key coverage`);
      for (const key of reference) assert.ok(typeof values[key] === "string" && values[key].trim(), `${file}: ${locale}: ${key}`);
    }
    const source = readFileSync(new URL(file, directory), "utf8");
    assert.doesNotMatch(source, /\b(?:values|ROWS\[locale\]|COPY\[locale\])\[index\]/, "wave translations must be keyed");
  });
}

test("wave semantic anchors keep titles, actions and read failures distinct", async () => {
  const { swBdCopy } = await import("../src/i18n/ui/messages/sw-bd-copy.ts");
  const { swHuCopy } = await import("../src/i18n/ui/messages/sw-hu-copy.ts");
  for (const copy of [swBdCopy("en"), swHuCopy("en")]) {
    assert.equal(copy["找人"], "Find people");
    assert.equal(copy["关注"], "Follow");
    assert.equal(copy["已关注"], "Following");
  }
  for (const [file, key, expected] of [
    ["sw-br-copy.ts", "保存未完成，将自动重试", "Save pending; will retry automatically"],
    ["sw-tw-copy.ts", "智能体正在工作", "Agent is working"],
    ["sw-nu-copy.ts", "官方", "Official"],
    ["sw-cs-copy.ts", "语音通话", "Voice call"],
    ["sw-ts-copy.ts", "分享链接", "Share link"],
    ["sw-pf-copy.ts", "项目管理员", "Admin"],
    ["sw-st-copy.ts", "侧栏任务", "Tasks"],
  ]) {
    const module = await import(new URL(file, directory));
    const copy = Object.values(module).find(value => typeof value === "function");
    assert.equal(copy("en")[key], expected, file);
  }
  assert.equal(swBdCopy("en")["关注状态暂不可用。"], "Follow status is unavailable right now.");
  assert.equal(swBdCopy("en")["关注操作未完成，请稍后再试。"], "Couldn’t update your follow. Try the action again later.");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const { loadUiMessages } = await import("../src/i18n/ui/messages/load.ts");
  assert.equal(UI_MESSAGES.en["找人"], "Find people");
  assert.equal(UI_MESSAGES.en["关注"], "Follow");
  // Check the lazy dictionary too: a later merge must not overwrite the title again.
  if (loadUiMessages) {
    const lazy = await loadUiMessages("en");
    assert.equal(lazy["找人"], "Find people");
    assert.match(lazy["找人功能暂不可用，正在自动恢复。"], /automatically/);
  } else {
    assert.fail("loadUiMessages export missing");
  }
});
