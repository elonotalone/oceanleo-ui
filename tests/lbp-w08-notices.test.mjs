// leobay-projects 波 W08：平台通知进 LeoChat（境内外完全一样）、内容处置视图的深链与挂载、未读合计、铃铛去留。
// 纯部分跑真实现（host-state / notice-links / notice-unread / notice-store / open-notice 的执行层，网络与计时器用假的）；
// 渲染部分用 module-bench 把真组件编出来，只给网络与重依赖打桩。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  IM_OPEN_EVENT,
  LAST_VIEW_KEY,
  MESSAGES_VIEWS,
  buildImSearch,
  createHostState,
  hostState,
  isCaseId,
  isSubView,
  parseImDeepLink,
  tabOfView,
} from "../src/shell/messages/host-state.ts";
import { imEnabledFor } from "../src/shell/messages/messages-family.ts";
import { classifyNoticeLink, isModerationKind, noticeIsActionable } from "../src/shell/messages/notices/notice-links.ts";
import { cleanCount, combineUnread, leoChatUnread, unreadBadgeText } from "../src/shell/messages/notices/notice-unread.ts";
import { formatNoticeRowTime, formatNoticeTime } from "../src/shell/messages/notices/notice-present.ts";
import {
  NOTICE_MAX_LIMIT,
  NOTICE_PAGE,
  NOTICE_POLL_MS,
  createNoticeStore,
  emptyNoticeState,
} from "../src/shell/messages/notices/notice-store.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");

// ---------------------------------------------------------------------------
// 假环境
// ---------------------------------------------------------------------------

function makeEnv({ url = "https://oceanleo.com/library?tab=a#x", width = 1280 } = {}) {
  const entries = [{ url, state: {} }];
  let index = 0;
  const handlers = new Map();
  const storage = new Map();
  const fire = (type, event = {}) => {
    for (const handler of Array.from(handlers.get(type) ?? [])) handler(event);
  };
  const env = {
    getLocation() {
      const u = new URL(entries[index].url);
      return { pathname: u.pathname, search: u.search, hash: u.hash };
    },
    history: {
      get state() {
        return entries[index].state;
      },
      pushState(state, _title, next) {
        entries.splice(index + 1);
        entries.push({ url: new URL(next, entries[index].url).href, state });
        index += 1;
      },
      replaceState(state, _title, next) {
        entries[index] = { url: new URL(next, entries[index].url).href, state };
      },
      back() {
        if (index > 0) {
          index -= 1;
          fire("popstate");
        }
      },
    },
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type).delete(handler);
    },
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    viewportWidth: () => width,
  };
  return { env, fire, storage, current: () => entries[index] };
}

function openHost(url) {
  const sim = makeEnv({ url });
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  return { sim, host };
}

// ---------------------------------------------------------------------------
// 1 视图与深链（I-4）
// ---------------------------------------------------------------------------

test("四个视图：常驻标签只有 聊天 / 联系人；通知与内容处置是二级视图，标签仍停在「聊天」", () => {
  assert.deepEqual([...MESSAGES_VIEWS], ["inbox", "people", "notices", "cases"]);
  assert.equal(isSubView("notices"), true);
  assert.equal(isSubView("cases"), true);
  assert.equal(isSubView("inbox"), false);
  assert.equal(isSubView("people"), false);
  assert.equal(tabOfView("inbox"), "inbox");
  assert.equal(tabOfView("notices"), "inbox");
  assert.equal(tabOfView("cases"), "inbox");
  assert.equal(tabOfView("people"), "people");
});

test("深链解析：?im=notices、?im=cases、?im=cases:<id>；不合法的案件 id 整条当没有", () => {
  assert.deepEqual(parseImDeepLink("?im=notices"), { kind: "open", target: { view: "notices" }, inviteCode: null });
  assert.deepEqual(parseImDeepLink("?im=cases"), { kind: "open", target: { view: "cases" }, inviteCode: null });
  const uuid = "7f1c2d3e-aaaa-bbbb-cccc-111122223333";
  assert.deepEqual(parseImDeepLink(`?im=cases:${uuid}`), {
    kind: "open",
    target: { view: "cases", caseId: uuid },
    inviteCode: null,
  });
  // 冒号被编码成 %3A 也是同一个意思
  assert.deepEqual(parseImDeepLink(`?im=cases%3A${uuid}`).target, { view: "cases", caseId: uuid });
  for (const bad of ["?im=cases:", "?im=cases:%20", "?im=cases:a:b", "?im=cases:../x", "?im=cases:%3Cb%3E", "?im=cases:-x"]) {
    assert.equal(parseImDeepLink(bad).kind, "none", bad);
  }
  // 会话 id 的字符集也含冒号（talent:<id>）：cases: 前缀先判，别的前缀照旧是会话
  assert.deepEqual(parseImDeepLink("?im=talent:abc123").target, { conversationId: "talent:abc123" });
  // 既有的值不受影响
  assert.deepEqual(parseImDeepLink("?im=inbox").target, { view: "inbox" });
  assert.deepEqual(parseImDeepLink("?im=people").target, { view: "people" });
  assert.equal(isCaseId("c1"), true);
  assert.equal(isCaseId("a:b"), false);
  assert.equal(isCaseId(""), false);
  assert.equal(isCaseId(12), false);
});

test("深链序列化：notices / cases / cases:<id>（冒号照原样写）；其余参数原样保留；解析与序列化互逆", () => {
  assert.equal(buildImSearch("", { target: { view: "notices" } }), "?im=notices");
  assert.equal(buildImSearch("", { target: { view: "cases" } }), "?im=cases");
  assert.equal(buildImSearch("", { target: { view: "cases", caseId: "c-1" } }), "?im=cases:c-1");
  assert.equal(buildImSearch("?tab=a", { target: { view: "cases", caseId: "c-1" } }), "?tab=a&im=cases:c-1");
  // 非法案件 id 退回 cases，不把任意字符串写进地址栏
  assert.equal(buildImSearch("", { target: { view: "cases", caseId: "a:b" } }), "?im=cases");
  // 会话优先于视图；只有 cases 带 caseId
  assert.equal(buildImSearch("", { target: { conversationId: "c9", view: "cases", caseId: "c-1" } }), "?im=c9");
  assert.equal(buildImSearch("?im=cases:c-1&x=1", null), "?x=1");
  for (const target of [{ view: "notices" }, { view: "cases" }, { view: "cases", caseId: "abc-9" }, { view: "people" }, { view: "inbox" }]) {
    assert.deepEqual(parseImDeepLink(buildImSearch("", { target })).target, target);
  }
});

test("带 ?im=notices / ?im=cases:<id> 进来：直接打开对应视图（案件 id 交给内容处置），地址栏随后清掉", () => {
  const notices = openHost("https://oceanleo.com/projects?im=notices");
  assert.equal(notices.host.getSnapshot().open, true);
  assert.equal(notices.host.getSnapshot().view, "notices");
  assert.equal(notices.host.getSnapshot().conversationId, null);
  assert.equal(notices.host.getSnapshot().caseId, null);
  assert.doesNotMatch(notices.sim.current().url, /im=/);

  const cases = openHost("https://oceanleo.cn/leochat?im=cases:case-42");
  assert.equal(cases.host.getSnapshot().open, true);
  assert.equal(cases.host.getSnapshot().view, "cases");
  assert.equal(cases.host.getSnapshot().caseId, "case-42");
  assert.doesNotMatch(cases.sim.current().url, /im=/);

  const all = openHost("https://oceanleo.com/?im=cases");
  assert.equal(all.host.getSnapshot().view, "cases");
  assert.equal(all.host.getSnapshot().caseId, null);
});

test("oceanleo:im-open 事件：view=notices / view=cases(+caseId)；caseId 只对 cases 有效，坏值丢掉", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();

  sim.fire(IM_OPEN_EVENT, { detail: { view: "cases", caseId: "c-7" } });
  assert.equal(host.getSnapshot().view, "cases");
  assert.equal(host.getSnapshot().caseId, "c-7");

  sim.fire(IM_OPEN_EVENT, { detail: { view: "cases", caseId: "bad:id" } });
  assert.equal(host.getSnapshot().view, "cases");
  assert.equal(host.getSnapshot().caseId, null, "不合法的案件 id 不进状态");

  sim.fire(IM_OPEN_EVENT, { detail: { view: "notices", caseId: "c-7" } });
  assert.equal(host.getSnapshot().view, "notices");
  assert.equal(host.getSnapshot().caseId, null, "caseId 只给 cases");

  sim.fire(IM_OPEN_EVENT, { detail: { view: "people" } });
  assert.equal(host.getSnapshot().view, "people");
  assert.equal(host.getSnapshot().caseId, null);
});

test("进二级视图放下当前会话；切回聊天 / 联系人清掉案件 id；showConversation 回到收件箱", () => {
  const { host } = openHost("https://oceanleo.com/");
  host.open();
  host.showConversation("c1", 5);
  assert.equal(host.getSnapshot().conversationId, "c1");
  host.setView("notices");
  assert.equal(host.getSnapshot().view, "notices");
  assert.equal(host.getSnapshot().conversationId, null);
  assert.equal(host.getSnapshot().highlightSeq, null);

  host.open({ view: "cases", caseId: "c-9" });
  assert.equal(host.getSnapshot().view, "cases");
  assert.equal(host.getSnapshot().caseId, "c-9");
  host.setView("notices");
  assert.equal(host.getSnapshot().view, "notices");
  assert.equal(host.getSnapshot().caseId, null);

  host.setView("cases"); // 没带案件 id：列出全部
  assert.equal(host.getSnapshot().caseId, null);
  host.open({ view: "cases", caseId: "c-9" });
  host.showConversation("c2");
  assert.equal(host.getSnapshot().view, "inbox");
  assert.equal(host.getSnapshot().caseId, null);
  assert.equal(host.getSnapshot().conversationId, "c2");

  // 点名会话的 open 优先于视图
  host.open({ conversationId: "c3", view: "cases", caseId: "c-9" });
  assert.equal(host.getSnapshot().view, "inbox");
  assert.equal(host.getSnapshot().caseId, null);
});

test("内容处置不是常驻入口：不被「上次停在哪」记住；notices 记得住；左下角图标不会落到 cases 上", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.open({ view: "cases", caseId: "c-1" });
  assert.equal(JSON.parse(sim.storage.get(LAST_VIEW_KEY)).view, "inbox", "cases 存成聊天");
  host.setView("notices");
  assert.equal(JSON.parse(sim.storage.get(LAST_VIEW_KEY)).view, "notices");

  // 重新起一个宿主（= 刷新）：停在通知，而不是 cases
  const again = createHostState(sim.env);
  assert.equal(again.getSnapshot().view, "notices");
  // 存档里即便有人手写了 cases，也读不回来
  sim.storage.set(LAST_VIEW_KEY, JSON.stringify({ view: "cases", conversationId: null }));
  assert.equal(createHostState(sim.env).getSnapshot().view, "inbox");

  // 开着 cases 时点左下角图标 = 关；再开 = 回到聊天，而不是 cases
  host.open({ view: "cases" });
  host.toggleWindow();
  assert.equal(host.getSnapshot().open, false);
  host.toggleWindow();
  assert.equal(host.getSnapshot().open, true);
  assert.notEqual(host.getSnapshot().view, "cases");
  assert.equal(host.getSnapshot().caseId, null);
});

