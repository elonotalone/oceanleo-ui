// LeoChat 小窗两栏头部：共用搜索 + + 号；联系人不再「新建聊天 / 邀请别人」。LeoBay 不在小窗里。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, "src", rel), "utf8");
const html = (node) => renderToStaticMarkup(node);
const count = (text, pattern) => (text.match(pattern) || []).length;
const xScroll = ["overflow", "x", "auto"].join("-");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

globalThis.__leoToolbarReact = React;

const { PanelToolbar } = await import(await compileModule("src/shell/leochat/PanelToolbar.tsx"));

test("PanelToolbar：0 项没有 + 号；1 项有 + 且没有菜单；2 项有菜单；搜索框带占位文字", () => {
  const none = html(
    React.createElement(PanelToolbar, {
      search: "",
      onSearch() {},
      placeholder: "搜一下",
      plusLabel: "新建",
      actions: [],
    }),
  );
  assert.equal(count(none, /data-leochat-plus/g), 0);
  assert.match(none, /placeholder="搜一下"/);

  const one = html(
    React.createElement(PanelToolbar, {
      search: "",
      onSearch() {},
      placeholder: "搜一下",
      plusLabel: "添加联系人",
      actions: [{ id: "add-contact", label: "添加联系人", onSelect() {} }],
    }),
  );
  assert.equal(count(one, /data-leochat-plus/g), 1);
  assert.doesNotMatch(one, /aria-haspopup/);
  assert.match(one, /placeholder="搜一下"/);

  const two = html(
    React.createElement(PanelToolbar, {
      search: "",
      onSearch() {},
      placeholder: "搜一下",
      plusLabel: "新建",
      actions: [
        { id: "new-chat", label: "新建聊天", onSelect() {} },
        { id: "add-contact", label: "添加联系人", onSelect() {} },
      ],
    }),
  );
  assert.equal(count(two, /data-leochat-plus/g), 1);
  assert.match(two, /aria-haspopup="menu"/);
  assert.match(two, /placeholder="搜一下"/);
});

const inboxStubs = {
  "../../i18n/ui/useUI": uiStub,
  "../../lib/im/inbox-api": dataModule(`export async function fetchDraftConversationIds(){ return []; }`),
  "../../lib/im/search-api": dataModule(`export function searchQueryReady(){ return false; }`),
  "./InboxRow": dataModule(`export function InboxRow(){ return null; }`),
  "./people/InviteLinkDialog": dataModule(`export function InviteLinkDialog(){ return null; }`),
  "./search/SearchView": dataModule(`export function SearchView(){ return null; }`),
  "./realtime/hooks": dataModule(`
    export function useImInbox(){ return { items: [], filter: "all", loaded: true, loading: false, error: null, nextCursor: null }; }
    export function useImConnection(){ return "open"; }
    export function useImResync(){}
    export function imStore(){ return { inbox(){ return { loaded: true, filter: "all" }; }, loadInbox(){}, loadMoreInbox(){} }; }
  `),
};

const { Inbox } = await import(await compileModule("src/shell/messages/Inbox.tsx", inboxStubs));

const peopleStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/im/people-api": dataModule(`
    export function listContactRequests(){ return Promise.resolve([]); }
    export function listGroupInvites(){ return Promise.resolve([]); }
    export function useLoader(){ return { data: [], loading: false, reload(){} }; }
  `),
  "../realtime/hooks": dataModule(`export function useImEvent(){}`),
  "./BlockedList": dataModule(`export function BlockedList(){ return null; }`),
  "./ContactList": dataModule(`export function ContactList(){ return null; }`),
  "./InviteLinkDialog": dataModule(`export function InviteLinkDialog(){ return null; }`),
  "./ProfileCard": dataModule(`export function ProfileCard(){ return null; }`),
  "./RequestsList": dataModule(`export function RequestsList(){ return null; }`),
};

const { PeopleView } = await import(await compileModule("src/shell/messages/people/PeopleView.tsx", peopleStubs));

function toolbarCounts(out) {
  return {
    toolbar: count(out, /data-leochat-toolbar/g),
    search: count(out, /data-leochat-search/g),
    plus: count(out, /data-leochat-plus/g),
  };
}

test("Inbox、PeopleView 各有一套头部；没有横向滚动容器；LeoBay 不在小窗里", () => {
  const inbox = html(
    React.createElement(Inbox, {
      activeConversationId: null,
      onOpenConversation() {},
      onNew() {},
    }),
  );
  const people = html(React.createElement(PeopleView, { onOpenConversation() {} }));

  for (const [name, out] of [
    ["inbox", inbox],
    ["people", people],
  ]) {
    const n = toolbarCounts(out);
    assert.equal(n.toolbar, 1, name);
    assert.equal(n.search, 1, name);
    assert.equal(n.plus, 1, name);
    assert.equal(out.includes(xScroll), false, name);
  }

  assert.doesNotMatch(people, /新建聊天/);
  assert.doesNotMatch(people, /邀请别人/);
  assert.doesNotMatch(src("shell/bay/shell/BayList.tsx"), /data-leochat-toolbar/);
});

test("InviteLinkDialog 联系人那一种的标题是添加联系人", () => {
  const text = src("shell/messages/people/InviteLinkDialog.tsx");
  assert.match(text, /kind === "group" \? tt\("群邀请链接"\) : tt\("添加联系人"\)/);
});
