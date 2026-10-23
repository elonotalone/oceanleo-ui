// W15: fresh browser (= full reload) → open the own game → Code page → which markers are in the code.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15-r2/check THEME=light node harness/run.mjs evidence/W15/scenarios/game-check.mjs <marker>…
import { guardProduction, openGame, clickTab, sleep } from "./_w15-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  await openGame(page, helpers, log);
  if (!(await clickTab(page, /^Code$/))) throw new Error("no Code tab");
  await sleep(4000);
  const value = await page.locator("[data-testid='game-code-editor']").first().inputValue();
  log("markers", JSON.stringify(Object.fromEntries(args.map((m) => [m, value.includes(m)]))));
  log("save state", await helpers.saveState(page));
  await shot("check-code");
}
