// LeoChat 三处入口：整页、右侧栏、小窗；一次只显示一处。host-state 用真的 createHostState + 假环境。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { createHostState } from "../src/shell/messages/host-state.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://music.oceanleo.com/library" });
dom.window.matchMedia = () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
});
dom.window.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
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

function makeEnv({ url = "https://music.oceanleo.com/library", width = 1280 } = {}) {
  const entries = [{ url, state: {} }];
  let index = 0;
  const handlers = new Map();
  const storage = new Map();
  const fire = (type, event = {}) => {
    for (const handler of Array.from(handlers.get(type) ?? [])) handler(event);
  };
  return {
    env: {
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
    },
  };
}

function resetHost() {
  const host = createHostState(makeEnv().env);
  host.setEnabled(true);
  globalThis.__leoChat4Host = host;
  globalThis.__leoChat4Last = {};
  globalThis.__leoChat4ImOn = true;
  globalThis.__leoChat4BayOn = true;
  return host;
}

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const hostStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  export function hostState(){ return globalThis.__leoChat4Host; }
  export function useMessagesHost(){
    const host = globalThis.__leoChat4Host;
    return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  }
  export function closeMessages(){ globalThis.__leoChat4Host.close(); }
  export function openMessages(target){ globalThis.__leoChat4Host.open(target); }
`);
const imStub = dataModule(`export function useImEnabled(){ return globalThis.__leoChat4ImOn !== false; }`);
const bayStateStub = dataModule(`
  export function bayEnabledHere(){ return globalThis.__leoChat4BayOn !== false; }
  export function setBaySiteKey(){}
  export function useBayEnabled(){ return globalThis.__leoChat4BayOn !== false; }
  export function attachBayDeepLinks(){ return () => {}; }
  export function setBayNavigator(){}
`);
const unreadStub = dataModule(`export function useImUnread(){ return { total: 0, requests: 0 }; }`);
const stylesStub = dataModule(`export function ensureMessagesSurfaceStyles(){}`);
const signInStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function BaySignInPrompt({ text }){
    return React.createElement("div", { "data-bay-sign-in": "true" }, text);
  }
`);
const bodyStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function LeoChatBody({ wide }){
    return React.createElement("div", { "data-leochat-body": wide ? "wide" : "narrow" });
  }
`);

function viewStub(name, { back = false } = {}) {
  return dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function ${name}(props){
      globalThis.__leoChat4Last.${name} = props;
      if (${back ? "true" : "false"}) {
        return React.createElement("button", {
          type: "button",
          "data-stub": ${JSON.stringify(name)},
          "data-layout": String(props.layout || ""),
          "data-thread": String(props.threadId || ""),
          "data-cid": String(props.conversationId || ""),
          onClick: () => props.onBack?.(),
        }, ${JSON.stringify(name)});
      }
      return React.createElement("div", {
        "data-stub": ${JSON.stringify(name)},
        "data-layout": String(props.layout || ""),
        "data-thread": String(props.threadId || ""),
        "data-cid": String(props.conversationId || ""),
      }, ${JSON.stringify(name)});
    }
  `);
}

const dialogStub = (name) =>
  dataModule(`
    export function ${name}(){ return null; }
  `);

const bodyAliases = {
  "../../i18n/ui/useUI": uiStub,
  "../bay/deal": viewStub("DealConversationView"),
  "../messages/conversation/ConversationView": viewStub("ConversationView", { back: true }),
  "../messages/groups/ConversationInfoPanel": dialogStub("ConversationInfoPanel"),
  "../messages/groups/NewConversationDialog": dialogStub("NewConversationDialog"),
  "../messages/Inbox": viewStub("Inbox"),
  "../messages/invite/InviteAcceptDialog": dialogStub("InviteAcceptDialog"),
  "../messages/host-state": hostStub,
  "../messages/people/PeopleView": viewStub("PeopleView"),
};