// ---------------------------------------------------------------------------
// 2 链接落点（任务书第 2 条）
// ---------------------------------------------------------------------------

const ORDER = "7f1c2d3e-aaaa-bbbb-cccc-111122223333";

test("链接落点：LeoBay 链接走 Bay 深链（订单、需求、作品留言……）", () => {
  const cases = [
    [`/bay?bay=order:${ORDER}`, { kind: "bay", target: { kind: "order", id: ORDER } }],
    ["/bay?bay=demand:d1", { kind: "bay", target: { kind: "demand", id: "d1" } }],
    ["/bay?bay=help:h1", { kind: "bay", target: { kind: "help", id: "h1" } }],
    ["/bay?bay=app:a1&src=follow", { kind: "bay", target: { kind: "app", id: "a1" } }],
    ["/bay?bay=app-thread:t1", { kind: "bay", target: { kind: "app-thread", id: "t1" } }],
    ["/bay?bay=app-manage:a1:feedback", { kind: "bay", target: { kind: "app-manage", appId: "a1", tab: "feedback" } }],
    ["/bay?bay=settings:money", { kind: "bay", target: { kind: "settings", pane: "money" } }],
    ["/bay?bay=settings:vetting", { kind: "bay", target: { kind: "settings", pane: "vetting" } }],
    ["/bay?bay=mine:orders", { kind: "bay", target: { kind: "mine", tab: "bought" } }],
    ["/bay?bay=mine:needs", { kind: "bay", target: { kind: "mine", tab: "published" } }],
    ["/bay", { kind: "bay", target: { kind: "feed" } }],
  ];
  for (const [link, want] of cases) {
    assert.deepEqual(classifyNoticeLink({ kind: "talent.order.new", link }), want, link);
  }
  // 认不出的 bay 参数、带别的筛选参数的 /bay：交给页面自己读（站内跳转），不瞎猜
  assert.deepEqual(classifyNoticeLink({ link: "/bay?bay=nonsense:1" }), { kind: "internal", href: "/bay?bay=nonsense:1" });
  assert.deepEqual(classifyNoticeLink({ link: "/bay?kind=asset" }), { kind: "internal", href: "/bay?kind=asset" });
});

test("链接落点：LeoChat 会话链接打开对应会话（交易会话 = talent:<id>）", () => {
  assert.deepEqual(classifyNoticeLink({ link: "/bay?bay=conversation:t-9" }), { kind: "conversation", conversationId: "talent:t-9" });
  assert.deepEqual(classifyNoticeLink({ link: "/leochat?im=conv-1" }), { kind: "conversation", conversationId: "conv-1" });
  assert.deepEqual(classifyNoticeLink({ link: "/leochat?im=conv-1&im_seq=12" }), {
    kind: "conversation",
    conversationId: "conv-1",
    seq: 12,
  });
  assert.deepEqual(classifyNoticeLink({ link: "/projects/p1?im=talent:x1" }), { kind: "conversation", conversationId: "talent:x1" });
  assert.deepEqual(classifyNoticeLink({ link: "/leochat?c=conv-2" }), { kind: "conversation", conversationId: "conv-2" });
  // 通话推送深链带 call：要让整页去核实来电，不在这里拆
  assert.deepEqual(classifyNoticeLink({ link: "/leochat?c=conv-2&call=call-1" }), {
    kind: "internal",
    href: "/leochat?c=conv-2&call=call-1",
  });
  assert.deepEqual(classifyNoticeLink({ link: "/leochat" }), { kind: "view", view: "inbox" });
  assert.deepEqual(classifyNoticeLink({ link: "/leochat?im=notices" }), { kind: "view", view: "notices" });
  assert.deepEqual(classifyNoticeLink({ link: "/leochat?im=people" }), { kind: "view", view: "people" });
  // 邀请码要走宿主的深链流程（弹接受邀请的对话框）：整页跳转
  assert.equal(classifyNoticeLink({ link: "/leochat?im_invite=Ab3dEf9hIjKl" }).kind, "internal");
});

test("链接落点：内容处置（kind=moderation，或 /account/content-cases、/settings/content-cases、?im=cases）打开 cases 视图", () => {
  const cases = {
    "/account/content-cases": { kind: "cases" },
    "/settings/content-cases": { kind: "cases" },
    "/settings/content-cases/": { kind: "cases" },
    "/account/content-cases/case-7": { kind: "cases", caseId: "case-7" },
    "/settings/content-cases?case=case-8": { kind: "cases", caseId: "case-8" },
    "/leochat?im=cases": { kind: "cases" },
    "/leochat?im=cases:case-9": { kind: "cases", caseId: "case-9" },
    "/?im=cases:case-9": { kind: "cases", caseId: "case-9" },
    "/settings/vault?im=cases": { kind: "cases" },
    // 后端旧版写的绝对地址，两个家族的都认（站内入口两版一样）
    "https://oceanleo.com/account/content-cases": { kind: "cases" },
    "https://oceanleo.cn/account/content-cases": { kind: "cases" },
    "https://oceanbizs.com/account/content-cases": { kind: "cases" },
    "https://oceanleo.com/leochat?im=cases:case-9": { kind: "cases", caseId: "case-9" },
  };
  for (const [link, want] of Object.entries(cases)) {
    assert.deepEqual(classifyNoticeLink({ kind: "x", link }, { pageHost: "oceanleo.com" }), want, link);
    assert.deepEqual(classifyNoticeLink({ kind: "x", link }, { pageHost: "oceanleo.cn" }), want, `${link}（境内页）`);
  }
  // kind=moderation：不管链接写什么都落在 cases；案件 id 以链接为先，其次 meta
  assert.deepEqual(classifyNoticeLink({ kind: "moderation", link: "" }), { kind: "cases" });
  assert.deepEqual(classifyNoticeLink({ kind: "moderation", link: "https://oceanleo.cn/account/content-cases" }), { kind: "cases" });
  assert.deepEqual(classifyNoticeLink({ kind: "moderation", link: "/leochat?im=cases:link-1", meta: { case_id: "meta-1" } }), {
    kind: "cases",
    caseId: "link-1",
  });
  assert.deepEqual(classifyNoticeLink({ kind: "moderation", link: "/leochat?im=cases", meta: { case_id: "meta-1" } }), {
    kind: "cases",
    caseId: "meta-1",
  });
  assert.deepEqual(classifyNoticeLink({ kind: "moderation.counter", link: "", meta: { caseId: "meta-2" } }), {
    kind: "cases",
    caseId: "meta-2",
  });
  assert.deepEqual(classifyNoticeLink({ kind: "moderation", link: "", meta: { case_id: "bad:id" } }), { kind: "cases" });
  assert.equal(isModerationKind("moderation"), true);
  assert.equal(isModerationKind("Moderation"), true);
  assert.equal(isModerationKind("moderation.counter"), true);
  assert.equal(isModerationKind("moderations"), false);
  assert.equal(isModerationKind("talent.order.new"), false);
  assert.equal(isModerationKind(null), false);
});

test("链接落点：其余站内页站内跳转，别的站新窗口，不是 http(s) / 站内路径的一律当没有（fail closed）", () => {
  const ctx = { pageHost: "oceanleo.com" };
  assert.deepEqual(classifyNoticeLink({ link: "/history?task=t1" }, ctx), { kind: "internal", href: "/history?task=t1" });
  assert.deepEqual(classifyNoticeLink({ link: "/settings/vault" }, ctx), { kind: "internal", href: "/settings/vault" });
  assert.deepEqual(classifyNoticeLink({ link: "/projects/p1/join#top" }, ctx), { kind: "internal", href: "/projects/p1/join#top" });
  assert.deepEqual(classifyNoticeLink({ link: "/settings/team?org=o1" }, ctx), { kind: "internal", href: "/settings/team?org=o1" });
  // 同源的绝对地址 = 站内
  assert.deepEqual(classifyNoticeLink({ link: "https://oceanleo.com/history?task=t1" }, ctx), {
    kind: "internal",
    href: "/history?task=t1",
  });
  // 别的主机（含同家族的子站、另一个家族）不能站内跳：新窗口
  assert.deepEqual(classifyNoticeLink({ link: "https://design.oceanleo.com/x?y=1" }, ctx), {
    kind: "external",
    href: "https://design.oceanleo.com/x?y=1",
  });
  assert.deepEqual(classifyNoticeLink({ link: "https://example.com/a" }, ctx), { kind: "external", href: "https://example.com/a" });
  // 用户内容域是独立的可注册域：外链
  assert.equal(classifyNoticeLink({ link: "https://x.oceanleo.app/leochat?im=cases" }, ctx).kind, "external");
  assert.equal(classifyNoticeLink({ link: "https://evil.com/account/content-cases" }, ctx).kind, "external");
  assert.equal(classifyNoticeLink({ link: "https://oceanleo.com.evil.com/account/content-cases" }, ctx).kind, "external");
  // 没给 pageHost 时绝对地址不当站内
  assert.equal(classifyNoticeLink({ link: "https://oceanleo.com/history" }).kind, "external");

  for (const bad of [
    "",
    "   ",
    null,
    undefined,
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<b>x</b>",
    "//evil.com/x",
    "mailto:a@b.c",
    "ftp://oceanleo.com/x",
    "bay?bay=order:1",
    "https://user:pw@oceanleo.com/x",
    `/${"a".repeat(3000)}`,
  ]) {
    assert.deepEqual(classifyNoticeLink({ kind: "x", link: bad }, ctx), { kind: "none" }, String(bad).slice(0, 40));
  }
});

test("链接落点分类不看域名家族：同一条链接在境内页、海外页、分身页得到同一个落点", () => {
  const links = [
    `/bay?bay=order:${ORDER}`,
    "/bay?bay=conversation:t1",
    "/leochat?im=cases:case-1",
    "/account/content-cases",
    "/history?task=t1",
    "/leochat",
  ];
  for (const link of links) {
    const baseline = classifyNoticeLink({ kind: "x", link }, { pageHost: "oceanleo.com" });
    for (const pageHost of ["oceanleo.cn", "www.oceanleo.cn", "oceanbizs.com", "p-0123456789abcdef0123456789abcdef.dev.oceanleo.com", null]) {
      assert.deepEqual(classifyNoticeLink({ kind: "x", link }, { pageHost }), baseline, `${link} @ ${pageHost}`);
    }
  }
});

test("箭头：有地方可去才画；LeoBay 落点在本站没有 LeoBay（境内）时不跳，也就不画", () => {
  assert.equal(noticeIsActionable({ kind: "none" }, true), false);
  assert.equal(noticeIsActionable({ kind: "bay", target: { kind: "feed" } }, true), true);
  assert.equal(noticeIsActionable({ kind: "bay", target: { kind: "feed" } }, false), false);
  for (const kind of ["conversation", "cases", "view", "internal", "external"]) {
    assert.equal(noticeIsActionable({ kind }, false), true, kind);
  }
});

// ---------------------------------------------------------------------------
// 3 未读合计（任务书第 4 条）
// ---------------------------------------------------------------------------

