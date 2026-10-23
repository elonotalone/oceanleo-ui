// W15 click-through: Code page Run / Stop / Reload; Edit page Gameplay → iterate (notice visible) → pick v1 (saves as a revision) → undo/redo.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15-r2/buttons THEME=light node harness/run.mjs evidence/W15/scenarios/game-buttons.mjs [--no-iterate]
import { guardProduction, openGame, clickTab, sleep } from "./_w15-lib.mjs";

const stage = "[data-game-preview-paused]";
const state = (page) => page.locator("[data-workspace-save-launcher]").first().getAttribute("data-save-state").catch(() => null);
async function playback(page) {
  return page.locator(stage).first().evaluate((el) => ({ paused: el.getAttribute("data-game-preview-paused"), reload: el.getAttribute("data-game-preview-reload") }));
}
async function watchSave(page, ms = 90000) {
  const seen = [];
  const t = Date.now();
  while (Date.now() - t < ms) {
    const s = await state(page);
    if (seen[seen.length - 1] !== s) seen.push(s);
    if (seen.length > 1 && (s === "saved" || s === "error")) break;
    await sleep(400);
  }
  return seen;
}

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  await openGame(page, helpers, log);
  await clickTab(page, /^Code$/);
  await sleep(3000);
  log("initial", JSON.stringify(await playback(page)));
  for (const id of ["game-stop", "game-run", "game-reload"]) {
    await page.locator(`[data-testid=${id}]`).click();
    await sleep(1200);
    log(id, JSON.stringify(await playback(page)), JSON.stringify(await page.locator("[data-testid=game-run-bar]").textContent()));
    await shot(`btn-${id}`);
  }
  await clickTab(page, /^(编辑|Edit)$/);
  await page.locator("[data-edit-bar-drawer]").first().click();
  await sleep(1000);
  if (!args.includes("--no-iterate")) {
    await page.locator("#game-prompt").fill("背景改成深蓝色。");
    await page.locator("[data-testid=game-play-panel] button").filter({ hasText: /迭代这一版|Update this version/ }).click();
    const t = Date.now();
    let text = null;
    while (Date.now() - t < 300000) {
      text = await page.locator("[data-testid=game-play-notice], [data-testid=game-play-error]").first().textContent({ timeout: 1000 }).catch(() => null);
      if (text) break;
      await sleep(2000);
    }
    log("iterate result", ((Date.now() - t) / 1000).toFixed(0), "s", JSON.stringify(text));
    await shot("iterate-result");
    log("save after iterate", await state(page));
  }
  const versions = page.locator("[data-testid=game-play-panel] ol button");
  log("versions", JSON.stringify(await versions.allTextContents()));
  if ((await versions.count()) > 1) {
    await versions.first().click();
    log("pick v1 save states", JSON.stringify(await watchSave(page)));
    await shot("picked-v1");
    const redo = page.locator("button[aria-label='重做'], button[aria-label='Redo']").first();
    log("redo enabled", await redo.isEnabled().catch(() => null));
    if (await redo.isEnabled().catch(() => false)) {
      await redo.click();
      log("redo save states", JSON.stringify(await watchSave(page)));
      log("current", JSON.stringify(await page.locator("[data-testid=game-play-panel] ol button[aria-current=true]").textContent().catch(() => null)));
    }
  }
}
