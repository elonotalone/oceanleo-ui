// W09：消息搜索——请求参数、筛选翻译、高亮（服务端区间优先，回落 splitHighlights）、摘要。
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const clientStub = dataModule("export async function imFetch(){ throw new Error('no network in tests'); }");
const apiModule = await import(
  await compileModule("src/lib/im/search-api.ts", { "./client": clientStub })
);
const filtersModule = await import(await compileModule("src/shell/messages/search/SearchFilters.tsx", {
  "../../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
}));
const viewModule = await import(
  await compileModule("src/shell/messages/search/SearchView.tsx", {
    "../../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
    "../../../lib/im/messages-api": dataModule("export const messagesApi = { profiles: async () => [], getConversation: async () => ({ members: [] }) };"),
    "../../../lib/im/search-api": dataModule(`
      export const searchApi = { search: async () => ({ items: [], next_cursor: null }), directory: async () => [] };
      export function searchQueryReady(v){ return Array.from(String(v).trim()).length >= 2; }
      export function normalizeSearchQuery(v){ return String(v).trim(); }
    `),
    "../realtime/hooks": dataModule("export function useImInbox(){ return { items: [] }; }"),
    "next-intl": dataModule("export function useLocale(){ return 'zh'; }"),
  })
);

const { buildSearchPath, searchQueryReady, SEARCH_MIN_CHARS } = apiModule;
const { EMPTY_FILTERS, filtersToParams, filtersActive } = filtersModule;
const { highlightSegments, snippetAround, SearchView } = viewModule;

const join = (segments) => segments.map((s) => s.text).join("");

test("至少 2 个字符才搜（中日韩两个字就够，空白不算）", () => {
  assert.equal(SEARCH_MIN_CHARS, 2);
  assert.equal(searchQueryReady("a"), false);
  assert.equal(searchQueryReady("  a  "), false);
  assert.equal(searchQueryReady("会议"), true);
  assert.equal(searchQueryReady("ab"), true);
  assert.equal(searchQueryReady("😀😀"), true);
  assert.equal(searchQueryReady(""), false);
});

test("请求路径：只带有值的筛选，查询词去首尾空白并转义", () => {
  assert.equal(buildSearchPath({ q: "  会议纪要 " }), "/v1/im/search?q=%E4%BC%9A%E8%AE%AE%E7%BA%AA%E8%A6%81");
  const full = buildSearchPath({
    q: "a&b=c",
    conversation_id: "c1",
    from: "u1",
    kind: "image",
    before: "2026-10-06T00:00:00.000Z",
    after: "2026-10-01T00:00:00.000Z",
    cursor: "next-1",
  });
  const url = new URL(full, "https://x.test");
  assert.equal(url.pathname, "/v1/im/search");
  assert.equal(url.searchParams.get("q"), "a&b=c");
  assert.equal(url.searchParams.get("conversation_id"), "c1");
  assert.equal(url.searchParams.get("from"), "u1");
  assert.equal(url.searchParams.get("kind"), "image");
  assert.equal(url.searchParams.get("before"), "2026-10-06T00:00:00.000Z");
  assert.equal(url.searchParams.get("after"), "2026-10-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("cursor"), "next-1");
  const bare = new URL(buildSearchPath({ q: "你好", from: "", kind: "", conversation_id: null }), "https://x.test");
  assert.deepEqual(Array.from(bare.searchParams.keys()), ["q"]);
});

test("筛选翻译：会话、发送人、类型直通；时间预设变成 after", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  assert.deepEqual(filtersToParams(EMPTY_FILTERS, now), {});
  assert.deepEqual(
    filtersToParams({ ...EMPTY_FILTERS, conversationId: "c1", from: "u1", kind: "file" }, now),
    { conversation_id: "c1", from: "u1", kind: "file" },
  );
  assert.equal(filtersToParams({ ...EMPTY_FILTERS, range: "day" }, now).after, "2026-10-05T12:00:00.000Z");
  assert.equal(filtersToParams({ ...EMPTY_FILTERS, range: "week" }, now).after, "2026-09-29T12:00:00.000Z");
  assert.equal(filtersToParams({ ...EMPTY_FILTERS, range: "month" }, now).after, "2026-09-06T12:00:00.000Z");
});

test("自定义时间范围：开始日 00:00 到结束日 23:59:59；非法日期被丢掉", () => {
  const params = filtersToParams({ ...EMPTY_FILTERS, range: "custom", customAfter: "2026-10-01", customBefore: "2026-10-03" });
  assert.equal(new Date(params.after).getTime(), new Date("2026-10-01T00:00:00").getTime());
  assert.equal(new Date(params.before).getTime(), new Date("2026-10-03T23:59:59.999").getTime());
  assert.deepEqual(filtersToParams({ ...EMPTY_FILTERS, range: "custom", customAfter: "不是日期" }), {});
});

test("在某个会话里搜时，会话固定为该会话，不受筛选影响", () => {
  const params = filtersToParams({ ...EMPTY_FILTERS, conversationId: "c-other" }, Date.now(), "c-fixed");
  assert.equal(params.conversation_id, "c-fixed");
  assert.equal(filtersActive(EMPTY_FILTERS), false);
  assert.equal(filtersActive({ ...EMPTY_FILTERS, kind: "text" }), true);
});

test("高亮：服务端给的区间优先；拼回来逐字等于原文", () => {
  const text = "明天下午三点开项目会议，别忘了";
  const segments = highlightSegments(text, [[7, 11]], "会议");
  assert.equal(join(segments), text);
  assert.deepEqual(segments.filter((s) => s.hit).map((s) => s.text), ["项目会议"]);
  assert.equal(segments.filter((s) => s.hit).length, 1);
});

test("高亮：区间越界被截断，重叠的合并，反向的丢掉", () => {
  const text = "abcdefghij";
  const segments = highlightSegments(text, [[2, 5], [4, 7], [8, 99], [6, 3]], "zz");
  assert.equal(join(segments), text);
  assert.deepEqual(segments.filter((s) => s.hit).map((s) => s.text), ["cdefg", "ij"]);
});

test("高亮：没有区间时回落到按查询词匹配（splitHighlights）", () => {
  const segments = highlightSegments("Hello World, hello!", [], "hello");
  assert.equal(join(segments), "Hello World, hello!");
  assert.deepEqual(segments.filter((s) => s.hit).map((s) => s.text), ["Hello", "hello"]);
  const none = highlightSegments("没有命中", [], "不存在");
  assert.deepEqual(none, [{ text: "没有命中", hit: false }]);
});

test("摘要：命中靠后时截一段并加省略号，区间随之平移", () => {
  const body = "前".repeat(100) + "关键词" + "后".repeat(300);
  const ranges = [[100, 103]];
  const snippet = snippetAround(body, ranges);
  assert.ok(snippet.text.startsWith("…"));
  assert.ok(snippet.text.endsWith("…"));
  assert.ok(snippet.text.length <= 145);
  const segments = highlightSegments(snippet.text, snippet.ranges, "x");
  assert.deepEqual(segments.filter((s) => s.hit).map((s) => s.text), ["关键词"]);
  const short = snippetAround("很短", [[0, 1]]);
  assert.equal(short.text, "很短");
});

test("搜索页：能渲染（首屏提示至少输入 2 个字），搜索框是 search 类型", () => {
  const html = renderToStaticMarkup(React.createElement(SearchView, { onOpenResult() {} }));
  assert.match(html, /type="search"/);
  assert.match(html, /至少输入 2 个字/);
  assert.match(html, /data-search-filters/);
});
