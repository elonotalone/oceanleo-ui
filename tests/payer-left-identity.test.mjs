import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { ORG_MCP_STUB_SOURCE } from "./helpers/org-api-stub.mjs";
import { TOAST_BARREL_STUB_SOURCE } from "./helpers/toast-stub.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

// ————————————————————————————————————————————————————————————————
// 0. 夹具
// ————————————————————————————————————————————————————————————————

// W11 的 `src/lib/org-api.ts` 与本文件同波并行落地。这里按 `_COMMON.md §3.8` 的
// 签名打替身，**判的是本组件怎么用那两个函数**，不是那两个函数自己——所以这份
// 测试不等 W11，W11 落地之后也不需要改。
const orgApiStub = dataModule(`
  const g = () => globalThis.__W12_ORG_API__;
  export class OrgApiError extends Error {
    constructor(code, status = 0) { super("org-api: " + code); this.code = code; this.status = status; }
  }
  export function orgApiCode(e) { return e instanceof OrgApiError ? e.code : "offline"; }
  export function orgErrorCopy(code) { return "ERR:" + code; }
  export async function listMyOrgs() { return g().listMyOrgs(); }
  export async function getOrg(orgId) { return g().getOrg(orgId); }
  ${ORG_MCP_STUB_SOURCE}
`);

const toastStub = dataModule(`
  ${TOAST_BARREL_STUB_SOURCE}
  export function useToast() {
    return {
      show: (input) => (globalThis.__W12_TOASTS__.push(input), { id: "t" }),
      info: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "info", title, description }), { id: "t" }),
      success: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "success", title, description }), { id: "t" }),
      error: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "error", title, description }), { id: "t" }),
      loading: (title, description) => (globalThis.__W12_TOASTS__.push({ kind: "loading", title, description }), { id: "t" }),
      dismiss(){}, dismissAll(){},
    };
  }
`);

const uiStub = dataModule("export function useUI(){ return (zh) => zh; }");

const OVERRIDES = {
  "../lib/org-api": orgApiStub,
  "../ui/Toast": toastStub,
  "../i18n/ui/useUI": uiStub,
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  // 模型选择器与原生宿主桥都要碰浏览器/网关，且与本波判据无关，换成空壳让这一排安静。
  "./ModelPicker": dataModule("export function ModelGroupPicker(){ return null; }"),
  "./mobile-native-actions": dataModule(
    "export function requestTaskNotificationsOnce(){}\n" +
      "export function useNativeAttachActions(){ return []; }\n" +
      "export function useNativeHandoffEntry(){ return { action: null, panel: null }; }\n" +
      "export function useNativeTaskNotifications(){}\n",
  ),
  "./LeoEntryButton": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function LeoEntryButton() {
      return createElement("button", {
        type: "button",
        "data-oceanleo-leo-entry": "",
        "aria-label": "leo",
      }, "leo");
    }
  `),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", {
        placeholder: props.placeholder,
        defaultValue: props.value || "",
        readOnly: true,
      });
    });
    export const TemplateFillArea = PromptHighlightArea;
  `),
};

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

async function load(rel) {
  return import(
    await compileModule(`src/shell/${rel}`, OVERRIDES, { missingPackageStub: lazyStub })
  );
}

const PAYER_LAST_KEY = "oceanleo.payer.last";
const { AccountMenu } = await load("AccountMenu.tsx");
const { LeoComposer } = await load("LeoComposer.tsx");

function org(id, name, extra = {}) {
  return {
    id,
    name,
    role: "member",
    canViewOrgPage: false,
    canViewAllTasks: false,
    currency: "CNY",
    ...extra,
  };
}

/**
 * 一台真 DOM + React 根。`listMyOrgs()` 是异步的，组件的「记忆 / 回落」判断全在
 * 列表到齐之后才允许发生，所以这里每次渲染都把微任务排空——否则判到的是加载态，
 * 是假绿。
 */
