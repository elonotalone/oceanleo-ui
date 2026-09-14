// 国内版绑手机（W8）：当前账号上的 phone_change，不是登录 OTP。
//
// 跑法（必须带 loader，与 account-security-w4 相同；裸跑 node --test 会在加载期打哑）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/phone-bind.test.mjs

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { PHONE_BIND_COPY_SOURCE } from "../src/i18n/ui/messages/phone-bind-copy-base.ts";
import { PHONE_BIND_MESSAGES } from "../src/i18n/ui/messages/phone-bind-copy.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (zh, vars) =>
      vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const familyStubUrl = dataModule(`
  export function currentDomainFamily() {
    return globalThis.__PHONE_FAMILY__ || "cn";
  }
  export function currentDomainProfile() {
    const family = currentDomainFamily();
    return { family, gatewayOrigin: "", cookieDomain: "", portalOrigin: "" };
  }
  export function domainProfileForHost() { return currentDomainProfile(); }
  export function familyForHost() { return currentDomainFamily(); }
`);

const uiKitStubUrl = dataModule(`
  export function ButtonSpinner({ label }) { return label; }
`);

const clientStubUrl = dataModule(`
  const g = () => globalThis.__PHONE_BIND__ || {};
  export const AUTH_STATE_EVENT = "oceanleo:auth-state";
  export const PHONE_REQUIRED_EVENT = "oceanleo:phone-required";
  export function announcePhoneRequired() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oceanleo:phone-required"));
    }
  }
  export async function accessToken() { return "test-token"; }
  export const oceanleoConfigured = () => true;
  export function normalizeCnPhone(raw) {
    const s = (raw || "").replace(/[\\s\\-()]/g, "");
    if (!s) return "";
    let digits = s;
    if (digits.startsWith("+")) digits = digits.slice(1);
    if (digits.startsWith("0086")) digits = digits.slice(4);
    else if (digits.startsWith("86") && digits.length === 13) digits = digits.slice(2);
    return /^1[3-9]\\d{9}$/.test(digits) ? "+86" + digits : "";
  }
  export function cnPhoneIsBound(user) {
    if (!user) return false;
    return Boolean(String(user.phone || "").trim() && String(user.phone_confirmed_at || "").trim());
  }
  export function maskCnPhone(phone) {
    const n = normalizeCnPhone(phone);
    const digits = (n || String(phone || "").replace(/[\\s\\-()]/g, "")).replace(/^\\+86/, "");
    if (!/^1[3-9]\\d{9}$/.test(digits)) return "****";
    return digits.slice(0, 3) + "****" + digits.slice(7);
  }
  export async function getAuthPhoneUser() {
    return g().getAuthPhoneUser ? g().getAuthPhoneUser() : { user: null };
  }
  export async function requestPhoneChange(...a) {
    return g().requestPhoneChange ? g().requestPhoneChange(...a) : {};
  }
  export async function verifyPhoneChange(...a) {
    return g().verifyPhoneChange ? g().verifyPhoneChange(...a) : {};
  }
  export async function listMfaFactors() { return { factors: [] }; }
  export async function currentAal() { return { current: "aal1", next: "aal1" }; }
  export async function enrollTotp() { return {}; }
  export async function challengeAndVerify() { return {}; }
  export async function unenrollFactor() { return {}; }
  export async function reauthenticate() { return {}; }
  export async function updatePassword() { return {}; }
  export async function signOutEverywhere() {}
`);

const gateUrl = await compileModule("src/pages/PhoneBindGate.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/auth/client": clientStubUrl,
  "../contracts/domain-family": familyStubUrl,
  "../ui": uiKitStubUrl,
  "react-dom": reactDomUrl,
});

const securityUrl = await compileModule("src/pages/AccountSecurityPage.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/auth/client": clientStubUrl,
  "../lib/auth": dataModule(`
    export const oceanleoConfigured = () => true;
    export const loginUnavailableNotice = () => null;
  `),
  "../lib/auth/account-security": dataModule(`
    export async function getSecurityEvents() { return { ok: false, code: "not_available" }; }
    export async function getSecuritySessions() { return { ok: false, code: "not_available" }; }
    export async function getWalletLimit() { return { ok: false, code: "not_available" }; }
    export async function revokeSecuritySession() { return { ok: false }; }
    export async function setWalletLimit() { return { ok: false }; }
    export function fenToYuan(n) { return String((Number(n) || 0) / 100); }
    export function yuanToFen(s) { const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) : null; }
  `),
  "../lib/money": dataModule(`
    export function currencySymbol() { return "¥"; }
    export function formatMinor(n) { return String(n); }
  `),
  "../contracts/domain-family": familyStubUrl,
  "../ui": dataModule(`
    export function ButtonSpinner({ label }) { return label; }
    export function ConfirmDialog() { return null; }
  `),
  "react-dom": reactDomUrl,
});

