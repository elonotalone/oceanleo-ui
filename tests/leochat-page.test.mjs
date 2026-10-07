// LeoChat 整页（W04）：页头、三栏、未登录与未开放、LeoBay 栏详情。
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

globalThis.__leochatReact = React;

const reactStub = dataModule(`
  const R = globalThis.__leochatReact;
  export const useState = R.useState;
  export const useEffect = R.useEffect;
  export const useLayoutEffect = R.useLayoutEffect;
  export const useMemo = R.useMemo;
  export const useCallback = R.useCallback;
  export const useRef = R.useRef;
  export const useContext = R.useContext;
  export const useReducer = R.useReducer;
  export const useId = R.useId;
  export const useDeferredValue = R.useDeferredValue;
  export const useTransition = R.useTransition;
  export const useInsertionEffect = R.useInsertionEffect;
  export const useImperativeHandle = R.useImperativeHandle;
  export function useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot(); }
  export const createElement = R.createElement;
  export const cloneElement = R.cloneElement;
  export const isValidElement = R.isValidElement;
  export const Fragment = R.Fragment;
  export const Children = R.Children;
  export const createContext = R.createContext;
  export const memo = R.memo;
  export const forwardRef = R.forwardRef;
  export const lazy = R.lazy;
  export const Suspense = R.Suspense;
  export const startTransition = R.startTransition;
  export default R;
`);

const state = {
  bayEnabled: true,
  imEnabled: true,
  unread: null,
  bayCount: 0,
  current: { kind: "feed" },
  filter: { kind: "all" },
  signedIn: true,
  authSettled: true,
};
globalThis.__leochatPageTest = state;

function reset(patch = {}) {
  state.bayEnabled = true;
  state.imEnabled = true;
  state.unread = null;
  state.bayCount = 0;
  state.current = { kind: "feed" };
  state.filter = { kind: "all" };
  state.signedIn = true;
  state.authSettled = true;
  Object.assign(state, patch);
}

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const stateStub = dataModule(`
  const s = () => globalThis.__leochatPageTest;
  export function bayEnabledHere(){ return s().bayEnabled; }
  export function bayStateSnapshot(){ return { current: s().current, canGoBack: s().current.kind !== "feed" }; }
  export function registerBayPage(){ return () => {}; }
  export function setBaySiteKey(){}
  export function useBaySignedIn(){ return s().signedIn; }
  export function useBayState(){ return { current: s().current, canGoBack: s().current.kind !== "feed" }; }
  export function useBayFilter(){ return s().filter; }
  export function useBaySiteKey(){ return "oceanleo"; }
  export function bayBack(){}
  export function requireBayLogin(){ return true; }
`);
const el = `const createElement = (...args) => globalThis.__leochatReact.createElement(...args);`;

