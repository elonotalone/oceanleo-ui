import assert from "node:assert/strict";
import { openDeck } from "./codex-open.mjs";

export default async function ({ page, context, helpers, log, shot, args }) {
  const revisions = [];
  page.on("response", (r) => { if (r.request().method() === "POST" && /\/revisions$/.test(new URL(r.url()).pathname)) revisions.push(r.status()); });
  const target = () => page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first();
  const italic = () => target().evaluate((el) => getComputedStyle(el.querySelector("[data-deck-text-body]")?.parentElement || el).fontStyle);
  await openDeck(page, helpers, args[0]);
  const before = await italic();
  await context.setOffline(true);
  await target().click({ force: true });
  await page.locator('[data-selection-control-id="italic"] button:visible,button[data-selection-control-id="italic"]:visible').first().click();
  const started = Date.now();
  while (await helpers.saveState(page) !== "error" && Date.now() - started < 90000) await page.waitForTimeout(250);
  assert.equal(await helpers.saveState(page), "error");
  assert.notEqual(await italic(), before);
  const expected = await italic();
  await shot("offline-error");
  await context.setOffline(false);
  await page.locator("[data-workspace-save-launcher]").first().click();
  await page.locator('[data-workspace-save-action-id="retry"]:visible').click();
  const retried = Date.now();
  while (await helpers.saveState(page) === "error" && Date.now() - retried < 20000) await page.waitForTimeout(250);
  await helpers.waitSaved(page, { timeout: 120000 });
  assert.deepEqual(revisions, [200]);
  await shot("offline-recovered");
  await openDeck(page, helpers, args[0]);
  assert.equal(await italic(), expected);
  assert.deepEqual(revisions, [200], "reopen must not save the same edit again");
  await shot("offline-reopened");
  log("PASS offline error -> retry -> saved -> reopen, one revision");
}