const { PhoneBindGate, PhoneBindForm, PHONE_BIND_OTP_COOLDOWN_SECONDS } =
  await import(gateUrl);
const { AccountSecurityPage } = await import(securityUrl);

const supabaseStubUrl = dataModule(`
  export function createBrowserClient() { return globalThis.__SUPA__; }
`);
const configStubUrl = dataModule(`
  export const SUPABASE_URL = "https://example.supabase.co";
  export const SUPABASE_ANON_KEY = "anon";
  export const GATEWAY_BASE = "https://api.example";
  export function cookieOptions() { return {}; }
  export function configured() { return true; }
  export function isLeoDevPreviewHost() { return false; }
`);
const realClientUrl = await compileModule("src/lib/auth/client.ts", {
  "@supabase/ssr": supabaseStubUrl,
  "./config": configStubUrl,
  "./auth-fetch": dataModule("export const authFetch = fetch;"),
  "./preview-cookies": dataModule("export function createLeoDevPreviewCookieJar() { return null; }"),
  "./captcha": dataModule(`
    export async function getCaptchaToken() { return null; }
    export function mapCaptchaError(raw) { return raw == null ? undefined : String(raw); }
  `),
});
const {
  requestPhoneChange,
  verifyPhoneChange,
  cnPhoneIsBound,
  maskCnPhone,
  normalizeCnPhone,
  PHONE_REQUIRED_EVENT,
} = await import(realClientUrl);

const clientSource = await readFile(resolve("src/lib/auth/client.ts"), "utf8");
const accountSource = await readFile(resolve("src/lib/auth/account.ts"), "utf8");
const gateSource = await readFile(resolve("src/pages/PhoneBindGate.tsx"), "utf8");
const securitySource = await readFile(resolve("src/pages/AccountSecurityPage.tsx"), "utf8");
const appShellSource = await readFile(resolve("src/shell/AppShell.tsx"), "utf8");
const dialogSource = await readFile(resolve("src/pages/AuthDialog.tsx"), "utf8");

function defaultBind() {
  return {
    calls: [],
    async getAuthPhoneUser() {
      return { user: { id: "u1", phone: "", phone_confirmed_at: null } };
    },
    async requestPhoneChange(phone) {
      this.calls.push(["requestPhoneChange", phone]);
      return {};
    },
    async verifyPhoneChange(phone, token) {
      this.calls.push(["verifyPhoneChange", phone, token]);
      return {};
    },
  };
}

