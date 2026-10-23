import { GAME_ID, guardProduction, sleep } from "./_w15-lib.mjs";
export default async function ({ page, context, helpers, log, shot }) {
  await guardProduction(context, log);
  await helpers.gotoApp(page, `/library?item=${GAME_ID}`);
  await sleep(12_000);
  log("visible", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("button,a,[role=alert]")].filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height).map(el => ({ tag: el.tagName, label: el.getAttribute("aria-label"), text: el.textContent?.slice(0, 90) })).slice(-55))));
  await shot("open-probe");
}
