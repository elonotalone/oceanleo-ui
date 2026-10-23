// R2 §5.4: change while offline → never "saved" before the server confirms → "save failed" with retry →
// back online, retry → "saved". args: <artifactId>
import { openPdf, pageBox, tool, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, context, log, shot, helpers, args }) {
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const box = await pageBox(page, 0);
  await context.setOffline(true);
  log("offline");
  await tool(page, "pdf-tool-cross");
  await page.mouse.click(box.x + 300 * box.scale, box.y + 520 * box.scale);
  await page.waitForTimeout(600);
  await tool(page, "pdf-tool-cross");
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const state = await helpers.saveState(page);
    if (seen.at(-1) !== state) seen.push(state);
    if (state === "error") break;
    await page.waitForTimeout(500);
  }
  log("offline states", seen.join(" → "), "saved shown while offline:", seen.includes("saved") && seen.indexOf("saved") > 0);
  const title = await page.locator("[data-workspace-save-launcher]").first().getAttribute("title");
  log("launcher title", title);
  await shot("offline-error");
  await context.setOffline(false);
  log("online");
  await page.locator("[data-workspace-save-launcher]").first().click();
  await page.waitForTimeout(600);
  const menu = page.locator("[data-workspace-save-menu]").first();
  log("save menu", JSON.stringify(await menu.innerText().catch(() => "")));
  await shot("offline-menu");
  const retry = menu.getByRole("menuitem", { name: /重试|Retry|再试/ }).first();
  if (await retry.count()) await retry.click();
  else await menu.locator("button").first().click();
  const after = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 90000) {
    const state = await helpers.saveState(page);
    if (after.at(-1) !== state) after.push(state);
    if (state === "saved") break;
    await page.waitForTimeout(500);
  }
  log("after retry", after.join(" → "));
  await shot("offline-recovered");
}
