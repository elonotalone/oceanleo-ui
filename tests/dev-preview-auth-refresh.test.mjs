import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PREVIEW_GUEST_COOKIE,
  createLeoDevPreviewCookieJar,
  parseDocumentCookies,
  previewGuestLatchSetCookie,
  writePreviewGuestLatch,
} from "../src/lib/auth/preview-cookies.ts";
import { isLeoDevPreviewHost } from "../src/lib/auth/config.ts";

test("开发版 setAll 只写内存，不改 document.cookie 原文", () => {
  let documentCookie =
    "sb-example-auth-token=old-access; oceanleo-theme=light";
  const jar = createLeoDevPreviewCookieJar(() => documentCookie, null);
  const before = jar.getAll();
  assert.equal(
    before.find((entry) => entry.name === "sb-example-auth-token")?.value,
    "old-access",
  );

  jar.setAll([
    { name: "sb-example-auth-token", value: "refreshed-access" },
    { name: "sb-example-auth-token.0", value: "" },
  ]);

  assert.equal(documentCookie, "sb-example-auth-token=old-access; oceanleo-theme=light");
  assert.equal(
    jar.getAll().find((entry) => entry.name === "sb-example-auth-token")?.value,
    "refreshed-access",
  );
  assert.equal(
    jar.getAll().some((entry) => entry.name === "sb-example-auth-token.0"),
    false,
  );
  assert.equal(
    jar.getAll().find((entry) => entry.name === "oceanleo-theme")?.value,
    "light",
  );
  assert.ok(jar.peekOverlay());
});

test("parseDocumentCookies 解码百分号并丢掉空名", () => {
  const parsed = parseDocumentCookies(" a=b%20c ; =orphan; lone ");
  assert.deepEqual(
    parsed.filter((entry) => entry.name === "a"),
    [{ name: "a", value: "b c" }],
  );
});

test("浏览器客户端在 preview 开自动刷新但仍禁止写家族 cookie", () => {
  const clientSource = readFileSync(
    new URL("../src/lib/auth/client.ts", import.meta.url),
    "utf8",
  );
  assert.match(clientSource, /autoRefreshToken:\s*true/);
  assert.match(clientSource, /detectSessionInUrl:\s*true/);
  assert.doesNotMatch(clientSource, /detectSessionInUrl:\s*!preview/);
  assert.match(clientSource, /createLeoDevPreviewCookieJar/);
  assert.match(clientSource, /never write family SSO from a capability hostname/);
  assert.match(clientSource, /writePreviewGuestLatch/);
  assert.match(clientSource, /_previewJar\?\.clear\(\)/);
  assert.match(clientSource, /signOut\(\{\s*scope:\s*"local"\s*\}\)/);
  assert.doesNotMatch(clientSource, /document\.cookie\s*=/);
  assert.match(
    clientSource,
    /emailRedirectTo:\s*\n\s*typeof window !== "undefined" \? window\.location\.origin/,
  );
  assert.match(clientSource, /window\.location\.href/);
  assert.match(clientSource, /passwordResetRedirectTo/);
  assert.doesNotMatch(clientSource, /emailRedirectTo:\s*["']https:\/\/oceanleo\.com/);
  assert.doesNotMatch(clientSource, /redirectTo:\s*["']https:\/\/oceanleo\.com/);
});

test("开发版 guest latch 是 host-only，并挡住家族登录 cookie", () => {
  const latch = previewGuestLatchSetCookie();
  assert.match(latch, new RegExp(`^${PREVIEW_GUEST_COOKIE}=1;`));
  assert.doesNotMatch(latch, /Domain=/i);
  assert.match(latch, /SameSite=Lax/);
  assert.match(latch, /Secure/);

  let documentCookie =
    `sb-example-auth-token=old-access; ${PREVIEW_GUEST_COOKIE}=1; oceanleo-theme=light`;
  const jar = createLeoDevPreviewCookieJar(() => documentCookie, null);
  assert.equal(
    jar.getAll().some((entry) => entry.name === "sb-example-auth-token"),
    false,
  );
  assert.equal(
    jar.getAll().find((entry) => entry.name === "oceanleo-theme")?.value,
    "light",
  );

  jar.setAll([{ name: "oceanleo-theme", value: "dark" }]);
  assert.equal(
    jar.getAll().some((entry) => entry.name.startsWith("sb-example-auth-token")),
    false,
  );
  assert.equal(
    jar.getAll().find((entry) => entry.name === "oceanleo-theme")?.value,
    "dark",
  );

  jar.setAll([{ name: "sb-example-auth-token", value: "signed-in-again" }]);
  assert.equal(
    jar.getAll().find((entry) => entry.name === "sb-example-auth-token")?.value,
    "signed-in-again",
  );
});

test("开发版 overlay 经 sessionStorage 扛过新 jar（等同刷新）", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
  let documentCookie = `${PREVIEW_GUEST_COOKIE}=1`;
  const first = createLeoDevPreviewCookieJar(() => documentCookie, storage);
  first.setAll([{ name: "sb-example-auth-token", value: "gmail-session" }]);
  const second = createLeoDevPreviewCookieJar(() => documentCookie, storage);
  assert.equal(
    second.getAll().find((entry) => entry.name === "sb-example-auth-token")?.value,
    "gmail-session",
  );
});

test("guest latch 清掉 overlay 存储，刷新后不会自动登回", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
  let documentCookie = `${PREVIEW_GUEST_COOKIE}=1; sb-example-auth-token=operator`;
  const first = createLeoDevPreviewCookieJar(() => documentCookie, storage);
  first.setAll([{ name: "sb-example-auth-token", value: "gmail-session" }]);
  writePreviewGuestLatch(storage);
  first.clear();
  documentCookie = `${PREVIEW_GUEST_COOKIE}=1; sb-example-auth-token=operator`;
  const second = createLeoDevPreviewCookieJar(() => documentCookie, storage);
  assert.equal(
    second.getAll().some((entry) => entry.name === "sb-example-auth-token"),
    false,
  );
});

test("一层 *.oceanleo.com 罩不住 LeoDev，回跳要 *.dev.oceanleo.com", () => {
  const preview = "p-e2e847384861cc7c08ebd6eef11a11f4.dev.oceanleo.com";
  assert.equal(isLeoDevPreviewHost(preview), true);
  assert.equal(/^[^.]+\.oceanleo\.com$/.test(preview), false, "p-….dev 不是一层子域");
  assert.equal(/^[^.]+\.dev\.oceanleo\.com$/.test(preview), true);
  assert.equal(/^[^.]+\.oceanleo\.com$/.test("design.oceanleo.com"), true);
});
