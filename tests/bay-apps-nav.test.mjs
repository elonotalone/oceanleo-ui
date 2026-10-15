// U1：作品栏导航——URL 五值合同、深链、页头发布与「我发布的」作品段。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const links = await import("../src/shell/bay/shell/bay-links.ts");

function src(rel) {
  return readFileSync(join(REPO, "src", rel), "utf8");
}

test("BAY_FEED_KINDS 常量仍是五值（URL 合同），逛页不要求五个 tab 按钮", () => {
  assert.deepEqual([...links.BAY_FEED_KINDS], ["service", "asset", "app", "lesson", "request"]);
  assert.equal(links.DEFAULT_BAY_FEED_KIND, "service");
  const list = src("shell/bay/shell/BayList.tsx");
  assert.match(list, /data-bay-browse-intent="sell"/);
  assert.match(list, /data-bay-browse-intent="buy"/);
  assert.doesNotMatch(list, /BAY_FEED_KINDS\.map\(/);
});

test("normalizeBayFeedKind 认 app，老值仍落到原来的栏", () => {
  assert.equal(links.normalizeBayFeedKind("app"), "app");
  assert.equal(links.canonicalBayFeedKind("app"), "app");
  assert.equal(links.normalizeBayFeedKind("service"), "service");
  assert.equal(links.normalizeBayFeedKind("asset"), "asset");
  assert.equal(links.normalizeBayFeedKind("request"), "request");
  assert.equal(links.normalizeBayFeedKind("supply"), "service");
  assert.equal(links.normalizeBayFeedKind("all"), "service");
  assert.equal(links.normalizeBayFeedKind("consult"), "service");
  assert.equal(links.normalizeBayFeedKind("demand"), "request");
  assert.equal(links.normalizeBayFeedKind("help"), "request");
  assert.equal(links.normalizeBayFeedKind("material"), "asset");
  assert.equal(links.normalizeBayFeedKind("bogus"), null);
  assert.equal(links.canonicalBayFeedKind(""), "service");
});

test("parseBayParam / formatBayParam 对 app 与 app-editor 互逆；非法 id 为 null", () => {
  const app = { kind: "app", id: "work_1" };
  assert.deepEqual(links.parseBayParam("app:work_1"), app);
  assert.equal(links.formatBayParam(app), "app:work_1");
  assert.deepEqual(links.parseBayParam(links.formatBayParam(app)), app);

  const editor = { kind: "app-editor" };
  assert.deepEqual(links.parseBayParam("app-editor"), editor);
  assert.equal(links.formatBayParam(editor), "app-editor");

  const editOne = { kind: "app-editor", appId: "work_1" };
  assert.deepEqual(links.parseBayParam("app-editor:work_1"), editOne);
  assert.equal(links.formatBayParam(editOne), "app-editor:work_1");
  assert.deepEqual(links.parseBayParam(links.formatBayParam(editOne)), editOne);

  assert.equal(links.parseBayParam("app"), null);
  assert.equal(links.parseBayParam("app:"), null);
  assert.equal(links.parseBayParam("app:bad id"), null);
  assert.equal(links.parseBayParam("app:../x"), null);
  assert.equal(links.parseBayParam("app-editor:bad id"), null);
  assert.equal(links.parseBayParam("app-editor:../x"), null);
});

test("sameBayTarget 对作品详情与上架 / 编辑两种目标", () => {
  assert.equal(links.sameBayTarget({ kind: "app", id: "a1" }, { kind: "app", id: "a1" }), true);
  assert.equal(links.sameBayTarget({ kind: "app", id: "a1" }, { kind: "app", id: "a2" }), false);
  assert.equal(links.sameBayTarget({ kind: "app-editor" }, { kind: "app-editor" }), true);
  assert.equal(links.sameBayTarget({ kind: "app-editor", appId: "a1" }, { kind: "app-editor", appId: "a1" }), true);
  assert.equal(links.sameBayTarget({ kind: "app-editor" }, { kind: "app-editor", appId: "a1" }), false);
  assert.equal(links.sameBayTarget({ kind: "app", id: "a1" }, { kind: "app-editor", appId: "a1" }), false);
});

test("LeoBayPage 作品栏渲染 BayAppShelf，页头发布走 startPublish", () => {
  const page = src("shell/bay/shell/LeoBayPage.tsx");
  const list = src("shell/bay/shell/BayList.tsx");
  assert.match(page, /BayAppShelf/);
  assert.match(page, /startPublish\(filter\.category, filter\.kind\)/);
  assert.match(list, /feed === "app"/);
  assert.match(list, /rememberPublishListing\("app"\)/);
  assert.match(list, /kind: "publish"/);
});

test("MyPublishedPane 把作品并进同一张清单", () => {
  const mine = src("shell/bay/mine/MyPublishedPane.tsx");
  assert.match(mine, /listMyBayApps/);
  assert.match(mine, /MineTradeList/);
  assert.doesNotMatch(mine, /MyAppsPane/);
});