test("未读合计 = 会话未读 + 通知未读；联系人标签只是联系请求；脏值当 0", () => {
  assert.equal(combineUnread(3, 4), 7);
  assert.equal(combineUnread(0, 5), 5);
  assert.equal(combineUnread(5, 0), 5);
  assert.equal(combineUnread(null, undefined), 0);
  assert.equal(combineUnread(-2, 3), 3);
  assert.equal(combineUnread(Number.NaN, 3), 3);
  assert.equal(combineUnread(Infinity, 3), 3);
  assert.equal(combineUnread("5", 1), 1, "字符串不是数字");
  assert.equal(combineUnread(2.9, 1.2), 3, "小数向下取整");
  assert.equal(cleanCount(-1), 0);

  assert.deepEqual(leoChatUnread({ total: 3, requests: 2 }, 4), { chat: 3, notices: 4, requests: 2, total: 7 });
  assert.deepEqual(leoChatUnread(null, 4), { chat: 0, notices: 4, requests: 0, total: 4 });
  assert.deepEqual(leoChatUnread({ total: 3 }, undefined), { chat: 3, notices: 0, requests: 0, total: 3 });

  assert.equal(unreadBadgeText(0), "");
  assert.equal(unreadBadgeText(1), "1");
  assert.equal(unreadBadgeText(99), "99");
  assert.equal(unreadBadgeText(100), "99+");
  assert.equal(unreadBadgeText(combineUnread(60, 50)), "99+");
});

test("时间口径：今天 时:分；昨天；今年 月/日；更早 年/月/日；列表里多带时刻", () => {
  const now = new Date(2026, 9, 23, 15, 30);
  const at = (y, m, d, h = 9, min = 5) => new Date(y, m, d, h, min).toISOString();
  assert.match(formatNoticeRowTime(at(2026, 9, 23), now, "昨天"), /\d/);
  assert.equal(formatNoticeRowTime(at(2026, 9, 22), now, "昨天"), "昨天");
  assert.match(formatNoticeRowTime(at(2026, 8, 3), now, "昨天"), /9.*3|3.*9/);
  assert.match(formatNoticeRowTime(at(2025, 2, 3), now, "昨天"), /2025/);
  assert.equal(formatNoticeRowTime("not a date", now, "昨天"), "");
  assert.equal(formatNoticeRowTime(null, now, "昨天"), "");

  assert.match(formatNoticeTime(at(2026, 9, 22), now, "昨天"), /^昨天 \S+/);
  assert.match(formatNoticeTime(at(2026, 8, 3), now, "昨天"), /\d.*\d.*:|\d.*\d.*：|\d.*\d/);
  assert.match(formatNoticeTime(at(2025, 2, 3), now, "昨天"), /2025/);
  assert.equal(formatNoticeTime(undefined, now, "昨天"), "");
});

// ---------------------------------------------------------------------------
// 4 通知仓：轮询、已读、错误（假网络、假计时器）
// ---------------------------------------------------------------------------

function item(id, over = {}) {
  return {
    id,
    kind: "talent.order.new",
    title: `标题 ${id}`,
    body: `正文 ${id}`,
    link: `/bay?bay=order:${id}`,
    meta: {},
    read_at: null,
    created_at: "2026-10-23T08:00:00Z",
    ...over,
  };
}

