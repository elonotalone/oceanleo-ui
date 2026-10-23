// W15 save protocol (§5 items 1 and 4) on the Code page of the own game.
// Edit 1 → saved → edit 2 → saved → close → reopen: both markers present; full reload: both present.
// Then offline edit → error + retry → online → saved.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15-r2/save THEME=light node harness/run.mjs evidence/W15/scenarios/game-save.mjs [tag] [--offline]
import { guardProduction, openGame, clickTab, describeEditor, sleep } from "./_w15-lib.mjs";

const CODE = "[data-testid='game-code-editor']";

async function appendMarker(page, marker) {
  const area = page.locator(CODE).first();
  await area.waitFor({ timeout: 60000 });
  for (let i = 0; i < 60 && (await area.isDisabled().catch(() => true)); i += 1) await sleep(500);
  await area.click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`\n<!-- ${marker} -->`, { delay: 5 });
}

async function waitState(page, want, timeout = 90000) {
  const started = Date.now();
  let last = null;
  const seen = [];
  while (Date.now() - started < timeout) {
    last = await page.locator("[data-workspace-save-launcher]").first().getAttribute("data-save-state").catch(() => null);
    if (seen[seen.length - 1] !== last) seen.push(last);
    if (want.includes(last)) return { last, seen };
    await sleep(400);
  }
  return { last, seen, timeout: true };
}

async function codeHas(page, markers) {
  const value = await page.locator(CODE).first().inputValue().catch(() => "");
  return Object.fromEntries(markers.map((m) => [m, value.includes(m)]));
}

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  const t0 = Date.now();
  page.on("response", async (res) => {
    const req = res.request();
    const url = new URL(req.url());
    if (!/\/v1\/(database\/upload|artifacts\/[^/]+\/(revisions|fork)|artifacts\/[^/]+:fork|editor-staging|staged)/.test(url.pathname) || req.method() === "GET") return;
    const headers = req.headers();
    log("NET", ((Date.now() - t0) / 1000).toFixed(1), req.method(), url.pathname, res.status(), headers["idempotency-key"] || headers["x-idempotency-key"] || "");
  });
  const tag = args[0] || `s${Date.now().toString(36).slice(-4)}`;
  const markers = [`W15-${tag}-one`, `W15-${tag}-two`];
  await openGame(page, helpers, log);
  if (!(await clickTab(page, /^Code$/))) throw new Error("no Code tab");
  await sleep(3000);
  for (const marker of markers) {
    await appendMarker(page, marker);
    // Never "saved" before the server confirms: record the state sequence.
    const done = await waitState(page, ["saved", "error"]);
    log("after", marker, JSON.stringify(done));
    await shot(`save-${marker}`);
  }
  log("state", JSON.stringify(await describeEditor(page)));
  // Close and reopen through the library.
  const close = page.locator("button[aria-label='关闭'], button[aria-label='Close']").last();
  if (await close.isVisible().catch(() => false)) await close.click();
  await sleep(3000);
  await openGame(page, helpers, log);
  await clickTab(page, /^Code$/);
  await sleep(4000);
  log("reopened", JSON.stringify(await codeHas(page, markers)));
  await page.reload({ waitUntil: "domcontentloaded" });
  await openGame(page, helpers, log);
  await clickTab(page, /^Code$/);
  await sleep(4000);
  log("reloaded", JSON.stringify(await codeHas(page, markers)));
  await shot("save-reloaded");
  if (args.includes("--offline")) {
    const marker = `W15-${tag}-offline`;
    await context.setOffline(true);
    await appendMarker(page, marker);
    const offline = await waitState(page, ["error", "saved"], 60000);
    log("offline", JSON.stringify(offline));
    await shot("save-offline");
    await context.setOffline(false);
    await sleep(1500);
    const retry = page.getByRole("button", { name: /^(重试|Retry|重新保存|Save again)/ }).first();
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
      log("clicked retry");
    } else {
      const launcher = page.locator("[data-workspace-save-launcher]").first();
      await launcher.click().catch(() => {});
      await sleep(800);
      await shot("save-offline-menu");
      const item = page.getByRole("menuitem", { name: /重试|Retry|保存|Save/ }).first();
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        log("clicked retry menu item");
      } else log("no retry control found");
    }
    const back = await waitState(page, ["saved"], 90000);
    log("online", JSON.stringify(back));
    await shot("save-online");
  }
}
