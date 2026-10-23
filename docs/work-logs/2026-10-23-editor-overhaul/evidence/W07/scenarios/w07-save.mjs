// W07 save protocol (00-dispatch §5) on a deck in My library, driven through the unified edit bar.
// args: <artifactId> [tag]
export default async function ({ page, context, log, shot, helpers, args }) {
  const [artifactId, tag = "save"] = args;
  if (!artifactId) throw new Error("artifact id required");
  const text = () => page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first();
  const open = async () => {
    await helpers.gotoApp(page, `/library?item=${artifactId}`);
    // 库详情先是预览；右上角铅笔进编辑器。
    const edit = page.getByRole("button", { name: /^(编辑|Edit)\b|编辑|Edit/ }).last();
    await edit.waitFor({ timeout: 60000 }).catch(() => {});
    if (!(await page.locator("[data-workspace-save-launcher]").count())) {
      await edit.click().catch((error) => log("no edit button", String(error).slice(0, 120)));
    }
    await page.locator("[data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
    await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 150000 });
    await page.getByText(/Loading presentation|正在载入演示文稿/).first().waitFor({ state: "hidden", timeout: 150000 }).catch(() => {});
    await page.waitForTimeout(3000);
  };
  const bar = () =>
    page.evaluate(() => {
      const root = document.querySelector("[data-selection-kind]");
      return {
        kind: root?.getAttribute("data-selection-kind"),
        visible: root?.getAttribute("data-selection-visible-controls"),
        overflow: root?.getAttribute("data-selection-overflow-controls"),
        url: location.search,
      };
    });
  const style = () =>
    text().evaluate((el) => {
      const body = el.querySelector("[data-deck-text-body]")?.parentElement || el;
      const cs = getComputedStyle(body);
      return {
        weight: cs.fontWeight,
        style: cs.fontStyle,
        decoration: body.style.textDecoration || cs.textDecorationLine,
        text: el.textContent.slice(0, 40),
      };
    });
  const states = [];
  const watch = setInterval(async () => {
    const state = await helpers.saveState(page);
    if (states[states.length - 1] !== state) states.push(state);
  }, 250);
  try {
    await open();
    await shot(`${tag}-open`);
    await text().click({ force: true });
    await page.waitForTimeout(800);
    log("bar-text", JSON.stringify(await bar()));
    await shot(`${tag}-bar-text`);
    await page.locator('[data-selection-control-id="bold"] button, button[data-selection-control-id="bold"]').first().click();
    await page.waitForTimeout(500);
    log("after-bold", JSON.stringify(await style()));
    await helpers.waitSaved(page, { timeout: 90000 });
    log("saved-1", JSON.stringify(states));
    await text().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('[data-selection-control-id="strike"] button, button[data-selection-control-id="strike"]').first().click();
    await page.waitForTimeout(800);
    log("after-strike", JSON.stringify(await style()));
    const cycle = Date.now();
    while (Date.now() - cycle < 20000 && (await helpers.saveState(page)) === "saved") {
      await page.waitForTimeout(250);
    }
    await helpers.waitSaved(page, { timeout: 90000 });
    log("saved-2", JSON.stringify(states));
    await shot(`${tag}-saved-2`);
    log("url-after-saves", JSON.stringify(await bar()));

    // Reopen from scratch (full reload).
    await open();
    log("after-reload", JSON.stringify(await style()));
    await shot(`${tag}-reloaded`);

    // Offline edit → error → retry.
    await context.setOffline(true);
    await text().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('[data-selection-control-id="italic"] button, button[data-selection-control-id="italic"]').first().click();
    const offStart = Date.now();
    let offState = null;
    while (Date.now() - offStart < 90000) {
      offState = await helpers.saveState(page);
      if (offState === "error") break;
      if (offState === "saved" && Date.now() - offStart > 3000) break;
      await page.waitForTimeout(500);
    }
    log("offline-state", offState, JSON.stringify(states));
    await shot(`${tag}-offline`);
    await context.setOffline(false);
    await page.waitForTimeout(1000);
    const launcher = page.locator("[data-workspace-save-launcher]").first();
    await launcher.click().catch(() => {});
    await page.waitForTimeout(600);
    const retry = page.getByRole("button", { name: /重试|Retry/ }).first();
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
      log("clicked retry");
    } else {
      log("no retry button visible");
      await shot(`${tag}-no-retry`);
    }
    await helpers.waitSaved(page, { timeout: 90000 }).then(
      () => log("saved-after-retry"),
      (error) => log("retry-not-saved", String(error)),
    );
    log("states", JSON.stringify(states));
    await shot(`${tag}-final`);
  } finally {
    clearInterval(watch);
  }
}
