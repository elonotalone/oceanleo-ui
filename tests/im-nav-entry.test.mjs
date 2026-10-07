// 侧栏不再放「消息」动作项；门户主导航是 LeoChat 整页，子站三者都没有。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NAV_SOURCE, navEntries, navEntryById, navIdsForScope } from "../src/shell/nav-source/index.ts";
import { imEnabledFor } from "../src/shell/messages/messages-family.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");

test("导航里不再有消息动作项；门户有 leochat，子站没有 leochat/bay/messages", () => {
  for (const entry of NAV_SOURCE) {
    assert.equal(entry.action, undefined, `${entry.id} 不应是动作项`);
  }
  for (const scope of ["workspace", "portal"]) {
    assert.equal(navEntries(scope).some((e) => e.id === "messages"), false, `${scope} 默认`);
    assert.equal(
      navEntries(scope, { withPlayground: true, withTalent: true, withMessages: true }).some((e) => e.id === "messages"),
      false,
      `${scope} 全开`,
    );
    assert.equal(navEntries(scope, {}, "footer").some((e) => e.id === "messages"), false, `${scope} footer`);
    assert.equal(navIdsForScope(scope).includes("messages"), false, `${scope} ids`);
    assert.equal(navEntries(scope).some((e) => e.action === "messages"), false, `${scope} 无消息动作项`);
  }
  assert.equal(navEntryById("messages"), undefined);
  assert.equal(NAV_SOURCE.some((e) => e.id === "messages"), false);
  assert.equal(NAV_SOURCE.some((e) => e.id === "bay"), false);

  const portal = navEntries("portal");
  const portalIds = portal.map((e) => e.id);
  const leochat = portal.find((e) => e.id === "leochat");
  assert.ok(leochat);
  assert.equal(leochat.href, "/leochat");
  assert.equal(leochat.iconId, "messages");
  assert.ok(portalIds.indexOf("projects") < portalIds.indexOf("leochat"));
  assert.ok(portalIds.indexOf("leochat") < portalIds.indexOf("workspace"));

  const ws = navEntries("workspace", { withPlayground: true }).map((e) => e.id);
  assert.deepEqual(ws, ["home", "explore", "workspace", "library", "history", "playground"]);
  assert.ok(!ws.includes("leochat"));
  assert.ok(!ws.includes("bay"));
  assert.ok(!ws.includes("messages"));
});

test("可见性判定：境内永远没有消息能力；未登录没有；海外与分身站登录后有", () => {
  assert.equal(imEnabledFor("cn", true), false);
  assert.equal(imEnabledFor("cn", false), false);
  assert.equal(imEnabledFor("com", false), false);
  assert.equal(imEnabledFor("com", true), true);
  assert.equal(imEnabledFor("ws", true), true);
});

test("租户站 workspaceNav 不再映射侧栏消息动作项", () => {
  const source = src("shell/WorkspacePages.tsx");
  assert.doesNotMatch(source, /openMessages/);
  assert.doesNotMatch(source, /MessagesNavIcon/);
  assert.doesNotMatch(source, /withMessages/);
  assert.doesNotMatch(source, /entry\.action/);
});

test("共享外壳消息导出；MessagesHost 在不可用时什么都不渲染", () => {
  const index = src("shell/index.ts");
  assert.match(index, /export \{ MessagesHost \} from "\.\/messages\/MessagesHost"/);
  assert.match(index, /export \{ openMessages, closeMessages \} from "\.\/messages\/host-state"/);
  assert.match(index, /export \{ MessagesNavIcon \} from "\.\/messages\/MessagesNavIcon"/);
  assert.match(index, /export \{ imEnabledHere, useImEnabled \} from "\.\.\/lib\/im\/client"/);
  const host = src("shell/messages/MessagesHost.tsx");
  assert.match(host, /if \(!enabled\) return bayEnabledHere\(\) \? <BayGuestHost \/> : null;/);
  assert.match(host, /<WorkReplayHost \/>/);
  // 连接与深链监听都只在 enabled 时挂上；不可用时关掉状态，cleanup 不再 setEnabled(false)
  assert.match(
    host,
    /if \(!enabled\) \{\s*hostState\(\)\.setEnabled\(false\);\s*return undefined;\s*\}\s*const host = hostState\(\);/,
  );
  assert.match(host, /return host\.attach\(\);/);
  assert.match(host, /if \(!enabled\) \{\s*publishImDisabled\(\);\s*return undefined;\s*\}\s*return attachImRealtime\(\);/);
});

test("useImEnabled：挂载后读 imEnabledHere，切页 useTransition 不能把它打回 false", () => {
  const client = src("lib/im/client.ts");
  assert.match(client, /useState\(false\)/);
  assert.match(client, /setClient\(true\)/);
  assert.match(client, /return client \? imEnabledHere\(\) : snapshot/);
});

test("切页关掉浮层，不把 ?im= 带走", () => {
  const hook = src("shell/nav-source/use-route-navigation.ts");
  assert.match(hook, /closeMessages\(\)/);
  assert.doesNotMatch(hook, /hrefWithOpenMessages/);
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
