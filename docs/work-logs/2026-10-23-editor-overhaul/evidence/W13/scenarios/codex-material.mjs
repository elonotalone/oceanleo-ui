import assert from "node:assert/strict";
import { openEditorByItem } from "../../V01/scenarios/_v01-lib.mjs";
import { waitModelReady, clickStageCenter } from "./lib.mjs";

export default async function ({ page, helpers, log, shot, args }) {
  const writes = [];
  page.on("response", (r) => {
    if (r.request().method() === "POST" && /\/revisions$/.test(new URL(r.url()).pathname)) {
      writes.push(r.status()); log("revision", r.status());
    }
  });
  const open = async () => {
    assert.ok(await openEditorByItem(page, helpers, "[W13] sample.glb", log, { id: args[0] }));
    await waitModelReady(page, log, 90000); await clickStageCenter(page);
  };
  const material = () => page.locator('[data-selection-control-id="selection-inspector-model-material"] button:visible').first();
  const hex = () => page.getByRole("textbox", { name: /^(基础色|Base color) HEX$/ });
  const inspect = async () => { if (!(await hex().isVisible())) await material().click(); };
  const settle = async (count) => {
    const start = Date.now();
    while (writes.length < count && Date.now() - start < 90000) await page.waitForTimeout(250);
    assert.equal(writes.length, count); assert.ok(writes.every((status) => status === 200));
    await helpers.waitSaved(page, { timeout: 30000 });
  };
  await open(); await inspect();
  const original = await hex().inputValue();
  await hex().fill("#3388cc"); await hex().press("Tab");
  await settle(1); await inspect();
  assert.equal((await hex().inputValue()).toLowerCase(), "#3388cc");
  await shot("material-blue-saved");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settle(2);
  await open(); await inspect();
  assert.equal(await hex().inputValue(), original, "undo/reopen did not restore authored material");
  await shot("material-authored-restored");
  await page.getByRole("button", { name: "Close right pane", exact: true }).click();
  await open(); await inspect();
  assert.equal(await hex().inputValue(), original);
  assert.equal(writes.length, 2, "clean close/reopen published a phantom revision");
  log("PASS actual material mutation, saved undo and reopen", original, JSON.stringify(writes));
}
