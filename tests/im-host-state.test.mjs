// 消息浮层的开合与深链（work-chat W08）：真实 host-state.ts + 假的 history/location。
import { test } from "node:test";
import assert from "node:assert/strict";

import { INBOX_FILTERS } from "../src/lib/im/inbox-api.ts";
import {
  IM_OPEN_EVENT,
  INBOX_FILTER_IDS,
  MESSAGES_VIEWS,
  buildImSearch,
  clampDockWidth,
  createHostState,
  parseImDeepLink,
} from "../src/shell/messages/host-state.ts";

function makeEnv({ url = "https://oceanleo.com/library?tab=a#x", width = 1280, stored = null } = {}) {
  const entries = [{ url, state: { __NA: true, tree: [1] } }];
  let index = 0;
  const handlers = new Map();
  const calls = { push: 0, replace: 0, back: 0 };
  const storage = new Map(stored ? [["oceanleo:im:dock-width", String(stored)]] : []);
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
        calls.push += 1;
        entries.splice(index + 1);
        entries.push({ url: new URL(next, entries[index].url).href, state });
        index += 1;
      },
      replaceState(state, _title, next) {
        calls.replace += 1;
        entries[index] = { url: new URL(next, entries[index].url).href, state };
      },
      back() {
        calls.back += 1;
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
  return { env, entries, calls, fire, storage, current: () => entries[index], count: () => entries.length };
}

test("深链解析：会话 id、seq、inbox、people、邀请码；不认的值一律当没有", () => {
  assert.deepEqual(parseImDeepLink("?im=7f1c2d3e-aaaa-bbbb-cccc-111122223333&im_seq=42"), {
    kind: "open",
    target: { conversationId: "7f1c2d3e-aaaa-bbbb-cccc-111122223333", seq: 42 },
    inviteCode: null,
  });
  assert.deepEqual(parseImDeepLink("?im=inbox"), { kind: "open", target: { view: "inbox" }, inviteCode: null });
  assert.deepEqual(parseImDeepLink("?im=people"), { kind: "open", target: { view: "people" }, inviteCode: null });
  assert.deepEqual(parseImDeepLink("?im=talent:abc123"), {
    kind: "open",
    target: { conversationId: "talent:abc123" },
    inviteCode: null,
  });
  const invite = parseImDeepLink("?im_invite=Ab3dEf9hIjKl");
  assert.equal(invite.kind, "open");
  assert.equal(invite.inviteCode, "Ab3dEf9hIjKl");
  assert.equal(invite.target.view, "inbox");
  // im_seq 不是数字、会话 id 带危险字符、邀请码太短：全部当没有
  assert.deepEqual(parseImDeepLink("?im=abc&im_seq=x1").target, { conversationId: "abc" });
  assert.equal(parseImDeepLink("?im=%3Cscript%3E").kind, "none");
  assert.equal(parseImDeepLink("?im=../../etc").kind, "none");
  assert.equal(parseImDeepLink("?im_invite=ab").kind, "none");
  assert.equal(parseImDeepLink("").kind, "none");
  assert.equal(parseImDeepLink("?foo=1").kind, "none");
});

test("buildImSearch 保留别的参数、清掉旧的 im 参数", () => {
  assert.equal(buildImSearch("?tab=a&im=old&im_seq=3", { target: { conversationId: "c1", seq: 9 } }), "?tab=a&im=c1&im_seq=9");
  assert.equal(buildImSearch("?tab=a&im=old&im_seq=3&im_invite=Zzzzzz", null), "?tab=a");
  assert.equal(buildImSearch("", { target: { view: "people" } }), "?im=people");
  assert.equal(buildImSearch("", { target: {} }), "?im=inbox");
  assert.equal(buildImSearch("", { target: { view: "inbox" }, inviteCode: "Abcdef12" }), "?im=inbox&im_invite=Abcdef12");
});

