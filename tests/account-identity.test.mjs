// 账户身份读写（W1）：本次登录联系方式、显示名、绑定/解绑封装。
//
// 跑法（必须带 loader；裸跑 node --test 会在加载期打哑）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/account-identity.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  avatarUrlFromUser,
  displayNameFromUser,
  identitiesFromUser,
  sessionContactFromUser,
} from "../src/lib/auth/account-identity.ts";

function user(partial) {
  return {
    id: "user-1",
    email: null,
    phone: null,
    user_metadata: {},
    identities: [],
    ...partial,
  };
}

function identity(partial) {
  return {
    id: "id-1",
    identity_id: "iid-1",
    provider: "email",
    last_sign_in_at: "2026-01-01T00:00:00.000Z",
    identity_data: {},
    ...partial,
  };
}

test("google 本次登录显示 gmail，即使 identities 里还有 outlook", () => {
  const u = user({
    email: "me@outlook.com",
    identities: [
      identity({
        id: "azure-1",
        identity_id: "azure-1",
        provider: "azure",
        last_sign_in_at: "2026-01-01T00:00:00.000Z",
        identity_data: { email: "me@outlook.com" },
      }),
      identity({
        id: "google-1",
        identity_id: "google-1",
        provider: "google",
        last_sign_in_at: "2026-09-15T12:00:00.000Z",
        identity_data: { email: "me@gmail.com" },
      }),
    ],
  });
  const contact = sessionContactFromUser(u);
  assert.equal(contact.kind, "email");
  assert.equal(contact.provider, "google");
  assert.equal(contact.value, "me@gmail.com");
  assert.notEqual(contact.value, "me@outlook.com");
});

test("outlook 本次登录显示 outlook，provider 是 microsoft", () => {
  const u = user({
    email: "me@gmail.com",
    identities: [
      identity({
        id: "google-1",
        identity_id: "google-1",
        provider: "google",
        last_sign_in_at: "2026-01-01T00:00:00.000Z",
        identity_data: { email: "me@gmail.com" },
      }),
      identity({
        id: "azure-1",
        identity_id: "azure-1",
        provider: "azure",
        last_sign_in_at: "2026-09-15T12:00:00.000Z",
        identity_data: { email: "me@outlook.com" },
      }),
    ],
  });
  const contact = sessionContactFromUser(u);
  assert.equal(contact.kind, "email");
  assert.equal(contact.provider, "microsoft");
  assert.equal(contact.value, "me@outlook.com");
  const providers = identitiesFromUser(u).map((row) => row.provider);
  assert.ok(providers.includes("microsoft"));
  assert.ok(!providers.includes("azure"));
});

test("微信合成邮箱 → kind wechat，value 不含 wechat.oceanleo.com", () => {
  const synthetic = "wx_unionidabc@wechat.oceanleo.com";
  const u = user({
    email: synthetic,
    user_metadata: { full_name: "阿强", name: "阿强" },
    identities: [
      identity({
        provider: "email",
        identity_data: { email: synthetic },
        last_sign_in_at: "2026-09-01T00:00:00.000Z",
      }),
    ],
  });
  const contact = sessionContactFromUser(u);
  assert.equal(contact.kind, "wechat");
  assert.equal(contact.provider, "wechat");
  assert.equal(contact.value.includes("wechat.oceanleo.com"), false);
  assert.equal(contact.value.includes("wx_"), false);
  assert.equal(contact.value, "阿强");

  const noName = user({
    email: synthetic,
    user_metadata: {},
    identities: [
      identity({
        provider: "email",
        identity_data: { email: synthetic },
      }),
    ],
  });
  const hidden = sessionContactFromUser(noName);
  assert.equal(hidden.kind, "wechat");
  assert.equal(hidden.value, "");
  assert.equal(String(hidden.value).includes("wechat.oceanleo.com"), false);
});

test("无 metadata 时名字回落到邮箱前缀", () => {
  const u = user({
    email: "jane.doe@example.com",
    user_metadata: {},
  });
  assert.equal(displayNameFromUser(u), "jane.doe");
});

