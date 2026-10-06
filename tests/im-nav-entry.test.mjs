// 侧栏「消息」入口（work-chat W08）：导航事实源里的动作项、门户与租户站的可见性、源码接线。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NAV_SOURCE, navEntries, navEntryById, navIdsForScope } from "../src/shell/nav-source/index.ts";
import { imEnabledFor } from "../src/shell/messages/messages-family.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");

test("withMessages 不传或为 false：两套外壳都不出现「消息」（境内与未登录天然看不到）", () => {
  for (const scope of ["workspace", "portal"]) {
    assert.equal(navEntries(scope).some((e) => e.id === "messages"), false, `${scope} 默认不显示`);
    assert.equal(navEntries(scope, { withMessages: false }).some((e) => e.id === "messages"), false);
    assert.equal(navEntries(scope, {}, "footer").some((e) => e.id === "messages"), false);
  }
});

test("withMessages 为 true：出现，且位置固定（租户站在探索与工作台之间，门户在真人协作与工作台之间）", () => {
  const ws = navEntries("workspace", { withMessages: true, withPlayground: true }).map((e) => e.id);
  assert.deepEqual(ws, ["home", "explore", "messages", "workspace", "library", "history", "playground"]);
  const portal = navEntries("portal", { withMessages: true, withTalent: true }).map((e) => e.id);
  const at = portal.indexOf("messages");
  assert.ok(at > portal.indexOf("talent") && at < portal.indexOf("workspace"), portal.join(","));
});

test("动作项：有 action、没有 href、不是外链；图标与文案来源按声明", () => {
  const entry = navEntries("workspace", { withMessages: true }).find((e) => e.id === "messages");
  assert.equal(entry.action, "messages");
  assert.equal(entry.href, undefined);
  assert.equal(entry.external, false);
  assert.equal(entry.iconId, "messages");
  assert.equal(entry.labelKey, "消息");
  assert.equal(entry.labelSource, "ui");
  const raw = navEntryById("messages");
  assert.equal("href" in raw, false);
  assert.deepEqual(raw.placements.workspace, { order: 25, option: "withMessages", optionDefault: false });
  assert.deepEqual(raw.placements.portal, { order: 45, option: "withMessages", optionDefault: false });
  // 其余条目没有被误加 action
  for (const other of navEntries("workspace", { withMessages: true, withPlayground: true })) {
    if (other.id !== "messages") assert.equal("action" in other, false, `${other.id} 不该有 action`);
  }
  assert.ok(navIdsForScope("workspace").includes("messages"));
  assert.ok(navIdsForScope("portal").includes("messages"));
  assert.equal(NAV_SOURCE.filter((e) => e.action).length, 1);
});

test("可见性判定：境内永远没有；未登录没有；海外与分身站登录后有", () => {
  assert.equal(imEnabledFor("cn", true), false);
  assert.equal(imEnabledFor("cn", false), false);
  assert.equal(imEnabledFor("com", false), false);
  assert.equal(imEnabledFor("com", true), true);
  assert.equal(imEnabledFor("ws", true), true);
});

test("租户站 workspaceNav：动作项映射成 onClick、不生成 href；默认值取 imEnabledHere()", () => {
  const source = src("shell/WorkspacePages.tsx");
  const branch = source.slice(source.indexOf('entry.action === "messages"'));
  const block = branch
    .slice(0, branch.indexOf("};") + 2)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.match(block, /onClick:\s*\(\)\s*=>\s*openMessages\(\)/);
  assert.match(block, /<MessagesNavIcon\s*\/>/);
  assert.doesNotMatch(block, /href/, "动作项不能带 href");
  assert.match(source, /withMessages:\s*opts\.withMessages\s*\?\?\s*imEnabledHere\(\)/);
  assert.match(source, /ALL_WORKSPACE_PAGES_VISIBLE[\s\S]*withMessages:\s*true/);
  // labels 订阅登录态，登录后外壳会重渲染，「消息」才出得来
  assert.match(source, /useImEnabled\(\)/);
  assert.match(source, /labelSource === "ui" \? tt\(entry\.labelKey\)/);
});

test("共享外壳只多四个导出；MessagesHost 在不可用时什么都不渲染", () => {
  const index = src("shell/index.ts");
  assert.match(index, /export \{ MessagesHost \} from "\.\/messages\/MessagesHost"/);
  assert.match(index, /export \{ openMessages \} from "\.\/messages\/host-state"/);
  assert.match(index, /export \{ MessagesNavIcon \} from "\.\/messages\/MessagesNavIcon"/);
  assert.match(index, /export \{ imEnabledHere \} from "\.\.\/lib\/im\/client"/);
  const host = src("shell/messages/MessagesHost.tsx");
  assert.match(host, /if \(!enabled\) return null;/);
  assert.match(host, /<WorkReplayHost \/>/);
  // 连接与深链监听都只在 enabled 时挂上
  assert.match(host, /if \(!enabled\) return undefined;\s*const host = hostState\(\);/);
  assert.match(host, /if \(!enabled\) \{\s*publishImDisabled\(\);\s*return undefined;\s*\}\s*return attachImRealtime\(\);/);
});

test("消息外壳不渲染任何 HTML 字符串", () => {
  for (const file of [
    "shell/messages/MessagesHost.tsx",
    "shell/messages/MessagesLayout.tsx",
    "shell/messages/Inbox.tsx",
    "shell/messages/InboxRow.tsx",
    "shell/messages/InboxFilters.tsx",
    "shell/messages/MessagesNavIcon.tsx",
    "shell/messages/SettingsView.tsx",
    "shell/messages/PrivacyNotice.tsx",
    "lib/im/client.ts",
    "lib/im/inbox-api.ts",
  ]) {
    assert.doesNotMatch(src(file), /dangerouslySetInnerHTML|innerHTML/, file);
  }
});
