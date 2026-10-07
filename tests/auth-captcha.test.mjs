// Turnstile wiring for international login (China sends no token).
//
// 判四件事，全是用户能不能登上去的：
//   ① 海外脚本走 challenges.cloudflare.com/turnstile，render=explicit；国内不插脚本。
//   ② 国内 isCaptchaConfigured 为假，getCaptchaToken 立即 null。
//   ③ 可见框拿到的 token 进 options.captchaToken；没有 token 调用照常发出且不抛。
//   ④ 上游 captcha 报错翻成「安全验证没有通过，请重试」。
//
// 跑法（不要 pnpm test：package.json 会先展开 tests/*.test.mjs 再跑全量）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/auth-captcha.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  AUTH_CAPTCHA_COPY_SOURCE,
  AUTH_CAPTCHA_COPY_KEYS,
} from "../src/i18n/ui/messages/auth-captcha-copy-base.ts";
import { AUTH_CAPTCHA_MESSAGES } from "../src/i18n/ui/messages/auth-captcha-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
import {
  CAPTCHA_FAILED_MESSAGE,
  CAPTCHA_LOAD_FAILED_MESSAGE,
  CAPTCHA_VERIFYING_MESSAGE,
  TURNSTILE_SITEKEY,
  captchaEnabledForFamily,
  isCaptchaConfigured,
  mapCaptchaError,
  turnstileScriptSrc,
} from "../src/lib/auth/captcha.ts";

test("sitekey 是公开值且海外 isCaptchaConfigured 为真、国内为假", () => {
  assert.equal(TURNSTILE_SITEKEY, "0x4AAAAAAFK-cPFBHQyr7ke8");
  assert.equal(captchaEnabledForFamily("com"), true);
  assert.equal(captchaEnabledForFamily("ws"), true);
  assert.equal(captchaEnabledForFamily("cn"), false);
  assert.equal(isCaptchaConfigured(), true);
});

test("Turnstile 脚本走 challenges.cloudflare.com，explicit，不走 hCaptcha", () => {
  const src = turnstileScriptSrc();
  assert.match(src, /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?/);
  assert.match(src, /render=explicit/);
  assert.doesNotMatch(src, /hcaptcha/i);
});

test("mapCaptchaError 把 captcha 原文翻成可重试的人话", () => {
  assert.equal(
    mapCaptchaError("captcha verification process failed"),
    CAPTCHA_FAILED_MESSAGE,
  );
  assert.equal(mapCaptchaError("captcha_failed"), CAPTCHA_FAILED_MESSAGE);
  assert.equal(mapCaptchaError("Invalid login credentials"), "Invalid login credentials");
  assert.equal(mapCaptchaError(undefined), undefined);
});

