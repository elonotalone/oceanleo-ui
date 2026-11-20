// Unit NM (wave 2026-11-20 roles): the client name pre-check runs the SAME vectors as
// backend/app/account_names.py and the 0610 SQL functions (fixture copied verbatim from
// oceanleo backend/tests/fixtures/name_vectors.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkName, cleanName, nameKey } from "../src/lib/account/name-rules.ts";

const vectors = JSON.parse(readFileSync(new URL("./fixtures/name_vectors.json", import.meta.url), "utf8"));

test("name key: NFKC, lower case, invisible characters removed, spaces collapsed", () => {
  for (const [raw, key] of vectors.key) assert.equal(nameKey(raw), key, JSON.stringify(raw));
});

test("clean name: whitespace runs become one space and ends are trimmed", () => {
  for (const [raw, clean] of vectors.clean) assert.equal(cleanName(raw), clean, JSON.stringify(raw));
});

test("name problems: invalid and reserved names are refused, ordinary names pass", () => {
  for (const [raw, problem] of vectors.problem) assert.equal(checkName(cleanName(raw)), problem, JSON.stringify(raw));
});

test("case and width variants of one name share one key", () => {
  assert.equal(nameKey("Elon"), nameKey("ＥＬＯＮ"));
  assert.equal(nameKey("elon lee"), nameKey("Elon​  LEE"));
  assert.notEqual(nameKey("测试甲"), nameKey("測試甲"));
  assert.equal(checkName("a".repeat(30)), null);
  assert.equal(checkName("😀😀"), null, "length counts code points, not UTF-16 units");
});

test("every locale has the NM copy and it is registered in both dictionaries", async () => {
  const { rwNmCopy } = await import("../src/i18n/ui/messages/rw-nm-copy.ts");
  const { LOCALES } = await import("../src/i18n/config.ts");
  const keys = Object.keys(rwNmCopy("zh"));
  for (const locale of LOCALES) {
    const copy = rwNmCopy(locale);
    assert.deepEqual(Object.keys(copy), keys, locale);
    for (const key of keys) assert.ok(copy[key]?.trim(), `${locale} ${key}`);
    if (locale !== "zh") assert.ok(copy["{date} 之后才能再次修改名称。"].includes("{date}"), locale);
  }
  assert.equal(rwNmCopy("en")["这个名称已被别人使用。"], "Someone else already uses this name.");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const { loadUiMessages } = await import("../src/i18n/ui/messages/load.ts");
  assert.equal(UI_MESSAGES.en["在账户设置中修改"], "Change it in Account settings");
  if (loadUiMessages) assert.equal((await loadUiMessages("en"))["在账户设置中修改"], "Change it in Account settings");
});

test("name API maps every gateway answer to a code (FastAPI detail shape)", async () => {
  const { compileModule, dataModule } = await import("./helpers/module-bench.mjs");
  const api = await import(await compileModule("src/lib/account/name-api.ts", {
    "../auth/client": dataModule(`export async function accessToken() { return "t"; } export const AUTH_STATE_EVENT = "auth";`),
    "../auth/config": dataModule(`export const GATEWAY_BASE = "https://api.test";`),
  }));
  const calls = [];
  let reply = { status: 200, body: {} };
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body, auth: new Headers(init?.headers).get("Authorization") });
    if (reply === "throw") throw new TypeError("network");
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
  try {
    reply = { status: 200, body: { name: "Elon Lee", can_change_at: null } };
    assert.deepEqual(await api.getAccountName(), { ok: true, state: { name: "Elon Lee", canChangeAt: null } });
    assert.equal(calls.at(-1).url, "https://api.test/v1/account/name");
    assert.equal(calls.at(-1).auth, "Bearer t");

    reply = { status: 200, body: { name: "Grace", can_change_at: "2026-11-27T00:00:00Z" } };
    const events = [];
    globalThis.window = globalThis.window ?? new EventTarget();
    const onAuth = (event) => events.push(event.type);
    globalThis.window.addEventListener("auth", onAuth);
    assert.deepEqual(await api.saveAccountName("Grace"), { ok: true, state: { name: "Grace", canChangeAt: "2026-11-27T00:00:00Z" } });
    assert.equal(calls.at(-1).method, "PUT");
    assert.deepEqual(JSON.parse(calls.at(-1).body), { name: "Grace" });
    assert.deepEqual(events, ["auth"], "a saved name tells the sidebar to re-read the profile");
    globalThis.window.removeEventListener("auth", onAuth);

    for (const [status, code] of [[409, "name_taken"], [422, "name_invalid"], [422, "name_reserved"], [503, "name_unavailable"]]) {
      reply = { status, body: { detail: { code, message: "" } } };
      assert.deepEqual(await api.saveAccountName("x y"), { ok: false, code, canChangeAt: null }, code);
    }
    reply = { status: 429, body: { detail: { code: "name_change_too_soon", message: "", can_change_at: "2026-11-27T00:00:00Z" } } };
    assert.deepEqual(await api.saveAccountName("x y"), { ok: false, code: "name_change_too_soon", canChangeAt: "2026-11-27T00:00:00Z" });
    reply = { status: 404, body: { detail: "Not Found" } };
    assert.deepEqual(await api.getAccountName(), { ok: false, code: "name_unavailable", canChangeAt: null }, "old gateway without the route");

    reply = { status: 200, body: { available: false, code: "name_taken" } };
    assert.deepEqual(await api.checkNameAvailable("Elon Lee"), { ok: true, available: false, code: "name_taken" });
    assert.equal(calls.at(-1).url, "https://api.test/v1/account/name/available?name=Elon%20Lee");
    reply = { status: 200, body: { available: true, code: null } };
    assert.deepEqual(await api.checkNameAvailable("Ada"), { ok: true, available: true, code: null });

    reply = "throw";
    assert.deepEqual(await api.getAccountName(), { ok: false, code: "network", canChangeAt: null });
  } finally {
    globalThis.fetch = previous;
  }
});