function makeStoreHarness({ items = [], unread = null, hidden = false } = {}) {
  const calls = { list: [], markRead: [] };
  const timers = new Map();
  let timerSeq = 0;
  const visibleHandlers = new Set();
  const server = { items: [...items], unread: unread ?? items.filter((i) => !i.read_at).length };
  const gates = { list: null, markRead: null, failList: false, failMarkRead: false };
  let clock = Date.parse("2026-10-23T12:00:00Z");
  const deps = {
    async list(limit) {
      calls.list.push(limit);
      // 响应在发出那一刻就定了（之后服务端再变，这份就是旧的）：门开之前它在路上。
      const snapshot = { items: server.items.slice(0, limit).map((i) => ({ ...i })), unread_count: server.unread };
      if (gates.list) await gates.list.promise;
      if (gates.failList) return { ok: false };
      return { ok: true, data: snapshot };
    },
    async markRead(ids) {
      calls.markRead.push(ids ?? null);
      if (gates.markRead) await gates.markRead.promise;
      if (gates.failMarkRead) return { ok: false };
      const hit = ids ? server.items.filter((i) => ids.includes(i.id) && !i.read_at) : server.items.filter((i) => !i.read_at);
      for (const i of hit) i.read_at = "2026-10-23T12:00:01Z";
      server.unread = Math.max(0, server.unread - hit.length);
      if (!ids) server.unread = 0;
      return { ok: true, data: { updated: hit.length, unread_count: server.unread } };
    },
    now: () => clock,
    setTimer(fn, ms) {
      timerSeq += 1;
      timers.set(timerSeq, { fn, ms });
      return timerSeq;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
    isHidden: () => hidden,
    onVisible(handler) {
      visibleHandlers.add(handler);
      return () => visibleHandlers.delete(handler);
    },
  };
  const store = createNoticeStore(deps);
  return {
    store,
    calls,
    server,
    gates,
    timers,
    visibleHandlers,
    setHidden(value) {
      hidden = value;
    },
    /** 触发唯一在排的那个轮询计时器。 */
    async tick() {
      const [handle, timer] = [...timers.entries()][0] ?? [];
      assert.ok(timer, "有一个在排的轮询计时器");
      timers.delete(handle);
      timer.fn();
      await settle();
    },
  };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("通知仓：第一个使用方开始取并排 60 秒一次的轮询；节奏沿用铃铛的 60 秒", async () => {
  const bell = src("shell/account/NotificationBell.tsx");
  assert.match(bell, /const COUNT_POLL_MS = 60000;/);
  assert.equal(NOTICE_POLL_MS, 60000, "与铃铛原来的轮询节奏相同");

  const h = makeStoreHarness({ items: [item("a"), item("b", { read_at: "2026-10-22T00:00:00Z" })], unread: 5 });
  assert.deepEqual(h.store.getState(), emptyNoticeState());
  const release = h.store.acquire();
  await settle();
  assert.deepEqual(h.calls.list, [NOTICE_PAGE], "一次取最近 30 条（同时拿到全局未读数）");
  const state = h.store.getState();
  assert.equal(state.loaded, true);
  assert.equal(state.loading, false);
  assert.equal(state.unread, 5, "未读数用服务端的全局计数，不是本地数");
  assert.deepEqual(state.items.map((i) => i.id), ["a", "b"]);
  assert.equal(state.hasMore, false);
  assert.equal([...h.timers.values()][0].ms, 60000);
  assert.equal(h.visibleHandlers.size, 1, "标签页切回可见要立即取");

  // 第二个使用方不会再起一份轮询
  const release2 = h.store.acquire();
  await settle();
  assert.equal(h.calls.list.length, 1);
  assert.equal(h.timers.size, 1);

  // 计时器到点：再取一次，并排下一次
  h.server.items.unshift(item("new"));
  h.server.unread = 6;
  await h.tick();
  assert.equal(h.calls.list.length, 2);
  assert.equal(h.store.getState().items[0].id, "new");
  assert.equal(h.store.getState().unread, 6);
  assert.equal(h.timers.size, 1, "下一次已经排上");

  // 最后一个使用方释放：计时器与可见性监听都撤掉；状态留着
  release();
  assert.equal(h.timers.size, 1, "还有一个使用方");
  release2();
  release2();
  assert.equal(h.timers.size, 0);
  assert.equal(h.visibleHandlers.size, 0);
  assert.equal(h.store.getState().items.length, 3);
  assert.equal(h.calls.list.length, 2);
});

test("通知仓：标签页在后台不取；切回可见立即取；取失败留着旧数据并标 error，下一次成功清掉", async () => {
  const h = makeStoreHarness({ items: [item("a")], unread: 1, hidden: false });
  h.store.acquire();
  await settle();
  assert.equal(h.calls.list.length, 1);

  h.setHidden(true);
  await h.tick();
  assert.equal(h.calls.list.length, 1, "后台不取");
  assert.equal(h.timers.size, 1, "但计时器照排");

  h.setHidden(false);
  h.server.unread = 2;
  for (const handler of h.visibleHandlers) handler();
  await settle();
  assert.equal(h.calls.list.length, 2, "切回可见立即取");
  assert.equal(h.store.getState().unread, 2);

  h.gates.failList = true;
  await h.tick();
  assert.equal(h.store.getState().error, true);
  assert.equal(h.store.getState().items.length, 1, "旧数据留着");
  assert.equal(h.store.getState().unread, 2);
  h.gates.failList = false;
  await h.tick();
  assert.equal(h.store.getState().error, false);
});

test("通知仓：第一次就失败 = 没有数据、error；refresh 重试成功后 loaded", async () => {
  const h = makeStoreHarness({ items: [item("a")], unread: 1 });
  h.gates.failList = true;
  h.store.acquire();
  await settle();
  assert.equal(h.store.getState().loaded, false);
  assert.equal(h.store.getState().error, true);
  assert.equal(h.store.getState().loading, false);
  h.gates.failList = false;
  await h.store.refresh();
  assert.equal(h.store.getState().loaded, true);
  assert.equal(h.store.getState().error, false);
});

test("通知仓：标一条已读 = 乐观（立刻变、未读数 -1），服务端的数覆盖；已读的不再发请求", async () => {
  const h = makeStoreHarness({ items: [item("a"), item("b"), item("c", { read_at: "2026-10-22T00:00:00Z" })], unread: 2 });
  h.store.acquire();
  await settle();
  const seen = [];
  h.store.subscribe(() => seen.push(h.store.getState().unread));
  const done = h.store.markRead(["a"]);
  assert.equal(h.store.getState().items[0].read_at != null, true, "乐观：立刻就是已读");
  assert.equal(h.store.getState().unread, 1);
  await done;
  assert.deepEqual(h.calls.markRead, [["a"]]);
  assert.equal(h.store.getState().unread, 1);
  assert.equal(seen[0], 1);

  await h.store.markRead(["c"]);
  await h.store.markRead(["nope"]);
  await h.store.markRead([]);
  assert.equal(h.calls.markRead.length, 1, "已读的、不存在的、空的都不发请求");
});

test("通知仓：全部标为已读 = 全部变已读、未读 0；更早没取下来的未读也由服务端清掉", async () => {
  const many = Array.from({ length: 40 }, (_, i) => item(`n${i}`));
  const h = makeStoreHarness({ items: many, unread: 40 });
  h.store.acquire();
  await settle();
  assert.equal(h.store.getState().items.length, NOTICE_PAGE);
  assert.equal(h.store.getState().unread, 40, "未读数是全局的，比列表里的多");
  assert.equal(h.store.getState().hasMore, true);
  const done = h.store.markAllRead();
  assert.equal(h.store.getState().unread, 0, "乐观：立刻 0");
  assert.equal(h.store.getState().items.every((i) => i.read_at), true);
  await done;
  assert.deepEqual(h.calls.markRead, [null], "不带 ids = 全部");
  assert.equal(h.server.unread, 0);

  // 已经没有未读：不再发请求
  await h.store.markAllRead();
  assert.equal(h.calls.markRead.length, 1);
});

test("通知仓：标已读失败 → 以服务端为准重取（不留骗人的已读）", async () => {
  const h = makeStoreHarness({ items: [item("a"), item("b")], unread: 2 });
  h.store.acquire();
  await settle();
  h.gates.failMarkRead = true;
  const done = h.store.markRead(["a"]);
  assert.equal(h.store.getState().unread, 1);
  await done;
  await settle();
  assert.equal(h.store.getState().unread, 2, "回到服务端的数");
  assert.equal(h.store.getState().items[0].read_at, null);
});

test("通知仓：取数期间用户标了已读，那份旧结果被丢掉再取一次，不闪回未读", async () => {
  const h = makeStoreHarness({ items: [item("a"), item("b")], unread: 2 });
  h.store.acquire();
  await settle();
  // 下一次取数卡住，期间用户点了 a
  h.gates.list = deferred();
  const refreshing = h.store.refresh();
  await settle();
  const seen = [];
  h.store.subscribe(() => seen.push(h.store.getState().unread));
  const marking = h.store.markRead(["a"]);
  assert.equal(h.store.getState().unread, 1);
  // 放开：在路上的那份响应是在标已读之前发出的（那一刻 a 还是未读、未读数 2）
  h.gates.list.resolve();
  h.gates.list = null;
  await refreshing;
  await marking;
  await settle();
  assert.equal(h.store.getState().unread, 1, "没有被旧响应盖回 2");
  assert.equal(h.store.getState().items.find((i) => i.id === "a").read_at != null, true);
  assert.equal(seen.includes(2), false, "中途也没有闪回过 2");
  assert.equal(h.calls.list.length >= 3, true, "丢掉旧结果后又取了一次");
});

test("通知仓：加载更多每次多取一屏（30 → 60 → …），封顶 200；没有更多就不再取", async () => {
  const many = Array.from({ length: 300 }, (_, i) => item(`n${i}`));
  const h = makeStoreHarness({ items: many, unread: 300 });
  h.store.acquire();
  await settle();
  assert.equal(h.store.getState().hasMore, true);
  await h.store.loadMore();
  assert.deepEqual(h.calls.list.slice(-1), [NOTICE_PAGE * 2]);
  assert.equal(h.store.getState().items.length, NOTICE_PAGE * 2);
  // 轮询沿用当前的条数，不会把列表又缩回 30 条
  await h.tick();
  assert.equal(h.calls.list.at(-1), NOTICE_PAGE * 2);
  assert.equal(h.store.getState().items.length, NOTICE_PAGE * 2);
  for (let i = 0; i < 10; i += 1) await h.store.loadMore();
  assert.equal(Math.max(...h.calls.list), NOTICE_MAX_LIMIT);
  assert.equal(h.store.getState().hasMore, false, "到顶就没有更多了");
  const before = h.calls.list.length;
  await h.store.loadMore();
  assert.equal(h.calls.list.length, before);
});

test("通知仓：登出清空（下一位账号看不到上一位的通知），进行中的响应作废；脏条目被滤掉", async () => {
  const h = makeStoreHarness({ items: [item("a")], unread: 1 });
  h.store.acquire();
  await settle();
  assert.equal(h.store.getState().loaded, true);
  h.gates.list = deferred();
  const inflight = h.store.refresh();
  h.store.reset();
  assert.deepEqual(h.store.getState(), emptyNoticeState());
  h.gates.list.resolve();
  await inflight;
  await settle();
  assert.deepEqual(h.store.getState(), emptyNoticeState(), "reset 之前发出的响应不再落进状态");

  const dirty = makeStoreHarness({ items: [item("ok"), { id: "", title: "x" }, null, { id: "t" }], unread: 9 });
  dirty.store.acquire();
  await settle();
  assert.deepEqual(dirty.store.getState().items.map((i) => i.id), ["ok"]);
  assert.equal(makeStoreHarness({ items: [item("a")], unread: -3 }).store.getState().unread, 0);
});

// ---------------------------------------------------------------------------
// 5 执行层：点一条通知（假依赖）
// ---------------------------------------------------------------------------

// 浏览器环境（渲染部分共用）。pretendToBeVisual：document.hidden 为 false，通知仓才会在「切回可见」时取数。
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://oceanleo.cn/leochat",
  pretendToBeVisual: true,
});
dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  requestAnimationFrame: (cb) => setTimeout(() => cb(0), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

/** 各桩共用的可控状态（每个用例开头重置）。 */
function resetW08() {
  globalThis.__w08 = {
    notices: { items: [], unread: 0, loaded: true, loading: false, error: false, hasMore: false },
    calls: { refresh: 0, markAll: 0, loadMore: 0, opened: [], markRead: [] },
    im: { total: 0, requests: 0 },
    imListeners: new Set(),
    noticeListeners: new Set(),
    titleCounts: [],
    pollingArgs: [],
    navigators: [],
    searching: false,
    api: { items: [], unread: 0, fail: false, calls: [] },
  };
  return globalThis.__w08;
}
resetW08();

async function mount(element) {
  const hostEl = document.createElement("div");
  document.body.appendChild(hostEl);
  const root = createRoot(hostEl);
  await act(async () => {
    root.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    host: hostEl,
    root,
    $: (selector) => hostEl.querySelector(selector),
    $$: (selector) => Array.from(hostEl.querySelectorAll(selector)),
    async click(selector) {
      const node = hostEl.querySelector(selector) ?? document.body.querySelector(selector);
      assert.ok(node, selector);
      await act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async rerender(next) {
      await act(async () => {
        root.render(next);
        await Promise.resolve();
      });
    },
    async unmount() {
      await act(() => root.unmount());
      hostEl.remove();
    },
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  });
}

function fakeActions(over = {}) {
  const log = [];
  const actions = {
    openConversation: (id, seq) => log.push(["conversation", id, seq]),
    openCases: (id) => log.push(["cases", id]),
    openView: (view) => log.push(["view", view]),
    openBay: (target) => log.push(["bay", target]),
    navigate: (href) => log.push(["navigate", href]),
    openExternal: (href) => log.push(["external", href]),
    closeWindow: () => log.push(["closeWindow"]),
    bayAvailable: () => true,
    ...over,
  };
  return { actions, log };
}

const openNoticeStubs = {
  "../../../api/notifications": dataModule(`export {}`),
  "../../bay/shell/bay-state": dataModule(`
    export function bayEnabledHere(){ return globalThis.__w08.bayOn !== false; }
    export function openBay(target){ globalThis.__w08.calls.opened.push(["openBay", target]); }
  `),
  "./use-notices": dataModule(`
    export function noticeStore(){
      return { markRead(ids){ globalThis.__w08.calls.markRead.push(ids); return Promise.resolve(); } };
    }
  `),
};
const openNoticeMod = await import(await compileModule("src/shell/messages/notices/open-notice.ts", openNoticeStubs));

test("执行层：会话 / 内容处置 / 栏目留在 LeoChat 里；LeoBay 与站内页先收起小窗再去；外链新窗口不收窗", () => {
  const { runNoticeTarget } = openNoticeMod;
  const run = (target, over) => {
    const { actions, log } = fakeActions(over);
    const went = runNoticeTarget(target, actions);
    return { went, log };
  };

  assert.deepEqual(run({ kind: "conversation", conversationId: "talent:t1" }), {
    went: true,
    log: [["conversation", "talent:t1", undefined]],
  });
  assert.deepEqual(run({ kind: "conversation", conversationId: "c1", seq: 4 }).log, [["conversation", "c1", 4]]);
  assert.deepEqual(run({ kind: "cases", caseId: "case-1" }).log, [["cases", "case-1"]]);
  assert.deepEqual(run({ kind: "cases" }).log, [["cases", undefined]]);
  assert.deepEqual(run({ kind: "view", view: "notices" }).log, [["view", "notices"]]);

  const bay = { kind: "bay", target: { kind: "order", id: "o1" } };
  assert.deepEqual(run(bay).log, [["closeWindow"], ["bay", { kind: "order", id: "o1" }]]);
  assert.deepEqual(run({ kind: "internal", href: "/history?task=t1" }).log, [["closeWindow"], ["navigate", "/history?task=t1"]]);
  assert.deepEqual(run({ kind: "external", href: "https://example.com/x" }).log, [["external", "https://example.com/x"]]);

  // 没有链接：什么都不做；本站没有 LeoBay（境内）：不替用户去另一个家族的站，也不收窗
  assert.deepEqual(run({ kind: "none" }), { went: false, log: [] });
  assert.deepEqual(run(bay, { bayAvailable: () => false }), { went: false, log: [] });
});

test("openNotice：未读的先标已读（不等网络）再去落点；已读的不再标；没有链接的只标已读", () => {
  const w = resetW08();
  const { openNotice, noticeTargetOf, noticeActionable } = openNoticeMod;
  const { actions, log } = fakeActions();
  const store = { markRead: (ids) => w.calls.markRead.push(ids) };

  const target = openNotice(item("o1", { link: "/bay?bay=order:o1" }), actions, store);
  assert.deepEqual(target, { kind: "bay", target: { kind: "order", id: "o1" } });
  assert.deepEqual(w.calls.markRead, [["o1"]]);
  assert.deepEqual(log, [["closeWindow"], ["bay", { kind: "order", id: "o1" }]]);

  log.length = 0;
  openNotice(item("o2", { read_at: "2026-10-22T00:00:00Z", link: "/history?task=t" }), actions, store);
  assert.deepEqual(w.calls.markRead, [["o1"]], "已读的不再发请求");
  assert.deepEqual(log, [["closeWindow"], ["navigate", "/history?task=t"]]);

  log.length = 0;
  assert.deepEqual(openNotice(item("o3", { link: "" }), actions, store), { kind: "none" });
  assert.deepEqual(w.calls.markRead, [["o1"], ["o3"]]);
  assert.deepEqual(log, []);

  // 内容处置通知：落在 cases 视图
  openNotice(item("m1", { kind: "moderation", link: "https://oceanleo.cn/account/content-cases" }), actions, store);
  assert.deepEqual(log, [["cases", undefined]]);

  // 箭头：LeoBay 链接在本站没有 LeoBay 时不画
  assert.equal(noticeActionable(item("o1")), true);
  w.bayOn = false;
  assert.equal(noticeActionable(item("o1")), false);
  assert.equal(noticeActionable(item("x", { link: "/history" })), true);
  assert.equal(noticeActionable(item("x", { link: "" })), false);
  assert.deepEqual(noticeTargetOf(item("o1")).kind, "bay");
});

test("执行层的默认依赖：会话 / 内容处置 / 栏目都经真实的宿主状态；LeoBay 经 openBay；先收窗", () => {
  const w = resetW08();
  const host = hostState();
  host.setEnabled(true);
  const actions = openNoticeMod.browserNoticeActions();

  actions.openConversation("c1", 3);
  assert.deepEqual(
    { open: host.getSnapshot().open, view: host.getSnapshot().view, id: host.getSnapshot().conversationId, seq: host.getSnapshot().highlightSeq },
    { open: true, view: "inbox", id: "c1", seq: 3 },
  );
  actions.openCases("case-1");
  assert.deepEqual(
    { view: host.getSnapshot().view, caseId: host.getSnapshot().caseId, id: host.getSnapshot().conversationId },
    { view: "cases", caseId: "case-1", id: null },
  );
  actions.openCases();
  assert.equal(host.getSnapshot().caseId, null);
  actions.openView("notices");
  assert.equal(host.getSnapshot().view, "notices");
  actions.openView("inbox");
  assert.equal(host.getSnapshot().view, "inbox");

  // 先收窗再去 LeoBay
  actions.closeWindow();
  assert.equal(host.getSnapshot().open, false);
  actions.openBay({ kind: "feed" });
  assert.deepEqual(w.calls.opened, [["openBay", { kind: "feed" }]]);
  assert.equal(actions.bayAvailable(), true);
  w.bayOn = false;
  assert.equal(actions.bayAvailable(), false);

  // 站内跳转：有外壳交进来的 router.push 就用它（不整页刷新）
  const pushed = [];
  openNoticeMod.setNoticeNavigator((href) => pushed.push(href));
  actions.navigate("/history?task=t1");
  assert.deepEqual(pushed, ["/history?task=t1"]);
  openNoticeMod.setNoticeNavigator(null);
  host.setEnabled(false);
});

// ---------------------------------------------------------------------------
// 6 渲染：收件箱通知行、通知视图、二级视图挂载（I-3）
// ---------------------------------------------------------------------------

const noticesHookStub = dataModule(`
  export function useNoticeState(){ return globalThis.__w08.notices; }
  export function noticeStore(){
    const w = globalThis.__w08;
    return {
      refresh(){ w.calls.refresh += 1; return Promise.resolve(); },
      markAllRead(){ w.calls.markAll += 1; return Promise.resolve(); },
      loadMore(){ w.calls.loadMore += 1; return Promise.resolve(); },
    };
  }
`);

const { InboxNoticesRow } = await import(
  await compileModule("src/shell/messages/notices/InboxNoticesRow.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "./use-notices": noticesHookStub,
  })
);

function noticeState(over = {}) {
  return { items: [], unread: 0, loaded: true, loading: false, error: false, hasMore: false, ...over };
}

test("收件箱最上方固定的「通知」行：未读数 + 最新一条标题；没加载 / 没有通知 / 出错各有说法", async () => {
  const w = resetW08();
  const opened = [];
  const row = (props = {}) => React.createElement(InboxNoticesRow, { active: false, onOpen: () => opened.push(1), ...props });

  w.notices = noticeState({ loaded: false, loading: true });
  const view = await mount(row());
  assert.ok(view.$("[data-inbox-notices-row]"));
  assert.equal(view.$("[data-inbox-notices-row]").tagName, "BUTTON");
  assert.match(view.host.textContent, /通知/);
  assert.equal(view.$("[data-notices-latest]").textContent, "", "还没加载完：不写摘要");
  assert.equal(view.$("[data-im-unread]"), null, "没有徽标");

  w.notices = noticeState({ loaded: true });
  await view.rerender(row());
  assert.equal(view.$("[data-notices-latest]").textContent, "还没有通知");

  w.notices = noticeState({ loaded: false, error: true });
  await view.rerender(row());
  assert.equal(view.$("[data-notices-latest]").textContent, "通知暂时打不开");

  const recent = new Date(Date.now() - 60_000).toISOString();
  w.notices = noticeState({
    items: [item("n1", { title: "你收到了一笔新订单", created_at: recent }), item("n2", { title: "更早的一条" })],
    unread: 3,
  });
  await view.rerender(row());
  assert.equal(view.$("[data-notices-latest]").textContent, "你收到了一笔新订单", "摘要是最新一条的标题");
  const badge = view.$("[data-im-unread]");
  assert.equal(badge.textContent, "3");
  assert.equal(badge.getAttribute("data-im-unread-count"), "3");
  assert.equal(badge.getAttribute("aria-label"), "未读 3 条");
  assert.match(view.host.textContent, /\d/, "最新一条的时间");

  // 只有 1 条也写数字（不是只剩一个小红点）；超过 99 写 99+
  w.notices = noticeState({ items: [item("n1")], unread: 1 });
  await view.rerender(row());
  assert.equal(view.$("[data-im-unread]").textContent, "1");
  w.notices = noticeState({ items: [item("n1")], unread: 240 });
  await view.rerender(row());
  assert.equal(view.$("[data-im-unread]").textContent, "99+");
  w.notices = noticeState({ items: [item("n1", { read_at: "2026-10-22T00:00:00Z" })], unread: 0 });
  await view.rerender(row());
  assert.equal(view.$("[data-im-unread]"), null, "全读完：徽标消失");

  // 通知视图开着时亮；点一下打开
  assert.equal(view.$("[data-inbox-notices-row]").getAttribute("aria-current"), null);
  await view.rerender(row({ active: true }));
  assert.equal(view.$("[data-inbox-notices-row]").getAttribute("aria-current"), "true");
  await view.click("[data-inbox-notices-row]");
  assert.equal(opened.length, 1);
  await view.unmount();
});

const noticesViewStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../messages-surface": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function ImBackIcon(){ return React.createElement("i", { "data-back-icon": "" }); }
  `),
  "./open-notice": dataModule(`
    export function noticeActionable(item){ return Boolean(item.link); }
    export function openNotice(item){ globalThis.__w08.calls.opened.push(item.id); }
  `),
  "./use-notices": noticesHookStub,
};
const { NoticesView } = await import(await compileModule("src/shell/messages/notices/NoticesView.tsx", noticesViewStubs));

test("通知视图：标题、正文、时间、已读 / 未读；点一条走 openNotice；全部标记已读；返回", async () => {
  const w = resetW08();
  const backs = [];
  w.notices = noticeState({
    items: [
      item("a", { title: "订单有新的交付", body: "对方已提交交付内容", created_at: new Date().toISOString() }),
      item("b", { title: "合同已签署生效", body: "", read_at: "2026-10-20T00:00:00Z", link: "" }),
      item("c", { title: "付款未成功", body: "请检查付款卡", link: "/settings/billing" }),
    ],
    unread: 2,
  });
  const view = await mount(React.createElement(NoticesView, { onBack: () => backs.push(1) }));
  assert.equal(w.calls.refresh, 1, "点进来先取一次最新的");
  assert.match(view.$("h2").textContent, /通知/);

  const rows = view.$$("[data-notice-row]");
  assert.equal(rows.length, 3);
  const [a, b, c] = rows;
  assert.equal(a.getAttribute("data-notice-unread"), "true");
  assert.ok(a.querySelector("[data-notice-dot]"), "未读有红点");
  assert.match(a.textContent, /订单有新的交付/);
  assert.match(a.textContent, /对方已提交交付内容/);
  assert.match(a.textContent, /\d/, "有时间");
  assert.ok(a.querySelector("[data-notice-go]"), "有链接画箭头");
  assert.equal(b.getAttribute("data-notice-unread"), "false");
  assert.equal(b.querySelector("[data-notice-dot]"), null, "已读没有红点");
  assert.equal(b.querySelector("[data-notice-go]"), null, "没有链接不画箭头");
  assert.equal(c.getAttribute("data-notice-id"), "c");

  await act(() => {
    c.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(w.calls.opened, ["c"]);

  // 全部标记已读：有未读才显示
  assert.ok(view.$("[data-notices-read-all]"));
  assert.match(view.$("[data-notices-read-all]").textContent, /全部标记已读/);
  await view.click("[data-notices-read-all]");
  assert.equal(w.calls.markAll, 1);

  await view.click("[data-notices-back]");
  assert.equal(backs.length, 1);

  w.notices = noticeState({ items: w.notices.items, unread: 0 });
  await view.rerender(React.createElement(NoticesView, { onBack: () => {} }));
  assert.equal(view.$("[data-notices-read-all]"), null, "没有未读：不画「全部标记已读」");
  await view.unmount();
});

test("通知视图：加载中 / 出错重试 / 没有通知 / 旧数据 + 刷新失败 / 加载更多", async () => {
  const w = resetW08();
  const element = () => React.createElement(NoticesView, { onBack: () => {} });

  w.notices = noticeState({ loaded: false, loading: true });
  const view = await mount(element());
  assert.ok(view.$("[data-notices-loading]"));
  assert.match(view.host.textContent, /正在加载…/);

  w.notices = noticeState({ loaded: false, error: true });
  await view.rerender(element());
  assert.ok(view.$("[data-notices-error]"));
  assert.match(view.host.textContent, /通知暂时打不开/);
  const before = w.calls.refresh;
  await view.click("[data-notices-error] button");
  assert.equal(w.calls.refresh, before + 1, "重试 = 再取一次");

  w.notices = noticeState({ loaded: true });
  await view.rerender(element());
  assert.ok(view.$("[data-notices-empty]"));
  assert.match(view.host.textContent, /还没有通知/);
  assert.match(view.host.textContent, /订单、任务、账单和内容处置等平台消息会出现在这里。/);
  assert.equal(view.$("[data-notices-read-all]"), null);

  w.notices = noticeState({ items: [item("a")], unread: 1, error: true });
  await view.rerender(element());
  assert.ok(view.$("[data-notices-stale]"), "留着旧列表，另给一条细提示");
  assert.equal(view.$$("[data-notice-row]").length, 1);

  w.notices = noticeState({ items: [item("a")], unread: 1, hasMore: true });
  await view.rerender(element());
  const more = view.$$("button").find((button) => /加载更多/.test(button.textContent));
  assert.ok(more, "还有更早的：加载更多");
  await act(() => {
    more.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.equal(w.calls.loadMore, 1);
  await view.unmount();
});

test("通知视图：标题与正文只当文字渲染（服务端 / 他人内容里的标签不会变成元素）", async () => {
  const w = resetW08();
  w.notices = noticeState({
    items: [item("x", { title: "<img src=x onerror=alert(1)>", body: "<script>alert(1)</script><b>粗</b>" })],
    unread: 1,
  });
  const view = await mount(React.createElement(NoticesView, { onBack: () => {} }));
  assert.equal(view.host.querySelectorAll("img, script, b").length, 0);
  assert.match(view.host.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(view.host.textContent, /<script>alert\(1\)<\/script>/);
  await view.unmount();
});

// ---- 二级视图的挂载（I-3：MessagesContentCases({ caseId, onBack })）-----------------------------------

globalThis.__w08Sub = { notices: null, cases: null };
const { MessagesSubView } = await import(
  await compileModule("src/shell/messages/notices/MessagesSubView.tsx", {
    "./NoticesView": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function NoticesView(props){
        globalThis.__w08Sub.notices = props;
        return React.createElement("button", { type: "button", "data-stub": "NoticesView", onClick: () => props.onBack() }, "通知视图");
      }
    `),
    "../cases/MessagesContentCases": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function MessagesContentCases(props){
        globalThis.__w08Sub.cases = props;
        return React.createElement("button", { type: "button", "data-stub": "MessagesContentCases", onClick: () => props.onBack && props.onBack() }, "内容处置");
      }
    `),
  })
);

test("二级视图挂载：notices → 通知列表（返回 = 聊天）；cases → MessagesContentCases 带 caseId 与 onBack（返回 = 通知）；别的视图什么都不画", async () => {
  const picked = [];
  const sub = (props) => React.createElement(MessagesSubView, { onSelectView: (view) => picked.push(view), caseId: null, ...props });

  const notices = await mount(sub({ view: "notices" }));
  assert.ok(notices.$('[data-leochat-subview="notices"] [data-stub="NoticesView"]'));
  await notices.click('[data-stub="NoticesView"]');
  assert.deepEqual(picked, ["inbox"]);
  await notices.unmount();

  const cases = await mount(sub({ view: "cases", caseId: "case-42" }));
  assert.ok(cases.$('[data-leochat-subview="cases"] [data-stub="MessagesContentCases"]'));
  assert.equal(globalThis.__w08Sub.cases.caseId, "case-42", "?im=cases:<id> 的 id 原样交给内容处置");
  assert.equal(typeof globalThis.__w08Sub.cases.onBack, "function");
  await cases.click('[data-stub="MessagesContentCases"]');
  assert.deepEqual(picked, ["inbox", "notices"]);
  await cases.unmount();

  const all = await mount(sub({ view: "cases", caseId: null }));
  assert.equal(globalThis.__w08Sub.cases.caseId, null, "没带案件：列出全部");
  await all.unmount();

  for (const view of ["inbox", "people"]) {
    const none = await mount(sub({ view }));
    assert.equal(none.host.innerHTML, "", view);
    await none.unmount();
  }
});

// ---------------------------------------------------------------------------
// 7 三处挂载：整页 / 右侧栏共用的正文、右侧栏、整页、小窗
// ---------------------------------------------------------------------------

const hostStateUrl = pathToFileURL(join(here, "..", "src", "shell", "messages", "host-state.ts")).href;
function resetHost() {
  const host = createHostState(makeEnv().env);
  host.setEnabled(true);
  globalThis.__w08Host = host;
  return host;
}
const hostStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  export { isSubView, tabOfView } from ${JSON.stringify(hostStateUrl)};
  export function hostState(){ return globalThis.__w08Host; }
  export function useMessagesHost(){
    const host = globalThis.__w08Host;
    return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  }
  export function closeMessages(){ globalThis.__w08Host.close(); }
  export function openMessages(target){ globalThis.__w08Host.open(target); }
`);
globalThis.__w08Last = {};
/** 把收到的 props 记下来的占位组件。 */
function propsStub(name) {
  return dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function ${name}(props){
      globalThis.__w08Last.${name} = props;
      return React.createElement("div", {
        "data-stub": ${JSON.stringify(name)},
        "data-view": String(props.view ?? ""),
        "data-case": String(props.caseId ?? ""),
        "data-active": String(props.active ?? ""),
        "data-notices-active": String(props.noticesActive ?? ""),
      }, ${JSON.stringify(name)});
    }
  `);
}
const nullStub = (name) => dataModule(`export function ${name}(){ return null; }`);
const imOnStub = dataModule(`export function useImEnabled(){ return globalThis.__w08ImOn !== false; }`);
globalThis.__w08ImOn = true;
const stylesStub = dataModule(`export function ensureMessagesSurfaceStyles(){}`);
const signInStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function BaySignInPrompt({ text }){ return React.createElement("div", { "data-bay-sign-in": "true" }, text); }
`);