test("三条文案与 17 语分册对齐，非中文不是英文占位", () => {
  assert.equal(AUTH_CAPTCHA_COPY_SOURCE.verifying, CAPTCHA_VERIFYING_MESSAGE);
  assert.equal(AUTH_CAPTCHA_COPY_SOURCE.failed, CAPTCHA_FAILED_MESSAGE);
  assert.equal(AUTH_CAPTCHA_COPY_SOURCE.loadFailed, CAPTCHA_LOAD_FAILED_MESSAGE);
  assert.equal(AUTH_CAPTCHA_COPY_KEYS.length, 3);
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|[Uu]ntranslated/;
  for (const key of AUTH_CAPTCHA_COPY_KEYS) {
    assert.equal(AUTH_CAPTCHA_MESSAGES.zh[key], key);
    for (const locale of LOCALES) {
      const value = AUTH_CAPTCHA_MESSAGES[locale][key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      if (locale !== "zh" && locale !== "zh-TW" && locale !== "ja" && locale !== "ko") {
        assert.doesNotMatch(value, /[\u4e00-\u9fff]/, `${locale} 的 "${key}" 残留汉字`);
        assert.notEqual(value, key);
      }
    }
    assert.notEqual(AUTH_CAPTCHA_MESSAGES["zh-TW"][key], key);
  }
});

function installDom({ fireScript = true } = {}) {
  const created = [];
  const append = (el) => {
    created.push(el);
    if (fireScript && String(el.tagName || "").toLowerCase() === "script") {
      queueMicrotask(() => {
        const src = String(el.src || "");
        const match = /[?&]onload=([^&]+)/.exec(src);
        const name = match ? decodeURIComponent(match[1]) : "";
        if (typeof globalThis[name] === "function") globalThis[name]();
        if (typeof el.onload === "function") el.onload();
      });
    }
    return el;
  };
  const doc = {
    getElementById: () => null,
    createElement(tag) {
      return {
        tagName: String(tag),
        src: "",
        async: false,
        defer: false,
        style: {},
        onload: null,
        onerror: null,
        setAttribute(k, v) {
          this[k] = v;
        },
      };
    },
    head: { appendChild: append },
    body: { appendChild: append },
    documentElement: { appendChild: append },
  };
  globalThis.document = doc;
  globalThis.window = globalThis;
  return created;
}

async function loadCaptchaModule(overrides = {}) {
  const url = await compileModule("src/lib/auth/captcha.ts", overrides);
  return import(url);
}

function fakeContainer() {
  return {
    isConnected: true,
    attrs: Object.create(null),
    getAttribute(name) {
      return this.attrs[name];
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    replaceChildren() {},
  };
}

function installTurnstile({ widgets, renders }) {
  globalThis.turnstile = {
    render(el, params) {
      if (widgets.has(el)) {
        throw new Error("Already rendered into this container");
      }
      renders.value += 1;
      const id = `w${renders.value}`;
      widgets.set(el, id);
      queueMicrotask(() => {
        if (typeof params?.callback === "function") params.callback(`tok-${id}`);
      });
      return id;
    },
    remove(id) {
      for (const [el, wid] of [...widgets]) {
        if (String(wid) === String(id)) widgets.delete(el);
      }
    },
    reset() {},
  };
}

test("可见框给出 token 后 getCaptchaToken 把它交出去", async () => {
  installDom();
  const widgets = new Map();
  const renders = { value: 0 };
  installTurnstile({ widgets, renders });
  const { mountCheckboxCaptcha, getCaptchaToken } = await loadCaptchaModule();
  const container = fakeContainer();
  let seen = null;
  mountCheckboxCaptcha(container, (token) => {
    seen = token;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(seen, "tok-w1");
  const token = await getCaptchaToken();
  assert.equal(token, "tok-w1");
  const again = await getCaptchaToken();
  assert.equal(again, null);
});

test("同一容器卸载再挂：不会二次 render", async () => {
  installDom();
  const widgets = new Map();
  const renders = { value: 0 };
  installTurnstile({ widgets, renders });
  const { mountCheckboxCaptcha } = await loadCaptchaModule();
  const container = fakeContainer();
  const stopEarly = mountCheckboxCaptcha(container, () => {});
  stopEarly();
  const stopLive = mountCheckboxCaptcha(container, () => {});
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(widgets.size, 1);
  assert.equal(renders.value, 1);
  stopLive();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const stopAgain = mountCheckboxCaptcha(container, () => {});
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(widgets.size, 1);
  assert.equal(renders.value, 2);
  stopAgain();
});

test("模块状态丢失后同一容器仍能挂：凭 data-oceanleo-turnstile-id 先 remove", async () => {
  installDom();
  const widgets = new Map();
  const renders = { value: 0 };
  installTurnstile({ widgets, renders });
  const container = fakeContainer();
  const { mountCheckboxCaptcha: mountA } = await loadCaptchaModule();
  mountA(container, () => {});
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(widgets.size, 1);
  const { mountCheckboxCaptcha: mountB } = await loadCaptchaModule();
  const stopB = mountB(container, () => {});
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(widgets.size, 1);
  assert.equal(renders.value, 2);
  stopB();
});

test("Turnstile 脚本超时：可见挂载回调 null 且不抛", async () => {
  const created = installDom({ fireScript: false });
  delete globalThis.turnstile;
  const familyStub = dataModule(`export function currentDomainFamily() { return "com"; }`);
  const { mountCheckboxCaptcha, captchaConfig } = await loadCaptchaModule({
    "../../contracts/domain-family": familyStub,
  });
  captchaConfig.loadTimeoutMs = 20;
  let seen = "unset";
  mountCheckboxCaptcha(fakeContainer(), (token) => {
    seen = token;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(seen, null);
  assert.ok(
    created.some((el) => /challenges\.cloudflare\.com\/turnstile/.test(String(el.src || ""))),
  );
});

test("国内 getCaptchaToken 立即 null，不插 Turnstile 脚本", async () => {
  const created = installDom({ fireScript: true });
  delete globalThis.turnstile;
  const familyStub = dataModule(`export function currentDomainFamily() { return "cn"; }`);
  const { getCaptchaToken, isCaptchaConfigured } = await loadCaptchaModule({
    "../../contracts/domain-family": familyStub,
  });
  assert.equal(isCaptchaConfigured(), false);
  const token = await getCaptchaToken();
  assert.equal(token, null);
  assert.equal(
    created.filter((el) => /turnstile|hcaptcha/i.test(String(el.src || ""))).length,
    0,
  );
});

function configStub() {
  return dataModule(`
    export const SUPABASE_URL = "https://example.supabase.co";
    export const SUPABASE_ANON_KEY = "anon";
    export const GATEWAY_BASE = "https://api.oceanleo.com";
    export function cookieOptions() { return {}; }
    export function configured() { return true; }
    export function isLeoDevPreviewHost() { return false; }
  `);
}

function captchaStub(token) {
  return dataModule(`
    export async function getCaptchaToken() { return ${JSON.stringify(token)}; }
    export function isCaptchaConfigured() { return true; }
    export function mapCaptchaError(raw) {
      if (!raw) return undefined;
      return /captcha/i.test(String(raw)) ? "安全验证没有通过，请重试" : String(raw);
    }
  `);
}

function supabaseStub() {
  return dataModule(`
    export function createBrowserClient() {
      return {
        auth: {
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
          async signInWithPassword(args) {
            globalThis.__CAPTCHA_CALLS__.push(["signInWithPassword", args]);
            return { data: { session: { access_token: "a" } }, error: null };
          },
          async signInWithOtp(args) {
            globalThis.__CAPTCHA_CALLS__.push(["signInWithOtp", args]);
            return { data: {}, error: null };
          },
          async verifyOtp(args) {
            globalThis.__CAPTCHA_CALLS__.push(["verifyOtp", args]);
            return { data: { session: { access_token: "a" } }, error: null };
          },
          async resetPasswordForEmail(email, opts) {
            globalThis.__CAPTCHA_CALLS__.push(["resetPasswordForEmail", email, opts]);
            return { data: {}, error: null };
          },
          async getSession() { return { data: { session: null } }; },
        },
      };
    }
  `);
}

async function loadClient(token) {
  globalThis.__CAPTCHA_CALLS__ = [];
  globalThis.window = {
    location: {
      host: "design.oceanleo.com",
      href: "https://design.oceanleo.com/",
      origin: "https://design.oceanleo.com",
    },
  };
  const url = await compileModule("src/lib/auth/client.ts", {
    "@supabase/ssr": supabaseStub(),
    "./config": configStub(),
    "./captcha": captchaStub(token),
  });
  return import(url);
}

test("有 token 时 signIn / OTP / 找回密码都带 options.captchaToken", async () => {
  const client = await loadClient("tok-1");
  await client.signIn("a@b.c", "secret-password");
  await client.sendPhoneOtp("13800138000");
  await client.verifyPhoneOtp("13800138000", "123456");
  await client.sendPasswordReset("a@b.c", "https://design.oceanleo.com");
  const calls = globalThis.__CAPTCHA_CALLS__;
  const password = calls.find((c) => c[0] === "signInWithPassword");
  assert.equal(password[1].options.captchaToken, "tok-1");
  const otp = calls.find((c) => c[0] === "signInWithOtp");
  assert.equal(otp[1].options.captchaToken, "tok-1");
  const verify = calls.find((c) => c[0] === "verifyOtp");
  assert.equal(verify[1].options.captchaToken, "tok-1");
  const reset = calls.find((c) => c[0] === "resetPasswordForEmail");
  assert.equal(reset[2].captchaToken, "tok-1");
});

test("无 token 时调用不带 captchaToken 且不抛", async () => {
  const client = await loadClient(null);
  await client.signIn("a@b.c", "secret-password");
  await client.sendPhoneOtp("13800138000");
  await client.sendPasswordReset("a@b.c", "https://design.oceanleo.com");
  for (const call of globalThis.__CAPTCHA_CALLS__) {
    const payload = call[0] === "resetPasswordForEmail" ? call[2] : call[1];
    const token = payload?.options?.captchaToken ?? payload?.captchaToken;
    assert.equal(token, undefined, `${call[0]} 不应带 token`);
  }
});

test("AuthDialog 把 captcha 上游错误映射成可重试文案", async () => {
  const require = createRequire(import.meta.url);
  const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
  const url = await compileModule("src/pages/AuthDialog.tsx", {
    "react-dom": reactDomUrl,
    "../i18n/ui/useUI": dataModule(`export function useUI() { return (zh) => zh; }`),
    "../lib/auth/client": dataModule(`
      export function oceanleoConfigured() { return true; }
      export async function signIn() { return {}; }
      export async function signUp() { return {}; }
      export async function sendPhoneOtp() { return {}; }
      export async function verifyPhoneOtp() { return {}; }
      export async function wechatLoginUrl() { return {}; }
      export async function startOauthSignIn() { return {}; }
      export function normalizeCnPhone() { return ""; }
      export async function sendPasswordReset() { return {}; }
      export async function currentAal() { return { current: null, next: null }; }
      export async function listMfaFactors() { return { factors: [] }; }
      export async function challengeAndVerify() { return {}; }
      export function needsMfaChallenge() { return false; }
    `),
  });
  const { authErrorCopy } = await import(url);
  assert.equal(
    authErrorCopy("email", "captcha verification process failed"),
    "安全验证没有通过，请重试",
  );
  assert.equal(authErrorCopy("email", "安全验证没有通过，请重试"), "安全验证没有通过，请重试");
});
