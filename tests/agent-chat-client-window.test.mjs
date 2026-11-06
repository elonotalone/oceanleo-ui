import assert from "node:assert/strict";
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