const { LeoChatBody } = await import(await compileModule("src/shell/leochat/leochat-body.tsx", bodyAliases));
const { LeoChatPage } = await import(
  await compileModule("src/shell/leochat/LeoChatPage.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/auth/client": dataModule(`export async function accessToken(){ return "t"; }`),
    "../../lib/im/client": imStub,
    "../bay/shell/BayMine": signInStub,
    "../bay/shell/bay-state": bayStateStub,
    "../messages/host-state": hostStub,
    "../messages/messages-surface": stylesStub,
    "../messages/realtime/hooks": unreadStub,
    "./leochat-body": bodyStub,
  })
);
const { LeoChatPanel } = await import(
  await compileModule("src/shell/leochat/LeoChatPanel.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/im/client": imStub,
    "../bay/shell/BayMine": signInStub,
    "../messages/host-state": hostStub,
    "../messages/messages-surface": stylesStub,
    "../messages/realtime/hooks": unreadStub,
    "./leochat-body": bodyStub,
  })
);
const { LeoChatButton } = await import(
  await compileModule("src/shell/leochat/LeoChatButton.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/im/client": imStub,
    "../bay/shell/bay-state": bayStateStub,
    "../messages/host-state": hostStub,
    "../messages/messages-surface": stylesStub,
    "../messages/realtime/hooks": unreadStub,
  })
);
const { MessagesHost } = await import(
  await compileModule("src/shell/messages/MessagesHost.tsx", {
    "next/navigation": dataModule(`
      export function usePathname(){ return "/library"; }
      export function useRouter(){ return { push(){}, replace(){} }; }
    `),
    "../../lib/im/client": imStub,
    "../../lib/im/notify-api": dataModule(`
      export function cachedImSettings(){ return {}; }
      export function refreshImSettingsInBackground(){}
    `),
    "../bay/deal": viewStub("DealConversationView"),
    "../bay/shell/bay-auth-host": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function BayAuthHost(){ return React.createElement("div", { "data-bay-auth-host": "true" }); }
    `),
    "../bay/shell/bay-state": bayStateStub,
    "../leochat/LeoChatTabs": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function LeoChatTabs(){ return React.createElement("div", { role: "tablist" }); }
    `),
    "../replay/work/WorkReplayHost": dataModule(`export function WorkReplayHost(){ return null; }`),
    "./conversation/ConversationView": viewStub("ConversationView", { back: true }),
    "./groups/ConversationInfoPanel": dialogStub("ConversationInfoPanel"),
    "./groups/NewConversationDialog": dialogStub("NewConversationDialog"),
    "./Inbox": viewStub("Inbox"),
    "./invite/InviteAcceptDialog": dialogStub("InviteAcceptDialog"),
    "./host-state": hostStub,
    "./MessagesLayout": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function MessagesLayout(){
        return React.createElement("div", { "data-testid": "messages-overlay" }, "overlay");
      }
    `),
    "./notify/sound": dataModule(`
      export function attachMessageSound(){ return () => {}; }
      export function createBrowserMessageSound(){ return {}; }
    `),
    "./notify/title-badge": dataModule(`export function attachBrowserTitleBadge(){ return null; }`),
    "./people/PeopleView": viewStub("PeopleView"),
    "./PrivacyNotice": dataModule(`export function PrivacyNotice(){ return null; }`),
    "./realtime/hooks": dataModule(`
      export function attachImRealtime(){ return () => {}; }
      export function imStore(){
        return {
          unread(){ return { total: 0 }; },
          subscribe(){ return () => {}; },
          setForegroundConversation(){},
          clearConversationUnread(){},
        };
      }
      export function publishImDisabled(){}
      export function useImUnread(){ return { total: 0, requests: 0 }; }
    `),
  })
);
const { workspaceNav } = await import(
  await compileModule("src/shell/WorkspacePages.tsx", {
    "../i18n/ui/useUI": uiStub,
    "next-intl": dataModule(`export function useTranslations(){ return (key) => key; }`),
    "./bay/shell/bay-state": bayStateStub,
    "./leochat/LeoChatButton": dataModule(`
      export function LeoChatGlyph(){ return null; }
      export function LeoChatButton(){ return null; }
    `),
  })
);

resetHost();

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
    async click(selector) {
      const node = document.body.querySelector(selector);
      assert.ok(node, selector);
      await act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
    await Promise.resolve();
    await Promise.resolve();
  });
}

test("LeoChatBody wide：左右两栏同时在；没选会话是提示；切到联系人右边仍是会话", async () => {
  const host = resetHost();
  host.open();
  const view = await mount(React.createElement(LeoChatBody, { wide: true }));
  assert.ok(view.host.querySelector('[data-leochat-body="wide"]'));
  assert.ok(view.host.querySelector("[data-leochat-list]"));
  assert.ok(view.host.querySelector("[data-leochat-thread]"));
  assert.match(view.host.textContent, /选一个聊天开始。/);
  await act(() => {
    host.showConversation("c1");
  });
  assert.equal(view.host.querySelector('[data-stub="Inbox"]') != null, true);
  assert.equal(view.host.querySelector('[data-stub="ConversationView"]') != null, true);
  assert.doesNotMatch(view.host.textContent, /选一个聊天开始。/);
  await act(() => {
    host.setView("people");
  });
  assert.equal(view.host.querySelector('[data-stub="PeopleView"]') != null, true);
  assert.equal(view.host.querySelector('[data-stub="ConversationView"]') != null, true);
  await view.unmount();
});

test("LeoChatBody 窄：没会话只有列表；有会话只有会话；返回调 showConversation(null)", async () => {
  const host = resetHost();
  host.open();
  const view = await mount(React.createElement(LeoChatBody, { wide: false }));
  assert.ok(view.host.querySelector('[data-leochat-body="narrow"]'));
  assert.ok(view.host.querySelector("[data-leochat-list]"));
  assert.equal(view.host.querySelector("[data-leochat-thread]"), null);
  await act(() => {
    host.showConversation("c2");
  });
  assert.equal(view.host.querySelector("[data-leochat-list]"), null);
  assert.ok(view.host.querySelector("[data-leochat-thread]"));
  assert.equal(view.host.querySelector('[data-stub="ConversationView"]') != null, true);
  await view.click('[data-stub="ConversationView"]');
  assert.equal(host.getSnapshot().conversationId, null);
  assert.ok(view.host.querySelector("[data-leochat-list]"));
  assert.equal(view.host.querySelector("[data-leochat-thread]"), null);
  await view.unmount();
});

test("交易会话 talent:t1 走 DealConversationView，threadId 是 t1", async () => {
  const host = resetHost();
  host.open();
  host.showConversation("talent:t1");
  const view = await mount(React.createElement(LeoChatBody, { wide: true }));
  const deal = view.host.querySelector('[data-stub="DealConversationView"]');
  assert.ok(deal);
  assert.equal(deal.getAttribute("data-thread"), "t1");
  assert.equal(globalThis.__leoChat4Last.DealConversationView.threadId, "t1");
  assert.equal(view.host.querySelector('[data-stub="ConversationView"]'), null);
  await view.unmount();
});

test("LeoChatPage：可用且登录 ready 并认领 page；卸载后收起；境内 unavailable；未登录 signin", async () => {
  const host = resetHost();
  const ready = await mount(React.createElement(LeoChatPage, { siteKey: "music" }));
  await flush();
  assert.equal(ready.host.querySelector("[data-leochat-page]")?.getAttribute("data-leochat-page"), "ready");
  assert.equal(host.getSnapshot().surface, "page");
  assert.equal(host.getSnapshot().open, true);
  await ready.unmount();
  assert.equal(host.getSnapshot().open, false);

  const inlandHost = resetHost();
  globalThis.__leoChat4BayOn = false;
  const inland = await mount(React.createElement(LeoChatPage, { siteKey: "music" }));
  await flush();
  assert.equal(inland.host.querySelector("[data-leochat-page]")?.getAttribute("data-leochat-page"), "unavailable");
  assert.equal(inlandHost.getSnapshot().surface, "window");
  await inland.unmount();

  const signHost = resetHost();
  globalThis.__leoChat4ImOn = false;
  const signin = await mount(React.createElement(LeoChatPage, { siteKey: "music" }));
  await flush();
  assert.equal(signin.host.querySelector("[data-leochat-page]")?.getAttribute("data-leochat-page"), "signin");
  assert.ok(signin.host.querySelector("[data-bay-sign-in]"));
  assert.match(signin.host.textContent, /登录后查看聊天和联系人/);
  void signHost;
  await signin.unmount();
});

test("LeoChatPanel：active 时 surface=panel；关掉释放；request 带会话；返回收起会话", async () => {
  const host = resetHost();
  const backs = [];
  const view = await mount(
    React.createElement(LeoChatPanel, {
      active: true,
      request: { nonce: "n1", conversationId: "c9" },
      onBackChange: (back) => {
        backs.push(back);
      },
    }),
  );
  await flush();
  assert.ok(view.host.querySelector("[data-leochat-panel]"));
  assert.equal(host.getSnapshot().surface, "panel");
  assert.equal(host.getSnapshot().open, true);
  assert.equal(host.getSnapshot().conversationId, "c9");
  const backFn = [...backs].reverse().find((item) => typeof item === "function");
  assert.equal(typeof backFn, "function");
  await act(() => {
    backFn();
  });
  assert.equal(host.getSnapshot().conversationId, null);
  assert.equal(backs.at(-1), null);

  await act(() => {
    view.root.render(React.createElement(LeoChatPanel, { active: false, request: null }));
  });
  assert.equal(host.getSnapshot().surface, "window");
  assert.equal(host.getSnapshot().open, false);
  await view.unmount();
});

test("右侧栏认领着时 toggleWindow：onEvicted 一次，surface=window", async () => {
  const host = resetHost();
  let evicted = 0;
  const view = await mount(
    React.createElement(LeoChatPanel, {
      active: true,
      request: null,
      onEvicted: () => {
        evicted += 1;
      },
    }),
  );
  await flush();
  assert.equal(host.getSnapshot().surface, "panel");
  await act(() => {
    host.toggleWindow();
  });
  assert.equal(evicted, 1);
  assert.equal(host.getSnapshot().surface, "window");
  await view.unmount();
});

test("MessagesHost 小窗：page/panel 时不画，window 且 open 时画", async () => {
  const host = resetHost();
  host.claimSurface("page");
  const pageView = await mount(React.createElement(MessagesHost));
  await flush();
  assert.equal(document.querySelector('[data-testid="messages-overlay"]'), null);
  await pageView.unmount();

  const panelHost = resetHost();
  panelHost.claimSurface("panel");
  const panelView = await mount(React.createElement(MessagesHost));
  await flush();
  assert.equal(document.querySelector('[data-testid="messages-overlay"]'), null);
  await panelView.unmount();

  const winHost = resetHost();
  winHost.open();
  const winView = await mount(React.createElement(MessagesHost));
  await flush();
  assert.ok(document.querySelector('[data-testid="messages-overlay"]'));
  await winView.unmount();
});

test("LeoChatButton：点一下调 toggleWindow；整页认领着时 pressed 且 surface=page", async () => {
  const host = resetHost();
  const view = await mount(React.createElement(LeoChatButton));
  assert.equal(view.host.querySelector("[data-leochat-open]")?.getAttribute("data-leochat-surface"), "none");
  await view.click("[data-leochat-open]");
  assert.equal(host.getSnapshot().open, true);
  assert.equal(host.getSnapshot().surface, "window");
  await view.unmount();

  const pageHost = resetHost();
  pageHost.claimSurface("page");
  const pageView = await mount(React.createElement(LeoChatButton));
  const btn = pageView.host.querySelector("[data-leochat-open]");
  assert.equal(btn.getAttribute("aria-pressed"), "true");
  assert.equal(btn.getAttribute("data-leochat-surface"), "page");
  await pageView.click("[data-leochat-open]");
  assert.equal(pageHost.getSnapshot().surface, "page");
  await pageView.unmount();
});

test("workspaceNav：海外有 LeoChat 紧跟 LeoBay；境内没有；withMessages:false 没有", () => {
  globalThis.__leoChat4BayOn = true;
  const overseas = workspaceNav();
  const bayAt = overseas.findIndex((row) => row.href === "/bay");
  const chatAt = overseas.findIndex((row) => row.href === "/leochat");
  assert.ok(bayAt >= 0);
  assert.equal(chatAt, bayAt + 1);
  assert.equal(overseas[chatAt].label, "LeoChat");
  assert.equal(overseas[chatAt].href, "/leochat");

  globalThis.__leoChat4BayOn = false;
  assert.equal(
    workspaceNav().some((row) => row.href === "/leochat"),
    false,
  );

  globalThis.__leoChat4BayOn = true;
  assert.equal(
    workspaceNav({ withMessages: false }).some((row) => row.href === "/leochat"),
    false,
  );
});
