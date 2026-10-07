// 设置 → 账户首页（Manus 布局）+ 改邮箱对话框（account-manus-layout W2）。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/account-home-layout.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.oceanleo.com/settings/account",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  FocusEvent: window.FocusEvent,
  InputEvent: window.InputEvent,
  File: window.File,
  FileReader: window.FileReader,
  Image: window.Image,
  DataTransfer: window.DataTransfer,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

// react-dom 在模块求值时就探测 `window.document` 是否存在（canUseDOM / 是否支持
// `input` 事件）。静态 import 会被提升到 jsdom 装好之前，React 就走 IE 的
// attachEvent 兜底并且不再监听 `input`，受控输入框收不到 onChange。所以必须在
// 全局 DOM 就位之后再加载它。
const { createRoot } = await import("react-dom/client");

Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: {
    async writeText(value) {
      globalThis.__w2Copied = value;
      return undefined;
    },
  },
});

const reactUrl = pathToFileURL(require.resolve("react")).href;

const STUBS = {
  "../../../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (zh, vars) =>
        vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
    }
  `),
  "../../../ui": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel, danger }) {
      return React.createElement(
        "div",
        { "data-testid": "confirm-dialog", "data-danger": danger ? "1" : "0" },
        React.createElement("h3", { "data-confirm-title": "" }, title),
        React.createElement("p", { "data-confirm-body": "" }, body),
        React.createElement("button", { type: "button", "data-confirm": "", onClick: onConfirm }, confirmLabel || "确认"),
        React.createElement("button", { type: "button", "data-cancel": "", onClick: onCancel }, "取消"),
      );
    }
    export function Modal({ children, labelledBy }) {
      return React.createElement("div", { role: "dialog", "data-modal": "", "aria-labelledby": labelledBy || undefined }, children);
    }
  `),
  "../../../lib/auth": dataModule(`
    const s = () => globalThis.__w2Auth;
    export async function signOutEverywhere() {
      s().signedOut += 1;
    }
  `),
  "../../../lib/auth/account-identity": dataModule(`
    const s = () => globalThis.__w2Identity;
    export async function updateDisplayName(name) { return s().updateDisplayName(name); }
    export async function updateAvatar(url) { return s().updateAvatar(url); }
    export async function requestEmailChange() { return s().requestEmailChange(); }
    export async function verifyEmailChange(code) { return s().verifyEmailChange(code); }
    export async function completeEmailChange(email, nonce) { return s().completeEmailChange(email, nonce); }
    export async function deleteOceanLeoAccount() {
      return s().deleteOceanLeoAccount ? s().deleteOceanLeoAccount() : { error: "now" };
    }
  `),
};

const { AccountHome, default: AccountHomeDefault } = await import(
  await compileModule("src/pages/settings/account/AccountHome.tsx", STUBS)
);

const {
  sessionContactDisplay,
  avatarInitial,
  emailForChangeDialog,
  isAvatarImageFile,
  fileToAvatarDataUrl,
  isWechatSyntheticEmail,
} = await import(await compileModule("src/pages/settings/account/account-home-model.ts"));

function tinyPngFile() {
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (ch) => ch.charCodeAt(0),
  );
  return new File([png], "face.png", { type: "image/png" });
}

function assignInputFile(input, file) {
  if (typeof window.DataTransfer === "function") {
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return;
  }
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
}

function fixture(overrides = {}) {
  const sessionContact = overrides.sessionContact ?? {
    kind: "email",
    value: "elonlee63@gmail.com",
    provider: "google",
  };
  return {
    userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    displayName: "Elon Lee",
    sessionContact,
    identities: [],
    deviceLabels: {},
    ...overrides,
    sessionContact: overrides.sessionContact ?? sessionContact,
  };
}

