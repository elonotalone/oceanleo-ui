import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { workspaceSnapshotFailureRetryable } from "../src/shell/workspace-session-model.ts";

let response;
let notifications = 0;
const history = dataModule(`export function notifyHistoryChanged(){globalThis.__sessionReceiptNotify();}`);
globalThis.__sessionReceiptNotify = () => notifications++;
const agent = await compileModule("src/lib/agent.ts", {
  "./auth/client": dataModule(`export async function accessToken(){return "test";}export function cachedAccessToken(){return "test";}`),
  "./auth/config": dataModule(`export const GATEWAY_BASE="https://gateway.invalid";`),
  "./history-events": history,
  "./cloud-computer-api": dataModule(`export function computerIdRequestField(){return {};}`),
});
const api = await import(await compileModule("src/lib/app-session.ts", {
  "./agent": agent, "./history-events": history,
}));
globalThis.fetch = async () => response;
const session = { id: "session-1", revision: 4 };
const jsonResponse = (data, status = 200) => ({ ok: status < 400, status,
  headers: new Headers(), json: async () => data });
const operations = {
  get: () => api.getAppSession("session-1"),
  ensure: () => api.ensureAppSession({ siteId: "library", appId: "library" }),
  update: () => api.updateAppSession("session-1", { revision: 3, snapshot: { output: true }, schemaVersion: 1 }),
};

for (const [name, operation] of Object.entries(operations)) {
  test(`${name}: unreadable HTTP 200 JSON is rejected retryably without acknowledging`, async () => {
    response = { ...jsonResponse(null), json: async () => { throw new TypeError("Failed to fetch"); } };
    const before = notifications;
    const result = await operation();
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(result.data, undefined);
    assert.equal(workspaceSnapshotFailureRetryable(result), true);
    assert.equal(notifications, before);
  });

  test(`${name}: absent and malformed success receipts are not accepted`, async () => {
    for (const data of [null, undefined, "proxy HTML", [], {}, { session: null },
      { session: [] }, { id: "", revision: 1 }, { id: "  ", revision: 1 },
      { id: "session-1" }, { id: "session-1", revision: "4" },
      { id: "session-1", revision: -1 }, { id: "session-1", revision: 1.5 },
      { id: "session-1", revision: Number.MAX_SAFE_INTEGER + 1 },
      { session: { id: "session-1", revision: null } }]) {
      response = jsonResponse(data);
      const result = await operation();
      assert.equal(result.ok, false, `invalid receipt ${JSON.stringify(data)}`);
      assert.equal(result.status, 502);
      assert.equal(workspaceSnapshotFailureRetryable(result), true);
    }
  });

  test(`${name}: bare and wrapped valid receipts preserve identity and legacy metadata shape`, async () => {
    for (const data of [session, { session }, { session: { ...session, revision: 0, snapshot: { title: "saved" } } }]) {
      response = jsonResponse(data);
      const result = await operation();
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, data.session || data);
    }
  });

  test(`${name}: explicit API failures retain status and details`, async () => {
    for (const status of [401, 403, 409, 429, 503]) {
      response = jsonResponse({ detail: "explicit failure" }, status);
      const result = await operation();
      assert.equal(result.ok, false);
      assert.equal(result.status, status);
      assert.equal(result.error, "explicit failure");
    }
  });
}
