// 用户看得见的账号安全（W4，2026-08-21）的判据。
//
// 这一波补的是「被盗号时用户唯一能自救的那几屏」：找回密码、两步验证的开与关、
// 账号安全中心（最近活动 / 登录中的设备 / 每日消费上限）。判四件事：
//
//   ① **有已验证因子时，密码过了必须再多一屏 6 位码；没有因子时绝不能多这一屏。**
//      这一屏做错的两种方向都是灾难：该出不出 = 2FA 形同虚设；不该出却出 =
//      把没开 2FA 的人锁在门外。所以两个方向都要有断言。
//   ② **完整 IP 不许进 DOM。** 契约 §2 说完整 IP 不出网关，那是服务端的承诺；
//      这里判的是**前端自己那道**：网关哪天回归了，用户界面也不会当场泄露。
//   ③ 17 语覆盖：这四份源码里每一条 `tt("中文")` 在 17 份词典里都有非空译文，
//      13 种非 CJK 语言零汉字，插值占位符逐一对齐。
//   ④ 契约 §2 的形状：kind 全集与失败码全集都有对应的人话，一条不漏。
//
// 跑法（**必须带 loader**，裸跑 `node --test` 会在加载期打哑整例、读数是假红）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/account-security-w4.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { ACCOUNT_SECURITY_COPY_SOURCE } from "../src/i18n/ui/messages/account-security-copy-base.ts";
import {
  deviceLabel,
  maskIp,
  SECURITY_EVENT_KINDS,
} from "../src/lib/auth/account-security.ts";

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

// ————————————————————————————————————————————————————————————————
// 0. 夹具
// ————————————————————————————————————————————————————————————————

