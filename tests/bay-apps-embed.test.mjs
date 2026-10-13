// U2：作品嵌入决策纯函数。直接 import app-embed.ts。
import assert from "node:assert/strict";
import test from "node:test";

import { embedDecision, isFirstPartyHost, safeAppUrl } from "../src/shell/bay/apps/app-embed.ts";

test("isFirstPartyHost：正例（大小写、末尾点、子域）", () => {
  assert.equal(isFirstPartyHost("oceanleo.com"), true);
  assert.equal(isFirstPartyHost("OCEANLEO.COM"), true);
  assert.equal(isFirstPartyHost("oceanleo.com."), true);
  assert.equal(isFirstPartyHost("www.oceanleo.com"), true);
  assert.equal(isFirstPartyHost("api.dev.oceanleo.com"), true);
  assert.equal(isFirstPartyHost("WWW.OCEANLEO.CN."), true);
  assert.equal(isFirstPartyHost("oceandino.com"), true);
  assert.equal(isFirstPartyHost("staff.oceandino.com"), true);
  assert.equal(isFirstPartyHost("oceanbizs.com"), true);
  assert.equal(isFirstPartyHost("portal.oceanbizs.com"), true);
});

test("isFirstPartyHost：反例（后缀近似、用户内容域）", () => {
  assert.equal(isFirstPartyHost("oceanleo.com.evil.com"), false);
  assert.equal(isFirstPartyHost("notoceanleo.com"), false);
  assert.equal(isFirstPartyHost("evil-oceanleo.com"), false);
  assert.equal(isFirstPartyHost("oceanleo.com.evil"), false);
  assert.equal(isFirstPartyHost("oceanleo.app"), false);
  assert.equal(isFirstPartyHost("shop.oceanleo.app"), false);
  assert.equal(isFirstPartyHost(""), false);
  assert.equal(isFirstPartyHost("."), false);
});

test("safeAppUrl：只收 https、无账号密码、主机非空", () => {
  assert.equal(safeAppUrl("https://app.example.com/play")?.href, "https://app.example.com/play");
  assert.equal(safeAppUrl("http://app.example.com"), null);
  assert.equal(safeAppUrl("javascript:alert(1)"), null);
  assert.equal(safeAppUrl("data:text/html,hi"), null);
  assert.equal(safeAppUrl("https://user:pass@example.com/"), null);
  assert.equal(safeAppUrl(""), null);
  assert.equal(safeAppUrl("not a url"), null);
});

test("embedDecision：本平台站可嵌，外链与第一方域只跳转", () => {
  assert.deepEqual(embedDecision({ url: "javascript:alert(1)", source_kind: "hosted", embed_ok: true }), {
    mode: "link",
    reason: "invalid",
    href: null,
  });
  assert.deepEqual(embedDecision({ url: "https://www.oceanleo.com/bay", source_kind: "hosted", embed_ok: true }), {
    mode: "link",
    reason: "first-party",
    href: "https://www.oceanleo.com/bay",
  });
  assert.deepEqual(embedDecision({ url: "https://maker.example.com/app", source_kind: "external", embed_ok: true }), {
    mode: "link",
    reason: "external",
    href: "https://maker.example.com/app",
  });
  assert.deepEqual(embedDecision({ url: "https://shop.oceanleo.app/", source_kind: "hosted", embed_ok: false }), {
    mode: "link",
    reason: "blocked",
    href: "https://shop.oceanleo.app/",
  });
  assert.deepEqual(embedDecision({ url: "https://shop.oceanleo.app/", source_kind: "hosted", embed_ok: null }), {
    mode: "frame",
    src: "https://shop.oceanleo.app/",
  });
});
