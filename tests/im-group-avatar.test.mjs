// F02 判据：群 / Team 群 / 项目群的头像由成员头像拼成（最多 4 个）：
// 1 人整图、2 人左右、3–4 人田字格；没头像的人画名字首字色块；头像地址只认 https，
// <img> 带 referrerPolicy="no-referrer" / loading="lazy" / alt=""；没有 members 时保持首字头像；
// 收件箱行与信息面板用同一个组件。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-group-avatar.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const uiHookStub = dataModule(`
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`);
const storeStub = dataModule(`export function formatBadge(n) { return n > 0 ? String(n) : ""; }`);

const { GroupAvatar, PersonAvatar } = await import(await compileModule("src/shell/messages/groups/GroupAvatar.tsx", {}));
const { Avatar } = await import(
  await compileModule("src/shell/messages/InboxRow.tsx", {
    "../../i18n/ui/useUI": uiHookStub,
    "./realtime/store": storeStub,
  })
);
const { avatarMembersOf, httpsAvatarUrl } = await import(await compileModule("src/lib/im/types.ts", {}));
const { fetchConversations } = await import(
  await compileModule("src/lib/im/inbox-api.ts", {
    "./client": dataModule(`export async function imFetch() { return globalThis.__PAGE; }`),
  })
);
const { getConversationDetail, isTeamAdminOf } = await import(
  await compileModule("src/lib/im/groups-api.ts", {
    "./client": dataModule(`export async function imFetch() { return globalThis.__DETAIL; }`),
  })
);

const m = (id, name, url = `https://img.example.com/${id}.png`) => ({ user_id: id, display_name: name, avatar_url: url });
const html = (el) => renderToStaticMarkup(el);
const count = (text, re) => (text.match(re) ?? []).length;