const { LeoChatBody } = await import(
  await compileModule("src/shell/leochat/leochat-body.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../bay/deal": propsStub("DealConversationView"),
    "../messages/conversation/ConversationView": propsStub("ConversationView"),
    "../messages/groups/ConversationInfoPanel": nullStub("ConversationInfoPanel"),
    "../messages/groups/NewConversationDialog": nullStub("NewConversationDialog"),
    "../messages/Inbox": propsStub("Inbox"),
    "../messages/invite/InviteAcceptDialog": nullStub("InviteAcceptDialog"),
    "../messages/host-state": hostStub,
    "../messages/notices/MessagesSubView": propsStub("MessagesSubView"),
    "../messages/people/PeopleView": propsStub("PeopleView"),
  })
);

test("LeoChatBody（整页 / 右侧栏共用）：通知与内容处置占详情位，左边仍是聊天列表；窄屏整块是它们；返回走宿主", async () => {
  const host = resetHost();
  host.open();
  const wide = await mount(React.createElement(LeoChatBody, { wide: true }));
  assert.ok(wide.$('[data-leochat-list] [data-stub="Inbox"]'));
  assert.equal(wide.$('[data-stub="MessagesSubView"]'), null);
  assert.match(wide.host.textContent, /选一个聊天开始/);

  // 收件箱最上面那一行「通知」：Inbox 收到 onOpenNotices，点了就进通知视图
  await act(() => {
    globalThis.__w08Last.Inbox.onOpenNotices();
  });
  assert.equal(host.getSnapshot().view, "notices");
  assert.ok(wide.$('[data-leochat-list] [data-stub="Inbox"]'), "左边仍是聊天列表");
  assert.equal(wide.$('[data-stub="Inbox"]').getAttribute("data-notices-active"), "true", "通知那一行亮着");
  const sub = wide.$('[data-leochat-thread] [data-stub="MessagesSubView"]');
  assert.ok(sub);
  assert.equal(sub.getAttribute("data-view"), "notices");
  assert.doesNotMatch(wide.host.textContent, /选一个聊天开始/);

  // 内容处置：带案件 id 直接展开
  await act(() => {
    host.open({ view: "cases", caseId: "case-7" });
  });
  const cases = wide.$('[data-leochat-thread] [data-stub="MessagesSubView"]');
  assert.equal(cases.getAttribute("data-view"), "cases");
  assert.equal(cases.getAttribute("data-case"), "case-7");
  assert.equal(wide.$('[data-stub="Inbox"]').getAttribute("data-notices-active"), "false");
  // 子视图的返回走宿主：内容处置 → 通知 → 聊天
  await act(() => {
    globalThis.__w08Last.MessagesSubView.onSelectView("notices");
  });
  assert.equal(host.getSnapshot().view, "notices");
  assert.equal(host.getSnapshot().caseId, null);
  await act(() => {
    globalThis.__w08Last.MessagesSubView.onSelectView("inbox");
  });
  assert.equal(host.getSnapshot().view, "inbox");
  assert.equal(wide.$('[data-stub="MessagesSubView"]'), null);

  // 联系人：左边是 PeopleView，没有收件箱（也就没有通知行）
  await act(() => {
    host.setView("people");
  });
  assert.ok(wide.$('[data-stub="PeopleView"]'));
  assert.equal(wide.$('[data-stub="Inbox"]'), null);
  await wide.unmount();

  const host2 = resetHost();
  host2.open();
  const narrow = await mount(React.createElement(LeoChatBody, { wide: false }));
  assert.ok(narrow.$("[data-leochat-list]"));
  assert.equal(narrow.$("[data-leochat-thread]"), null);
  await act(() => {
    host2.setView("notices");
  });
  assert.equal(narrow.$("[data-leochat-list]"), null, "窄屏：通知占整块");
  assert.ok(narrow.$('[data-leochat-thread] [data-stub="MessagesSubView"]'));
  await act(() => {
    host2.open({ view: "cases", caseId: "c-1" });
  });
  assert.equal(narrow.$('[data-stub="MessagesSubView"]').getAttribute("data-case"), "c-1");
  await act(() => {
    host2.setView("inbox");
  });
  assert.ok(narrow.$("[data-leochat-list]"));
  assert.equal(narrow.$("[data-leochat-thread]"), null);
  await narrow.unmount();
});

