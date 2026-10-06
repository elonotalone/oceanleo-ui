// F03：标签页标题前的未读数。假文档 + 假观察器，跑真实 title-badge.ts。
import { test } from "node:test";
import assert from "node:assert/strict";

import { badgeLabel, createTitleBadge } from "../src/shell/messages/notify/title-badge.ts";

function harness(initial = "OceanLeo") {
  const state = { title: initial, writes: 0, observers: new Set() };
  const doc = {
    get title() {
      return state.title;
    },
    set title(value) {
      state.writes += 1;
      state.title = value;
      fire(); // 真浏览器里自己的写入也会触发观察器
    },
  };
  function fire() {
    for (const cb of [...state.observers]) cb();
  }
  const badge = createTitleBadge({
    doc,
    observe(cb) {
      state.observers.add(cb);
      return () => state.observers.delete(cb);
    },
  });
  /** 模拟 Next 换页：页面把标题改成新的（不带前缀）。 */
  const pageSetsTitle = (value) => {
    state.title = value;
    fire();
  };
  return { state, badge, pageSetsTitle };
}

test("0 条：标题一个字都不动，也不写 document.title", () => {
  const h = harness();
  h.badge.setCount(0);
  assert.equal(h.state.title, "OceanLeo");
  assert.equal(h.state.writes, 0);
});

test("1 条与 3 条：前缀是「(n) 原标题」", () => {
  const h = harness();
  h.badge.setCount(1);
  assert.equal(h.state.title, "(1) OceanLeo");
  h.badge.setCount(3);
  assert.equal(h.state.title, "(3) OceanLeo");
});

test("120 条显示 99+，99 条显示 99", () => {
  const h = harness();
  h.badge.setCount(99);
  assert.equal(h.state.title, "(99) OceanLeo");
  h.badge.setCount(120);
  assert.equal(h.state.title, "(99+) OceanLeo");
  assert.equal(badgeLabel(120), "99+");
  assert.equal(badgeLabel(0), "");
  assert.equal(badgeLabel(-4), "");
  assert.equal(badgeLabel(Number.NaN), "");
});

test("读完（回到 0）：恢复页面自己的标题", () => {
  const h = harness();
  h.badge.setCount(5);
  h.badge.setCount(0);
  assert.equal(h.state.title, "OceanLeo");
});

test("换页重写标题：新标题上重新加前缀，不叠成 (3) (3)", () => {
  const h = harness("OceanLeo");
  h.badge.setCount(3);
  h.pageSetsTitle("文档 - OceanLeo");
  assert.equal(h.state.title, "(3) 文档 - OceanLeo");
  h.pageSetsTitle("表格 - OceanLeo");
  assert.equal(h.state.title, "(3) 表格 - OceanLeo");
  assert.equal(h.badge.baseTitle(), "表格 - OceanLeo");
  // 页面用同一个标题重写一遍（Next 常这样）：照样补回前缀
  h.pageSetsTitle("表格 - OceanLeo");
  assert.equal(h.state.title, "(3) 表格 - OceanLeo");
  assert.equal(h.state.title.match(/\(3\)/g).length, 1);
});

test("换页之后数字变化：用新标题，数字更新", () => {
  const h = harness("A");
  h.badge.setCount(2);
  h.pageSetsTitle("B");
  h.badge.setCount(7);
  assert.equal(h.state.title, "(7) B");
  h.badge.setCount(0);
  assert.equal(h.state.title, "B");
});

test("没有未读时页面改标题：不加前缀，也记住新标题", () => {
  const h = harness("A");
  h.pageSetsTitle("B");
  assert.equal(h.state.title, "B");
  h.badge.setCount(1);
  assert.equal(h.state.title, "(1) B");
});

test("观察器还没来得及跑时 setCount 也读到页面的新标题", () => {
  const h = harness("A");
  h.badge.setCount(2);
  h.state.title = "C"; // 页面改了，但观察回调还没触发
  h.badge.setCount(4);
  assert.equal(h.state.title, "(4) C");
});

test("不死循环：同一数字重复设置不再写标题；自己的写入不触发再写", () => {
  const h = harness();
  h.badge.setCount(3);
  const writes = h.state.writes;
  h.badge.setCount(3);
  h.badge.setCount(3);
  assert.equal(h.state.writes, writes);
  assert.equal(writes, 1);
});

test("卸载：恢复原标题并停止观察；之后页面改标题不再被加前缀", () => {
  const h = harness("OceanLeo");
  h.badge.setCount(3);
  h.badge.detach();
  assert.equal(h.state.title, "OceanLeo");
  assert.equal(h.state.observers.size, 0);
  h.pageSetsTitle("别处");
  assert.equal(h.state.title, "别处");
  h.badge.setCount(5);
  assert.equal(h.state.title, "别处");
});

test("消息未启用：不创建徽标就完全不动标题（MessagesHost 只在 enabled 时挂）", async () => {
  const { readFileSync } = await import("node:fs");
  const host = readFileSync(new URL("../src/shell/messages/MessagesHost.tsx", import.meta.url), "utf8");
  const start = host.indexOf("attachBrowserTitleBadge()");
  assert.ok(start > 0, "MessagesHost 没有接标题角标");
  const before = host.slice(Math.max(0, start - 400), start);
  assert.match(before, /if \(!enabled\) return undefined;/, "标题角标必须先判 enabled");
});