test("拼图：1 人整图，2 人左右，3 人 / 4 人田字格，最多取 4 人", () => {
  const h1 = html(React.createElement(GroupAvatar, { name: "设计组", members: [m("a", "甲")], size: 40 }));
  assert.match(h1, /data-avatar-mosaic="1"/);
  assert.equal(count(h1, /<img /g), 1);
  assert.match(h1, /grid-template-columns:repeat\(1/);

  const h2 = html(React.createElement(GroupAvatar, { name: "设计组", members: [m("a", "甲"), m("b", "乙")], size: 40 }));
  assert.match(h2, /data-avatar-mosaic="2"/);
  assert.equal(count(h2, /<img /g), 2);
  assert.match(h2, /grid-template-columns:repeat\(2/);
  assert.match(h2, /grid-template-rows:repeat\(1/);

  const h3 = html(React.createElement(GroupAvatar, { name: "设计组", members: [m("a", "甲"), m("b", "乙"), m("c", "丙")], size: 40 }));
  assert.match(h3, /data-avatar-mosaic="3"/);
  assert.equal(count(h3, /<img /g), 3);
  assert.match(h3, /grid-template-rows:repeat\(2/);

  const five = ["a", "b", "c", "d", "e"].map((id) => m(id, id));
  const h4 = html(React.createElement(GroupAvatar, { name: "设计组", members: five, size: 40 }));
  assert.match(h4, /data-avatar-mosaic="4"/, "超过 4 个只取前 4 个");
  assert.equal(count(h4, /<img /g), 4);
  assert.ok(!h4.includes("e.png"), "第 5 个人不画");
});

test("没头像的人画名字首字色块；非 https 头像地址一律当没有", () => {
  const h = html(
    React.createElement(GroupAvatar, {
      name: "群",
      size: 40,
      members: [
        m("a", "alice", null),
        m("b", "鲍勃", "http://img.example.com/b.png"),
        m("c", "carol", "javascript:alert(1)"),
        m("d", "dave", "/local/d.png"),
      ],
    }),
  );
  assert.equal(count(h, /<img /g), 0, "没有任何一张合格头像就不出 <img>");
  assert.equal(count(h, /data-avatar-tile="initial"/g), 4);
  for (const letter of ["A", "鲍", "C", "D"]) assert.ok(h.includes(`>${letter}</span>`), "缺首字 " + letter);
  assert.ok(!h.includes("javascript:"), "危险协议不能出现在输出里");
  assert.ok(!h.includes("http://"), "http 头像不画");
});

test("<img> 带 no-referrer / lazy / 空 alt，地址是 https", () => {
  const h = html(React.createElement(GroupAvatar, { name: "群", size: 40, members: [m("a", "甲"), m("b", "乙")] }));
  const imgs = h.match(/<img [^>]*>/g) ?? [];
  assert.equal(imgs.length, 2);
  for (const img of imgs) {
    assert.match(img, /referrerPolicy="no-referrer"/);
    assert.match(img, /loading="lazy"/);
    assert.match(img, /alt=""/);
    assert.match(img, /src="https:\/\/img\.example\.com\//);
  }
});

test("没有 members（或空数组）时保持原来的群名首字头像；自己上传的群头像优先", () => {
  for (const members of [undefined, null, []]) {
    const h = html(React.createElement(GroupAvatar, { name: "设计组", seed: "c1", size: 40, members }));
    assert.ok(!h.includes("data-avatar-mosaic"));
    assert.ok(h.includes(">设</span>"), "仍是群名首字");
  }
  const own = html(React.createElement(GroupAvatar, { name: "设计组", src: "https://img.example.com/own.png", size: 40, members: [m("a", "甲")] }));
  assert.ok(!own.includes("data-avatar-mosaic"), "有群自己的头像时不拼图");
  assert.ok(own.includes("own.png"));
  // 个人头像组件不受影响
  const person = html(React.createElement(PersonAvatar, { name: "甲", size: 32 }));
  assert.ok(person.includes(">甲</span>"));
});

test("avatarMembersOf / httpsAvatarUrl：丢脏数据、去重、最多 4 个", () => {
  assert.equal(httpsAvatarUrl("https://a.example.com/x.png"), "https://a.example.com/x.png");
  for (const bad of ["http://a.example.com/x.png", "//a.example.com/x.png", "data:image/png;base64,AAAA", "javascript:1", "", null, undefined, 5, "https://"]) {
    assert.equal(httpsAvatarUrl(bad), null, String(bad));
  }
  assert.deepEqual(avatarMembersOf(null), []);
  assert.deepEqual(avatarMembersOf("x"), []);
  const out = avatarMembersOf([m("a", "甲"), null, { display_name: "没 id" }, m("a", "重复"), m("b", "乙", "http://x"), m("c", "丙"), m("d", "丁"), m("e", "戊")]);
  assert.deepEqual(out.map((x) => x.user_id), ["a", "b", "c", "d"]);
  assert.equal(out[1].avatar_url, null);
});

const conv = (over = {}) => ({
  id: "c1", kind: "group", title: "设计组", avatar_url: null, peer: null, member_count: 5,
  last_message: null, last_activity_at: "2026-10-05T00:00:00Z", unread_count: 0, mention_count: 0, muted: false,
  notify_level: "all", org_id: null, project_id: null, has_external: false, my_role: "member", dissolved: false, ...over,
});

test("收件箱行：群有成员头像就拼图；Team 群、项目群同；没有则保持原来的 2×2 首字块；私聊不受影响", () => {
  const members = [m("a", "甲"), m("b", "乙"), m("c", "丙")];
  for (const kind of ["group", "team", "project"]) {
    const h = html(React.createElement(Avatar, { item: conv({ kind, avatar_members: members }) }));
    assert.match(h, /data-avatar-mosaic="3"/, kind);
  }
  const fallback = html(React.createElement(Avatar, { item: conv({ title: "设计组织" }) }));
  assert.ok(!fallback.includes("data-avatar-mosaic"), "没有 members 不拼图");
  assert.ok(fallback.includes("grid-cols-2"), "沿用原来的 2×2 首字块");
  const dm = html(React.createElement(Avatar, { item: conv({ kind: "dm", title: "", peer: { user_id: "p", display_name: "对方", avatar_url: null }, avatar_members: members }) }));
  assert.ok(!dm.includes("data-avatar-mosaic"), "私聊不拼图");
  const own = html(React.createElement(Avatar, { item: conv({ avatar_url: "https://img.example.com/own.png", avatar_members: members }) }));
  assert.ok(!own.includes("data-avatar-mosaic"), "有自己上传的群头像就用它");
});

test("接口层：会话列表与详情把 avatar_members 收拾成安全形状，没给的行原样不动", async () => {
  globalThis.__PAGE = {
    items: [
      conv({ id: "g", avatar_members: [m("a", "甲", "http://x/y.png"), m("b", "乙"), m("c", "丙"), m("d", "丁"), m("e", "戊")] }),
      conv({ id: "plain" }),
    ],
    next_cursor: null,
  };
  const page = await fetchConversations("all");
  assert.equal(page.items[0].avatar_members.length, 4);
  assert.equal(page.items[0].avatar_members[0].avatar_url, null);
  assert.ok(!("avatar_members" in page.items[1]));

  globalThis.__DETAIL = { ...conv(), avatar_members: [m("a", "甲"), { nope: 1 }], members: [] };
  const detail = await getConversationDetail("c1");
  assert.deepEqual(detail.avatar_members.map((x) => x.user_id), ["a"]);
  globalThis.__DETAIL = { ...conv(), members: [] };
  assert.ok(!("avatar_members" in (await getConversationDetail("c1"))));
});

test("isTeamAdminOf：只有这个 Team 的 owner / admin 为真", () => {
  const orgs = [{ id: "o1", role: "owner" }, { id: "o2", role: "admin" }, { id: "o3", role: "member" }];
  assert.equal(isTeamAdminOf(orgs, "o1"), true);
  assert.equal(isTeamAdminOf(orgs, "o2"), true);
  assert.equal(isTeamAdminOf(orgs, "o3"), false);
  assert.equal(isTeamAdminOf(orgs, "o9"), false);
  assert.equal(isTeamAdminOf(orgs, null), false);
  assert.equal(isTeamAdminOf(null, "o1"), false);
});