globalThis.__w08.unread = { chat: 0, notices: 0, requests: 0, total: 0 };
const useLeoChatUnreadStub = dataModule(`
  export function useLeoChatUnread(){ return globalThis.__w08.unread; }
  export function useNoticePolling(){}
`);
const bodyStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function LeoChatBody({ wide }){ return React.createElement("div", { "data-leochat-body": wide ? "wide" : "narrow" }); }
`);

const { LeoChatPanel } = await import(
  await compileModule("src/shell/leochat/LeoChatPanel.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/im/client": imOnStub,
    "../bay/shell/BayMine": signInStub,
    "../messages/host-state": hostStub,
    "../messages/messages-surface": stylesStub,
    "../messages/notices/use-notices": useLeoChatUnreadStub,
    "./leochat-body": bodyStub,
  })
);

test("右侧栏：通知 / 内容处置打开时顶上的标签收起，右侧栏的「返回」先退它们（cases → 通知 → 聊天）；聊天标签的数字含通知", async () => {
  const w = resetW08();
  w.unread = { chat: 2, notices: 3, requests: 4, total: 5 };
  const host = resetHost();
  const backs = [];
  const view = await mount(
    React.createElement(LeoChatPanel, { active: true, request: null, onBackChange: (back) => backs.push(back) }),
  );
  await flush();
  const lastBack = () => backs.at(-1);
  assert.equal(host.getSnapshot().surface, "panel");
  assert.ok(view.$('[role="tablist"]'), "列表：有标签");
  const tabs = view.$$('[role="tab"]');
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].textContent.replace(/\s/g, ""), "聊天5", "聊天标签 = 会话未读 + 通知未读");
  assert.equal(tabs[1].textContent.replace(/\s/g, ""), "联系人4", "联系人标签只是联系请求");
  assert.equal(lastBack(), null, "列表是最上一层：没有上一步");

  await act(() => {
    host.setView("notices");
  });
  assert.equal(view.$('[role="tablist"]'), null, "通知占整块：标签收起");
  assert.equal(typeof lastBack(), "function");
  await act(() => {
    host.open({ view: "cases", caseId: "c-1" });
  });
  assert.equal(view.$('[role="tablist"]'), null);
  await act(() => {
    lastBack()();
  });
  assert.equal(host.getSnapshot().view, "notices", "内容处置 → 通知");
  await act(() => {
    lastBack()();
  });
  assert.equal(host.getSnapshot().view, "inbox", "通知 → 聊天");
  assert.ok(view.$('[role="tablist"]'));
  assert.equal(lastBack(), null);
  await view.unmount();
});

const { LeoChatPage } = await import(
  await compileModule("src/shell/leochat/LeoChatPage.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/auth/client": dataModule(`export async function accessToken(){ return "t"; }`),
    "../../lib/im/client": imOnStub,
    "../bay/shell/BayMine": signInStub,
    // 整页不需要知道 LeoBay 在不在本站（只剩 setBaySiteKey）：它要是还引 bayEnabledHere，这里链接就会失败。
    "../bay/shell/bay-state": dataModule(`export function setBaySiteKey(){}`),
    "../messages/host-state": hostStub,
    "../messages/messages-surface": stylesStub,
    "../messages/notices/use-notices": useLeoChatUnreadStub,
    "./leochat-body": bodyStub,
  })
);

test("整页：境内外同一页；聊天标签的数字含通知；通知 / 内容处置时标签仍停在「聊天」", async () => {
  const w = resetW08();
  w.unread = { chat: 1, notices: 6, requests: 0, total: 7 };
  const host = resetHost();
  const view = await mount(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  await flush();
  assert.equal(view.$("[data-leochat-page]").getAttribute("data-leochat-page"), "ready");
  assert.equal(host.getSnapshot().surface, "page");
  const chat = () => view.$('[role="tab"][data-view="inbox"]');
  const people = () => view.$('[role="tab"][data-view="people"]');
  assert.equal(chat().textContent.replace(/\s/g, ""), "聊天7");
  assert.equal(people().querySelector("[data-im-tab-badge]"), null);
  assert.equal(chat().getAttribute("aria-selected"), "true");

  await act(() => {
    host.setView("notices");
  });
  assert.equal(chat().getAttribute("aria-selected"), "true", "通知挂在「聊天」下面");
  assert.equal(people().getAttribute("aria-selected"), "false");
  await act(() => {
    host.open({ view: "cases", caseId: "c-1" });
  });
  assert.equal(chat().getAttribute("aria-selected"), "true");
  await act(() => {
    host.setView("people");
  });
  assert.equal(people().getAttribute("aria-selected"), "true");
  assert.equal(chat().getAttribute("aria-selected"), "false");
  // 点「聊天」回到收件箱（不是停在通知上）
  await view.click('[role="tab"][data-view="inbox"]');
  assert.equal(host.getSnapshot().view, "inbox");
  await view.unmount();
});

// ---------------------------------------------------------------------------
// 8 入口角标（真实的通知仓 + 假网络）：会话未读 + 通知未读；切回标签页立即取
// ---------------------------------------------------------------------------

const apiStub = dataModule(`
  export async function listNotifications(limit){
    const api = globalThis.__w08.api;
    api.calls.push(["list", limit]);
    if (api.fail) return { ok: false };
    return { ok: true, data: { items: api.items.slice(0, limit), unread_count: api.unread } };
  }
  export async function markNotificationsRead(ids){
    const api = globalThis.__w08.api;
    api.calls.push(["read", ids ?? null]);
    return { ok: true, data: { updated: 0, unread_count: api.unread } };
  }
