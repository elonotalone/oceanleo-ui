import assert from "node:assert/strict";
import { openSite, FORK, sectionStyle } from "./w14-site-probe.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  page.removeAllListeners("console"); // Browser errors can contain signed rendition grants.
  const root = args[0] || FORK;
  const revisions = [];
  page.on("response", async response => {
    if (response.request().method() !== "POST" || !/\/v1\/artifacts\/[^/]+\/revisions$/.test(response.url())) return;
    const body = await response.json().catch(() => ({}));
    log("revision-response", String(response.status()), body.revisionId || body.code || "");
    if (response.ok()) revisions.push(body);
  });
  const savedAfter = async (mutate) => {
    const before = revisions.length;
    await mutate();
    await page.waitForFunction(() => document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") !== "saved", { timeout: 15000 });
    for (let n = 0; n < 180 && revisions.length === before; n++) await page.waitForTimeout(500);
    assert.ok(revisions.length > before, "a real server revision must acknowledge each edit");
    await helpers.waitSaved(page, { timeout: 90000 });
  };
  const title = () => page.locator("[data-w14-section]").first().locator("[data-w14-field=title]");
  assert.ok(await openSite(page, log, helpers, root));
  await title().click();
  await shot("01-text");
  const stamp = `W14 verified ${Date.now()}`;
  const color = (await sectionStyle(page, 0)).color === "rgb(162, 28, 175)" ? "#166534" : "#a21caf";
  const rgb = color === "#166534" ? "rgb(22, 101, 52)" : "rgb(162, 28, 175)";
  await savedAfter(async () => {
    const fields = page.locator("[data-testid=website-normal-fields] input");
    const current = await title().textContent();
    for (let i = 0; i < await fields.count(); i++) {
      if (await fields.nth(i).inputValue() === current.trim()) {
        await fields.nth(i).fill(stamp);
        await fields.nth(i).blur();
        return;
      }
    }
    throw new Error("title field missing");
  });
  assert.equal((await title().textContent()).trim(), stamp);
  await savedAfter(async () => {
    await title().click();
    await page.locator('[data-selection-control-id="text-color"] input[type=color]').fill(color);
  });
  const painted = await sectionStyle(page, 0);
  assert.equal(painted.color, rgb);
  await page.locator("[data-w14-section] img[data-w14-kind=image]").first().click({ force: true });
  await savedAfter(async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.locator('[data-selection-control-id="replace"]').locator("button").first().click();
    await (await chooser).setFiles("harness/fixtures/sample.png");
  });
  log("saved-image", String(revisions.length));
  await page.evaluate(() => { document.querySelector("[data-testid=website-puck-stage]").__codexMark = true; });
  await page.getByRole("button", { name: /^(Pro edit|专业编辑)$/ }).or(page.getByRole("tab", { name: /^(Pro edit|专业编辑)$/ })).first().click();
  await page.waitForTimeout(1000);
  assert.ok(await page.evaluate(() => document.querySelector("[data-testid=website-puck-stage]").__codexMark));
  await shot("02-pro");
  await page.getByRole("button", { name: /^(Edit|编辑)$/ }).or(page.getByRole("tab", { name: /^(Edit|编辑)$/ })).first().click();
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.ok(await openSite(page, log, helpers, root));
  assert.equal((await title().textContent()).trim(), stamp);
  assert.equal((await sectionStyle(page, 0)).color, rgb);
  log("reopen", "both edits survived full reload");
  await title().click();
  await context.setOffline(true);
  await page.locator('[data-selection-control-id="text-color"] input[type=color]').fill("#0369a1");
  for (let n = 0; n < 100 && (await helpers.saveState(page)) !== "error"; n++) await page.waitForTimeout(500);
  assert.equal(await helpers.saveState(page), "error");
  await shot("03-offline-error");
  await context.setOffline(false);
  const beforeRetry = revisions.length;
  await page.locator("[data-workspace-save-launcher]").click();
  await page.locator('[data-workspace-save-action-id="retry"]').click();
  for (let n = 0; n < 180 && revisions.length === beforeRetry; n++) await page.waitForTimeout(500);
  assert.ok(revisions.length > beforeRetry);
  await helpers.waitSaved(page, { timeout: 90000 });
  log("offline-retry", "server acknowledged");
  await shot("04-restored");
  log("PASS", JSON.stringify({ root, commits: revisions.length, theme: process.env.THEME }));
}