async function withDom(run, { orgApi = {}, storage = {} } = {}) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM, VirtualConsole } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://chat.oceanleo.com/",
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    StorageEvent: window.StorageEvent,
    CustomEvent: window.CustomEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.__W12_ORG_API__ = {
    listMyOrgs: async () => [],
    getOrg: async () => {
      throw new Error("没配 getOrg");
    },
    ...orgApi,
  };
  globalThis.__W12_TOASTS__ = [];
  for (const [key, value] of Object.entries(storage)) {
    window.localStorage.setItem(key, value);
  }

  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  const settle = () => act(async () => {});
  const render = async (Component, props) => {
    await act(async () => root.render(React.createElement(Component, props)));
    await settle();
  };

  try {
    return await run({
      window,
      render,
      settle,
      container,
      toasts: () => globalThis.__W12_TOASTS__,
      html: () => container.innerHTML,
      find: (selector) => container.querySelector(selector),
      findAll: (selector) => [...window.document.querySelectorAll(selector)],
      click: (selector) => {
        const node = container.querySelector(selector);
        assert.ok(node, `点不到 ${selector}`);
        return act(async () =>
          node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
        );
      },
      pick: async (selector, value) => {
        const node = container.querySelector(selector);
        assert.ok(node, `找不到下拉 ${selector}`);
        await act(async () => node.click());
        const label = value === "" ? "个人钱包" : value === "org-a" ? "海狮科技" : "蓝鲸传媒";
        const option = [...window.document.querySelectorAll('[role="option"]')].find((item) => item.textContent === label);
        assert.ok(option, `找不到选项 ${label}`);
        await act(async () => option.click());
      },
    });
  } finally {
    await act(async () => root.unmount());
    console.error = originalError;
    assert.deepEqual(errors, [], "render must not log console.error");
    window.close();
    delete globalThis.__W12_ORG_API__;
    delete globalThis.__W12_TOASTS__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}


for (const native of [false, true]) for (const showPayerSelector of [false, true]) {
  test(`real composer has no payer control: native=${native}, legacy prop=${showPayerSelector}`, async () => {
    await withDom(async ({ render, find, container, click }) => {
      const calls = [];
      await render(LeoComposer, { value: "hello", onChange() {}, onSubmit: (...args) => calls.push(args),
        showPayerSelector, showComputerDock: false, showAppsBar: false,
        conversation: native ? { kind: "native", computerId: "test", program: "codex", view: "chat" }
          : { kind: "oceanleo", target: { kind: "cloud" } } });
      assert.equal(Boolean(find('[data-payer-selector], [data-leo-payer]')), false);
      assert.doesNotMatch(container.textContent, /个人钱包|Personal wallet|这次谁付钱/);
      await click('button[aria-label="发送"]');
      assert.equal(calls.length, 1);
      assert.equal(calls[0][1], undefined, "composer must not override identity");
    }, { storage: { [PAYER_LAST_KEY]: "org-a" }, orgApi: { listMyOrgs: async () => [org("org-a", "Team")] } });
  });
}

const accountProps = { name: "Test", balanceText: "0", orgHref: "/org", homeHref: "/", helpHref: null,
  docsHref: "/docs", onOpenSettings() {}, onSignOut() {} };
test("AccountMenu reconciles a removed team on initial load without opening the menu", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  await withDom(async ({ render, window, settle, click }) => {
    await render(AccountMenu, accountProps);
    assert.equal(window.localStorage.getItem(PAYER_LAST_KEY), "removed");
    await act(async () => finish([org("org-a", "Team A")]));
    await settle();
    assert.equal(window.localStorage.getItem(PAYER_LAST_KEY), null);
    await click('[data-account-trigger]');
    assert.match(window.document.querySelector('[data-account-identity]').textContent, /个人/);
  }, { storage: { [PAYER_LAST_KEY]: "removed" }, orgApi: { listMyOrgs: () => pending } });
});

test("AccountMenu selection is the only writer and cross-tab stale identities fall back", async () => {
  await withDom(async ({ render, window, click }) => {
    await render(AccountMenu, accountProps);
    await click('[data-account-trigger]');
    const identityButton = window.document.querySelector('[data-account-identity]').closest('button');
    await act(async () => identityButton.click());
    const team = [...window.document.querySelectorAll('[role="menuitem"]')].find(x => x.textContent.includes("Team A"));
    assert.ok(team);
    await act(async () => team.click());
    assert.equal(window.localStorage.getItem(PAYER_LAST_KEY), "org-a");
    await act(async () => {
      window.localStorage.setItem(PAYER_LAST_KEY, "removed");
      window.dispatchEvent(new window.StorageEvent("storage", { key: PAYER_LAST_KEY, newValue: "removed" }));
    });
    assert.equal(window.localStorage.getItem(PAYER_LAST_KEY), null);
  }, { orgApi: { listMyOrgs: async () => [org("org-a", "Team A")] } });
});

