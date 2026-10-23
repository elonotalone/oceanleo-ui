// W09 §E: 素材库 → 插入 lands a new image layer on the canvas; undo removes it.
// Usage: mint.sh | OUT_DIR=/tmp/w09-i node harness/run.mjs evidence/W09/scenarios/w09-insert.mjs <rootId>
export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  for (let i = 0; i < 60 && !(await page.locator("[data-editor-loading='false']").count()); i += 1) {
    const edit = page.locator('button[aria-label*="Edit"], button[aria-label*="编辑"]').first();
    if (await edit.isVisible().catch(() => false)) await edit.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  const layers = () => page.locator("[data-editor-loading]").first().getAttribute("data-editor-layer-count");
  log("layers-before", await layers());
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  await page.waitForTimeout(6000);
  const insert = page.locator("[data-workspace-pane='left'] button, [data-editor-fallback-pane] button").filter({ hasText: /^\s*(Insert|插入)\s*$/ }).first();
  if (!(await insert.count())) {
    // Library list: open the first card's detail first.
    const card = page.locator("[data-workspace-pane='left'] [data-material-card], [data-workspace-pane='left'] button[aria-label]").first();
    await card.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  log("insert-disabled", await insert.isDisabled().catch(() => "missing"), JSON.stringify(await insert.getAttribute("title").catch(() => null)));
  await insert.click({ timeout: 10000 });
  await page.waitForTimeout(5000);
  log("layers-after-insert", await layers());
  const feedback = await page.locator("[role=status], [role=alert]").allTextContents().catch(() => []);
  log("feedback", JSON.stringify(feedback.map((t) => t.trim()).filter(Boolean).slice(0, 4)));
  await shot("insert-after");
  await page.keyboard.press("Escape").catch(() => {});
  await helpers.waitSaved(page, { timeout: 90000 }).then(() => log("saved-after-insert"), (e) => log("save-after-insert", String(e)));
  const undoState = await page.locator('[data-global-row-slot="history"] button').first().evaluate((b) => ({ disabled: b.disabled, aria: b.getAttribute("aria-disabled"), label: b.getAttribute("aria-label") })).catch(() => null);
  log("undo-button", JSON.stringify(undoState));
  const undo = page.locator('[data-global-row-slot="history"] button').first();
  await undo.click().catch(() => log("undo-missing"));
  await page.waitForTimeout(2000);
  log("layers-after-undo", await layers());
  if ((await layers()) !== "1") {
    await page.locator("[data-editor-loading] canvas").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(2000);
    log("layers-after-ctrl-z", await layers());
  }
  await helpers.waitSaved(page, { timeout: 90000 }).then(() => log("saved-after-undo"), (e) => log("save-after-undo", String(e)));
  await shot("insert-undo");
}
