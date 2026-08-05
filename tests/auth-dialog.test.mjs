// 共享登录 UI `src/pages/AuthDialog.tsx` 的行为契约（合同 §4 W10，2026-07-29）。
//
// 为什么这份测试值得写死：此前全家桶有 35 份分叉登录实现、七种命名，其中 33 份只有
// 邮箱密码（附录 3 §3）。本组件是唯一的门，它坏掉等于 36 个站一起登不上。
//
// 覆盖：
//   ① 三个 tab（邮箱 / 手机号 OTP / 微信扫码）都真实可用，且**只**调 lib/auth 已有函数；
//   ② **微信回跳地址取当前页**——这一条就是「子站登录后回子站而不是弹回门户」，
//      按传给 wechatLoginUrl 的**实参**断言，不是看源码里写没写；
//   ③ SMS provider / 微信 key 未配时给可读降级提示（上游给的是
//      `Unsupported phone provider` / 网关 501），**不是白屏、不是英文原文**；
//   ④ oceanleoConfigured() 为假时走「登录服务尚未配置」分支且不渲染表单；
//   ⑤ **没有任何注册入口**（注册 2026-06-15 已由 DB 触发器关闭），
//      底部固定「目前仅开放被邀请的账号登录。」；
//   ⑥ 17 语：源码里每条 tt() 中文字面量在 17 份词典里都有译文，
//      zh 是 key===值，15 个非中文 locale 真的翻了（无占位、无汉字残留），
//      zh-TW 该改的改了，`{seconds}` 插值符 17 语一个不丢。
//
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入（与
// tests/template-showcase.test.mjs 同一套夹具），所以可以直接
// `node --test tests/auth-dialog.test.mjs` 跑。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

