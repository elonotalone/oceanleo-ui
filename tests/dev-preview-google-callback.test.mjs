import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import test from "node:test";

function page(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./helpers/preview-oauth-worker.mjs", import.meta.url), { workerData:data });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error("OAuth fixture page did not complete")); }, 20_000);
    worker.once("message", (result) => { clearTimeout(timer); resolve(result); });
    worker.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

test("Google 从独立新页面返回 LeoDev 时，PKCE 换取会话并移除 code", async () => {
  const begin = await page({stage:"begin"});
  assert.equal(begin.failure, undefined);
  assert.equal(begin.error, undefined);
  assert.equal(begin.initiallyGuest, true);
  assert.equal(begin.method, "s256");
  assert.ok(begin.challenge);
  assert.equal(begin.redirect, "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/settings/account");
  const returned = await page({stage:"return",storage:begin.storage,tabStorage:begin.tabStorage,challenge:begin.challenge});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.initError, undefined);
  assert.equal(returned.exchanges, 1);
  assert.equal(returned.proofMatches, true);
  assert.equal(returned.allReadersAgree, true);
  assert.equal(returned.id, "00000000-0000-4000-8000-000000000026");
  assert.equal(returned.stillHasCode, false);
});

test("Google 回跳缺少凭证时给失败状态并清理旧 code，不能静默回到未登录", async () => {
  const returned = await page({stage:"return",storage:[],tabStorage:[]});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.id, null);
  assert.equal(returned.exchanges, 0, "缺少 PKCE 凭证时不能发送不受约束的兑换请求");
  assert.equal(returned.returnState, "error");
  assert.equal(returned.stillHasCode, false);
});

test("Google 回跳凭证不被同源其他页面覆盖的空会话吞掉", async () => {
  const begin = await page({stage:"begin"});
  const storage = begin.storage.map(([key,value]) => [key,key === "oceanleo-leodev-auth-overlay" ? "[]" : value]);
  const returned = await page({stage:"return",storage,tabStorage:begin.tabStorage,challenge:begin.challenge});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.exchanges, 1, "不能静默忽略带 code 的 Google 回跳");
  assert.equal(returned.proofMatches, true);
  assert.equal(returned.id, "00000000-0000-4000-8000-000000000026");
  assert.equal(returned.stillHasCode, false);
});

test("失败后重试 Google 不把旧回执带进新的 redirect_to", async () => {
  const begin = await page({stage:"begin",staleCode:true});
  assert.equal(begin.failure, undefined);
  const redirect = new URL(begin.redirect);
  assert.equal(redirect.searchParams.has("code"), false);
  assert.equal(redirect.searchParams.get("keep"), "1");
});

test("Google 新登录先兑换回执，不能被旧会话的续期请求永久堵住", async () => {
  const begin = await page({stage:"begin"});
  const returned = await page({stage:"return",storage:begin.storage,tabStorage:begin.tabStorage,challenge:begin.challenge,expiredSession:true});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.exchanges, 1);
  assert.equal(returned.refreshes, 0);
  assert.equal(returned.id, "00000000-0000-4000-8000-000000000026");
  assert.equal(returned.returnState, "idle");
  assert.equal(returned.stillHasCode, false);
});

test("缺少 Google 凭证且旧会话过期时仍能结束并重新发起授权", async () => {
  const returned = await page({stage:"return",expiredSession:true,retry:true});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.returnState, "error");
  assert.equal(returned.exchanges, 0);
  assert.equal(returned.refreshes, 0);
  assert.equal(returned.id, null);
  assert.ok(returned.retryUrl);
  assert.equal(new URL(new URL(returned.retryUrl).searchParams.get("redirect_to")).searchParams.has("code"), false);
});

test("Google 兑换网络不返回时结束等待，重试后迟到响应不能写入会话", async () => {
  const begin = await page({stage:"begin"});
  const returned = await page({stage:"return",storage:begin.storage,tabStorage:begin.tabStorage,challenge:begin.challenge,stalledExchange:true,expiredSession:true,retry:true});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.exchanges, 1);
  assert.equal(returned.returnState, "error");
  assert.equal(returned.id, null);
  assert.equal(returned.stillHasCode, false);
  assert.ok(returned.retryUrl);
  assert.equal(returned.lateSession, null);
  assert.equal(returned.refreshes, 0);
  assert.equal(returned.retryProofPreserved, true);
});

test("Google 拒绝授权也显示失败并清理回跳参数", async () => {
  const returned = await page({stage:"return",providerError:true});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.returnState, "error");
  assert.equal(returned.exchanges, 0);
  assert.equal(returned.stillHasError, false);
});

test("Google 已返回响应头但正文卡住时也能重试且丢弃迟到正文", async () => {
  const begin = await page({stage:"begin"});
  const returned = await page({stage:"return",storage:begin.storage,tabStorage:begin.tabStorage,challenge:begin.challenge,stalledBody:true,retry:true});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.returnState, "error");
  assert.equal(returned.id, null);
  assert.ok(returned.retryUrl);
  assert.equal(returned.lateSession, null);
  assert.equal(returned.retryProofPreserved, true);
});

test("旧会话分片比 Google 新会话更长时移除尾片并可在新页面恢复", async () => {
  const begin = await page({stage:"begin"});
  const returned = await page({stage:"return",storage:begin.storage,tabStorage:begin.tabStorage,challenge:begin.challenge,expiredSession:true,chunkedSession:true});
  assert.equal(returned.failure, undefined);
  assert.equal(returned.id, "00000000-0000-4000-8000-000000000026");
  const overlay = JSON.parse(returned.storage.find(([key]) => key === "oceanleo-leodev-auth-overlay")[1]);
  const chunks = overlay.filter(({name}) => /auth-token\.\d+$/.test(name));
  assert.ok(chunks.length > 1 && chunks.length < 7);
  const encoded = chunks.sort((a,b) => Number(a.name.split(".").at(-1)) - Number(b.name.split(".").at(-1))).map(({value}) => value).join("");
  assert.equal(JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString()).user.user_metadata.padding, "n".repeat(5000));
  const restored = await page({stage:"restore",storage:returned.storage});
  assert.equal(restored.failure, undefined);
  assert.equal(restored.id, returned.id);
  assert.equal(restored.exchanges, 0);
});