test("显示名优先 full_name，再 name，再打码手机", () => {
  assert.equal(
    displayNameFromUser(
      user({
        email: "jane.doe@example.com",
        user_metadata: { full_name: "Jane Doe", name: "Ignored" },
      }),
    ),
    "Jane Doe",
  );
  assert.equal(
    displayNameFromUser(
      user({
        email: "jane.doe@example.com",
        user_metadata: { name: "Only Name" },
      }),
    ),
    "Only Name",
  );
  assert.equal(
    displayNameFromUser(
      user({
        email: null,
        phone: "+8613812348000",
        user_metadata: {},
      }),
    ),
    "138****8000",
  );
  assert.equal(displayNameFromUser(null), "");
});

test("手机本次登录显示打码号，不把完整号交出去", () => {
  const contact = sessionContactFromUser(
    user({
      phone: "13900001111",
      identities: [
        identity({
          provider: "phone",
          last_sign_in_at: "2026-09-20T00:00:00.000Z",
          identity_data: { phone: "13900001111" },
        }),
      ],
    }),
  );
  assert.equal(contact.kind, "phone");
  assert.equal(contact.provider, "phone");
  assert.equal(contact.value, "139****1111");
  assert.equal(contact.value.includes("13900001111"), false);
});

const clientStubUrl = dataModule(`
  const g = () => globalThis.__W1_AUTH__;
  export const AUTH_STATE_EVENT = "oceanleo:auth-state";
  export function browserClient() { return g().client; }
  export async function accessToken() { return g().accessToken ?? "tok"; }
  export async function getUserEmail() { return g().user?.email ?? null; }
  export async function getUserId() { return g().user?.id ?? null; }
  export async function reauthenticate() { return g().reauthenticate(); }
  export async function wechatLoginUrl(redirect) { return g().wechatLoginUrl(redirect); }
  export async function startOauthSignIn(provider, redirect) {
    return g().startOauthSignIn(provider, redirect);
  }
  export async function getAuthPhoneUser() { return { user: g().user }; }
  export function maskCnPhone(phone) {
    const digits = String(phone || "").replace(/[\\s\\-()]/g, "").replace(/^\\+86/, "");
    if (!/^1[3-9]\\d{9}$/.test(digits)) return "****";
    return digits.slice(0, 3) + "****" + digits.slice(7);
  }
`);

async function loadIdentityModule() {
  const url = await compileModule("src/lib/auth/account-identity.ts", {
    "./client": clientStubUrl,
    "./config": dataModule(`
      export const GATEWAY_BASE = "https://api.test.oceanleo.com";
    `),
  });
  return import(url);
}

function installAuth(overrides = {}) {
  const calls = [];
  const userState = {
    id: "user-1",
    email: "me@gmail.com",
    phone: null,
    user_metadata: {},
    identities: [
      identity({
        id: "google-1",
        identity_id: "google-1",
        provider: "google",
        identity_data: { email: "me@gmail.com" },
      }),
      identity({
        id: "azure-1",
        identity_id: "azure-1",
        provider: "azure",
        identity_data: { email: "me@outlook.com" },
      }),
    ],
  };
  globalThis.__W1_AUTH__ = {
    user: userState,
    client: {
      auth: {
        async getUser() {
          return { data: { user: globalThis.__W1_AUTH__.user }, error: null };
        },
        async getSession() {
          return { data: { session: { user: globalThis.__W1_AUTH__.user } }, error: null };
        },
        async updateUser(attrs) {
          calls.push(["updateUser", attrs]);
          return { data: { user: globalThis.__W1_AUTH__.user }, error: null };
        },
        async linkIdentity(creds) {
          calls.push(["linkIdentity", creds]);
          return { data: { provider: creds.provider, url: "https://oauth.example/" + creds.provider }, error: null };
        },
        async unlinkIdentity(target) {
          calls.push(["unlinkIdentity", target]);
          return { data: {}, error: null };
        },
      },
    },
    async reauthenticate() {
      calls.push(["reauthenticate"]);
      return {};
    },
    async wechatLoginUrl() {
      calls.push(["wechatLoginUrl"]);
      return { url: "https://open.weixin.qq.com/qr" };
    },
    async startOauthSignIn() {
      return { error: "should-not-sign-in-when-linking" };
    },
    ...overrides,
    calls,
  };
  globalThis.__W1_AUTH__.calls = calls;
  if (overrides.user) globalThis.__W1_AUTH__.user = overrides.user;
  return calls;
}