// tt() 替身：未命中词典时回退中文原文 + 做插值，与真 useUI 的回退语义一致。
const uiStubUrl = dataModule(`
  export function useUI() {
    return (zh, vars) =>
      vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

// lib/auth 替身：把调用转发到 globalThis.__W10_AUTH__，每个用例自己装。
// **只替换这一层**——组件里不允许有第二套身份逻辑，所以替掉 lib/auth 之后
// 组件就应当彻底没有登录能力，这本身也是「只消费既有函数」的证明。
const authStubUrl = dataModule(`
  const g = () => globalThis.__W10_AUTH__;
  export const oceanleoConfigured = (...a) => g().oceanleoConfigured(...a);
  export const signIn = (...a) => g().signIn(...a);
  export const sendPhoneOtp = (...a) => g().sendPhoneOtp(...a);
  export const verifyPhoneOtp = (...a) => g().verifyPhoneOtp(...a);
  export const wechatLoginUrl = (...a) => g().wechatLoginUrl(...a);
  export const normalizeCnPhone = (...a) => g().normalizeCnPhone(...a);
`);

// @supabase/ssr 只在真 client.ts 的顶层被 import；`normalizeCnPhone` 是纯函数，
// 用真的那一份（组件的本地格式校验必须和后端归一化同源，不能各判各的）。
const supabaseStubUrl = dataModule("export function createBrowserClient(){ return null; }");

const OVERRIDES = {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/auth/client": authStubUrl,
  "react-dom": reactDomUrl,
};

const dialogUrl = await compileModule("src/pages/AuthDialog.tsx", OVERRIDES);
const realClientUrl = await compileModule("src/lib/auth/client.ts", {
  "@supabase/ssr": supabaseStubUrl,
  "react-dom": reactDomUrl,
});

const { AuthDialog, AuthPanel, AUTH_METHODS, AUTH_DIALOG_COPY, authErrorCopy, wechatRedirectTarget } =
  await import(dialogUrl);
const { normalizeCnPhone } = await import(realClientUrl);

const dialogSource = await readFile(resolve("src/pages/AuthDialog.tsx"), "utf8");

// ————————————————————————————————————————————————————————————————
// 1. 纯函数：回跳地址与降级文案（无 DOM，按值断言）
// ————————————————————————————————————————————————————————————————

test("wechatRedirectTarget 默认取当前页——子站登录后回子站，不弹回门户", () => {
  // 显式传入优先。
  assert.equal(
    wechatRedirectTarget("https://game.oceanleo.com/account", "https://ppt.oceanleo.com/"),
    "https://game.oceanleo.com/account",
  );
  // 没传就取当前页：这就是「回子站」的全部实现。
  assert.equal(
    wechatRedirectTarget(undefined, "https://converter.oceanleo.com/workspace?x=1"),
    "https://converter.oceanleo.com/workspace?x=1",
  );
  // 空串 / 空白等于没传，不能拼出 `redirect=` 空参。
  assert.equal(wechatRedirectTarget("   ", "https://law.oceanleo.com/"), "https://law.oceanleo.com/");
  // 绝不硬编码门户：任何输入下都不许自己变出 oceanleo.com 首页。
  assert.doesNotMatch(
    wechatRedirectTarget(undefined, "https://med.oceanleo.com/account"),
    /^https:\/\/(www\.)?oceanleo\.com\/?$/,
  );
  // SSR（无 window、无 currentHref）返回空串，交给 client.ts 自己兜底。
  assert.equal(wechatRedirectTarget(), "");
});

test("authErrorCopy 把上游原始错误翻成能照做的中文（未配 ≠ 白屏）", () => {
  // Supabase 未配 SMS provider 时的原话。
  assert.equal(
    authErrorCopy("phone", "Unsupported phone provider"),
    "短信登录暂未开放：短信服务尚未配置，请改用邮箱登录。",
  );
  // 网关未配微信 key → 501 / client.ts 的兜底文案。
  assert.equal(
    authErrorCopy("wechat", "微信登录暂未开放"),
    "微信登录暂未开放：微信开放平台尚未配置，请改用邮箱或手机号登录。",
  );
  assert.equal(
    authErrorCopy("wechat", "Not Implemented (501)"),
    "微信登录暂未开放：微信开放平台尚未配置，请改用邮箱或手机号登录。",
  );
  // 同一句话在不同 tab 上要给不同的出路，这就是 method 参与判定的理由。
  assert.notEqual(
    authErrorCopy("phone", "provider is not configured"),
    authErrorCopy("wechat", "provider is not configured"),
  );
  // client.ts 在 Supabase 未配时返回的原话。
  assert.equal(
    authErrorCopy("phone", "Supabase not configured"),
    "短信登录暂未开放：短信服务尚未配置，请改用邮箱登录。",
  );

  assert.equal(
    authErrorCopy("wechat", "网络错误：无法连接到登录服务"),
    "网络错误：无法连接到登录服务，请稍后重试。",
  );
  assert.equal(authErrorCopy("email", "Failed to fetch"), "网络错误：无法连接到登录服务，请稍后重试。");
  assert.equal(authErrorCopy("email", "Invalid login credentials"), "邮箱或密码不正确。");
  assert.equal(
    authErrorCopy("phone", "Token has expired or is invalid"),
    "验证码不正确或已过期，请重新获取。",
  );
  // 注册已关（DB 触发器）的各种上游说法都要落到同一句可读提示。
  for (const raw of ["Signups not allowed for otp", "Database error saving new user"]) {
    assert.equal(
      authErrorCopy("email", raw),
      "该账号尚未被邀请。目前仅开放被邀请的账号登录。",
      `未识别的注册关闭形态: ${raw}`,
    );
  }
  assert.equal(
    authErrorCopy("phone", "For security purposes, you can only request this after 51 seconds."),
    "操作过于频繁，请稍后再试。",
  );
  // 空错误 → 通用可读兜底，不是空串。
  assert.equal(authErrorCopy("email", ""), "登录失败，请稍后重试。");
  assert.equal(authErrorCopy("email", undefined), "登录失败，请稍后重试。");
  // 认不出来的错误原样透出（吞掉才是白屏）。
  assert.equal(authErrorCopy("email", "weird upstream detail"), "weird upstream detail");
});

test("AUTH_METHODS 顺序固定：邮箱 → 手机号 → 微信", () => {
  assert.deepEqual([...AUTH_METHODS], ["email", "phone", "wechat"]);
});

// ————————————————————————————————————————————————————————————————
// 2. jsdom 夹具
// ————————————————————————————————————————————————————————————————

const SUBSITE_URL = "https://converter.oceanleo.com/workspace?fn=pdf";

function defaultAuth() {
  return {
    calls: [],
    oceanleoConfigured: () => true,
    normalizeCnPhone,
    async signIn(email, password) {
      this.calls.push(["signIn", email, password]);
      return { error: "Invalid login credentials" };
    },
    async sendPhoneOtp(phone) {
      this.calls.push(["sendPhoneOtp", phone]);
      return {};
    },
    async verifyPhoneOtp(phone, token) {
      this.calls.push(["verifyPhoneOtp", phone, token]);
      return {};
    },
    async wechatLoginUrl(redirect) {
      this.calls.push(["wechatLoginUrl", redirect]);
      return { url: "https://open.weixin.qq.com/connect/qrconnect?x=1" };
    },
  };
}

async function withDom(run, { auth = defaultAuth(), url = SUBSITE_URL } = {}) {
  // fabric 自带的 jsdom 是仓内唯一可用的那份；它的 canvas 依赖在本容器里装不上。
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  // jsdom 不实现真跳转，`window.location.href = …` 会抛 jsdomError。
  // 把它收进数组：这条错误的出现**就是**「组件真的发起了跳转」的证据。
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => navigations.push(String(e.message)));

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
  globalThis.__W10_AUTH__ = auth;

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const render = (Component, props) =>
    act(async () => root.render(React.createElement(Component, props)));
  const find = (selector) => window.document.querySelector(selector);
  const findAll = (selector) => [...window.document.querySelectorAll(selector)];
  const text = () => window.document.body.textContent || "";
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `点不到 ${selector}`);
    return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  };
  const type = (selector, value) => {
    const node = find(selector);
    assert.ok(node, `找不到输入框 ${selector}`);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    return act(async () => {
      setter.call(node, value);
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const submit = (selector) => {
    const node = find(selector);
    assert.ok(node, `找不到表单 ${selector}`);
    return act(async () => node.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  };

  try {
    await run({ window, auth, navigations, render, find, findAll, text, click, type, submit });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    delete globalThis.__W10_AUTH__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

// ————————————————————————————————————————————————————————————————
// 3. 三个 tab 真实可用
// ————————————————————————————————————————————————————————————————

test("三个 tab 都在，切换真的换表单", async () => {
  await withDom(async ({ render, find, findAll, click }) => {
    await render(AuthPanel, { onClose() {} });
    assert.deepEqual(
      findAll("[data-auth-method-tab]").map((n) => n.getAttribute("data-auth-method-tab")),
      ["email", "phone", "wechat"],
    );
    // 默认邮箱。
    assert.ok(find('[data-auth-form="email"]'));
    assert.equal(find("[data-auth-active-method]").getAttribute("data-auth-active-method"), "email");

    await click('[data-auth-method-tab="phone"]');
    assert.ok(find('[data-auth-form="phone"]'), "切到手机号后应渲染手机号表单");
    assert.equal(find('[data-auth-form="email"]'), null);

    await click('[data-auth-method-tab="wechat"]');
    assert.ok(find('[data-auth-form="wechat"]'), "切到微信后应渲染微信面板");
    assert.equal(find('[data-auth-form="phone"]'), null);
  });
});

test("邮箱密码：提交把值交给 lib/auth 的 signIn，成功后回调并关闭", async () => {
  const auth = defaultAuth();
  let succeeded = 0;
  let closed = 0;
  auth.signIn = async function (email, password) {
    this.calls.push(["signIn", email, password]);
    return { data: {} };
  };
  await withDom(
    async ({ render, type, submit }) => {
      await render(AuthPanel, {
        onClose: () => { closed += 1; },
        onSuccess: () => { succeeded += 1; },
      });
      await type("#oceanleo-auth-email", "invited@oceanleo.com");
      await type("#oceanleo-auth-password", "hunter2hunter2");
      await submit('[data-auth-form="email"]');
      assert.deepEqual(auth.calls, [["signIn", "invited@oceanleo.com", "hunter2hunter2"]]);
      assert.equal(succeeded, 1);
      assert.equal(closed, 1, "成功后默认自动关闭");
    },
    { auth },
  );
});

test("邮箱密码：失败给可读中文，不是 Supabase 的英文原话", async () => {
  const auth = defaultAuth(); // 默认返回 Invalid login credentials
  await withDom(
    async ({ render, type, submit, find }) => {
      await render(AuthPanel, { onClose() {} });
      await type("#oceanleo-auth-email", "who@oceanleo.com");
      await type("#oceanleo-auth-password", "wrongpass");
      await submit('[data-auth-form="email"]');
      const error = find("[data-auth-error]");
      assert.ok(error, "失败必须有可见错误区");
      assert.equal(error.textContent, "邮箱或密码不正确。");
      assert.doesNotMatch(error.textContent, /Invalid login credentials/);
    },
    { auth },
  );
});

test("手机号 OTP：格式先本地判（与 normalizeCnPhone 同源），有效才发", async () => {
  const auth = defaultAuth();
  await withDom(
    async ({ render, click, type, submit, find }) => {
      await render(AuthPanel, { onClose() {}, defaultMethod: "phone" });
      await type("#oceanleo-auth-phone", "12345");
      await submit('[data-auth-form="phone"]');
      assert.equal(find("[data-auth-error]").textContent, "请输入有效的中国大陆手机号。");
      assert.deepEqual(auth.calls, [], "格式不合法时不得发起一次注定失败的往返");

      await type("#oceanleo-auth-phone", "138 0013 8000");
      await submit('[data-auth-form="phone"]');
      assert.deepEqual(auth.calls, [["sendPhoneOtp", "138 0013 8000"]]);
      assert.equal(find("[data-auth-error]"), null);
      assert.equal(find("[data-auth-notice]").textContent, "验证码已发送，请查收短信。");
      // 验证码输入框与冷却中的重发键出现了。
      assert.ok(find("#oceanleo-auth-otp"));
      const resend = find("[data-auth-resend]");
      assert.equal(resend.textContent, "重新发送（60s）");
      assert.equal(resend.disabled, true, "冷却期内重发键必须禁用");

      await type("#oceanleo-auth-otp", "654321");
      await submit('[data-auth-form="phone"]');
      assert.deepEqual(auth.calls[1], ["verifyPhoneOtp", "138 0013 8000", "654321"]);
      void click;
    },
    { auth },
  );
});

test("手机号 OTP：SMS provider 未配 → 可读降级提示而不是白屏", async () => {
  const auth = defaultAuth();
  auth.sendPhoneOtp = async function (phone) {
    this.calls.push(["sendPhoneOtp", phone]);
    return { error: "Unsupported phone provider" };
  };
  await withDom(
    async ({ render, type, submit, find, text }) => {
      await render(AuthPanel, { onClose() {}, defaultMethod: "phone" });
      await type("#oceanleo-auth-phone", "13800138000");
      await submit('[data-auth-form="phone"]');
      assert.equal(
        find("[data-auth-error]").textContent,
        "短信登录暂未开放：短信服务尚未配置，请改用邮箱登录。",
      );
      // 白屏的形态是「表单没了、也没有话」——这里两样都在。
      assert.ok(find('[data-auth-form="phone"]'), "降级后表单仍在");
      assert.ok(text().includes("目前仅开放被邀请的账号登录。"));
    },
    { auth },
  );
});

test("微信：回跳地址就是当前子站页面，且真的发起跳转", async () => {
  const auth = defaultAuth();
  await withDom(
    async ({ render, click, navigations, find }) => {
      await render(AuthPanel, { onClose() {}, defaultMethod: "wechat" });
      await click('[data-auth-form="wechat"] [data-auth-submit]');
      // ① 交给网关的 redirect 必须是**当前页**，不是门户首页。
      assert.deepEqual(auth.calls, [["wechatLoginUrl", SUBSITE_URL]]);
      assert.match(auth.calls[0][1], /^https:\/\/converter\.oceanleo\.com\//);
      // ② 拿到 url 后真的跳了（jsdom 不实现导航，这条错误就是跳转发生过的证据）。
      assert.ok(
        navigations.some((m) => /Not implemented: navigation/i.test(m)),
        `未观察到跳转，实际 jsdomError: ${JSON.stringify(navigations)}`,
      );
      assert.equal(find("[data-auth-error]"), null);
    },
    { auth },
  );
});

test("微信：显式 wechatRedirect 覆盖当前页", async () => {
  const auth = defaultAuth();
  await withDom(
    async ({ render, click }) => {
      await render(AuthPanel, {
        onClose() {},
        defaultMethod: "wechat",
        wechatRedirect: "https://converter.oceanleo.com/account",
      });
      await click('[data-auth-form="wechat"] [data-auth-submit]');
      assert.deepEqual(auth.calls, [["wechatLoginUrl", "https://converter.oceanleo.com/account"]]);
    },
    { auth },
  );
});

test("微信：key 未配（网关 501）→ 可读降级提示，按钮回到可点状态", async () => {
  const auth = defaultAuth();
  auth.wechatLoginUrl = async function (redirect) {
    this.calls.push(["wechatLoginUrl", redirect]);
    return { error: "微信登录暂未开放" };
  };
  await withDom(
    async ({ render, click, find, navigations }) => {
      await render(AuthPanel, { onClose() {}, defaultMethod: "wechat" });
      await click('[data-auth-form="wechat"] [data-auth-submit]');
      assert.equal(
        find("[data-auth-error]").textContent,
        "微信登录暂未开放：微信开放平台尚未配置，请改用邮箱或手机号登录。",
      );
      assert.equal(find('[data-auth-form="wechat"] [data-auth-submit]').disabled, false);
      assert.deepEqual(navigations, [], "拿不到 url 时不得跳转");
    },
    { auth },
  );
});

// ————————————————————————————————————————————————————————————————
// 4. 产品红线：无注册入口 / 未配置分支 / Modal 外壳
// ————————————————————————————————————————————————————————————————

test("不提供开放注册入口，底部固定「目前仅开放被邀请的账号登录。」", async () => {
  await withDom(async ({ render, find, text, click }) => {
    await render(AuthPanel, { onClose() {} });
    for (const method of ["email", "phone", "wechat"]) {
      if (method !== "email") await click(`[data-auth-method-tab="${method}"]`);
      assert.ok(
        find("[data-auth-invite-only]"),
        `${method} tab 下必须仍有「仅开放被邀请」提示`,
      );
      assert.equal(find("[data-auth-invite-only]").textContent, "目前仅开放被邀请的账号登录。");
      const body = text();
      assert.doesNotMatch(body, /注册|去注册|创建账号|sign\s?up/i, `${method} tab 出现了注册入口`);
    }
  });
  // 源码层面也钉一次：注册函数一次都不能出现。
  assert.doesNotMatch(dialogSource, /signUp|signInWithOAuth|resetPasswordForEmail/);
});

test("oceanleoConfigured() 为假：明确的「登录服务尚未配置」分支，且不渲染表单", async () => {
  const auth = defaultAuth();
  auth.oceanleoConfigured = () => false;
  await withDom(
    async ({ render, find, text }) => {
      await render(AuthPanel, { onClose() {} });
      assert.ok(find("[data-auth-unconfigured]"), "必须有独立的未配置分支");
      assert.ok(text().includes("登录服务尚未配置"));
      assert.ok(text().includes("本站还没有接入 OceanLeo 登录服务，请联系管理员。"));
      // 渲染了也只会在提交时报 "Supabase not configured"，等于让用户白填一遍。
      assert.equal(find('[data-auth-form="email"]'), null);
      assert.equal(find("[data-auth-method-tab]"), null);
    },
    { auth },
  );
});

test("AuthDialog 走共享 Modal（遮罩 / aria-modal / 标题关联）", async () => {
  await withDom(async ({ render, find, window }) => {
    await render(AuthDialog, { onClose() {} });
    const dialog = find('[role="dialog"][aria-modal="true"]');
    assert.ok(dialog, "AuthDialog 必须是真 modal");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    assert.ok(labelledBy, "缺 aria-labelledby");
    assert.equal(window.document.getElementById(labelledBy)?.textContent, "登录 OceanLeo");
    assert.ok(find("[data-auth-panel]"));
    assert.ok(find("[data-auth-close]"), "浮层形态必须有关闭键");
  });
});

test("AuthPanel 内嵌形态（不传 onClose）不渲染关闭键——converter/aitools 要就地登录", async () => {
  await withDom(async ({ render, find }) => {
    await render(AuthPanel, {});
    assert.ok(find("[data-auth-panel]"));
    assert.equal(find("[data-auth-close]"), null);
    assert.equal(find('[role="dialog"]'), null, "内嵌形态不得自带遮罩");
    assert.ok(find('[data-auth-form="email"]'));
  });
});

test("methods 子集：只给一种方式时不渲染 tab 条", async () => {
  await withDom(async ({ render, find }) => {
    await render(AuthPanel, { onClose() {}, methods: ["email"] });
    assert.equal(find("[data-auth-method-tab]"), null);
    assert.ok(find('[data-auth-form="email"]'));
  });
});

// ————————————————————————————————————————————————————————————————
// 5. 17 语判据
// ————————————————————————————————————————————————————————————————

const LOCALES = [
  "zh", "zh-TW", "en", "de", "es", "es-419", "fr", "it", "pt-BR",
  "pt-PT", "ja", "ko", "ar", "th", "tr", "vi", "hi",
];
const CHINESE_LOCALES = new Set(["zh", "zh-TW"]);

const dictionaries = new Map();
const dictionarySources = new Map();
for (const locale of LOCALES) {
  const mod = await import(`../src/i18n/ui/messages/${locale}.ts`);
  dictionaries.set(locale, mod.default);
  dictionarySources.set(
    locale,
    await readFile(resolve(`src/i18n/ui/messages/${locale}.ts`), "utf8"),
  );
}

/** 本轮新增（既有词条如「登录」「邮箱」不在此列，它们的译文不得被改写）。 */
const W10_NEW_COPY = [
  "登录方式",
  "微信",
  "登录成功",
  "中国大陆手机号",
  "验证码",
  "6 位验证码",
  "获取验证码",
  "验证并登录",
  "验证码已发送，请查收短信。",
  "重发",
  "重新发送（{seconds}s）",
  "使用微信扫码登录 OceanLeo。",
  "微信登录",
  "跳转中...",
  "目前仅开放被邀请的账号登录。",
  "登录服务尚未配置",
  "本站还没有接入 OceanLeo 登录服务，请联系管理员。",
  "短信登录暂未开放：短信服务尚未配置，请改用邮箱登录。",
  "微信登录暂未开放：微信开放平台尚未配置，请改用邮箱或手机号登录。",
  "网络错误：无法连接到登录服务，请稍后重试。",
  "邮箱或密码不正确。",
  "验证码不正确或已过期，请重新获取。",
  "该账号尚未被邀请。目前仅开放被邀请的账号登录。",
  "请输入有效的中国大陆手机号。",
  "操作过于频繁，请稍后再试。",
  "登录失败，请稍后重试。",
];

/** 复用的既有词条：本轮**不新增**，但删了会让 16 个 locale 露中文。 */
const W10_REUSED_COPY = [
  "登录 OceanLeo",
  "关闭",
  "邮箱",
  "手机号",
  "密码",
  "至少 6 位",
  "登录",
  "处理中...",
  "一次登录，全家桶所有 AI 应用通用。",
];

/** zh-TW 必须真本地化的抽样（简繁不是逐字换字）。 */
const ZH_TW_MUST_DIFFER = {
  "登录成功": "登入成功",
  "验证码": "驗證碼",
  "获取验证码": "取得驗證碼",
  "微信登录": "微信登入",
  "目前仅开放被邀请的账号登录。": "目前僅開放受邀請的帳號登入。",
  "登录服务尚未配置": "登入服務尚未設定",
  "邮箱或密码不正确。": "電子郵件或密碼不正確。",
};

/**
 * zh-TW 与简体逐字相同的那条：「微信」是产品名，繁体写法完全一致，属**语言事实**。
 * 日后有人往 zh-TW 里偷懒抄简体，这个集合会变大并让测试变红。
 */
const ZH_TW_SAME_AS_SOURCE = new Set(["微信"]);

test("AUTH_DIALOG_COPY 覆盖组件里所有 tt() 中文字面量（词条清单不许漂移）", () => {
  const literals = [...dialogSource.matchAll(/tt\(\s*"((?:[^"\\]|\\.)*)"/g)]
    .map(([, literal]) => literal)
    .filter((literal) => /[\u4e00-\u9fff]/.test(literal));
  // 组件真的在用这些词条，否则下面的循环会空转成一条永远为真的断言。
  for (const expected of ["登录 OceanLeo", "验证并登录", "使用微信扫码登录 OceanLeo。", "目前仅开放被邀请的账号登录。"]) {
    assert.ok(literals.includes(expected), `组件应通过 tt("${expected}") 取文案`);
  }
  const copy = new Set(AUTH_DIALOG_COPY);
  const missing = literals.filter((literal) => !copy.has(literal));
  assert.deepEqual(missing, [], `tt() 字面量不在 AUTH_DIALOG_COPY 白名单里: ${missing.join(" / ")}`);
  // 动态取文案的三处（tab 标签、本地格式校验、错误映射）也必须在清单里。
  for (const dynamic of ["邮箱", "手机号", "微信", "请输入有效的中国大陆手机号。", "登录失败，请稍后重试。"]) {
    assert.ok(copy.has(dynamic), `动态文案 "${dynamic}" 漏进白名单`);
  }
});

test("AUTH_DIALOG_COPY 的每一条在 17 语词典里都有非空译文", () => {
  for (const key of AUTH_DIALOG_COPY) {
    for (const [locale, dict] of dictionaries) {
      const value = dict[key];
      assert.equal(typeof value, "string", `${locale} 词典缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
    }
  }
  // 复用的既有词条一条都不许丢。
  for (const key of W10_REUSED_COPY) {
    for (const [locale, dict] of dictionaries) {
      assert.equal(typeof dict[key], "string", `${locale} 丢了要复用的既有词条 "${key}"`);
    }
  }
});

