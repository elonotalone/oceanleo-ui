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

test("SettingsHub：海外 builtin 有 OceanLeo Bay，境内不加", () => {
  const text = src("pages/settings/SettingsHub.tsx");
  assert.match(text, /import \{ BaySettingsSection \} from "\.\.\/\.\.\/shell\/bay\/settings"/);
  assert.match(text, /import \{ bayEnabledHere \} from "\.\.\/\.\.\/shell\/bay\/shell\/bay-state"/);
  assert.match(text, /bayEnabledHere\(\)/);
  assert.match(text, /id: "bay"/);
  assert.match(text, /label: tt\("OceanLeo Bay"\)/);
  assert.match(text, /<BaySettingsSection \/>/);
});