test("打开用 pushState 并保留 Next 的 history.state；返回键关闭，不刷新", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  assert.equal(host.getSnapshot().open, false);

  host.open({ conversationId: "c1", seq: 5 });
  assert.equal(sim.calls.push, 1);
  assert.equal(host.getSnapshot().open, true);
  assert.equal(host.getSnapshot().conversationId, "c1");
  assert.equal(host.getSnapshot().highlightSeq, 5);
  assert.equal(sim.current().url, "https://oceanleo.com/library?tab=a&im=c1&im_seq=5#x");
  // Next 的 App Router 靠 __NA 判断「这是我的历史记录」，丢了就整页重载
  assert.equal(sim.current().state.__NA, true);
  assert.deepEqual(sim.current().state.tree, [1]);
  assert.equal(sim.current().state.imOverlay, true);

  // 浏览器返回键 = popstate，回到没有 im 参数的那条
  sim.env.history.back();
  assert.equal(host.getSnapshot().open, false);
  assert.equal(sim.current().url, "https://oceanleo.com/library?tab=a#x");
});

test("浮层内切换会话只 replaceState，不堆历史记录", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  host.open({ view: "inbox" });
  assert.equal(sim.count(), 2);
  host.showConversation("c2");
  host.showConversation("c3", 11);
  assert.equal(sim.count(), 2, "历史记录条数不变");
  assert.equal(sim.calls.push, 1);
  assert.match(sim.current().url, /im=c3&im_seq=11/);
  host.open({ view: "people" });
  assert.equal(sim.count(), 2);
  assert.match(sim.current().url, /im=people/);
});

test("closeMessages：自己 push 出来的那条用 back 退掉；URL 上带进来的深链用 replaceState 清掉", () => {
  const a = makeEnv();
  const hostA = createHostState(a.env);
  hostA.setEnabled(true);
  hostA.attach();
  hostA.open({ conversationId: "c1" });
  hostA.close();
  assert.equal(a.calls.back, 1);
  assert.equal(hostA.getSnapshot().open, false);
  assert.equal(a.current().url, "https://oceanleo.com/library?tab=a#x");

  // 页面本来就带着 ?im=：没有可退的记录，只清参数
  const b = makeEnv({ url: "https://oceanleo.com/library?im=c9&im_seq=2" });
  const hostB = createHostState(b.env);
  hostB.attach();
  assert.equal(hostB.getSnapshot().open, false, "还没确认可用之前不打开（未登录/境内）");
  hostB.setEnabled(true);
  assert.equal(hostB.getSnapshot().open, true);
  assert.equal(hostB.getSnapshot().conversationId, "c9");
  assert.equal(hostB.getSnapshot().highlightSeq, 2);
  assert.equal(b.calls.push, 0);
  hostB.close();
  assert.equal(b.calls.back, 0);
  assert.equal(b.current().url, "https://oceanleo.com/library");
  assert.equal(hostB.getSnapshot().open, false);
});

test("浮层开着时用户又跳到了别的页：关闭不能把人退出当前页", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  host.open({ conversationId: "c1" });
  // 站内路由跳转（Next 自己 pushState，state 里没有 imOverlay）
  sim.env.history.pushState({ __NA: true }, "", "/explore");
  host.close();
  assert.equal(sim.calls.back, 0);
  assert.equal(host.getSnapshot().open, false);
});

test("不可用（境内 / 未登录）：openMessages 无效，深链无效", () => {
  const sim = makeEnv({ url: "https://oceanleo.cn/?im=c1" });
  const host = createHostState(sim.env);
  host.attach();
  host.open({ conversationId: "c1" });
  assert.equal(host.getSnapshot().open, false);
  assert.equal(sim.calls.push, 0);
  // 登录后才可用：这时才认地址栏里的深链
  host.setEnabled(true);
  assert.equal(host.getSnapshot().open, true);
  // 又退出登录：浮层收起
  host.setEnabled(false);
  assert.equal(host.getSnapshot().open, false);
});

test("oceanleo:im-open 事件（W03 桌面通知点击）打开对应会话；非法 id 被忽略", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  sim.fire(IM_OPEN_EVENT, { detail: { conversationId: "<img onerror=1>" } });
  assert.equal(host.getSnapshot().conversationId, null, "非法 id 退化成只打开收件箱");
  host.close();
  sim.fire(IM_OPEN_EVENT, { detail: { conversationId: "c77", seq: 8 } });
  assert.equal(host.getSnapshot().open, true);
  assert.equal(host.getSnapshot().conversationId, "c77");
  assert.equal(host.getSnapshot().highlightSeq, 8);
});

