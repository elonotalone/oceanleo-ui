import assert from "node:assert/strict";
import { openSite, FORK, sectionStyle, barInfo } from "./w14-site-probe.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  page.removeAllListeners("console");
  page.on("response", response => {
    const url = new URL(response.url());
    if (response.request().method() !== "GET" && url.origin === "https://api.dev.oceanleo.com") {
      log("write", response.request().method(), url.pathname, String(response.status()));
    }
  });
  assert.ok(await openSite(page, log, helpers, args[0] || FORK));
  log("reopened", JSON.stringify(await sectionStyle(page, 0)));
  const img = page.locator("[data-w14-section] img[data-w14-kind=image]").first();
  await img.waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector("[data-w14-section] img[data-w14-kind=image]");
    return image?.complete && image.naturalWidth > 0;
  }, null, { timeout: 45000 });
  assert.ok(await img.evaluate(image => image.complete && image.naturalWidth > 0));
  const title = page.locator("[data-w14-section]").first().locator("[data-w14-field=title]");
  assert.match(await title.textContent(), /^W14 verified /);
  await title.click();
  log("normal-bar", JSON.stringify(await barInfo(page)));
  await shot("01-normal");
  await page.evaluate(() => { document.querySelector("[data-testid=website-puck-stage]").__codexMark = true; });
  const mode = name => page.getByRole("button", { name }).or(page.getByRole("tab", { name })).first();
  await mode(/^(Pro edit|专业编辑)$/).click();
  await page.waitForTimeout(1500);
  assert.ok(await page.evaluate(() => document.querySelector("[data-testid=website-puck-stage]")?.__codexMark));
  await shot("02-pro");
  await mode(/^(Edit|编辑)$/).click();
  await page.waitForTimeout(1000);
  assert.ok(await page.evaluate(() => document.querySelector("[data-testid=website-puck-stage]")?.__codexMark));
  log("same-instance", "mode round trip preserved DOM and selection", JSON.stringify(await barInfo(page)));
  await title.click();
  await context.setOffline(true);
  await page.locator('[data-selection-control-id="text-color"] input[type=color]').fill("#0369a1");
  for (let n = 0; n < 100 && (await helpers.saveState(page)) !== "error"; n++) await page.waitForTimeout(500);
  assert.equal(await helpers.saveState(page), "error");
  await shot("03-offline-error");
  await context.setOffline(false);
  await page.locator("[data-workspace-save-launcher]").click();
  await page.locator('[data-workspace-save-action-id="retry"]').click();
  await page.waitForFunction(() => document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") !== "error");
  await helpers.waitSaved(page, { timeout: 90000 });
  log("offline-retry", "saved");
  await shot("04-recovered");
}