`);

const buttonMod = await import(
  await compileModule("src/shell/leochat/LeoChatButton.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/im/client": imOnStub,
    "../bay/shell/bay-state": dataModule(`
      export function useBayEnabled(){ return false; }
      export function attachBayDeepLinks(){ return () => {}; }
    `),
    "../messages/host-state": hostStub,
    "../messages/messages-surface": stylesStub,
    // 会话未读由 IM 状态仓给；这里给个可控的假的。通知那一份走真实的 use-notices + 上面的假网络。
    "../messages/realtime/hooks": dataModule(`export function useImUnread(){ return globalThis.__w08.im; }`),
    "../../../api/notifications": apiStub,
  })
);
const { LeoChatButton } = buttonMod;

test("入口角标 = 会话未读 + 通知未读（真实的通知仓）；切回标签页立即取一次；卸载后不再取", async () => {
  const w = resetW08();
  resetHost();
  globalThis.__w08ImOn = true;
  w.im = { total: 2, requests: 0 };
  w.api.items = [item("n1"), item("n2"), item("n3")];
  w.api.unread = 3;

  const view = await mount(React.createElement(LeoChatButton));
  await flush();
  assert.deepEqual(w.api.calls[0], ["list", 30], "登录就取一次最近 30 条");
  const badge = () => view.$("[data-leochat-badge]");
  assert.equal(badge().textContent, "5", "2 条会话未读 + 3 条通知未读");
  assert.equal(view.$("[data-leochat-open]").getAttribute("aria-label"), "LeoChat：5 条新消息");

  // 新通知到了（服务端多了 1 条）；会话未读也变了：用户切回标签页 → 立即取一次，角标跟着变
  w.api.unread = 4;
  w.im = { total: 1, requests: 0 };
  const callsBefore = w.api.calls.length;
  await act(async () => {
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    await Promise.resolve();
  });
  await flush();
  assert.equal(w.api.calls.length, callsBefore + 1);
  assert.equal(badge().textContent, "5", "1 + 4");

  // 通知全读完、会话也没有未读：角标消失
  w.api.unread = 0;
  w.im = { total: 0, requests: 0 };
  await act(async () => {
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    await Promise.resolve();
  });
  await flush();
  assert.equal(badge(), null);

  // 只有通知未读也要亮（境内外都一样）
  w.api.unread = 120;
  await act(async () => {
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    await Promise.resolve();
  });
  await flush();
  assert.equal(badge().textContent, "99+");

  await view.unmount();
  const afterUnmount = w.api.calls.length;
  await act(async () => {
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    await Promise.resolve();
  });
  await flush();
  assert.equal(w.api.calls.length, afterUnmount, "最后一个使用方卸载就停，不再取");
});

test("入口角标：未登录不画、不取通知（登录态是唯一的开关，不看域名家族）", async () => {
  const w = resetW08();
  resetHost();
  globalThis.__w08ImOn = false;
  w.api.items = [item("n1")];
  w.api.unread = 9;
  const view = await mount(React.createElement(LeoChatButton));
  await flush();
  assert.equal(view.$("[data-leochat-button]"), null);
  assert.equal(w.api.calls.length, 0);
  await view.unmount();
  globalThis.__w08ImOn = true;
});

// ---------------------------------------------------------------------------
// 9 小窗宿主：通知轮询、标题未读、二级视图、标签数字
// ---------------------------------------------------------------------------

const hostBench = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function MessagesLayout(props){
    return React.createElement("div", { "data-testid": "messages-overlay", "data-show-detail": String(props.showDetail) },
      React.createElement("div", { "data-slot": "tabs" }, props.tabs),
      React.createElement("div", { "data-slot": "list" }, props.list),
      React.createElement("div", { "data-slot": "detail" }, props.detail));
  }
`);
const { MessagesHost } = await import(
  await compileModule("src/shell/messages/MessagesHost.tsx", {
    "next/navigation": dataModule(`
      export function usePathname(){ return "/library"; }
      export function useRouter(){ return globalThis.__w08.router; }
    `),
    "../../lib/im/client": imOnStub,
    "../../lib/im/notify-api": dataModule(`
      export function cachedImSettings(){ return {}; }
      export function refreshImSettingsInBackground(){}
    `),
    "../bay/deal": propsStub("DealConversationView"),
    "../bay/shell/bay-auth-host": nullStub("BayAuthHost"),
    "../bay/shell/bay-state": dataModule(`export function setBayNavigator(fn){ globalThis.__w08.navigators.push(["bay", fn]); }`),
    "../leochat/LeoChatTabs": propsStub("LeoChatTabs"),
    "../replay/work/WorkReplayHost": nullStub("WorkReplayHost"),
    "./conversation/ConversationView": propsStub("ConversationView"),
    "./groups/ConversationInfoPanel": nullStub("ConversationInfoPanel"),
    "./groups/NewConversationDialog": nullStub("NewConversationDialog"),
    "./Inbox": propsStub("Inbox"),
    "./invite/InviteAcceptDialog": nullStub("InviteAcceptDialog"),
    "./host-state": hostStub,
    "./MessagesLayout": hostBench,
    "./notices/MessagesSubView": propsStub("MessagesSubView"),
    "./notices/open-notice": dataModule(`export function setNoticeNavigator(fn){ globalThis.__w08.navigators.push(["notice", fn]); }`),
    "./notices/use-notices": dataModule(`
      export function useNoticePolling(enabled){ globalThis.__w08.pollingArgs.push(enabled); }
      export function useLeoChatUnread(){ return globalThis.__w08.unread; }
      export function noticeStore(){
        const w = globalThis.__w08;
        return {
          getState(){ return { unread: w.noticeUnread }; },
          subscribe(fn){ w.noticeListeners.add(fn); return () => w.noticeListeners.delete(fn); },
          refresh(){ w.calls.refresh += 1; return Promise.resolve(); },
        };
      }
    `),
    "./call/ui": dataModule(`export function CallHost(){ return null; } export function CallParticipantMenu(){ return null; }`),
    "./call/incoming": nullStub("IncomingCallHost"),
    "./call/control": dataModule(`export function CallControlHost(){ return null; } export function CallControlBanner(){ return null; }`),
    "./notify/sound": dataModule(`
      export function attachMessageSound(){ return () => {}; }
      export function createBrowserMessageSound(){ return {}; }
    `),
    "./notify/title-badge": dataModule(`
      export function attachBrowserTitleBadge(){
        return { setCount(n){ globalThis.__w08.titleCounts.push(n); }, detach(){ globalThis.__w08.titleDetached = true; } };
      }
    `),
    "./people/PeopleView": propsStub("PeopleView"),
    "./PrivacyNotice": nullStub("PrivacyNotice"),
    "../realtime-call/RealtimeCallHost": nullStub("RealtimeCallHost"),
    "./realtime/hooks": dataModule(`
      export function attachImRealtime(){ return () => {}; }
      export function publishImDisabled(){}
      export function imStore(){
        const w = globalThis.__w08;
        return {
          unread(){ return w.im; },
          subscribe(fn){ w.imListeners.add(fn); return () => w.imListeners.delete(fn); },
          setForegroundConversation(){},
          clearConversationUnread(){},
        };
      }
    `),
  })
);

test("小窗宿主：登录就轮询通知；标签页标题 = 会话未读 + 通知未读（任一变了都跟着变）；站内跳转交给通知", async () => {
  const w = resetW08();
  const host = resetHost();
  w.router = { push() {} };
  w.im = { total: 2, requests: 1 };
  w.noticeUnread = 3;
  w.unread = { chat: 2, notices: 3, requests: 1, total: 5 };
  globalThis.__w08ImOn = true;

  const view = await mount(React.createElement(MessagesHost));
  await flush();
  assert.deepEqual(w.pollingArgs.at(-1), true, "登录就轮询通知（和 IM 连接同一个开关）");
  assert.equal(w.navigators.some(([which, fn]) => which === "notice" && typeof fn === "function"), true, "通知里的站内链接走外壳的 router.push");
  assert.equal(w.titleCounts.at(-1), 5, "标题数字 = 2 + 3");

  // 会话未读变了
  w.im = { total: 6, requests: 1 };
  await act(() => {
    for (const fn of w.imListeners) fn();
  });
  assert.equal(w.titleCounts.at(-1), 9);
  // 通知未读变了
  w.noticeUnread = 0;
  await act(() => {
    for (const fn of w.noticeListeners) fn();
  });
  assert.equal(w.titleCounts.at(-1), 6);
  w.im = { total: 0, requests: 0 };
  w.noticeUnread = 0;
  await act(() => {
    for (const fn of w.imListeners) fn();
  });
  assert.equal(w.titleCounts.at(-1), 0);

  // LeoChat 一打开就取一次最新的
  const before = w.calls.refresh;
  await act(() => {
    host.open();
  });
  await flush();
  assert.equal(w.calls.refresh > before, true);

  await view.unmount();
  assert.equal(w.titleDetached, true, "卸载时标题前缀去掉");
});

test("小窗宿主：通知视图在详情位、左边仍是聊天列表且通知行亮着；cases 带案件 id；标签数字含通知，标签停在「聊天」", async () => {
  const w = resetW08();
  const host = resetHost();
  w.router = { push() {} };
  w.unread = { chat: 2, notices: 3, requests: 1, total: 5 };
  w.im = { total: 2, requests: 1 };
  host.open();
  const view = await mount(React.createElement(MessagesHost));
  await flush();

  const inList = () => view.$('[data-slot="list"] [data-stub="Inbox"]');
  const detail = () => view.$('[data-slot="detail"] [data-stub="MessagesSubView"]');
  assert.ok(inList());
  assert.equal(detail(), null);
  assert.equal(view.$('[data-testid="messages-overlay"]').getAttribute("data-show-detail"), "false");
  assert.equal(globalThis.__w08Last.LeoChatTabs.badges.inbox, 5, "聊天标签 = 会话 + 通知");
  assert.equal(globalThis.__w08Last.LeoChatTabs.badges.people, 1, "联系人标签只是联系请求");
  assert.equal(globalThis.__w08Last.LeoChatTabs.active, "inbox");

  // 点收件箱最上面的「通知」行
  await act(() => {
    globalThis.__w08Last.Inbox.onOpenNotices();
  });
  assert.equal(host.getSnapshot().view, "notices");
  assert.ok(inList(), "左边仍是聊天列表");
  assert.equal(inList().getAttribute("data-notices-active"), "true");
  assert.equal(detail().getAttribute("data-view"), "notices");
  assert.equal(view.$('[data-testid="messages-overlay"]').getAttribute("data-show-detail"), "true", "窄屏 / 小窗里整块是通知");
  assert.equal(globalThis.__w08Last.LeoChatTabs.active, "inbox", "标签仍停在「聊天」");

  // 深链 / 通知把它带到内容处置：案件 id 交给内容处置视图；不在任何标签里
  await act(() => {
    host.open({ view: "cases", caseId: "case-9" });
  });
  assert.equal(detail().getAttribute("data-view"), "cases");
  assert.equal(detail().getAttribute("data-case"), "case-9");
  assert.equal(globalThis.__w08Last.LeoChatTabs.active, "inbox");
  assert.equal(inList().getAttribute("data-notices-active"), "false");

  // 子视图的返回：内容处置 → 通知 → 聊天
  await act(() => {
    globalThis.__w08Last.MessagesSubView.onSelectView("notices");
  });
  assert.equal(detail().getAttribute("data-view"), "notices");
  await act(() => {
    globalThis.__w08Last.MessagesSubView.onSelectView("inbox");
  });
  assert.equal(detail(), null);

  // 联系人：左边是 PeopleView（没有通知行）
  await act(() => {
    globalThis.__w08Last.LeoChatTabs.onSelect("people");
  });
  assert.ok(view.$('[data-slot="list"] [data-stub="PeopleView"]'));
  assert.equal(inList(), null);
  assert.equal(globalThis.__w08Last.LeoChatTabs.active, "people");
  await view.unmount();
});