test("oceanleo:im-open 读 detail.view / detail.filter：talent 直接打开收件箱并选中「交易」筛选", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  sim.fire(IM_OPEN_EVENT, { detail: { view: "inbox", filter: "talent" } });
  const snap = host.getSnapshot();
  assert.equal(snap.open, true);
  assert.equal(snap.view, "inbox");
  assert.equal(snap.filter, "talent");
  assert.equal(snap.conversationId, null);
  // 已经打开时再来一次别的筛选：切过去；带 view 也生效
  sim.fire(IM_OPEN_EVENT, { detail: { view: "people", filter: "unread" } });
  assert.equal(host.getSnapshot().view, "people");
  assert.equal(host.getSnapshot().filter, "unread");
});

test("oceanleo:im-open 的 view / filter 非法值被忽略，退回默认", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  sim.fire(IM_OPEN_EVENT, { detail: { view: "<script>", filter: "../../etc" } });
  let snap = host.getSnapshot();
  assert.equal(snap.open, true);
  assert.equal(snap.view, "inbox");
  assert.equal(snap.filter, "all");
  sim.fire(IM_OPEN_EVENT, { detail: { view: 7, filter: { a: 1 } } });
  snap = host.getSnapshot();
  assert.equal(snap.view, "inbox");
  assert.equal(snap.filter, "all");
  // 一个合法一个非法：合法的生效
  host.close();
  sim.fire(IM_OPEN_EVENT, { detail: { view: "bogus", filter: "team" } });
  assert.equal(host.getSnapshot().view, "inbox");
  assert.equal(host.getSnapshot().filter, "team");
});

test("会话 id 与 view/filter 同时给：打开会话，filter 仍记下；setFilter 只认白名单", () => {
  const sim = makeEnv();
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  sim.fire(IM_OPEN_EVENT, { detail: { conversationId: "talent:9", seq: 3, view: "people", filter: "talent" } });
  const snap = host.getSnapshot();
  assert.equal(snap.conversationId, "talent:9");
  assert.equal(snap.view, "inbox", "有会话 id 时一定是收件箱视图");
  assert.equal(snap.filter, "talent");
  assert.equal(snap.highlightSeq, 3);
  host.setFilter("project");
  assert.equal(host.getSnapshot().filter, "project");
  host.setFilter("nope");
  assert.equal(host.getSnapshot().filter, "project");
});

test("host-state 的筛选白名单与收件箱 API 的 INBOX_FILTERS 一致", () => {
  assert.deepEqual([...INBOX_FILTER_IDS], [...INBOX_FILTERS]);
  assert.deepEqual([...MESSAGES_VIEWS].sort(), ["bay", "inbox", "people", "search", "settings"]);
});

test("?im_invite 打开收件箱并交出邀请码；处理完清掉", () => {
  const sim = makeEnv({ url: "https://oceanleo.com/?im_invite=Abcdef123456" });
  const host = createHostState(sim.env);
  host.setEnabled(true);
  host.attach();
  assert.equal(host.getSnapshot().open, true);
  assert.equal(host.getSnapshot().inviteCode, "Abcdef123456");
  host.clearInvite();
  assert.equal(host.getSnapshot().inviteCode, null);
  assert.doesNotMatch(sim.current().url, /im_invite/);
});

test("布局：手机 < 768 单栏，桌面默认停靠，可放大到全屏；停靠宽度夹在 360–720 并记住", () => {
  const desktop = makeEnv({ width: 1280 });
  const host = createHostState(desktop.env);
  host.setEnabled(true);
  assert.equal(host.getSnapshot().layout, "docked");
  assert.equal(host.getSnapshot().dockWidth, 420);
  host.setExpanded(true);
  assert.equal(host.getSnapshot().layout, "full");
  host.setDockWidth(9999);
  assert.equal(host.getSnapshot().dockWidth, 720);
  assert.equal(desktop.storage.get("oceanleo:im:dock-width"), "720");
  host.setDockWidth(10);
  assert.equal(host.getSnapshot().dockWidth, 360);

  const phone = makeEnv({ width: 390 });
  const phoneHost = createHostState(phone.env);
  assert.equal(phoneHost.getSnapshot().layout, "mobile");
  phoneHost.setExpanded(true);
  assert.equal(phoneHost.getSnapshot().layout, "mobile", "手机永远是单栏全屏");

  const remembered = createHostState(makeEnv({ stored: 600 }).env);
  assert.equal(remembered.getSnapshot().dockWidth, 600);
  assert.equal(clampDockWidth(Number.NaN), 420);
});
