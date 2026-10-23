// W15: open the own game, screenshot Edit page (drawer open/closed) and Code page (drawer open), log the editor state.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15-r2/look-light THEME=light node harness/run.mjs evidence/W15/scenarios/game-look.mjs [label]
import { guardProduction, openGame, clickTab, describeEditor, sleep } from "./_w15-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  const label = `${args[0] || "look"}-${theme}`;
  await openGame(page, helpers, log);
  await shot(`${label}-edit`);
  log("edit", JSON.stringify(await describeEditor(page)));
  const drawer = page.locator("[data-edit-bar-drawer]").first();
  if (await drawer.isVisible().catch(() => false)) {
    await drawer.click();
    await sleep(1500);
    await shot(`${label}-edit-drawer`);
    log("edit drawer open", JSON.stringify(await describeEditor(page)));
    await drawer.click().catch(() => {});
    await sleep(800);
  } else log("no drawer button on edit page");
  if (await clickTab(page, /^Code$/)) {
    await sleep(4000);
    await shot(`${label}-code`);
    log("code", JSON.stringify(await describeEditor(page)));
    const codeDrawer = page.locator("[data-edit-bar-drawer]").first();
    if (await codeDrawer.isVisible().catch(() => false)) {
      await codeDrawer.click();
      await sleep(1500);
      await shot(`${label}-code-drawer`);
      log("code drawer open", JSON.stringify(await describeEditor(page)));
    } else log("no drawer button on code page");
    if (await clickTab(page, /^(编辑|Edit)$/)) {
      await shot(`${label}-back-to-edit`);
      log("back to edit", JSON.stringify(await describeEditor(page)));
    } else log("edit tab not found");
  } else log("no Code tab visible");
}
