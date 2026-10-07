// 管理登录方式页（account-manus-layout W3）。
//
// 人侧：国外三行 Google / Microsoft / Apple；国内邮箱 / 手机 / 微信。
// 已绑显示 identity_data.email 和「断开」，未绑「连接」。
// 微信合成邮箱不准上屏。连接走 linkSignInMethod 后 window.location.assign。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/sign-in-methods-page.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const navigations = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => navigations.push(String(e && e.message ? e.message : e)));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/settings/account/sign-in-methods",
  virtualConsole,
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiI18nStub = dataModule(`
  export function useUI() {
    return (zh, vars) =>
      vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const domainStub = dataModule(`
  export function currentDomainFamily() {
    return globalThis.__W3_FAMILY__ || "com";
  }
`);

const identityStub = dataModule(`
  const g = () => globalThis.__W3_AUTH__;
  export async function getAccountProfile() { return g().getAccountProfile(); }
  export async function linkSignInMethod(provider) { return g().linkSignInMethod(provider); }
  export async function unlinkSignInMethod(identity) { return g().unlinkSignInMethod(identity); }
`);

const clientStub = dataModule(`
  const g = () => globalThis.__W3_AUTH__;
  export const AUTH_STATE_EVENT = "oceanleo:auth-state";
  export function cnPhoneIsBound(user) {
    if (!user) return false;
    return Boolean(String(user.phone || "").trim() && String(user.phone_confirmed_at || "").trim());
  }
  export function maskCnPhone(phone) {
    const digits = String(phone || "").replace(/\\D/g, "").replace(/^86/, "");
    if (digits.length < 7) return "****";
    return digits.slice(0, 3) + "****" + digits.slice(-4);
  }
  export async function getAuthPhoneUser() { return g().getAuthPhoneUser(); }
  export async function wechatLoginUrl(redirect) { return g().wechatLoginUrl(redirect); }
`);

const confirmStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }) {
    return React.createElement(
      "div",
      { "data-sign-in-confirm": "" },
      React.createElement("p", { "data-sign-in-confirm-title": "" }, title),
      React.createElement("p", { "data-sign-in-confirm-body": "" }, body),
      React.createElement("button", { type: "button", "data-sign-in-confirm-ok": "", onClick: onConfirm }, confirmLabel),
      React.createElement("button", { type: "button", "data-sign-in-confirm-cancel": "", onClick: onCancel }, "取消"),
    );
  }
`);

const authDialogStub = dataModule(`
  export const AUTH_METHODS_CN = ["email", "phone", "wechat"];
  export const AUTH_METHODS_INTL = ["email", "google", "microsoft", "apple"];
  export function authMethodsForFamily(family) {
    return family === "cn" ? AUTH_METHODS_CN : AUTH_METHODS_INTL;
  }
`);

const phoneBindStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PhoneBindForm({ onSuccess, submitLabel }) {
    return React.createElement(
      "form",
      { "data-phone-bind-form": "" },
      React.createElement(
        "button",
        { type: "button", "data-phone-bind-success": "", onClick: () => onSuccess?.() },
        submitLabel || "验证并绑定",
      ),
    );
  }
