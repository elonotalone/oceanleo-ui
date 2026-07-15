import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  UI_MESSAGES_NAMESPACE,
  uiMessageDictionaryFrom,
} from "../src/i18n/ui/messages/runtime.ts";

const source = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("client translation hook receives one request-local dictionary", () => {
  const hook = source("../src/i18n/ui/useUI.ts");
  const provider = source("../src/i18n/provider.tsx");

  assert.match(hook, /useUiMessages\(\)/);
  assert.doesNotMatch(hook, /UI_MESSAGES|from\s+["']\.\/messages["']/);
  assert.match(provider, /uiMessageDictionaryFrom\(messages\)/);
  assert.match(provider, /<UIMessageProvider messages=\{uiMessages\}>/);
});

test("request config loads the selected locale instead of the aggregate", () => {
  const request = source("../src/i18n/request.ts");
  const loader = source("../src/i18n/ui/messages/load.ts");

  assert.match(request, /await loadUiMessages\(locale\)/);
  assert.match(request, /messages\[UI_MESSAGES_NAMESPACE\] = uiMessages/);
  assert.match(loader, /if \(locale === DEFAULT_LOCALE\) return \{\}/);
  assert.doesNotMatch(loader, /from\s+["']\.\/index["']/);
});

test("UI dictionary namespace extraction is safe and deterministic", () => {
  const dictionary = { 加载: "Loading" };
  assert.equal(
    uiMessageDictionaryFrom({ [UI_MESSAGES_NAMESPACE]: dictionary }),
    dictionary,
  );
  assert.deepEqual(uiMessageDictionaryFrom(undefined), {});
  assert.deepEqual(
    uiMessageDictionaryFrom({ [UI_MESSAGES_NAMESPACE]: "invalid" }),
    {},
  );
});