const stubs = {
  react: reactStub,
  "../../i18n/ui/useUI": uiStub,
  "../../../i18n/ui/useUI": uiStub,
  "../../lib/im/client": dataModule(`export function useImEnabled(){ return globalThis.__leochatPageTest.imEnabled; }`),
  "./auth-settled": dataModule(`export function useAuthSettled(){ return globalThis.__leochatPageTest.authSettled; }`),
  "../bay/shell/bay-state": stateStub,
  "./bay-state": stateStub,
  "../bay/shell/BayNavIcon": dataModule(`export function useBayNeedsAction(){ return globalThis.__leochatPageTest.bayCount; }`),
  "../bay/shell/BayMine": dataModule(`
    ${el}
    export function BaySignInPrompt({ text }){ return createElement("div", { "data-bay-sign-in": "" }, createElement("p", null, text)); }
  `),
  "../messages/messages-surface": dataModule(`export function ensureMessagesSurfaceStyles(){}`),
  "../messages/realtime/hooks": dataModule(`
    export function useImUnread(){ return globalThis.__leochatPageTest.unread; }
    export function imStore(){ return { setForegroundConversation(){}, clearConversationUnread(){} }; }
  `),
  "./page-chats": dataModule(`
    ${el}
    export function ChatsSection(){ return createElement("div", { "data-leochat-chats": "" }); }
  `),
  "./page-contacts": dataModule(`
    ${el}
    export function ContactsSection(){ return createElement("div", { "data-leochat-contacts": "" }); }
  `),
  "../LibraryLayout": dataModule(`
    ${el}
    export function LibraryToolbar({ placeholder }){ return createElement("input", { type: "search", placeholder: placeholder }); }
  `),
  "../bay/needs/LibraryWorkPicker": dataModule(`${el} export function LibraryWorkPickerHost(){ return null; }`),
  "../bay/shell/bay-auth-host": dataModule(`${el} export function BayAuthHost(){ return null; }`),
  "../bay/deal/DealConversationView": dataModule(`
    ${el}
    export function DealConversationView({ threadId, layout, onBack }){
      return createElement("section", { "data-stub-conversation": threadId, "data-layout": layout, "data-has-back": onBack ? "true" : "false" });
    }
  `),
  "../bay/shell/BayDetail": dataModule(`
    ${el}
    export function bayDetailTitleKey(target){ return target && target.kind === "feed" ? null : (target && target.kind === "post-need" ? "发需求" : (target && target.kind) || null); }
    export function BayDetailPane({ target }){ return createElement("section", { "data-stub-pane": target.kind }); }
  `),
  "./BayDetail": dataModule(`
    ${el}
    export function bayDetailTitleKey(target){ return target && target.kind === "feed" ? null : (target && target.kind === "post-need" ? "发需求" : (target && target.kind) || null); }
    export function BayDetailPane({ target }){ return createElement("section", { "data-stub-pane": target.kind }); }
  `),
  "../bay/shell/BayList": dataModule(`
    ${el}
    export function startPostNeed(){}
    export function startServiceEditor(){}
    export function openMine(){}
    export function useBaySearchText(){ return { text: "", change(){}, commit(){} }; }
    export function BayKindTabs(){ return createElement("div", { role: "tablist", "data-bay-kinds": "page" }); }
    export function BayCategoryToggle(){ return createElement("button", { type: "button", "data-bay-category-toggle": "" }); }
    export function BayCategoryChips(){ return null; }
    export function BayFeed({ emptyAction }){ return createElement("div", { "data-bay-feed": "grid" }, emptyAction); }
  `),
  "./BayList": dataModule(`
    ${el}
    export function startPostNeed(){}
    export function startServiceEditor(){}
    export function openMine(){}
    export function useBaySearchText(){ return { text: "", change(){}, commit(){} }; }
    export function BayKindTabs(){ return createElement("div", { role: "tablist", "data-bay-kinds": "page" }); }
    export function BayCategoryToggle(){ return createElement("button", { type: "button", "data-bay-category-toggle": "" }); }
    export function BayCategoryChips(){ return null; }
    export function BayFeed({ emptyAction }){ return createElement("div", { "data-bay-feed": "grid" }, emptyAction); }
  `),
};

const { LeoChatPage } = await import(await compileModule("src/shell/leochat/LeoChatPage.tsx", stubs));
const { LeoBaySection } = await import(await compileModule("src/shell/leochat/page-leobay.tsx", stubs));

const html = (node) => renderToStaticMarkup(node);
const count = (text, pattern) => (text.match(pattern) || []).length;

