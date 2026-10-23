import assert from "node:assert/strict";
import { openDeck } from "./codex-open.mjs";

export default async function ({ page, context, helpers, log, shot, args }) {
  const writes = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.request().method() === "POST" && /\/revisions$/.test(path)) {
      writes.push({ status: response.status(), path });
      log("revision", response.status(), path);
    }
  });
  const target = () => page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first();
  const style = () => target().evaluate((el) => {
    const body = el.querySelector("[data-deck-text-body]")?.parentElement || el;
    const s = getComputedStyle(body);
    return { weight: s.fontWeight, decoration: s.textDecorationLine, italic: s.fontStyle };
  });
  const select = async () => { await target().click({ force: true }); await page.waitForTimeout(500); };
  const click = async (id) => {
    await select();
    await page.locator(`[data-selection-control-id="${id}"] button:visible,button[data-selection-control-id="${id}"]:visible`).first().click();
  };
  const saveCycle = async () => {
    const start = Date.now();
    while (await helpers.saveState(page) === "saved" && Date.now() - start < 8000) await page.waitForTimeout(200);
    await helpers.waitSaved(page, { timeout: 120000 });
    assert.equal(await helpers.saveState(page), "saved");
  };
  await openDeck(page, helpers, args[0]);
  const before = await style();
  await click("bold");
  await saveCycle();
  const first = await style();
  assert.notEqual(first.weight, before.weight, "bold did not affect the slide");
  await click("strike");
  await saveCycle();
  const second = await style();
  assert.notEqual(second.decoration, first.decoration, "strike did not affect the slide");
  await shot("two-edits");
  await page.waitForTimeout(5000);
  assert.equal(writes.length, 2, "two real edits must create exactly two revisions");
  await openDeck(page, helpers, args[0]);
  assert.deepEqual(await style(), second, "reopen lost a formatting edit");
  await page.reload({ waitUntil: "domcontentloaded" });
  await openDeck(page, helpers, args[0]);
  assert.deepEqual(await style(), second, "reload lost a formatting edit");
  assert.equal(writes.length, 2, "reopen or reload caused a phantom save");
  await context.setOffline(true);
  await click("italic");
  const offlineStart = Date.now();
  while (await helpers.saveState(page) !== "error" && Date.now() - offlineStart < 90000) await page.waitForTimeout(250);
  assert.equal(await helpers.saveState(page), "error", "offline edit must report failure");
  await shot("offline-error");
  await context.setOffline(false);
  await page.locator("[data-workspace-save-launcher]").first().click();
  await page.locator('[data-workspace-save-action-id="retry"]:visible').click();
  const retryStart = Date.now();
  while (await helpers.saveState(page) === "error" && Date.now() - retryStart < 20000) await page.waitForTimeout(250);
  await saveCycle();
  await page.waitForTimeout(3000);
  assert.equal(writes.length, 3, "offline retry must commit exactly once");
  assert.ok(writes.every((r) => r.status === 200));
  const third = await style();
  assert.notEqual(third.italic, second.italic);
  await openDeck(page, helpers, args[0]);
  assert.deepEqual(await style(), third, "offline-retried edit did not persist");
  await shot("reopened-final");
  log("PASS two edits/reopen/reload/offline retry", JSON.stringify(writes));
}