const uiStubUrl = dataModule(`
  export function useUI() {
    return (zh, vars) =>
      vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

/**
 * `lib/auth/client` 的替身。**account-security.ts 里的 `./client` 解析到同一份
 * 文件，所以它拿到的也是这个替身**——`accessToken` 于是永远有值，取数层会真的
 * 走一遍 fetch 和它自己的归一化（含 `maskIp`），这正是判据②要判的那条路。
 */
const clientStubUrl = dataModule(`
  const g = () => globalThis.__W4_AUTH__;
  export async function accessToken() { return "test-token"; }
  export const oceanleoConfigured = () => true;
  export const signIn = (...a) => g().signIn(...a);
  export const sendPhoneOtp = (...a) => g().sendPhoneOtp(...a);
  export const verifyPhoneOtp = (...a) => g().verifyPhoneOtp(...a);
  export const wechatLoginUrl = (...a) => g().wechatLoginUrl(...a);
  export const normalizeCnPhone = (v) => (/^1[3-9]\\d{9}$/.test(String(v||"").replace(/\\s/g,"")) ? "+86" + String(v).replace(/\\s/g,"") : "");
  export const sendPasswordReset = (...a) => g().sendPasswordReset(...a);
  export const reauthenticate = (...a) => g().reauthenticate(...a);
  export const updatePassword = (...a) => g().updatePassword(...a);
  export const currentAal = (...a) => g().currentAal(...a);
  export const listMfaFactors = (...a) => g().listMfaFactors(...a);
  export const enrollTotp = (...a) => g().enrollTotp(...a);
  export const challengeAndVerify = (...a) => g().challengeAndVerify(...a);
  export const unenrollFactor = (...a) => g().unenrollFactor(...a);
  export const signOutEverywhere = (...a) => g().signOutEverywhere(...a);
  export function needsMfaChallenge(aal) {
    if (!aal || !aal.current || !aal.next) return false;
    return aal.current === "aal1" && aal.next === "aal2";
  }
`);

/** `lib/auth` 桶：只给页面真正用到的两个，别把 account.ts 整棵拖进来。 */
const authIndexStubUrl = dataModule(`
  export const oceanleoConfigured = () => true;
  export const loginUnavailableNotice = () => null;
`);

const securityPageUrl = await compileModule("src/pages/AccountSecurityPage.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/auth/client": clientStubUrl,
  "../lib/auth": authIndexStubUrl,
  "react-dom": reactDomUrl,
});

const dialogUrl = await compileModule("src/pages/AuthDialog.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/auth/client": clientStubUrl,
  "react-dom": reactDomUrl,
});

const { AccountSecurityPage, securityErrorCopy, securityEventCopy } =
  await import(securityPageUrl);
const { AuthPanel } = await import(dialogUrl);

function defaultAuth() {
  return {
    calls: [],
    async signIn(email, password) {
      this.calls.push(["signIn", email, password]);
      return { data: {} };
    },
    async sendPhoneOtp() {
      return {};
    },
    async verifyPhoneOtp() {
      return {};
    },
    async wechatLoginUrl() {
      return { url: "https://open.weixin.qq.com/x" };
    },
    async sendPasswordReset(email) {
      this.calls.push(["sendPasswordReset", email]);
      return {};
    },
    async reauthenticate() {
      return {};
    },
    async updatePassword() {
      return {};
    },
    async currentAal() {
      return { current: "aal1", next: "aal1" };
    },
    async listMfaFactors() {
      return { factors: [] };
    },
    async enrollTotp() {
      return { enrollment: { factorId: "f1", qrCode: "", secret: "ABCD", uri: "" } };
    },
    async challengeAndVerify(factorId, code) {
      this.calls.push(["challengeAndVerify", factorId, code]);
      return {};
    },
    async unenrollFactor() {
      return {};
    },
    async signOutEverywhere() {},
  };
}

async function withDom(run, { auth = defaultAuth(), routes = {}, url = "https://ppt.oceanleo.com/account/security" } = {}) {
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
  globalThis.__W4_AUTH__ = auth;

  // 网关替身：按路径给 JSON，没配的路径回 404（= 契约里「这条路由还没上线」）。
  const previousFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (input, init) => {
    const href = String(input);
    fetched.push([href, init?.method || "GET"]);
    const hit = Object.entries(routes).find(([path]) => href.includes(path));
    // 404 = 契约里那条路由还没上线（W3 并行实现中）。用普通对象而不是
    // `window.Response`：jsdom 那份构造不出来会抛，取数层就会把它当成断网，
    // 于是这一例判到的是「offline」而不是「这一块还没上线」——假红。
    if (!hit) return { ok: false, status: 404, json: async () => ({ detail: "not found" }) };
    const body = typeof hit[1] === "function" ? hit[1](init) : hit[1];
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  };

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const render = (Component, props) =>
    act(async () => root.render(React.createElement(Component, props)));
  const find = (selector) => window.document.querySelector(selector);
  const findAll = (selector) => [...window.document.querySelectorAll(selector)];
  const html = () => window.document.body.innerHTML;
  const text = () => window.document.body.textContent || "";
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `点不到 ${selector}`);
    return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  };
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
    await run({ window, auth, fetched, render, find, findAll, html, text, click, type, submit });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    globalThis.fetch = previousFetch;
    delete globalThis.__W4_AUTH__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

// ————————————————————————————————————————————————————————————————
// 1. 判据①：aal2 那一屏，该出必出、不该出绝不出
// ————————————————————————————————————————————————————————————————

test("有已验证因子时，密码通过之后必须多出 6 位码那一屏（不许直接算登录成功）", async () => {
  const auth = defaultAuth();
  auth.currentAal = async () => ({ current: "aal1", next: "aal2" });
  auth.listMfaFactors = async () => ({
    factors: [{ id: "factor-9", status: "verified", friendlyName: "我的手机" }],
  });
  let succeeded = 0;
  await withDom(
    async ({ render, type, submit, find, text }) => {
      await render(AuthPanel, { onClose() {}, onSuccess: () => { succeeded += 1; } });
      await type("#oceanleo-auth-email", "invited@oceanleo.com");
      await type("#oceanleo-auth-password", "hunter2hunter2");
      await submit('[data-auth-form="email"]');

      assert.ok(find('[data-auth-form="mfa"]'), "开了两步验证的账号必须停在第二屏");
      assert.equal(succeeded, 0, "第二屏还没过就回调成功 = 2FA 形同虚设");
      assert.ok(text().includes("这个账号开了两步验证。打开验证器 App，输入它现在显示的 6 位码。"));

      // 6 位码交给 lib/auth 的 challengeAndVerify，因子 id 取自已验证的那一个。
      await type("#oceanleo-auth-mfa-code", "123456");
      await submit('[data-auth-form="mfa"]');
      assert.deepEqual(auth.calls.at(-1), ["challengeAndVerify", "factor-9", "123456"]);
      assert.equal(succeeded, 1, "第二屏过了才算登录成功");
    },
    { auth },
  );
});

test("没有因子时绝不能多出这一屏（多拦一屏就是把人锁在门外）", async () => {
  const auth = defaultAuth(); // currentAal 默认 aal1 → aal1
  let succeeded = 0;
  await withDom(
    async ({ render, type, submit, find }) => {
      await render(AuthPanel, { onClose() {}, onSuccess: () => { succeeded += 1; } });
      await type("#oceanleo-auth-email", "invited@oceanleo.com");
      await type("#oceanleo-auth-password", "hunter2hunter2");
      await submit('[data-auth-form="email"]');
      assert.equal(find('[data-auth-form="mfa"]'), null, "没开 2FA 的人不该被多问一遍");
      assert.equal(succeeded, 1);
    },
    { auth },
  );
});

test("取不到会话等级时放行，不拦（拦错的代价是把人锁在外面）", async () => {
  const auth = defaultAuth();
  // 未配 Supabase / 网络抖动时 currentAal() 给的就是两个 null。
  auth.currentAal = async () => ({ current: null, next: null });
  let succeeded = 0;
  await withDom(
    async ({ render, type, submit, find }) => {
      await render(AuthPanel, { onClose() {}, onSuccess: () => { succeeded += 1; } });
      await type("#oceanleo-auth-email", "invited@oceanleo.com");
      await type("#oceanleo-auth-password", "hunter2hunter2");
      await submit('[data-auth-form="email"]');
      assert.equal(find('[data-auth-form="mfa"]'), null);
      assert.equal(succeeded, 1);
    },
    { auth },
  );
});

test("忘记密码：入口在邮箱页，填了邮箱之后给的是诚实的等待提示而不是「已发送请查收」", async () => {
  const auth = defaultAuth();
  await withDom(
    async ({ render, click, type, submit, find, text }) => {
      await render(AuthPanel, { onClose() {} });
      assert.ok(find("[data-auth-forgot]"), "邮箱页必须有找回密码入口");
      await click("[data-auth-forgot]");
      assert.ok(find('[data-auth-form="forgot"]'));

      // 空邮箱先本地挡下，不发一次注定失败的往返。
      await submit('[data-auth-form="forgot"]');
      assert.equal(find("[data-auth-error]").textContent, "请先填写邮箱地址。");
      assert.deepEqual(auth.calls, []);

      await type("#oceanleo-auth-reset-email", "who@oceanleo.com");
      await submit('[data-auth-form="forgot"]');
      assert.deepEqual(auth.calls, [["sendPasswordReset", "who@oceanleo.com"]]);
      assert.ok(find('[data-auth-form="forgot-sent"]'));
      const body = text();
      // 发信额度实测 2 封/小时，界面必须说实话。
      assert.ok(body.includes("每小时最多发 2 封"), `成功屏没说清发信限制：${body}`);
      assert.doesNotMatch(body, /已发送，请查收/);
    },
    { auth },
  );
});

// ————————————————————————————————————————————————————————————————
// 2. 判据②：完整 IP 不进 DOM
// ————————————————————————————————————————————————————————————————

const FULL_IPV4 = "203.0.113.77";
const FULL_IPV6 = "2001:db8:85a3:0:0:8a2e:370:7334";

test("maskIp：完整地址一律打回两段，认不出来的形状返回空串", () => {
  assert.equal(maskIp(FULL_IPV4), "203.0.*.*");
  assert.equal(maskIp("  10.20.30.40 "), "10.20.*.*");
  // 已经按契约脱敏过的原样放行。
  assert.equal(maskIp("1.2.*.*"), "1.2.*.*");
  assert.equal(maskIp(FULL_IPV6), "2001:db8:*");
  // 越界的八位组不是合法 IP，也不该原样透出。
  assert.equal(maskIp("999.1.2.3"), "");
  assert.equal(maskIp(""), "");
  assert.equal(maskIp(null), "");
  assert.equal(maskIp(12345), "");
  // 无论输入什么，输出里都不许再出现四段完整数字。
  for (const raw of [FULL_IPV4, "8.8.8.8", "192.168.1.254", FULL_IPV6, "garbage"]) {
    assert.doesNotMatch(maskIp(raw), /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, `maskIp(${raw}) 漏了完整地址`);
  }
});

test("deviceLabel：原始 UA 串与网关那句中文兜底都不当成最终文案", () => {
  assert.equal(deviceLabel("Chrome · macOS"), "Chrome · macOS");
  // 契约说解析不出就回「未知设备」——那是一句中文，直接渲染会让 16 个语种露汉字。
  assert.equal(deviceLabel("未知设备"), "");
  assert.equal(
    deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"),
    "",
    "原始 UA 串不许甩给用户",
  );
  assert.equal(deviceLabel(undefined), "");
});

test("账号安全区块不把完整 IP 渲染到 DOM——网关回归了也不会当场泄露给用户", async () => {
  // 网关**故意**回完整 IP（契约说不会，这里判的是前端自己那道）。
  const routes = {
    "/v1/account/security/events": {
      events: [
        {
          id: "e1",
          kind: "login",
          at: "2026-08-20T10:00:00Z",
          ip_masked: FULL_IPV4,
          device_label: "Chrome · macOS",
          result: "ok",
        },
        {
          id: "e2",
          kind: "spend_blocked",
          at: "2026-08-20T09:00:00Z",
          ip_masked: FULL_IPV6,
          device_label: "未知设备",
          result: "denied",
        },
      ],
      next_before: null,
    },
    "/v1/account/security/sessions": {
      sessions: [
        {
          id: "s1",
          created_at: "2026-08-19T08:00:00Z",
          last_seen_at: "2026-08-21T08:00:00Z",
          ip_masked: FULL_IPV4,
          device_label: "Safari · iOS",
          current: true,
        },
      ],
    },
  };
  await withDom(
    async ({ render, html, text, findAll }) => {
      await render(AccountSecurityPage, {});
      const rendered = html();
      assert.ok(findAll("[data-security-events] li").length >= 2, "活动列表没渲染出来，断言会空转");
      assert.ok(findAll("[data-security-sessions] li").length >= 1, "设备列表没渲染出来，断言会空转");

      assert.doesNotMatch(rendered, /203\.0\.113\.77/, "完整 IPv4 进了 DOM");
      assert.doesNotMatch(rendered, /8a2e:370:7334/, "完整 IPv6 进了 DOM");
      assert.doesNotMatch(
        rendered,
        /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
        "DOM 里出现了四段完整的地址",
      );
      // 脱敏之后的那一份必须真的在（否则上面三条会因为「什么都没渲染」而假绿）。
      assert.ok(text().includes("203.0.*.*"), "脱敏后的地址也没出现，说明整块没渲染");
      assert.ok(text().includes("2001:db8:*"));
    },
    { routes },
  );
});

test("当前设备标出来且不给踢自己的键；别的设备才有「退出这台设备」", async () => {
  const routes = {
    "/v1/account/security/sessions": {
      sessions: [
        {
          id: "here",
          created_at: "2026-08-19T08:00:00Z",
          last_seen_at: "2026-08-21T08:00:00Z",
          ip_masked: "1.2.*.*",
          device_label: "Safari · iOS",
          current: true,
        },
        {
          id: "there",
          created_at: "2026-08-18T08:00:00Z",
          last_seen_at: "2026-08-20T08:00:00Z",
          ip_masked: "3.4.*.*",
          device_label: "Chrome · Windows",
          current: false,
        },
      ],
    },
  };
  await withDom(
    async ({ render, find }) => {
      await render(AccountSecurityPage, {});
      assert.ok(find("[data-security-current]"), "当前设备必须标出来");
      assert.equal(
        find('[data-security-revoke="here"]'),
        null,
        "当前设备不给踢自己的键——要退就用「退出所有设备」",
      );
      assert.ok(find('[data-security-revoke="there"]'), "别的设备必须有退出键");
      assert.ok(find("[data-security-signout-all]"), "「退出所有设备」这条退路必须在");
    },
    { routes },
  );
});

test("接口全挂（404 = W3 还没上线）也不白屏：每一块各说一句人话", async () => {
  await withDom(
    async ({ render, find, findAll, text }) => {
      await render(AccountSecurityPage, {}); // routes 为空 → 全部 404
      assert.ok(find("[data-security-page]"), "整页必须还在");
      // 五块区域一块不少。
      assert.deepEqual(
        findAll("[data-security-section]").map((n) => n.getAttribute("data-security-section")),
        ["two-step", "password", "devices", "activity", "limit"],
      );
      const body = text();
      assert.ok(body.includes("这一块还没上线，过些天再来看。"), `没给出人话：${body}`);
      assert.doesNotMatch(body, /HTTP 404|Failed to fetch|undefined|NaN/);
    },
    { routes: {} },
  );
});

// ————————————————————————————————————————————————————————————————
// 3. 判据④：契约 §2 的两张表一条不漏
// ————————————————————————————————————————————————————————————————

test("契约 §2 的 kind 全集都有对应的人话，且认不出来的落到兜底那句", () => {
  const seen = new Set();
  for (const kind of SECURITY_EVENT_KINDS) {
    const copy = securityEventCopy(kind);
    assert.ok(copy, `kind=${kind} 没有文案`);
    assert.equal(seen.has(copy), false, `kind=${kind} 与另一个 kind 撞了同一句话：${copy}`);
    seen.add(copy);
    assert.ok(UI_MESSAGES.en[copy], `kind=${kind} 的文案没进词典：${copy}`);
  }
  assert.equal(securityEventCopy("unknown"), "其它账号操作");
  assert.equal(securityEventCopy("something-w3-adds-later"), "其它账号操作");
});

test("取数失败的每个码都有人话，且每一句都在 17 语词典里", () => {
  const codes = [
    "signed_out",
    "offline",
    "not_available",
    "not_found",
    "rate_limited",
    "server_error",
    "unknown",
    undefined,
  ];
  for (const code of codes) {
    const copy = securityErrorCopy(code);
    assert.ok(copy, `码 ${code} 没有文案`);
    for (const locale of LOCALES) {
      assert.ok(UI_MESSAGES[locale][copy], `${locale} 缺 "${copy}"（码 ${code}）`);
    }
  }
});

// ————————————————————————————————————————————————————————————————
// 4. 判据③：17 语覆盖闸
// ————————————————————————————————————————————————————————————————

/** 本波新增的这四份源码；扫描面漂了就报出来，别让判据空转。 */
const SCANNED = [
  "src/pages/AccountSecurityPage.tsx",
  "src/pages/PasswordResetPage.tsx",
  "src/pages/AuthDialog.tsx",
  "src/lib/auth/client.ts",
];

const SOURCES = new Map();
for (const file of SCANNED) {
  SOURCES.set(file, await readFile(resolve(file), "utf8"));
}

const NON_CJK = LOCALES.filter((l) => !["zh", "zh-TW", "ja", "ko"].includes(l));
const TRANSLATED = LOCALES.filter((l) => l !== "zh");

function hasHan(value) {
  return /[\u4e00-\u9fff]/.test(value);
}

/** 四份源码里所有含汉字的 `tt("…")` 字面量。 */
function ttLiterals() {
  const found = new Map();
  for (const [file, source] of SOURCES) {
    for (const match of source.matchAll(/\btt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const key = JSON.parse(`"${match[1]}"`);
      if (!hasHan(key)) continue;
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(file);
    }
  }
  return found;
}

/**
 * `client.ts` 那层**返回给调用方当句子用**的中文（`return { error: "…" }`）。
 * 它们不写在 `tt()` 里，但渲染处一定会 `tt()` 一下，所以同样要有译文——
 * 漏了就是英文用户在改密码失败时看到一句中文。
 */
function clientErrorLiterals() {
  const source = SOURCES.get("src/lib/auth/client.ts");
  return [...source.matchAll(/error:\s*"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => JSON.parse(`"${m[1]}"`))
    .filter(hasHan);
}

/** 这一波开工前就缺译文的历史词条（`client.ts` 里三句手机号/网络的老文案）。 */
const PRE_EXISTING_GAPS = new Set([
  "请输入有效的中国大陆手机号",
  "网络错误：无法连接到登录服务",
]);

test("四份源码里的每一条 tt() 中文，17 语词典里都有非空译文", () => {
  const keys = [...ttLiterals().keys()];
  assert.ok(keys.length > 60, `取样疑似失效：只找到 ${keys.length} 条 tt() 字面量`);
  // 这一波真的在用这些新文案，否则下面的循环会空转成永远为真的断言。
  for (const expected of [
    "忘记密码？",
    "账号安全",
    "两步验证",
    "每日消费上限",
    "验证器丢了怎么办",
    "退出这台设备",
  ]) {
    assert.ok(keys.includes(expected), `源码里应当有 tt("${expected}")`);
  }

  const missing = [];
  for (const key of keys) {
    for (const locale of TRANSLATED) {
      const value = UI_MESSAGES[locale][key];
      if (!value || !value.trim()) missing.push(`${key} → 缺 ${locale}`);
    }
  }
  assert.deepEqual(missing.sort(), [], "有新文案没补译文（非中文站会原样露出中文）");
});

test("client.ts 返回给界面当句子用的中文，同样有 17 语译文", () => {
  const messages = clientErrorLiterals().filter((m) => !PRE_EXISTING_GAPS.has(m));
  assert.ok(messages.length >= 4, `取样失效：只找到 ${messages.length} 条`);
  const missing = [];
  for (const key of messages) {
    for (const locale of TRANSLATED) {
      if (!UI_MESSAGES[locale][key]) missing.push(`${key} → 缺 ${locale}`);
    }
  }
  assert.deepEqual(missing.sort(), []);
});

test("历史缺口白名单只能变短：里面的 key 必须还在源码里，且必须还真的缺着", () => {
  const referenced = new Set(clientErrorLiterals());
  assert.deepEqual(
    [...PRE_EXISTING_GAPS].filter((key) => !referenced.has(key)),
    [],
    "白名单里的 key 已经不在源码里了，请删掉这几行",
  );
  assert.deepEqual(
    [...PRE_EXISTING_GAPS].filter((key) =>
      TRANSLATED.every((locale) => Boolean(UI_MESSAGES[locale][key])),
    ),
    [],
    "这些 key 已经补齐译文了，请从白名单里删掉，别再给下一次留豁免",
  );
});

/**
 * zh-TW 与简体逐字相同的三条。这三句在繁体里本来就这样写（阿拉伯数字 + 「元 / 天」
 * + 「取消上限」四个字繁简同形），属**语言事实**。日后有人往 zh-TW 里偷懒抄简体，
 * 这个集合会变大并让本例变红。
 */
const ZH_TW_SAME_AS_SOURCE = new Set(["例如 50", "元 / 天", "取消上限"]);

test("本波新增的 90 条：zh 是 key===值，非 CJK 的 13 语零汉字，占位符逐一对齐", () => {
  const keys = Object.values(ACCOUNT_SECURITY_COPY_SOURCE);
  assert.equal(keys.length, 90, "原文表条数变了，判据里的读数要跟着更新");
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;

  for (const key of keys) {
    assert.equal(UI_MESSAGES.zh[key], key, `zh 的 "${key}" 必须 key===值`);
    const want = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of TRANSLATED) {
      const value = UI_MESSAGES[locale][key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      assert.deepEqual(
        [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
        want,
        `${locale} 的译文丢了插值占位符：${key}`,
      );
    }
    for (const locale of NON_CJK) {
      assert.equal(
        hasHan(UI_MESSAGES[locale][key]),
        false,
        `${locale} 的 "${key}" 残留汉字：${UI_MESSAGES[locale][key]}`,
      );
    }
  }
  assert.equal(NON_CJK.length, 13, "非 CJK 语种数变了，覆盖面的读数要跟着更新");
});

test("zh-TW 真的繁体化了：逐字相同的只有具名的那三条", () => {
  const same = Object.values(ACCOUNT_SECURITY_COPY_SOURCE).filter(
    (key) => UI_MESSAGES["zh-TW"][key] === key,
  );
  assert.deepEqual(
    new Set(same),
    ZH_TW_SAME_AS_SOURCE,
    "zh-TW 出现了新的「与简体逐字相同」词条：要么它真的繁简同形（请加进白名单并说明），" +
      "要么是有人把简体直接抄进了 zh-TW（必须真翻）",
  );
  // 抽样几条必须真变的，防止有人整批照抄。
  for (const [key, expected] of Object.entries({
    "忘记密码？": "忘記密碼？",
    "账号安全": "帳號安全",
    "两步验证": "兩步驟驗證",
    "登录中的设备": "登入中的裝置",
    "未知设备": "未知裝置",
  })) {
    assert.equal(UI_MESSAGES["zh-TW"][key], expected, `zh-TW 的 "${key}" 应为「${expected}」`);
  }
});

test("新词条不会被 useUI 的两条改写规则误伤", async () => {
  const hook = await readFile(resolve("src/i18n/ui/useUI.ts"), "utf8");
  assert.match(hook, /replaceAll\("文件库", "我的库"\)/);
  assert.match(hook, /灵感\|靈感/);
  for (const key of Object.values(ACCOUNT_SECURITY_COPY_SOURCE)) {
    assert.doesNotMatch(key, /文件库|檔案庫|灵感|靈感/, `"${key}" 会被 useUI 改写`);
  }
});

// ---------------------------------------------------------------------------
// 找回密码的落点：邮件里那条链接必须落在一条真实存在的路由上
// ---------------------------------------------------------------------------

test("邮件落点与「这是找回密码」的判断对得上，且不会把微信回跳算进来", async () => {
  const clientSource = await readFile(new URL("../src/lib/auth/client.ts", import.meta.url), "utf8");

  const pathLiteral = clientSource.match(/PASSWORD_RESET_PATH = "([^"]+)"/);
  assert.ok(pathLiteral, "client.ts 里找不到 PASSWORD_RESET_PATH");
  // 共享包没有路由；36 个消费站里今天真实存在的账户路由只有 /account。落点写成
  // 别的（比如 /account/reset-password）＝ 找回密码的邮件点开是 404。
  assert.match(pathLiteral[1], /^\/account(\?|$)/);

  const landingRe = clientSource.match(/isPasswordResetLanding[\s\S]{0,200}?return (\/.+?\/)\.test/);
  assert.ok(landingRe, "client.ts 里找不到 isPasswordResetLanding 的判断");
  const re = new RegExp(landingRe[1].slice(1, -1));

  const origin = "https://design.oceanleo.com";
  assert.equal(
    re.test(`${origin}${pathLiteral[1]}`),
    true,
    "邮件把人送到 PASSWORD_RESET_PATH，账户页却认不出这是找回密码——那一屏永远出不来",
  );
  assert.equal(
    re.test(`${origin}${pathLiteral[1]}#access_token=x&type=recovery`),
    true,
  );
  // 微信登录回跳也落在 /account，带的是 code=。两条路撞在一起就会把刚登录的人
  // 弹到改密码屏。
  assert.equal(re.test(`${origin}/account?code=wx-oauth-code`), false);
  assert.equal(re.test(`${origin}/account`), false);

  // 账户页的测试替身照抄了同一条正则，两边不许走样。
  const pageTest = await readFile(new URL("./account-page.test.mjs", import.meta.url), "utf8");
  const stubRe = pageTest.match(/isPasswordResetLanding\(href\) \{\s*return (\/.+?\/)\.test/);
  assert.ok(stubRe, "account-page 替身里找不到 isPasswordResetLanding");
  assert.equal(stubRe[1], landingRe[1], "替身与真身的正则不一致，账户页那两条断言就是在验一个假东西");
});