// ---------------------------------------------------------------------------
// 10 收件箱挂「通知」行（境内外同一套，显式断言不分叉）
// ---------------------------------------------------------------------------

const { Inbox } = await import(
  await compileModule("src/shell/messages/Inbox.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "./realtime/hooks": dataModule(`
      export function useImInbox(){ return { items: [], filter: "all", loaded: true, loading: false, error: null, nextCursor: null }; }
      export function useImConnection(){ return "open"; }
      export function useImResync(){}
      export function imStore(){ return { inbox(){ return { loaded: true, filter: "all" }; }, loadInbox(){}, loadMoreInbox(){} }; }
    `),
    "../../lib/im/inbox-api": dataModule(`export async function fetchDraftConversationIds(){ return new Set(); }`),
    "../../lib/im/groups-api": dataModule(`export async function clearConversationHistory(){} export async function markConversationUnread(){} export async function patchMySettings(){}`),
    "../../lib/im/people-api": dataModule(`export function reasonOf(_e, fallback){ return fallback; }`),
    "../../lib/im/search-api": dataModule(`export function searchQueryReady(){ return globalThis.__w08.searching; }`),
    "../../ui": dataModule(`export function ConfirmDialog(){ return null; }`),
    "./InboxRow": nullStub("InboxRow"),
    "./people/InviteLinkDialog": nullStub("InviteLinkDialog"),
    "./search/SearchView": nullStub("SearchView"),
    "./call/chat/InboxCallBadge": nullStub("InboxCallDecor"),
    // InboxNoticesRow 用真的，只把它读的通知仓换成可控的。
    "./notices/use-notices": noticesHookStub,
  })
);

test("收件箱：最上方固定一行「通知」（在搜索框与会话列表之间），点开进通知视图；搜索时不画", async () => {
  const w = resetW08();
  w.notices = noticeState({ items: [item("n1", { title: "付款未成功" })], unread: 2 });
  const opened = [];
  const inbox = (props = {}) =>
    React.createElement(Inbox, {
      activeConversationId: null,
      onOpenConversation() {},
      onNew() {},
      onOpenNotices: () => opened.push(1),
      ...props,
    });
  const view = await mount(inbox());
  const row = view.$("[data-inbox-notices-row]");
  assert.ok(row, "收件箱里有通知行");
  assert.match(row.textContent, /通知/);
  assert.match(row.textContent, /付款未成功/);
  assert.equal(row.querySelector("[data-im-unread]").textContent, "2");

  // 位置：工具条 → 通知行 → 会话列表
  const toolbar = view.$("[data-leochat-toolbar]");
  const list = view.$(".overflow-y-auto");
  assert.ok(toolbar.compareDocumentPosition(row) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(row.compareDocumentPosition(list) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(list.contains(row), false, "固定在列表外，不随会话一起滚走");

  await view.click("[data-inbox-notices-row]");
  assert.equal(opened.length, 1);

  await view.rerender(inbox({ noticesActive: true }));
  assert.equal(view.$("[data-inbox-notices-row]").getAttribute("aria-current"), "true");

  w.searching = true;
  await view.rerender(inbox());
  assert.equal(view.$("[data-inbox-notices-row]"), null, "搜索结果替换列表，通知行也让位");
  w.searching = false;
  await view.rerender(inbox());
  assert.ok(view.$("[data-inbox-notices-row]"));
  await view.unmount();
});

test("境内外完全一样：三个域名家族的页面上，收件箱的通知行与未读标记逐字相同；imEnabledFor 对三个家族都只看是否登录", async () => {
  for (const family of ["com", "cn", "ws"]) {
    assert.equal(imEnabledFor(family, true), true, `${family} 登录后有 LeoChat（含通知）`);
    assert.equal(imEnabledFor(family, false), false, `${family} 未登录没有`);
  }
  const w = resetW08();
  w.notices = noticeState({ items: [item("n1", { title: "合同已签署生效", created_at: "2026-10-20T08:00:00Z" })], unread: 4 });
  const htmls = {};
  for (const host of ["oceanleo.com", "oceanleo.cn", "oceanbizs.com"]) {
    dom.reconfigure({ url: `https://${host}/leochat` });
    const view = await mount(
      React.createElement(Inbox, { activeConversationId: null, onOpenConversation() {}, onNew() {}, onOpenNotices() {} }),
    );
    htmls[host] = view.$("[data-inbox-notices-wrap]").outerHTML;
    assert.ok(htmls[host].includes("data-inbox-notices-row"), host);
    await view.unmount();
  }
  assert.equal(htmls["oceanleo.cn"], htmls["oceanleo.com"]);
  assert.equal(htmls["oceanbizs.com"], htmls["oceanleo.com"]);
  dom.reconfigure({ url: "https://oceanleo.cn/leochat" });
});

// ---------------------------------------------------------------------------
// 11 铃铛去留、不分叉的源码守卫、文案
// ---------------------------------------------------------------------------

test("铃铛：从侧栏账号区拿掉；文件与公开导出保留（别处还在引用），不再被渲染", () => {
  const cluster = src("shell/account/SidebarAccountCluster.tsx");
  assert.doesNotMatch(cluster, /NotificationBell/);
  assert.match(cluster, /<LeoChatButton className="leo-tap-target-inner" \/>/);
  assert.match(cluster, /<DeviceStatusPopover className="leo-tap-target-inner" \/>/);
  const accountIndex = src("shell/account/index.ts");
  assert.match(accountIndex, /export \{ NotificationBell \} from "\.\/NotificationBell"/);
  const bell = src("shell/account/NotificationBell.tsx");
  assert.match(bell, /export function NotificationBell/);
  assert.match(bell, /已不再渲染/);
  // 全仓除了定义与导出，没有任何组件再 <NotificationBell …/>
  for (const file of ["shell/AppShell.tsx", "shell/leochat/LeoChatButton.tsx", "shell/messages/MessagesHost.tsx"]) {
    assert.doesNotMatch(src(file), /<NotificationBell/, file);
  }
});

test("不按域名分叉：通知相关的渲染、状态仓、挂载文件里没有任何域名家族 / LeoBay 在不在本站的分支", () => {
  const forkTokens = /currentDomainFamily|bayEnabledHere|useBayEnabled|familyForHost|isCurrentFamily|DOMAIN_FAMILIES|DomainFamily|portalHref|\bcn\b|isCn\b|is_cn/;
  const files = [
    "shell/messages/notices/InboxNoticesRow.tsx",
    "shell/messages/notices/NoticesView.tsx",
    "shell/messages/notices/MessagesSubView.tsx",
    "shell/messages/notices/notice-store.ts",
    "shell/messages/notices/notice-unread.ts",
    "shell/messages/notices/notice-present.ts",
    "shell/messages/notices/use-notices.ts",
    "shell/messages/Inbox.tsx",
    "shell/messages/MessagesHost.tsx",
    "shell/leochat/leochat-body.tsx",
    "shell/leochat/LeoChatPage.tsx",
    "shell/leochat/LeoChatPanel.tsx",
  ];
  for (const file of files) {
    const text = src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(text, forkTokens, `${file} 不许按域名家族分叉`);
  }
  // 唯一读「LeoBay 在不在本站」的地方是执行层：LeoBay 的落点本站没有 LeoBay 就不跳，不替用户去另一个家族的站。
  const openNoticeText = src("shell/messages/notices/open-notice.ts");
  assert.match(openNoticeText, /bayAvailable: \(\) => bayEnabledHere\(\)/);
  assert.doesNotMatch(openNoticeText, /currentDomainFamily|familyForHost|portalHref/);
  // 入口角标与 IM 同一个开关
  const button = src("shell/leochat/LeoChatButton.tsx");
  assert.match(button, /const count = imOn \? unread\.total : 0;/);
  // imEnabledFor 对三个家族只看登录（家族只决定各自网关）
  assert.match(src("shell/messages/messages-family.ts"), /return signedIn;/);
});

test("通知相关文件不渲染任何 HTML 字符串", () => {
  for (const file of [
    "shell/messages/notices/InboxNoticesRow.tsx",
    "shell/messages/notices/NoticesView.tsx",
    "shell/messages/notices/MessagesSubView.tsx",
    "shell/messages/notices/notice-icons.tsx",
  ]) {
    assert.doesNotMatch(src(file), /dangerouslySetInnerHTML|innerHTML/, file);
  }
});

test("链接只在执行层碰 window：外链带 noopener、noreferrer；站内走外壳的 router.push", () => {
  const text = src("shell/messages/notices/open-notice.ts");
  assert.match(text, /window\.open\(href, "_blank", "noopener,noreferrer"\)/);
  assert.match(text, /setNoticeNavigator\(\(href\) => router\.push\(href\)\)|let navigator/);
  assert.match(src("shell/messages/MessagesHost.tsx"), /setNoticeNavigator\(\(href\) => router\.push\(href\)\)/);
});

test("本波新文案 17 种语言齐全（中文站 key 即原文），占位符不丢，非中日韩语种没有汉字", async () => {
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const { LOCALES } = await import("../src/i18n/config.ts");
  const keys = ["通知暂时打不开", "订单、任务、账单和内容处置等平台消息会出现在这里。", "未读 {count} 条"];
  for (const key of keys) {
    assert.equal(UI_MESSAGES.zh[key], key, `中文站 key 等于值：${key}`);
    const placeholders = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of LOCALES) {
      if (locale === "zh") continue;
      const value = UI_MESSAGES[locale][key];
      assert.ok(value, `${locale} 缺译文：${key}`);
      assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), placeholders, `${locale} 丢了占位符：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.doesNotMatch(value, /[一-鿿]/, `${locale} 里有汉字：${key}`);
      if (["ja", "ko"].includes(locale)) assert.notEqual(value, key, `${locale} 整句照抄了中文：${key}`);
    }
  }
  // 复用的老词条都有译文（不在本波分表里重定义）
  for (const key of ["通知", "还没有通知", "全部标记已读", "正在加载…", "加载更多", "返回", "重试", "昨天", "未读"]) {
    for (const locale of LOCALES) assert.ok(UI_MESSAGES[locale][key], `${locale} ${key}`);
  }
});
