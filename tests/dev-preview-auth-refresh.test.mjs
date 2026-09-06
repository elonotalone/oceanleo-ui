import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createLeoDevPreviewCookieJar,
  parseDocumentCookies,
} from "../src/lib/auth/preview-cookies.ts";

test("开发版 setAll 只写内存，不改 document.cookie 原文", () => {
  let documentCookie =
    "sb-example-auth-token=old-access; oceanleo-theme=light";
  const jar = createLeoDevPreviewCookieJar(() => documentCookie);
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
  assert.match(clientSource, /createLeoDevPreviewCookieJar/);
  assert.match(clientSource, /never write family SSO from a capability hostname/);
  assert.doesNotMatch(clientSource, /document\.cookie\s*=/);
});
