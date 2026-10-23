// leobay-projects 父 agent 收尾时补的接缝：老深链 settings:vetting / settings:profile 转去「我的主页」。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pane = readFileSync(new URL("../src/shell/bay/settings/BaySettingsPane.tsx", import.meta.url), "utf8");

test("settings:vetting / settings:profile 转到我的主页编辑状态，vetting 滚到核验块；money 仍是设置单页", () => {
  assert.match(pane, /pane === "vetting" \|\| pane === "profile"/);
  assert.match(pane, /requestMinePageEdit\(pane === "vetting" \? "vetting" : undefined\)/);
  assert.match(pane, /replaceBay\(\{ kind: "mine", tab: "page" \}\)/);
  assert.match(pane, /<BaySettingsSection /);
});
