import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";

const messages = new URL("../src/i18n/ui/messages/", import.meta.url);
const copies = readdirSync(messages).filter(file => /^sw-.*-copy\.ts$/.test(file));

test("every social copy is registered once in both static and runtime dictionaries", async () => {
  assert.equal(copies.length, 9);
  const keys = new Set();
  for (const file of copies) {
    const module = await import(new URL(file, messages));
    const copy = Object.values(module).find(value => typeof value === "function");
    assert.equal(typeof copy, "function", file);
    for (const key of Object.keys(copy("en"))) keys.add(key);
    for (const registry of ["index.ts", "load.ts"]) {
      const source = readFileSync(new URL(registry, messages), "utf8");
      const imports = [...source.matchAll(new RegExp(`import \\{ (\\w+) \\} from "\\./${file.slice(0, -3)}";`, "g"))];
      assert.equal(imports.length, 1, `${registry}: ${file} import`);
      const name = imports[0][1];
      assert.equal([...source.matchAll(new RegExp(`\\.\\.\\.${name}\\(`, "g"))].length, 1, `${registry}: ${name} registration`);
    }
  }
  for (const locale of LOCALES) {
    const runtime = await loadUiMessages(locale);
    if (locale === "zh") assert.deepEqual(runtime, {}, "Chinese uses source keys");
    for (const key of keys) {
      assert.ok(UI_MESSAGES[locale][key]?.trim(), `${locale}: ${key}`);
      if (locale !== "zh") assert.equal(runtime[key], UI_MESSAGES[locale][key], `${locale}: ${key}`);
    }
  }
});

test("people API has no friend-request write operation", async () => {
  const module = await import("../src/lib/im/people-api.ts");
  assert.equal("sendContactRequest" in module, false);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/im/people-api.ts", import.meta.url), "utf8"), /contact-requests/);
});