test("avatarUrlFromUser 优先 avatar_url，其次 picture", () => {
  assert.equal(avatarUrlFromUser(user({ user_metadata: { avatar_url: "https://cdn.example/a.png" } })), "https://cdn.example/a.png");
  assert.equal(avatarUrlFromUser(user({ user_metadata: { picture: "https://cdn.example/p.png" } })), "https://cdn.example/p.png");
  assert.equal(avatarUrlFromUser(user({ user_metadata: { avatar_url: "not-a-url" } })), "");
});

test("updateAvatar 写入 avatar_url", async () => {
  const mod = await loadIdentityModule();
  const calls = installAuth();
  const result = await mod.updateAvatar("data:image/png;base64,abc");
  assert.equal(result.error, undefined);
  const update = calls.find((row) => row[0] === "updateUser");
  assert.ok(update);
  assert.equal(update[1].data.avatar_url, "data:image/png;base64,abc");
});

test("updateDisplayName 同时写入 full_name 和 name", async () => {
  const mod = await loadIdentityModule();
  const calls = installAuth();
  const result = await mod.updateDisplayName("Ada Lovelace");
  assert.equal(result.error, undefined);
  const update = calls.find((row) => row[0] === "updateUser");
  assert.ok(update);
  assert.equal(update[1].data.full_name, "Ada Lovelace");
  assert.equal(update[1].data.name, "Ada Lovelace");
});

test("linkSignInMethod microsoft 带 skipBrowserRedirect 与 scopes，返回 url", async () => {
  const mod = await loadIdentityModule();
  const calls = installAuth();
  const result = await mod.linkSignInMethod("microsoft");
  assert.equal(result.error, undefined);
  assert.equal(result.url, "https://oauth.example/azure");
  const link = calls.find((row) => row[0] === "linkIdentity");
  assert.equal(link[1].provider, "azure");
  assert.equal(link[1].options.skipBrowserRedirect, true);
  assert.equal(link[1].options.scopes, "email profile offline_access");
});

test("unlinkSignInMethod 只剩一种时返回至少保留一种登录方式。", async () => {
  const mod = await loadIdentityModule();
  installAuth({
    user: user({
      identities: [
        identity({
          id: "only",
          identity_id: "only",
          provider: "google",
          identity_data: { email: "me@gmail.com" },
        }),
      ],
    }),
  });
  const result = await mod.unlinkSignInMethod({ identityId: "only" });
  assert.equal(result.error, "至少保留一种登录方式。");
});

test("requestEmailChange 走 reauthenticate；completeEmailChange 带 nonce 调 updateUser", async () => {
  const mod = await loadIdentityModule();
  const calls = installAuth();
  const requested = await mod.requestEmailChange();
  assert.equal(requested.error, undefined);
  assert.ok(calls.some((row) => row[0] === "reauthenticate"));
  const completed = await mod.completeEmailChange("new@example.com", "123456");
  assert.equal(completed.error, undefined);
  const update = calls.find((row) => row[0] === "updateUser" && row[1].email);
  assert.equal(update[1].email, "new@example.com");
  assert.equal(update[1].nonce, "123456");
});

test("GoTrue 英文错误翻成中文，不甩原文", async () => {
  const mod = await loadIdentityModule();
  installAuth({
    client: {
      auth: {
        async getUser() {
          return { data: { user: globalThis.__W1_AUTH__.user }, error: null };
        },
        async getSession() {
          return { data: { session: { user: globalThis.__W1_AUTH__.user } } };
        },
        async linkIdentity() {
          return { data: { url: null }, error: { message: "Identity is already linked to another user" } };
        },
        async unlinkIdentity() {
          return { data: null, error: { message: "User cannot unlink the last identity" } };
        },
        async updateUser() {
          return { data: {}, error: { message: "Token has expired or is invalid" } };
        },
      },
    },
  });
  const linked = await mod.linkSignInMethod("google");
  assert.equal(linked.error, "绑定失败，请稍后重试。");
  assert.equal(/[A-Za-z]{4,}/.test(linked.error) && !/OceanLeo/.test(linked.error), false);
  const unlinked = await mod.unlinkSignInMethod({ identityId: "google-1" });
  assert.equal(unlinked.error, "至少保留一种登录方式。");
  const changed = await mod.completeEmailChange("new@example.com", "000000");
  assert.equal(changed.error, "验证码不正确或已过期，请重新获取。");
});
