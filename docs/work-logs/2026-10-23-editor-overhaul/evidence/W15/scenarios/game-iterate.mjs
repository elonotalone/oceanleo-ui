// W15: Edit page → 玩法 drawer → describe a change → 迭代这一版 (default route, no explicit model).
// Records the notice / error, the save state, and the generation requests.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15-r2/iterate THEME=light node harness/run.mjs evidence/W15/scenarios/game-iterate.mjs ["prompt"]
import { guardProduction, openGame, describeEditor, sleep } from "./_w15-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  const t0 = Date.now();
  page.on("response", async (res) => {
    const req = res.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET" || !/game-generate|\/revisions|:fork|\/fork/.test(path)) return;
    let body = "";
    if (res.status() >= 400) body = (await res.text().catch(() => "")).slice(0, 400);
    log("NET", ((Date.now() - t0) / 1000).toFixed(1), req.method(), path, res.status(), body);
  });
  const prompt = args[0] || "把星星改成蓝色，并且每收集 10 颗星星时间加 5 秒。";
  await openGame(page, helpers, log);
  const drawer = page.locator("[data-edit-bar-drawer]").first();
  await drawer.click();
  await sleep(1000);
  await page.locator("#game-prompt").fill(prompt);
  await shot("iterate-before");
  const button = page.locator("#game-prompt ~ button").first();
  log("button", await button.textContent());
  await button.click();
  const started = Date.now();
  let outcome = null;
  while (Date.now() - started < 300000) {
    const busy = await button.isDisabled().catch(() => false);
    const text = (await button.textContent().catch(() => "")) || "";
    if (!busy && !/生成中|Generating/.test(text)) {
      outcome = await describeEditor(page);
      break;
    }
    await sleep(2000);
  }
  log("elapsed", ((Date.now() - started) / 1000).toFixed(0), "s");
  log("outcome", JSON.stringify(outcome));
  const status = await page.locator("[role=status], [role=alert]").allTextContents().catch(() => []);
  log("status texts", JSON.stringify(status.filter(Boolean).slice(0, 8)));
  const versions = await page.locator("ol li button").allTextContents().catch(() => []);
  log("versions", JSON.stringify(versions));
  await sleep(3000);
  log("save state", await helpers.saveState(page));
  await shot("iterate-after");
}
