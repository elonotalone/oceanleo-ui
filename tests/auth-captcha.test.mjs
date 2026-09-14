// hCaptcha wiring for login / OTP / password reset (security-overhaul W4).
//
// 判三件事，全是用户能不能登上去的：
//   ① 脚本按家族选域：.cn → cn1.hcaptcha.com（apihost/endpoint 同域），其它 → js.hcaptcha.com，都带 render=explicit。
//   ② window.hcaptcha 在 → token 进 options.captchaToken；不在 / 超时 → 调用照常发出且不抛（开关未开时不能把人挡在门外）。
//   ③ 上游 captcha 报错翻成「安全验证没有通过，请重试」。
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
  HCAPTCHA_SITEKEY,
  hcaptchaScriptSrc,
  isCaptchaConfigured,
  mapCaptchaError,
} from "../src/lib/auth/captcha.ts";

test("sitekey 是公开值且 isCaptchaConfigured 为真", () => {
  assert.equal(HCAPTCHA_SITEKEY, "f638949a-afa8-4142-8fbe-fb3abdeacf3a");
  assert.equal(isCaptchaConfigured(), true);
});

test("edition=cn 用 cn1 域，query 带 render=explicit、apihost、endpoint", () => {
  const src = hcaptchaScriptSrc("cn");
  assert.match(src, /^https:\/\/cn1\.hcaptcha\.com\/1\/api\.js\?/);
  assert.match(src, /render=explicit/);
  assert.match(src, /apihost=https%3A%2F%2Fcn1\.hcaptcha\.com/);
  assert.match(src, /endpoint=https%3A%2F%2Fcn1\.hcaptcha\.com/);
  assert.doesNotMatch(src, /js\.hcaptcha\.com/);
});

test("非 cn 用 js.hcaptcha.com，不带大陆接入点", () => {
  const src = hcaptchaScriptSrc("com");
  assert.match(src, /^https:\/\/js\.hcaptcha\.com\/1\/api\.js\?/);
  assert.match(src, /render=explicit/);
  assert.doesNotMatch(src, /cn1\.hcaptcha\.com/);
  assert.doesNotMatch(src, /apihost=/);
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

test("window.hcaptcha 存在时 getCaptchaToken 返回 token 且不抛", async () => {
  installDom();
  globalThis.hcaptcha = {
    render() {
      return "w1";
    },
    async execute() {
      return { response: "tok-present" };
    },
    reset() {},
  };
  const { getCaptchaToken } = await loadCaptchaModule();
  const token = await getCaptchaToken();
  assert.equal(token, "tok-present");
});

test("hCaptcha 不存在 / 超时：返回 null 且不抛", async () => {
  const created = installDom({ fireScript: false });
  delete globalThis.hcaptcha;
  const familyStub = dataModule(`export function currentDomainFamily() { return "com"; }`);
  const { getCaptchaToken, captchaConfig } = await loadCaptchaModule({
    "../../contracts/domain-family": familyStub,
  });
  captchaConfig.loadTimeoutMs = 20;
  const token = await getCaptchaToken();
  assert.equal(token, null);
  assert.ok(created.some((el) => /js\.hcaptcha\.com/.test(String(el.src || ""))));
});

test("edition=cn 时加载脚本走 cn1 域", async () => {
  const created = installDom({ fireScript: true });
  delete globalThis.hcaptcha;
  const familyStub = dataModule(`export function currentDomainFamily() { return "cn"; }`);
  const { getCaptchaToken } = await loadCaptchaModule({
    "../../contracts/domain-family": familyStub,
  });
  // onload 回调触发后 API 仍缺 → null，但脚本 URL 必须是大陆接入点。
  const token = await getCaptchaToken();
  assert.equal(token, null);
  const script = created.find((el) => /hcaptcha/.test(String(el.src || "")));
  assert.ok(script, "应当插入 hCaptcha 脚本");
  assert.match(String(script.src), /cn1\.hcaptcha\.com/);
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
