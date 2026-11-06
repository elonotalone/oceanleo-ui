import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { compileModule } from "./helpers/module-bench.mjs";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("client window id replaces invalid storage and stays stable in one tab", async () => {
  const sessionStorage = storage({ oceanleo_window_id: "user-secret-or-old-format" });
  globalThis.window = { sessionStorage };
  const { getClientWindowId } = await import(await compileModule("src/shell/client-window.ts"));
  const first = getClientWindowId();
  assert.match(first, /^w_[0-9a-f]{16}$/);
  assert.equal(getClientWindowId(), first);
  assert.equal(sessionStorage.getItem("oceanleo_window_id"), first);
  delete globalThis.window;
});

test("Leo and computer task sends include the per-window field", async () => {
  const agent = await readFile(new URL("../src/lib/agent.ts", import.meta.url), "utf8");
  const chat = await readFile(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.match(agent, /client_window: clientWindow/);
  assert.match(chat, /client_window: getClientWindowId\(\)/);
  assert.match(chat, /followUp\([^\n]*getClientWindowId\(\)/);
});

test("task paging uses the reviewed 480px trigger and reconciles later injection", async () => {
  const chat = await readFile(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.match(chat, /LOAD_OLDER_PX = 480/);
  assert.match(chat, /reconcileTimelineDelivery\(current, timeline\.items\)/);
  assert.match(chat, /delivery !== "queued" \|\| !serverIds\.has\(id\) \|\| queuedIds\.has\(id\)/);
});
