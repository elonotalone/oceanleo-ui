import assert from "node:assert/strict";
import test from "node:test";
import { completeBrowserOauthReturn, browserOauthReturnState, waitForBrowserOauthReturn } from "../src/lib/auth/oauth-return.ts";

test("替换回跳时旧请求不能覆盖新尝试的状态，重复读者不重复兑换", async () => {
  let finishOld;
  let finishNew;
  let oldCalls = 0;
  let newCalls = 0;
  let cancelled = 0;
  const oldClient = { auth: { initialize: () => { oldCalls++; return new Promise((resolve) => { finishOld = resolve; }); } } };
  const newClient = { auth: { initialize: () => { newCalls++; return new Promise((resolve) => { finishNew = resolve; }); } } };
  const options = { initialize:true, hasProof:true, sessionConfirmed:() => true };
  completeBrowserOauthReturn(oldClient, "old-fixture", {...options, cancel:() => { cancelled++; }});
  completeBrowserOauthReturn(oldClient, "old-fixture", options);
  completeBrowserOauthReturn(newClient, "new-fixture", options);
  assert.equal(oldCalls, 1);
  assert.equal(newCalls, 1);
  assert.equal(cancelled, 1);
  finishOld({error:null});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(browserOauthReturnState(), "pending");
  finishNew({error:{message:"fixture failure"}});
  assert.equal(await waitForBrowserOauthReturn(), false);
  assert.equal(browserOauthReturnState(), "error");
});
