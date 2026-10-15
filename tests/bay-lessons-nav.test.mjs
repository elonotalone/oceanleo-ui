// V1：课程栏导航——URL 五值合同、深链、页头发布与「我的」课程段。
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

test("normalizeBayFeedKind 认 lesson，老值仍落到原来的栏", () => {
  assert.equal(links.normalizeBayFeedKind("lesson"), "lesson");
  assert.equal(links.canonicalBayFeedKind("lesson"), "lesson");
  assert.equal(links.normalizeBayFeedKind("service"), "service");
  assert.equal(links.normalizeBayFeedKind("asset"), "asset");
  assert.equal(links.normalizeBayFeedKind("app"), "app");
  assert.equal(links.normalizeBayFeedKind("request"), "request");
  assert.equal(links.normalizeBayFeedKind("supply"), "service");
  assert.equal(links.normalizeBayFeedKind("material"), "asset");
  assert.equal(links.normalizeBayFeedKind("bogus"), null);
});

test("parseBayParam / formatBayParam 对四种课程目标互逆；非法 id 为 null", () => {
  const lesson = { kind: "lesson", id: "les_1" };
  assert.deepEqual(links.parseBayParam("lesson:les_1"), lesson);
  assert.equal(links.formatBayParam(lesson), "lesson:les_1");
  assert.deepEqual(links.parseBayParam(links.formatBayParam(lesson)), lesson);

  const bundle = { kind: "bundle", id: "bun_1" };
  assert.deepEqual(links.parseBayParam("bundle:bun_1"), bundle);
  assert.equal(links.formatBayParam(bundle), "bundle:bun_1");
  assert.deepEqual(links.parseBayParam(links.formatBayParam(bundle)), bundle);

  const newLesson = { kind: "lesson-editor" };
  assert.deepEqual(links.parseBayParam("lesson-editor"), newLesson);
  assert.equal(links.formatBayParam(newLesson), "lesson-editor");

  const editLesson = { kind: "lesson-editor", lessonId: "les_1" };
  assert.deepEqual(links.parseBayParam("lesson-editor:les_1"), editLesson);
  assert.equal(links.formatBayParam(editLesson), "lesson-editor:les_1");
  assert.deepEqual(links.parseBayParam(links.formatBayParam(editLesson)), editLesson);

  const newBundle = { kind: "bundle-editor" };
  assert.deepEqual(links.parseBayParam("bundle-editor"), newBundle);
  assert.equal(links.formatBayParam(newBundle), "bundle-editor");

  const editBundle = { kind: "bundle-editor", bundleId: "bun_1" };
  assert.deepEqual(links.parseBayParam("bundle-editor:bun_1"), editBundle);
  assert.equal(links.formatBayParam(editBundle), "bundle-editor:bun_1");
  assert.deepEqual(links.parseBayParam(links.formatBayParam(editBundle)), editBundle);

  assert.equal(links.parseBayParam("lesson"), null);
  assert.equal(links.parseBayParam("lesson:"), null);
  assert.equal(links.parseBayParam("lesson:bad id"), null);
  assert.equal(links.parseBayParam("bundle:../x"), null);
  assert.equal(links.parseBayParam("lesson-editor:bad id"), null);
  assert.equal(links.parseBayParam("bundle-editor:../x"), null);
});

test("LeoBayPage 课程栏渲染 BayLessonShelf，页头发布走 startPublish", () => {
  const page = src("shell/bay/shell/LeoBayPage.tsx");
  const list = src("shell/bay/shell/BayList.tsx");
  assert.match(page, /BayLessonShelf/);
  assert.match(page, /startPublish\(filter\.category, filter\.kind\)/);
  assert.match(list, /feed === "lesson"/);
  assert.match(list, /rememberPublishListing\("lesson"\)/);
  assert.match(list, /kind: "publish"/);
});

test("MyPublishedPane 与 MyBoughtPane 都把课程并进同一张清单", () => {
  const published = src("shell/bay/mine/MyPublishedPane.tsx");
  const bought = src("shell/bay/mine/MyBoughtPane.tsx");
  assert.match(published, /listMyBayLessons/);
  assert.match(published, /MineTradeList/);
  assert.doesNotMatch(published, /MyLessonsPane/);
  assert.match(bought, /listBoughtBayLessonOrders/);
  assert.match(bought, /MineTradeList/);
  assert.doesNotMatch(bought, /MyBoughtLessonsPane/);
});
