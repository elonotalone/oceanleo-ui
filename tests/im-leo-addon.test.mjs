import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
const { payerRequestField } = await import(await compileModule("src/lib/im/leo-api.ts", {
  "./client": dataModule("export function imFetch() { throw new Error('unexpected network'); }")
}));
test("Leo request reads left identity each time, personal omits team field", () => {
  const previous = globalThis.window;
  let identity = "team-a";
  globalThis.window = { localStorage: { getItem: () => identity } };
  try {
    assert.deepEqual(payerRequestField(), { leo_payer_org_id: "team-a" });
    identity = "team-b";
    assert.deepEqual(payerRequestField(), { leo_payer_org_id: "team-b" });
    identity = null;
    assert.deepEqual(payerRequestField(), {});
  } finally { globalThis.window = previous; }
});