function resetStubs() {
  globalThis.__w2Copied = "";
  globalThis.__w2Auth = { signedOut: 0 };
  globalThis.__w2Identity = {
    names: [],
    avatars: [],
    emailsRequested: 0,
    codes: [],
    completed: [],
    async updateDisplayName(name) {
      this.names.push(name);
      return {};
    },
    async updateAvatar(url) {
      this.avatars.push(url);
      return {};
    },
    async requestEmailChange() {
      this.emailsRequested += 1;
      return {};
    },
    async verifyEmailChange(code) {
      this.codes.push(code);
      return { nonce: code };
    },
    async completeEmailChange(email, nonce) {
      this.completed.push({ email, nonce });
      return {};
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(props = {}) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  const calls = {
    signIn: 0,
    devices: 0,
    topup: 0,
    signedOut: 0,
    profiles: [],
    deleted: 0,
  };
  const profile = props.profile ?? fixture();
  await act(async () => {
    root.render(
      React.createElement(AccountHome, {
        profile,
        credits: props.credits ?? 551,
        currency: props.currency ?? "CNY",
        onOpenSignInMethods: () => {
          calls.signIn += 1;
        },
        onOpenDevices: () => {
          calls.devices += 1;
        },
        onOpenTopup: () => {
          calls.topup += 1;
        },
        onSignedOut: () => {
          calls.signedOut += 1;
        },
        onProfileChange: (next) => {
          calls.profiles.push(next);
        },
        onDeleteAccount: props.onDeleteAccount,
      }),
    );
  });
  await flush();
  return {
    host,
    calls,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function click(el) {
  assert.ok(el, "click target");
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function typeInto(el, value) {
  assert.ok(el, "input target");
  await act(async () => {
    const tracker = el._valueTracker;
    el.value = value;
    if (tracker) tracker.setValue("");
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  await flush();
}

async function blur(el) {
  await act(async () => {
    el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
  await flush();
}

test("默认导出就是 AccountHome", () => {
  assert.equal(AccountHomeDefault, AccountHome);
});

test("sessionContactDisplay：邮箱 / 手机 / 微信合成邮箱不上屏", () => {
  assert.equal(
    sessionContactDisplay({ kind: "email", value: "elonlee63@gmail.com", provider: "google" }),
    "elonlee63@gmail.com",
  );
  assert.equal(
    sessionContactDisplay({ kind: "phone", value: "138****8000", provider: "phone" }),
    "138****8000",
  );
  assert.equal(
    sessionContactDisplay({
      kind: "wechat",
      value: "wx_abc@wechat.oceanleo.com",
      provider: "wechat",
    }),
    "微信",
  );
  assert.equal(sessionContactDisplay({ kind: "wechat", value: "", provider: "wechat" }), "微信");
  assert.equal(isWechatSyntheticEmail("wx_abc@wechat.oceanleo.com"), true);
  assert.equal(emailForChangeDialog({ kind: "wechat", value: "wx_x@wechat.oceanleo.com", provider: "wechat" }), "");
  assert.equal(avatarInitial(fixture({ displayName: "Elon Lee" })), "E");
});

test("渲染后能找到全名、Email 更改、用户 ID 复制、登录方式、设备、删除、退出", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    const pane = host.querySelector('[data-settings-pane="account"]');
    assert.ok(pane);
    const nameInput = host.querySelector("[data-account-full-name]");
    assert.ok(nameInput);
    assert.equal(nameInput.value, "Elon Lee");
    assert.match(host.textContent, /全名/);
    assert.match(host.textContent, /邮箱/);
    assert.match(host.textContent, /elonlee63@gmail.com/);
    const avatar = host.querySelector("[data-account-avatar]");
    assert.ok(avatar);
    assert.equal(avatar.tagName, "BUTTON");
    assert.equal(avatar.getAttribute("aria-label"), "上传头像");
    assert.ok(host.querySelector("[data-account-avatar-edit]"));
    assert.ok(host.querySelector("[data-account-avatar-edit]").className.includes("group-hover:opacity-100"));
    const file = host.querySelector("[data-account-avatar-file]");
    assert.ok(file);
    assert.equal(file.getAttribute("accept"), "image/*");
    assert.ok(host.querySelector("[data-account-email-change]"));
    assert.match(host.querySelector("[data-account-email-change]").textContent, /更改/);
    for (const key of ["data-account-topup", "data-account-email-change", "data-account-copy-user-id", "data-account-open-sign-in-methods", "data-account-open-devices"]) {
      const button = host.querySelector(`[${key}]`);
      assert.ok(button, key);
      assert.ok(button.className.includes("font-medium"), `${key} 右侧按键字重太细`);
    }
    assert.match(host.textContent, /用户 ID/);
    assert.match(host.textContent, /aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/);
    assert.ok(host.querySelector("[data-account-copy-user-id]"));
    assert.match(host.querySelector("[data-account-copy-user-id]").textContent, /复制/);
    assert.match(host.textContent, /登录方式/);
    assert.match(host.textContent, /管理用于登录 OceanLeo 的第三方账号。/);
    assert.ok(host.querySelector("[data-account-open-sign-in-methods]"));
    assert.match(host.textContent, /已连接的设备/);
    assert.match(host.textContent, /查看并管理已登录 OceanLeo 的设备。/);
    assert.ok(host.querySelector("[data-account-open-devices]"));
    assert.match(host.textContent, /删除账户/);
    assert.ok(host.querySelector("[data-account-delete]"));
    const signOut = host.querySelector("[data-account-sign-out]");
    assert.ok(signOut);
    assert.equal(signOut.getAttribute("aria-label"), "退出登录");
    const signOutIcon = signOut.querySelector("[data-account-sign-out-icon]");
    assert.ok(signOutIcon);
    const paths = [...signOutIcon.querySelectorAll("path")].map((p) => p.getAttribute("d") || "").join(" ");
    assert.match(paths, /M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4/);
    assert.match(paths, /M10 12h11M16 7l5 5-5 5/);
    assert.equal(paths.includes("M14 4h4"), false);
    assert.match(host.textContent, /余额/);
    assert.match(host.textContent, /充值/);
    assert.ok(host.querySelector("[data-account-balance]"));
    assert.ok(host.querySelector("[data-account-topup]"));
    assert.match(host.querySelector("[data-account-balance]").textContent, /¥551\.00/);
    assert.equal(host.textContent.includes("免费计划"), false);
    assert.equal(host.textContent.includes("升级"), false);
    assert.equal(host.textContent.includes("积分"), false);
    assert.equal(host.textContent.includes("免费积分"), false);
    assert.equal(host.querySelector("[data-account-plan]"), null);
    assert.equal(host.querySelector("[data-account-upgrade]"), null);
    assert.equal(host.querySelector("[data-account-credits]"), null);
    assert.equal(host.querySelector("[data-account-free-credits]"), null);
  } finally {
    await unmount();
  }
});

test("点管理会调对应 callback；充值走 onOpenTopup", async () => {
  resetStubs();
  const { host, calls, unmount } = await mount();
  try {
    await click(host.querySelector("[data-account-open-sign-in-methods]"));
    await click(host.querySelector("[data-account-open-devices]"));
    await click(host.querySelector("[data-account-topup]"));
    assert.equal(calls.signIn, 1);
    assert.equal(calls.devices, 1);
    assert.equal(calls.topup, 1);
  } finally {
    await unmount();
  }
});

test("改名即时 onProfileChange，blur 调 updateDisplayName", async () => {
  resetStubs();
  const { host, calls, unmount } = await mount();
  try {
    const input = host.querySelector("[data-account-full-name]");
    await typeInto(input, "Elon L");
    assert.ok(calls.profiles.length >= 1);
    assert.equal(calls.profiles.at(-1).displayName, "Elon L");
    assert.equal(globalThis.__w2Identity.names.length, 0);
    await blur(input);
    assert.deepEqual(globalThis.__w2Identity.names, ["Elon L"]);
  } finally {
    await unmount();
  }
});

test("改邮箱对话框出现截图上的标题和「发送」", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    await click(host.querySelector("[data-account-email-change]"));
    const dialog = host.querySelector("[data-change-email-dialog]");
    assert.ok(dialog);
    assert.match(dialog.textContent, /更改邮箱地址/);
    assert.match(dialog.textContent, /为了账户安全，请先完成两步验证。/);
    assert.match(dialog.textContent, /验证身份/);
    assert.match(dialog.textContent, /发送/);
    assert.match(dialog.textContent, /elonlee63@gmail.com/);
    assert.ok(dialog.querySelector("[data-change-email-send]"));
    await click(dialog.querySelector("[data-change-email-send]"));
    assert.equal(globalThis.__w2Identity.emailsRequested, 1);
    await typeInto(dialog.querySelector("[data-change-email-code]"), "123456");
    await click(dialog.querySelector("[data-change-email-next]"));
    assert.deepEqual(globalThis.__w2Identity.codes, ["123456"]);
    const step2 = host.querySelector("[data-change-email-dialog]");
    assert.equal(step2.getAttribute("data-change-email-step"), "new-email");
    assert.match(step2.textContent, /新邮箱地址/);
    await typeInto(step2.querySelector("[data-change-email-new]"), "new@oceanleo.com");
    await click(step2.querySelector("[data-change-email-next]"));
    assert.deepEqual(globalThis.__w2Identity.completed, [{ email: "new@oceanleo.com", nonce: "123456" }]);
  } finally {
    await unmount();
  }
});

test("不出现 Daily refresh / 300 every day", async () => {
  resetStubs();
  const { host, unmount } = await mount({ credits: 551 });
  try {
    const text = host.textContent;
    assert.equal(text.includes("Daily refresh"), false);
    assert.equal(text.includes("300 every day"), false);
    assert.equal(text.includes("Refresh to 300"), false);
    assert.equal(text.includes("每日刷新"), false);
  } finally {
    await unmount();
  }
});

test("微信本次登录不展示合成邮箱", async () => {
  resetStubs();
  const { host, unmount } = await mount({
    profile: fixture({
      sessionContact: {
        kind: "wechat",
        value: "wx_unionid@wechat.oceanleo.com",
        provider: "wechat",
      },
    }),
  });
  try {
    const email = host.querySelector("[data-account-email]");
    assert.equal(email.textContent.trim(), "微信");
    assert.equal(host.textContent.includes("wechat.oceanleo.com"), false);
    assert.equal(host.textContent.includes("wx_unionid"), false);
  } finally {
    await unmount();
  }
});

test("复制用户 ID 提示「已复制。」", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    await click(host.querySelector("[data-account-copy-user-id]"));
    assert.equal(globalThis.__w2Copied, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    assert.match(host.querySelector("[data-account-copy-user-id]").textContent, /已复制。/);
  } finally {
    await unmount();
  }
});

test("删除账户不是退出登录；无 API 时提示写信注销", async () => {
  resetStubs();
  const { host, calls, unmount } = await mount();
  try {
    await click(host.querySelector("[data-account-delete]"));
    const dialog = host.querySelector("[data-testid=confirm-dialog]");
    assert.ok(dialog);
    assert.match(dialog.textContent, /确认删除账户/);
    assert.match(dialog.textContent, /这将删除你的账户和全部数据。/);
    await click(dialog.querySelector("[data-confirm]"));
    assert.match(host.textContent, /请写信到 support@oceanleo.com 申请注销。/);
    assert.equal(globalThis.__w2Auth.signedOut, 0);
    assert.equal(calls.signedOut, 0);
  } finally {
    await unmount();
  }
});

test("isAvatarImageFile 只认图片", () => {
  assert.equal(isAvatarImageFile({ type: "image/png", name: "a.png" }), true);
  assert.equal(isAvatarImageFile({ type: "image/svg+xml", name: "a.svg" }), false);
  assert.equal(isAvatarImageFile({ type: "text/plain", name: "a.txt" }), false);
});

test("fileToAvatarDataUrl 把图片读成 data URL", async () => {
  const result = await fileToAvatarDataUrl(tinyPngFile());
  assert.equal(result.error, undefined);
  assert.match(result.url, /^data:image\//);
});

test("点头像打开图片选择；选图后 updateAvatar 并回写 profile", async () => {
  resetStubs();
  const { host, calls, unmount } = await mount();
  try {
    const picker = host.querySelector("[data-account-avatar-file]");
    assert.ok(picker);
    assert.equal(picker.getAttribute("accept"), "image/*");
    const file = tinyPngFile();
    assignInputFile(picker, file);
    await act(async () => {
      picker.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    for (let i = 0; i < 30 && globalThis.__w2Identity.avatars.length === 0; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    const err = host.querySelector("[data-account-avatar-error]");
    assert.equal(
      globalThis.__w2Identity.avatars.length,
      1,
      err ? `avatar error: ${err.textContent}` : "updateAvatar 未被调用",
    );
    assert.match(globalThis.__w2Identity.avatars[0], /^data:image\//);
    assert.ok(calls.profiles.some((row) => typeof row.avatarUrl === "string" && row.avatarUrl.startsWith("data:image/")));
  } finally {
    await unmount();
  }
});

test("已有头像画成图片，不是首字母", async () => {
  resetStubs();
  const { host, unmount } = await mount({
    profile: fixture({ avatarUrl: "data:image/png;base64,aaa" }),
  });
  try {
    const img = host.querySelector("[data-account-avatar] img");
    assert.ok(img);
    assert.equal(img.getAttribute("src"), "data:image/png;base64,aaa");
  } finally {
    await unmount();
  }
});

test("退出走确认文案，确认后才 signOutEverywhere", async () => {
  resetStubs();
  const { host, calls, unmount } = await mount();
  try {
    await click(host.querySelector("[data-account-sign-out]"));
    const dialog = host.querySelector("[data-testid=confirm-dialog]");
    assert.ok(dialog);
    assert.match(dialog.textContent, /退出登录/);
    assert.match(dialog.textContent, /退出后需要重新登录才能使用。这将退出全部 OceanLeo 站点。/);
    assert.equal(globalThis.__w2Auth.signedOut, 0);
    await click(dialog.querySelector("[data-confirm]"));
    assert.equal(globalThis.__w2Auth.signedOut, 1);
    assert.equal(calls.signedOut, 1);
  } finally {
    await unmount();
  }
});
