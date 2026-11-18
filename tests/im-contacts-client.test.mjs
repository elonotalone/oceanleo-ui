import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { IM_PEOPLE_MESSAGES } from "../src/i18n/ui/messages/im-people-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

const { imFetch } = await import(await compileModule("src/lib/im/client.ts", {
  "../../contracts/domain-family": dataModule('export function currentDomainFamily() { return "global"; }'),
  "../auth/config": dataModule('export const GATEWAY_BASE = "http://unit.invalid";'),
  "../auth/client": dataModule('export const AUTH_STATE_EVENT = "unit-auth"; export async function accessToken() { return "unit-only"; } export function cachedAccessToken() { return "unit-only"; }'),
  "../../shell/messages/messages-family": dataModule('export function imEnabledFor() { return true; }'),
}));

test("HTTP error parser preserves request_limit retry_at without account operations", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: { code: "request_limit", message: "Limit reached", retry_at: "2026-11-25T12:34:56Z" } }), { status: 429, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(imFetch("/v1/im/contact-requests", { method: "POST", json: { to_user_id: "unit" } }), (e) => {
      assert.equal(e.status, 429);
      assert.equal(e.code, "request_limit");
      assert.equal(e.retry_at, "2026-11-25T12:34:56Z");
      return true;
    });
  } finally { globalThis.fetch = original; }
});

test("approved-friends copy exists for every locale and preserves placeholders", () => {
  // Contract §1.3 removes the Add-contacts explanation (ic13) in every locale.
  const keys = ["好友", "群组", "来自我的团队", "全选团队", "添加 {n} 人", "已添加 {n} 人，跳过 {skipped} 位已有好友。", "暂无可添加的团队成员。", "最多选择 100 人。", "7 天内最多向同一个人发送 3 次请求。可在 {time} 后重试。", "好友请求留言（选填）", "发送好友请求", "再发一次请求", "已发送", "添加好友需要对方同意。可以留一句话介绍自己。", "还没有加入任何群组。", "同意"];
  for (const locale of LOCALES) {
    assert.equal(Object.hasOwn(IM_PEOPLE_MESSAGES[locale], "把链接或二维码发给对方。对方发送好友请求后，需要你同意。"), false);
  }
  for (const locale of LOCALES) for (const key of keys) {
    const value = IM_PEOPLE_MESSAGES[locale][key];
    assert.equal(typeof value, "string", `${locale}: ${key}`);
    assert.ok(value.trim());
    assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(), [...key.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort());
  }
});