test("W10 新增词条：zh 是 key===值，15 个非中文 locale 真的翻了", () => {
  const zh = dictionaries.get("zh");
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;
  for (const key of W10_NEW_COPY) {
    assert.equal(zh[key], key, `zh 的 "${key}" 必须 key===值`);
    for (const [locale, dict] of dictionaries) {
      const value = dict[key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      if (CHINESE_LOCALES.has(locale)) continue;
      assert.notEqual(value, key, `${locale} 的 "${key}" 还是中文源串（未翻译）`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      // 汉字残留启发式对 ja/ko 不成立（它们的正确译文本就含 CJK 码位）。
      if (locale !== "ja" && locale !== "ko") {
        assert.doesNotMatch(value, /[\u4e00-\u9fff]/, `${locale} 的 "${key}" 残留汉字`);
      }
    }
  }
});

test("W10 新增词条的 zh-TW：该改的改了，逐字相同的那条是语言事实", () => {
  const zhTW = dictionaries.get("zh-TW");
  for (const [key, expected] of Object.entries(ZH_TW_MUST_DIFFER)) {
    assert.equal(zhTW[key], expected, `zh-TW 的 "${key}" 应为「${expected}」`);
    assert.notEqual(zhTW[key], key);
  }
  const same = W10_NEW_COPY.filter((key) => zhTW[key] === key);
  assert.deepEqual(
    new Set(same),
    ZH_TW_SAME_AS_SOURCE,
    "zh-TW 出现了新的「与简体逐字相同」词条：要么它真的繁简同形（请加进白名单并说明），" +
      "要么是有人把简体直接抄进了 zh-TW（必须真翻）",
  );
});

test("`{seconds}` 插值符 17 语一个不丢（丢了会渲染出字面量 {seconds}）", () => {
  for (const [locale, dict] of dictionaries) {
    assert.match(
      dict["重新发送（{seconds}s）"],
      /\{seconds\}/,
      `${locale} 的重发倒计时丢了 {seconds} 占位符`,
    );
  }
});

test("新词条在每份词典里只出现一次（重复 key 会静默覆盖）", () => {
  for (const key of W10_NEW_COPY) {
    const pattern = new RegExp(
      `^  ${JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`,
      "gm",
    );
    for (const [locale, source] of dictionarySources) {
      const hits = source.match(pattern) || [];
      assert.equal(hits.length, 1, `${locale} 里 "${key}" 出现了 ${hits.length} 次`);
    }
  }
});

test("新词条不会被 useUI 的两条改写规则误伤", async () => {
  const hook = await readFile(resolve("src/i18n/ui/useUI.ts"), "utf8");
  // useUI 会把「文件库」归一成「我的库」、把含「灵感」的文案整段改写。
  assert.match(hook, /replaceAll\("文件库", "我的库"\)/);
  assert.match(hook, /灵感\|靈感/);
  for (const key of W10_NEW_COPY) {
    assert.doesNotMatch(key, /文件库|檔案庫|灵感|靈感/, `"${key}" 会被 useUI 改写`);
  }
});