test("页头：恰好一个 LeoChat 标题；栏目顺序是聊天、联系人、LeoBay；数字只在大于 0 时出现", () => {
  reset();
  const out = html(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  assert.equal(count(out, /<h1/g), 1);
  assert.match(out, /<h1[^>]*>LeoChat<\/h1>/);
  const tabs = [...out.matchAll(/data-leochat-tab="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ["inbox", "people", "bay"]);
  assert.match(out, /data-leochat-tab="inbox"[^>]*>聊天</);
  assert.match(out, /data-leochat-tab="people"[^>]*>联系人</);
  assert.match(out, /data-leochat-tab="bay"[^>]*>LeoBay</);
  assert.doesNotMatch(out, /data-leochat-tab="inbox"[^>]*>聊天<span/);
  assert.doesNotMatch(out, /data-leochat-tab="people"[^>]*>联系人<span/);
  assert.doesNotMatch(out, /data-leochat-tab="bay"[^>]*>LeoBay<span/);

  reset({ unread: { total: 3, requests: 2 }, bayCount: 5 });
  const badged = html(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  assert.match(badged, /data-leochat-tab="inbox"[^>]*>聊天<span[^>]*>3<\/span>/);
  assert.match(badged, /data-leochat-tab="people"[^>]*>联系人<span[^>]*>2<\/span>/);
  assert.match(badged, /data-leochat-tab="bay"[^>]*>LeoBay<span[^>]*>5<\/span>/);

  reset({ unread: { total: 120, requests: 0 }, bayCount: 0 });
  const capped = html(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  assert.match(capped, /data-leochat-tab="inbox"[^>]*>聊天<span[^>]*>99\+<\/span>/);
  assert.doesNotMatch(capped, /data-leochat-tab="people"[^>]*>联系人<span/);
});

test("initialTab=bay：画出 LeoBay 栏；页头右边一组操作是我的、发布服务、找人帮忙，没有发需求", () => {
  reset();
  const out = html(React.createElement(LeoChatPage, { siteKey: "oceanleo", initialTab: "bay" }));
  assert.match(out, /data-bay-page="browse"/);
  assert.equal(count(out, /data-bay-page-actions/g), 1);
  const actions = out.match(/data-bay-page-actions[^>]*>[\s\S]*?<\/div>/);
  assert.ok(actions);
  assert.equal(count(actions[0], /data-bay-action="mine"/g), 1);
  assert.equal(count(actions[0], /data-bay-action="publish-service"/g), 1);
  assert.equal(count(actions[0], /data-bay-action="get-help"/g), 1);
  assert.equal(count(out, /data-bay-action="get-help"/g), 1);
  assert.equal(count(out, /data-bay-action="post-need"/g), 0);
  assert.match(out, /找人帮忙/);
  assert.doesNotMatch(out, /发需求/);
});

test("缺省画出聊天栏，LeoBay 栏还没挂载", () => {
  reset();
  const out = html(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  assert.match(out, /data-leochat-chats/);
  assert.doesNotMatch(out, /data-bay-page/);
  assert.equal(count(out, /data-bay-page-actions/g), 0);
});

test("没登录：聊天栏位置是登录提示，没有聊天列表", () => {
  reset({ imEnabled: false });
  const out = html(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  assert.match(out, /data-bay-sign-in/);
  assert.match(out, /登录后查看聊天和联系人/);
  assert.doesNotMatch(out, /data-leochat-chats/);
});

test("登录状态还没查清：聊天栏先空着，既不画登录提示也不画聊天列表；页头和栏目标签照常在", () => {
  reset({ imEnabled: false, authSettled: false });
  const out = html(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  assert.doesNotMatch(out, /data-bay-sign-in/, "已登录的人不该每次进来都先看到一眼「请登录」");
  assert.doesNotMatch(out, /data-leochat-chats/);
  assert.equal(count(out, /<h1/g), 1);
  assert.equal(count(out, /data-leochat-tab=/g), 3);
});

test("本站没开放：只有标题和暂未开放那一句", () => {
  reset({ bayEnabled: false });
  const out = html(React.createElement(LeoChatPage, { siteKey: "oceanleo" }));
  assert.equal(count(out, /<h1/g), 1);
  assert.match(out, />LeoChat</);
  assert.match(out, /此功能暂未在本站开放/);
  assert.doesNotMatch(out, /data-leochat-page-tabs/);
  assert.doesNotMatch(out, /data-leochat-chats/);
  assert.doesNotMatch(out, /data-bay-page/);
});

test("LeoBay 栏停在详情：一个返回键、标题是二级标题、没有整页页框", () => {
  reset({ current: { kind: "post-need" } });
  const out = html(React.createElement(LeoBaySection, { active: true }));
  assert.match(out, /data-bay-page="detail"/);
  assert.equal(count(out, /data-bay-page-back/g), 1);
  assert.equal(count(out, /<h2/g), 1);
  assert.match(out, /<h2[^>]*>发需求<\/h2>/);
  assert.equal(count(out, /<h1/g), 0);
  assert.doesNotMatch(out, /data-leochat-page/);
  assert.doesNotMatch(out, /data-bay-page-actions/);
});

test("源码：整页登记在场、接管地址、注入小窗样式；BayPage 不再写 OceanLeo Bay", () => {
  const page = src("shell/leochat/LeoChatPage.tsx");
  assert.match(page, /registerLeoChatPage\(\)/);
  assert.match(page, /registerBayPage\(\)/);
  assert.match(page, /onLeoChatPageRequest\(/);
  assert.match(page, /ensureMessagesSurfaceStyles\(/);
  const bayPage = src("shell/bay/shell/BayPage.tsx");
  assert.doesNotMatch(bayPage, /OceanLeo Bay/);
  assert.match(bayPage, /initialTab="bay"/);
  assert.doesNotMatch(src("shell/leochat/page-leobay.tsx"), /APP_PAGE_FRAME_CLASS/);
});