const { Composer: LeoChatComposer } = await import(await compileModule("src/shell/messages/composer/Composer.tsx", {
  "../../../i18n/ui/useUI": uiStub,
  "./drafts": dataModule("export const draftBook = {read: async () => '@leo hello', write(){}, clear(){}, saver:{flush:async()=>{}}};"),
  "../realtime/hooks": dataModule("export function sendTyping(){}"),
  "../../replay/work/ReplayPickerDialog": dataModule("export function ReplayPickerDialog(){return null;}"),
  "./ArtifactPickerDialog": dataModule("export function ArtifactPickerDialog(){return null;}"),
  "./VoiceRecorder": dataModule("export function VoiceRecorder(){return null;}"),
  "./EmojiPicker": dataModule("export function EmojiPicker(){return null;}"),
}));

test("real LeoChat composer sends the current left identity after draft loading", async () => {
  await withDom(async ({ render, click, window, container }) => {
    const calls = [];
    const props = { store: { send: input => calls.push(input) }, viewerId: "me", layout: "full",
      conversation: { id: "c1", kind: "team", org_id: "different-team", leo_enabled: true, members: [] } };
    for (const [i, identity] of ["org-a", "org-b", ""].entries()) {
      identity ? window.localStorage.setItem(PAYER_LAST_KEY, identity) : window.localStorage.removeItem(PAYER_LAST_KEY);
      await render(LeoChatComposer, { ...props, conversationId: `c${i}` });
      assert.doesNotMatch(container.textContent, /个人钱包|Personal wallet|这次谁付钱/);
      await click('button[aria-label="发送"]');
      assert.equal(calls.at(-1).mention_leo, true);
      assert.equal(calls.at(-1).leo_payer_org_id, identity || undefined);
    }
    assert.equal(calls.length, 3);
  });
});

const { createTask } = await import(await compileModule("src/lib/agent.ts", {
  "./auth/client": dataModule("export async function accessToken(){return 'test';} export function cachedAccessToken(){return 'test';} export async function getUserId(){return 'test';}"),
  "./auth/config": dataModule("export const GATEWAY_BASE='https://gateway.test'; export function gatewayBase(){return GATEWAY_BASE;}"),
  "./history-events": dataModule("export function notifyHistoryChanged(){}"),
  "./fn-agent": dataModule("export {};"),
}, { missingPackageStub: lazyStub }));

test("createTask request follows left identity and never carries a team rejected by AccountMenu", async () => {
  const previousFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init = {}) => {
    if (init.body) bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({task_id: "t1"}) };
  };
  try {
    await withDom(async ({ render, window }) => {
      await render(AccountMenu, accountProps);
      await createTask({prompt: "removed membership"});
      assert.equal(bodies.at(-1).org_id, "");
      for (const identity of ["org-a", "org-b", ""]) {
        identity ? window.localStorage.setItem(PAYER_LAST_KEY, identity) : window.localStorage.removeItem(PAYER_LAST_KEY);
        await createTask({prompt: "new send"});
        assert.equal(bodies.at(-1).org_id, identity);
      }
    }, { storage: { [PAYER_LAST_KEY]: "removed" }, orgApi: { listMyOrgs: async () => [org("org-a", "A"), org("org-b", "B")] } });
  } finally { globalThis.fetch = previousFetch; }
});

const { SettingsIdentityCard } = await import(await compileModule("src/pages/settings/SettingsIdentityCard.tsx", OVERRIDES, { missingPackageStub: lazyStub }));
test("settings identity shortcut uses the same AccountMenu selection action", async () => {
  await withDom(async ({ render, window, click }) => {
    await render(SettingsIdentityCard, { displayName: "Test", userEmail: "test@example.test" });
    await click('[data-settings-identity]');
    const team = [...window.document.querySelectorAll('[role="menuitem"]')].find(x => x.textContent.includes("Team A"));
    assert.ok(team);
    await act(async () => team.click());
    assert.equal(window.localStorage.getItem(PAYER_LAST_KEY), "org-a");
    assert.equal(window.document.querySelector('[data-settings-identity-kind]').textContent, "Team A");
  }, { orgApi: { listMyOrgs: async () => [org("org-a", "Team A")] } });
});
