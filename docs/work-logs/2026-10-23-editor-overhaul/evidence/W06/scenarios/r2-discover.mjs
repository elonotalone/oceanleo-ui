import { openPdf, viewerChrome, editBar } from "./_w06-lib.mjs";
// R2 discovery: pro toolbar item ids and the ··· menu entries. args: <artifactId>
export default async function ({ page, log, shot, helpers, args }) {
  await openPdf(page, helpers, log, args[0]);
  log("basic editbar", JSON.stringify(await editBar(page)));
  await page.locator("button, [role=tab]").filter({ hasText: /^(专业编辑|Pro edit)$/ }).first().click();
  await page.waitForTimeout(2500);
  log("pro chrome", JSON.stringify(await viewerChrome(page)));
  await shot("pro");
  const more = page.locator("[data-workspace-more-menu], button[aria-label*='More'], button[aria-label*='更多']").first();
  log("more count", await more.count());
  await more.click().catch((error) => log("more click failed", String(error).slice(0, 200)));
  await page.waitForTimeout(800);
  log("menu items", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[role=menuitem], [role=menu] button")].map((el) => (el.textContent || "").trim().slice(0, 40)))));
  await shot("more");
}
