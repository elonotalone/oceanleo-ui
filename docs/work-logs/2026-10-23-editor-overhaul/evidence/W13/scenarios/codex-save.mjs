import assert from "node:assert/strict";
import { openModel, clickStageCenter, editBarInfo, surfaceColors } from "./lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  const writes = [];
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (r.request().method() === "POST" && /\/revisions$/.test(path)) {
      writes.push({ status: r.status(), path }); log("revision", r.status(), path);
    }
  });
  const stage = () => page.locator('[data-testid="model3d-stage-backdrop"]');
  const transform = async () => JSON.parse(await stage().getAttribute("data-model3d-selected-transform"));
  const control = (id) => page.locator(`[data-selection-control-id="${id}"] button:visible`).first();
  const save = async (count) => {
    const start = Date.now();
    log("await save", count, "edit", await stage().getAttribute("data-model3d-edit-revision"), "state", await helpers.saveState(page));
    while (writes.length < count && Date.now() - start < 120000) {
      if (await helpers.saveState(page) === "error") throw Error("save error before durable revision");
      await page.waitForTimeout(250);
    }
    assert.equal(writes.length, count); assert.ok(writes.every((w) => w.status === 200));
    await helpers.waitSaved(page, { timeout: 30000 });
    log("saved", count, JSON.stringify(await transform()));
  };
  const select = async () => { await clickStageCenter(page); await page.locator('[data-selection-kind="model-3d"]').waitFor(); };
  const setAxis = async (label, value) => {
    await control("position").click();
    const input = page.getByRole("spinbutton", { name: label, exact: true });
    await input.fill(String(value)); await input.press("Tab");
    log("axis", label, value, JSON.stringify(await transform()));
  };
  await openModel(page, helpers, args[0], log);
  await page.waitForTimeout(10000);
  assert.equal((await editBarInfo(page)).kind, null);
  assert.equal(writes.length, 0, "open must not publish");
  await select(); await page.waitForTimeout(8000);
  assert.equal(writes.length, 0, "selection must not publish");
  log("selected", JSON.stringify(await editBarInfo(page)));
  log("surfaces", JSON.stringify(await surfaceColors(page)));
  await shot("selected-canonical");
  const before = await transform();
  const x = +(before.position[0] + 0.25).toFixed(3);
  await setAxis("PX", x); await save(1);
  assert.equal((await transform()).position[0], x);
  const rotation = +(before.rotation[1] + 15).toFixed(3);
  await setAxis("RY", rotation); await save(2);
  await shot("two-edits-saved");
  await openModel(page, helpers, args[0], log); await select();
  assert.equal((await transform()).position[0], x);
  assert.ok(Math.abs((await transform()).rotation[1] - rotation) < 0.01);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openModel(page, helpers, args[0], log); await select();
  assert.equal((await transform()).position[0], x);
  assert.ok(Math.abs((await transform()).rotation[1] - rotation) < 0.01);
  await page.waitForTimeout(3000); assert.equal(writes.length, 2, "reopen/reload phantom revision");
  await context.setOffline(true);
  await setAxis("PZ", +(before.position[2] + 0.1).toFixed(3));
  const start = Date.now();
  while (await helpers.saveState(page) !== "error" && Date.now() - start < 90000) await page.waitForTimeout(250);
  assert.equal(await helpers.saveState(page), "error"); await shot("offline-error");
  await context.setOffline(false);
  await page.locator("[data-workspace-save-launcher]").first().click();
  await page.locator('[data-workspace-save-action-id="retry"]:visible').click();
  const retry = Date.now();
  while (await helpers.saveState(page) === "error" && Date.now() - retry < 20000) await page.waitForTimeout(250);
  await save(3);
  await openModel(page, helpers, args[0], log); await select();
  assert.ok(Math.abs((await transform()).position[2] - (before.position[2] + 0.1)) < 0.001);
  await shot("reopened-final");
  assert.equal(new Set(writes.map((w) => w.path)).size, 1);
  log("PASS typed revisions, reopen, reload, selection no-op and offline retry", JSON.stringify(writes));
}