`);

const compiled = await compileModule("src/pages/settings/account/SignInMethodsPage.tsx", {
  "../../../i18n/ui/useUI": uiI18nStub,
  "../../../contracts/domain-family": domainStub,
  "../../../lib/auth/account-identity": identityStub,
  "../../../lib/auth/client": clientStub,
  "../../../ui": confirmStub,
  "../../AuthDialog": authDialogStub,
  "../../PhoneBindGate": phoneBindStub,
});

const {
  SignInMethodsPage,
  signInMethodsForFamily,
  isSyntheticWechatEmail,
} = await import(compiled);

function googleProfile(extraIdentities = []) {
  return {
    userId: "u-1",
    displayName: "Elon L",
    sessionContact: {
      kind: "email",
      value: "elonlee63@gmail.com",
      provider: "google",
    },
    identities: [
      {
        id: "id-google",
        provider: "google",
        identity_data: { email: "elonlee63@gmail.com" },
      },
      ...extraIdentities,
    ],
  };
}

function installAuth(overrides = {}) {
  navigations.length = 0;
  const links = [];
  const unlinks = [];
  const wechat = [];
  globalThis.__W3_FAMILY__ = overrides.family || "com";
  globalThis.__W3_AUTH__ = {
    profile: overrides.profile || googleProfile(),
    phoneUser: overrides.phoneUser || { user: null },
    async getAccountProfile() {
      return this.profile;
    },
    async getAuthPhoneUser() {
      return this.phoneUser;
    },
    async linkSignInMethod(provider) {
      links.push(provider);
      if (overrides.linkError) return { error: overrides.linkError };
      return { url: "https://oauth.test/" + provider };
    },
    async unlinkSignInMethod(identity) {
      unlinks.push(identity);
      if (overrides.unlinkError) return { error: overrides.unlinkError };
      return {};
    },
    async wechatLoginUrl(redirect) {
      wechat.push(redirect || "");
      if (overrides.wechatError) return { error: overrides.wechatError };
      return { url: "https://wechat.test/qr" };
    },
  };
  return { links, unlinks, wechat };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
}

async function render(props = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(SignInMethodsPage, props));
  });
  await flush();
  return {
    host,
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("intl 固定三行 Google / Microsoft / Apple，已绑 google 显示邮箱和断开", async () => {
  installAuth();
  const view = await render({ family: "com" });
  const root = view.host.querySelector("[data-sign-in-methods]");
  assert.ok(root, "data-sign-in-methods 必须存在");
  const methods = [...view.host.querySelectorAll("[data-sign-in-method]")].map((node) =>
    node.getAttribute("data-sign-in-method"),
  );
  assert.deepEqual(methods, ["google", "microsoft", "apple"]);
  const google = view.host.querySelector("[data-sign-in-method=google]");
  assert.match(google.textContent, /Google/);
  assert.match(google.textContent, /elonlee63@gmail.com/);
  assert.match(google.textContent, /断开/);
  assert.ok(view.host.querySelector("[data-sign-in-disconnect=google]"));
  const microsoft = view.host.querySelector("[data-sign-in-method=microsoft]");
  assert.match(microsoft.textContent, /Microsoft/);
  assert.match(microsoft.textContent, /连接/);
  assert.ok(view.host.querySelector("[data-sign-in-connect=microsoft]"));
  const apple = view.host.querySelector("[data-sign-in-method=apple]");
  assert.match(apple.textContent, /Apple/);
  assert.match(apple.textContent, /连接/);
  assert.ok(view.host.querySelector("[data-sign-in-connect=apple]"));
  assert.equal(view.host.querySelector("[data-sign-in-method=wechat]"), null);
  assert.equal(view.host.querySelector("[data-sign-in-method=google]") !== null, true);
  view.cleanup();
});

test("cn 没有 Google / Apple，有微信或手机行", async () => {
  installAuth({
    family: "cn",
    profile: {
      userId: "u-cn",
      displayName: "用户",
      sessionContact: { kind: "email", value: "a@oceanleo.cn", provider: "email" },
      identities: [
        { provider: "email", identity_data: { email: "a@oceanleo.cn" } },
      ],
    },
  });
  const view = await render({ family: "cn" });
  assert.ok(view.host.querySelector("[data-sign-in-methods]"));
  assert.equal(view.host.querySelector("[data-sign-in-method=google]"), null);
  assert.equal(view.host.querySelector("[data-sign-in-method=apple]"), null);
  assert.equal(view.host.querySelector("[data-sign-in-method=microsoft]"), null);
  assert.equal(view.host.textContent.includes("Google"), false);
  assert.equal(view.host.textContent.includes("Apple"), false);
  const cnMethods = [...view.host.querySelectorAll("[data-sign-in-method]")].map((node) =>
    node.getAttribute("data-sign-in-method"),
  );
  assert.deepEqual(cnMethods, ["email", "phone", "wechat"]);
  assert.ok(
    view.host.querySelector("[data-sign-in-method=wechat]") ||
      view.host.querySelector("[data-sign-in-method=phone]"),
  );
  assert.match(view.host.querySelector("[data-sign-in-method=email]").textContent, /邮箱登录/);
  assert.match(view.host.querySelector("[data-sign-in-method=wechat]").textContent, /微信/);
  view.cleanup();
});

test("连接未绑的 Microsoft 会 linkSignInMethod 再 location.assign", async () => {
  const auth = installAuth();
  const view = await render({ family: "com" });
  await view.click(view.host.querySelector("[data-sign-in-connect=microsoft]"));
  assert.deepEqual(auth.links, ["microsoft"]);
  assert.ok(
    navigations.some((m) => /Not implemented: navigation/i.test(m)),
    `未观察到 location.assign 跳转，实际 jsdomError: ${JSON.stringify(navigations)}`,
  );
  view.cleanup();
});

test("只剩一种时点断开会提示至少保留一种登录方式，不弹确认", async () => {
  installAuth();
  const view = await render({ family: "com" });
  await view.click(view.host.querySelector("[data-sign-in-disconnect=google]"));
  assert.equal(view.host.querySelector("[data-sign-in-confirm]"), null);
  assert.match(view.host.querySelector("[data-sign-in-error]").textContent, /至少保留一种登录方式/);
  view.cleanup();
});

test("多于一种时断开先确认再 unlinkSignInMethod", async () => {
  const auth = installAuth({
    profile: googleProfile([
      {
        id: "id-ms",
        provider: "azure",
        identity_data: { email: "elonlee63@outlook.com" },
      },
    ]),
  });
  const view = await render({ family: "com" });
  const ms = view.host.querySelector("[data-sign-in-method=microsoft]");
  assert.match(ms.textContent, /elonlee63@outlook.com/);
  assert.match(ms.textContent, /断开/);
  await view.click(view.host.querySelector("[data-sign-in-disconnect=google]"));
  assert.match(
    view.host.querySelector("[data-sign-in-confirm-body]").textContent,
    /断开后将不能再用这个方式登录/,
  );
  await view.click(view.host.querySelector("[data-sign-in-confirm-ok]"));
  assert.equal(auth.unlinks.length, 1);
  assert.equal(auth.unlinks[0].provider, "google");
  assert.match(view.host.querySelector("[data-sign-in-notice]").textContent, /已断开/);
  view.cleanup();
});

test("微信合成邮箱不上屏", async () => {
  installAuth({
    family: "cn",
    profile: {
      userId: "u-wx",
      displayName: "微信用户",
      sessionContact: { kind: "wechat", value: "", provider: "wechat" },
      identities: [
        {
          provider: "email",
          identity_data: { email: "wx_abc123@wechat.oceanleo.com" },
        },
      ],
    },
  });
  const view = await render({ family: "cn" });
  assert.equal(view.host.textContent.includes("wechat.oceanleo.com"), false);
  assert.equal(view.host.textContent.includes("wx_abc123"), false);
  assert.ok(view.host.querySelector("[data-sign-in-disconnect=wechat]"));
  view.cleanup();
});

test("国内微信连接走 wechatLoginUrl", async () => {
  const auth = installAuth({
    family: "cn",
    profile: {
      userId: "u-cn",
      displayName: "用户",
      sessionContact: { kind: "email", value: "a@oceanleo.cn", provider: "email" },
      identities: [{ provider: "email", identity_data: { email: "a@oceanleo.cn" } }],
    },
  });
  const view = await render({ family: "cn" });
  await view.click(view.host.querySelector("[data-sign-in-connect=wechat]"));
  assert.equal(auth.wechat.length, 1);
  assert.ok(
    navigations.some((m) => /Not implemented: navigation/i.test(m)),
    `未观察到 wechat location.assign 跳转，实际 jsdomError: ${JSON.stringify(navigations)}`,
  );
  view.cleanup();
});

test("国内未绑手机点连接展开 PhoneBindForm", async () => {
  installAuth({
    family: "cn",
    profile: {
      userId: "u-cn",
      displayName: "用户",
      sessionContact: { kind: "email", value: "a@oceanleo.cn", provider: "email" },
      identities: [{ provider: "email", identity_data: { email: "a@oceanleo.cn" } }],
    },
  });
  const view = await render({ family: "cn" });
  assert.equal(view.host.querySelector("[data-phone-bind-form]"), null);
  await view.click(view.host.querySelector("[data-sign-in-connect=phone]"));
  assert.ok(view.host.querySelector("[data-phone-bind-form]"));
  await view.click(view.host.querySelector("[data-phone-bind-success]"));
  assert.match(view.host.querySelector("[data-sign-in-notice]").textContent, /已连接/);
  view.cleanup();
});

test("W1 的 { profile } 包装和 identity.email 也能画出已绑邮箱", async () => {
  installAuth({
    profile: {
      profile: {
        userId: "u-1",
        displayName: "Elon L",
        sessionContact: {
          kind: "email",
          value: "elonlee63@gmail.com",
          provider: "google",
        },
        identities: [
          {
            id: "id-google",
            identityId: "id-google",
            provider: "google",
            email: "elonlee63@gmail.com",
          },
        ],
      },
    },
  });
  const view = await render({ family: "com" });
  assert.match(
    view.host.querySelector("[data-sign-in-method=google]").textContent,
    /elonlee63@gmail.com/,
  );
  assert.ok(view.host.querySelector("[data-sign-in-disconnect=google]"));
  view.cleanup();
});

test("signInMethodsForFamily：国外无邮箱行、国内无 Google", () => {
  assert.deepEqual([...signInMethodsForFamily("com")], ["google", "microsoft", "apple"]);
  assert.deepEqual([...signInMethodsForFamily("cn")], ["email", "phone", "wechat"]);
  assert.equal(isSyntheticWechatEmail("wx_abc@wechat.oceanleo.com"), true);
  assert.equal(isSyntheticWechatEmail("elonlee63@gmail.com"), false);
});