async function withDom(run, { family = "cn", bind = defaultBind(), url = "https://ppt.oceanleo.cn/app" } = {}) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url,
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
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
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.__PHONE_FAMILY__ = family;
  globalThis.__PHONE_BIND__ = bind;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ detail: "not found" }),
  });

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const find = (selector) => window.document.querySelector(selector);
  const type = (selector, value) => {
    const node = find(selector);
    assert.ok(node, `找不到输入框 ${selector}`);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    return act(async () => {
      setter.call(node, value);
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const submit = (selector) => {
    const node = find(selector);
    assert.ok(node, `找不到表单 ${selector}`);
    return act(async () =>
      node.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
    );
  };

  try {
    await run({
      window,
      bind,
      find,
      type,
      submit,
      text: () => window.document.body.textContent || "",
      render: (Component, props) => act(async () => root.render(React.createElement(Component, props))),
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    delete globalThis.__PHONE_BIND__;
    delete globalThis.__PHONE_FAMILY__;
    globalThis.fetch = previousFetch;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("冷却秒数与登录门同为 60", () => {
  assert.equal(PHONE_BIND_OTP_COOLDOWN_SECONDS, 60);
});

test("cnPhoneIsBound 要号码且要 phone_confirmed_at", () => {
  assert.equal(cnPhoneIsBound(null), false);
  assert.equal(cnPhoneIsBound({ phone: "+8613812345678" }), false);
  assert.equal(cnPhoneIsBound({ phone_confirmed_at: "2026-01-01" }), false);
  assert.equal(
    cnPhoneIsBound({ phone: "+8613812345678", phone_confirmed_at: "2026-01-01T00:00:00Z" }),
    true,
  );
});

test("maskCnPhone 打码，不露出完整号", () => {
  assert.equal(maskCnPhone("13812345678"), "138****5678");
  assert.equal(maskCnPhone("+8613812345678"), "138****5678");
  assert.equal(maskCnPhone("bad"), "****");
});

test("绑号走 updateUser + phone_change，不是 signInWithOtp", async () => {
  const requestFn = clientSource.slice(
    clientSource.indexOf("export async function requestPhoneChange"),
    clientSource.indexOf("export async function verifyPhoneChange"),
  );
  const verifyFn = clientSource.slice(
    clientSource.indexOf("export async function verifyPhoneChange"),
    clientSource.indexOf("// --- 微信登录"),
  );
  assert.match(requestFn, /updateUser\(\{\s*phone/);
  assert.doesNotMatch(requestFn, /signInWithOtp/);
  assert.match(verifyFn, /type:\s*"phone_change"/);
  assert.match(verifyFn, /refreshSession\(\)/);
  assert.doesNotMatch(verifyFn, /signInWithOtp/);
  const gateCode = gateSource
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
  assert.doesNotMatch(gateCode, /signInWithOtp|sendPhoneOtp|verifyPhoneOtp/);
  assert.doesNotMatch(securitySource, /signInWithOtp/);
  assert.doesNotMatch(dialogSource, /requestPhoneChange|PhoneBindGate|phone_change/);

  const calls = [];
  globalThis.__SUPA__ = {
    auth: {
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async updateUser(attrs) {
        calls.push(["updateUser", attrs]);
        return { data: {}, error: null };
      },
      async verifyOtp(args) {
        calls.push(["verifyOtp", args]);
        return { data: { session: { access_token: "t" } }, error: null };
      },
      async refreshSession() {
        calls.push(["refreshSession"]);
        return { data: { session: { access_token: "t2" } }, error: null };
      },
      async signInWithOtp() {
        calls.push(["signInWithOtp"]);
        return { error: null };
      },
      async getUser() {
        return { data: { user: null }, error: null };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
  };

  const sent = await requestPhoneChange("13812345678");
  assert.equal(sent.error, undefined);
  const verified = await verifyPhoneChange("13812345678", "123456");
  assert.equal(verified.error, undefined);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["updateUser", "verifyOtp", "refreshSession"],
  );
  assert.equal(calls[0][1].phone, normalizeCnPhone("13812345678"));
  assert.equal(calls[1][1].type, "phone_change");
  assert.equal(calls[1][1].phone, "+8613812345678");
});

test("非法号码走 normalizeCnPhone 失败文案，不发请求", async () => {
  const bad = await requestPhoneChange("12345");
  assert.equal(bad.error, "请输入有效的中国大陆手机号。");
  assert.equal(normalizeCnPhone("12345"), "");
});

test("authed 把 phone_required 收成同一块绑卡事件", () => {
  assert.match(accountSource, /phone_required/);
  assert.match(accountSource, /announcePhoneRequired/);
  assert.match(accountSource, /PHONE_REQUIRED_EVENT|phone_required/);
  assert.equal(PHONE_REQUIRED_EVENT, "oceanleo:phone-required");
});

test("AppShell 两支布局都挂 PhoneBindGate；登录门不另写一套", () => {
  assert.equal((appShellSource.match(/<PhoneBindGate\s*\/>/g) || []).length, 2);
  assert.match(dialogSource, /目前仅开放被邀请的账号登录。/);
});

test("cn + 已登录 + 无 phone_confirmed_at → 出现绑卡；com → 不出现", async () => {
  await withDom(async ({ render, find, text }) => {
    await render(PhoneBindGate);
    assert.ok(find("[data-phone-bind-gate]"), "国内版未绑必须盖住");
    assert.ok(text().includes("绑定手机号"));
  }, { family: "cn" });

  await withDom(async ({ render, find }) => {
    await render(PhoneBindGate);
    assert.equal(find("[data-phone-bind-gate]"), null);
  }, { family: "com", url: "https://ppt.oceanleo.com/app" });
});

test("网关 code: phone_required 会打开绑卡", async () => {
  const bind = defaultBind();
  bind.getAuthPhoneUser = async () => ({
    user: { id: "u1", phone: "+8613812345678", phone_confirmed_at: "2026-01-01T00:00:00Z" },
  });
  await withDom(async ({ render, find, window }) => {
    await render(PhoneBindGate);
    assert.equal(find("[data-phone-bind-gate]"), null, "已绑时不该先弹");
    await act(async () => {
      window.dispatchEvent(new window.CustomEvent("oceanleo:phone-required"));
    });
    assert.ok(find("[data-phone-bind-gate]"), "phone_required 必须打开同一块绑卡");
  }, { family: "cn", bind });
});

test("com 上 phone_required 也不打开绑卡", async () => {
  await withDom(async ({ render, find, window }) => {
    await render(PhoneBindGate);
    await act(async () => {
      window.dispatchEvent(new window.CustomEvent("oceanleo:phone-required"));
    });
    assert.equal(find("[data-phone-bind-gate]"), null);
  }, { family: "com", url: "https://ppt.oceanleo.com/app" });
});

test("表单非法号码给出失败文案，且不调用 requestPhoneChange", async () => {
  const bind = defaultBind();
  await withDom(async ({ render, type, submit, text, find }) => {
    await render(PhoneBindForm, {
      tt: (zh, vars) =>
        vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh,
      submitLabel: "验证并绑定",
    });
    await type("#oceanleo-phone-bind-number", "12345");
    await submit("[data-phone-bind-form]");
    assert.ok(text().includes("请输入有效的中国大陆手机号。"));
    assert.deepEqual(bind.calls, []);
    assert.equal(find("[data-phone-bind-error]").textContent, "请输入有效的中国大陆手机号。");
  }, { family: "cn", bind });
});

test("有效号码调用 requestPhoneChange，不是 signInWithOtp", async () => {
  const bind = defaultBind();
  await withDom(async ({ render, type, submit }) => {
    await render(PhoneBindForm, {
      tt: (zh) => zh,
      submitLabel: "验证并绑定",
    });
    await type("#oceanleo-phone-bind-number", "13812345678");
    await submit("[data-phone-bind-form]");
    assert.deepEqual(bind.calls, [["requestPhoneChange", "13812345678"]]);
    await type("#oceanleo-phone-bind-otp", "123456");
    await submit("[data-phone-bind-form]");
    assert.deepEqual(bind.calls[1], ["verifyPhoneChange", "13812345678", "123456"]);
  }, { family: "cn", bind });
});

test("账号安全：仅 cn 渲染手机号块，能看见打码号码", async () => {
  const bind = defaultBind();
  bind.getAuthPhoneUser = async () => ({
    user: { id: "u1", phone: "+8613812345678", phone_confirmed_at: "2026-01-01T00:00:00Z" },
  });
  await withDom(async ({ render, find, text }) => {
    await render(AccountSecurityPage, { embedded: true });
    assert.ok(find('[data-security-section="phone"]'));
    assert.ok(text().includes("138****5678"));
    assert.ok(find("[data-security-change-phone]"));
    assert.ok(text().includes("support@oceanleo.com"));
  }, { family: "cn", bind });

  await withDom(async ({ render, find }) => {
    await render(AccountSecurityPage, { embedded: true });
    assert.equal(find('[data-security-section="phone"]'), null);
  }, { family: "com", bind, url: "https://ppt.oceanleo.com/account" });
});

const TRANSLATED = LOCALES.filter((l) => l !== "zh");
const NON_CJK = LOCALES.filter((l) => !["zh", "zh-TW", "ja", "ko"].includes(l));

function hasHan(value) {
  return /[\u4e00-\u9fff]/.test(value);
}

function ttLiterals(source) {
  return [...source.matchAll(/\btt\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    JSON.parse(`"${m[1]}"`),
  );
}

test("词典：tt() 字面量都在 17 语里", () => {
  const keys = Object.values(PHONE_BIND_COPY_SOURCE);
  assert.ok(keys.length >= 12, `原文表太短：${keys.length}`);
  for (const key of keys) {
    assert.equal(PHONE_BIND_MESSAGES.zh[key], key);
    assert.equal(UI_MESSAGES.zh[key], key);
    for (const locale of TRANSLATED) {
      const value = UI_MESSAGES[locale][key];
      assert.equal(typeof value, "string", `${locale} 缺「${key}」`);
      assert.notEqual(value.trim(), "", `${locale} 的「${key}」是空串`);
      assert.deepEqual(
        [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
        [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
        `${locale} 丢了插值：${key}`,
      );
    }
    for (const locale of NON_CJK) {
      assert.equal(hasHan(UI_MESSAGES[locale][key]), false, `${locale} 残留汉字：${key}`);
    }
  }

  const scanned = [...ttLiterals(gateSource), ...ttLiterals(securitySource)].filter(hasHan);
  const missing = [];
  for (const key of new Set(scanned)) {
    for (const locale of TRANSLATED) {
      if (!UI_MESSAGES[locale][key]) missing.push(`${key} → 缺 ${locale}`);
    }
  }
  assert.deepEqual(missing.sort(), [], "有新文案没补译文");
});
