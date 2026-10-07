// W09 契约 §1.5 插桩：断言工作区里的设置钩子已在。干净 HEAD 上会红；不提交，父 agent 整合时一并进库。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, "src", rel), "utf8");

test("SETTINGS_BUILTIN_TABS 在 billing 后面有 bay", () => {
  const text = src("pages/settings/settings-tabs.ts");
  assert.match(text, /"billing",\s*"bay",/);
});

test("SettingsHub：海外 builtin 有 LeoBay，境内不加", () => {
  const text = src("pages/settings/SettingsHub.tsx");
  assert.match(text, /import \{ BaySettingsSection \} from "\.\.\/\.\.\/shell\/bay\/settings"/);
  assert.match(text, /import \{ bayEnabledHere \} from "\.\.\/\.\.\/shell\/bay\/shell\/bay-state"/);
  assert.match(text, /bayEnabledHere\(\)/);
  assert.match(text, /id: "bay"/);
  assert.match(text, /label: "LeoBay"/);
  assert.match(text, /<BaySettingsSection \/>/);
});

test("SETTINGS_BUILTIN_TABS 在 bay 后面有 messages", () => {
  const text = src("pages/settings/settings-tabs.ts");
  assert.match(text, /"bay",\s*"messages",/);
});

test("SettingsHub：海外 builtin 有消息栏，境内不加", () => {
  const text = src("pages/settings/SettingsHub.tsx");
  assert.match(text, /import \{ MessagesSection \} from "\.\/sections\/MessagesSection"/);
  assert.match(text, /import \{ imEnabledFor \} from "\.\.\/\.\.\/shell\/messages\/messages-family"/);
  assert.match(text, /imEnabledFor\(currentDomainFamily\(\), true\)/);
  assert.match(text, /id: "messages"/);
  assert.match(text, /label: tt\("消息"\)/);
  assert.match(text, /<MessagesSection \/>/);
});
