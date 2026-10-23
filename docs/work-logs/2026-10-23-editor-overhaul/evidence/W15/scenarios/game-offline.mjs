// W15 save protocol §5 item 4 on the Code page: offline edit → error (never "saved") → online → retry → saved.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15-r2/offline THEME=light node harness/run.mjs evidence/W15/scenarios/game-offline.mjs [tag]
import { guardProduction, openGame, clickTab, sleep } from "./_w15-lib.mjs";

const CODE = "[data-testid='game-code-editor']";
const state = (page) => page.locator("[data-workspace-save-launcher]").first().getAttribute("data-save-state").catch(() => null);

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  const marker = `W15-${args[0] || "off"}-offline`;
  await openGame(page, helpers, log);
  if (!(await clickTab(page, /^Code$/))) throw new Error("no Code tab");
  await sleep(3000);
  await context.setOffline(true);
  const area = page.locator(CODE).first();
  await area.click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`\n<!-- ${marker} -->`, { delay: 5 });
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < 60000) {
    const s = await state(page);
    if (seen[seen.length - 1] !== s) seen.push(s);
    if (s === "error") break;
    await sleep(400);
  }
  log("offline states", JSON.stringify(seen));
  await shot("offline-error");
  await context.setOffline(false);
  await sleep(1500);
  await page.locator("[data-workspace-save-launcher]").first().click().catch(() => {});
  await sleep(800);
  await shot("offline-menu");
  const items = await page.getByRole("menuitem").allTextContents().catch(() => []);
  log("menu items", JSON.stringify(items));
  const retry = page.getByRole("menuitem", { name: /重试|Retry/ }).first();
  if (await retry.isVisible().catch(() => false)) {
    await retry.click();
    log("clicked retry");
  } else log("no retry menu item; waiting for automatic retry");
  const back = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 90000) {
    const s = await state(page);
    if (back[back.length - 1] !== s) back.push(s);
    if (s === "saved") break;
    await sleep(400);
  }
  log("online states", JSON.stringify(back));
  await shot("offline-recovered");
}
