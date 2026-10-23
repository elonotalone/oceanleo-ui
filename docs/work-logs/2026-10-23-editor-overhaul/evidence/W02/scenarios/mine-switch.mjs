// W02: 我的库 switches the same editor host to another file; ?item= follows.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w02-mine node harness/run.mjs evidence/W02/scenarios/mine-switch.mjs <fromId> <toId> <toTitle>
export default async function ({ page, log, shot, helpers, args }) {
  const [fromId, toId, toTitle] = args;
  await helpers.gotoApp(page, `/library?item=${fromId}`);
  const editor = page.locator("[data-inline-editor]").first();
  const pencil = page
    .locator('button[aria-label*="Edit"], button[aria-label*="编辑"], button[title*="Edit"], button[title*="编辑"]')
    .first();
  const openBy = Date.now() + 180000;
  while (Date.now() < openBy && !(await editor.isVisible().catch(() => false))) {
    if (await pencil.isVisible().catch(() => false)) await pencil.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  const before = await editor.getAttribute("data-editor-adapter");
  log("before", before, page.url());
  await page.locator('[data-workspace-library-panel="mine"]').first().click();
  const row = page.locator(`[data-inline-editor-mine-item="${toId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 60000 });
  const current = await page.locator('[data-inline-editor-mine-item][aria-current="true"]').first().getAttribute("data-inline-editor-mine-item").catch(() => "");
  log("highlighted-current", current);
  await shot("mine-0-panel");
  await row.click();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    log("t", i, JSON.stringify(await page.evaluate(() => ({
      url: location.search,
      adapter: document.querySelector("[data-inline-editor]")?.getAttribute("data-editor-adapter") || null,
      switching: Boolean(document.querySelector("[data-inline-editor-mine-switching]")),
      error: document.querySelector("[data-inline-editor-mine-switch-error]")?.textContent || "",
      save: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      leaving: Boolean(document.querySelector("[data-editor-leave-pending]")),
    }))));
  }
  const switchBy = Date.now() + 120000;
  let adapter = before;
  while (Date.now() < switchBy) {
    adapter = await page.locator("[data-inline-editor]").first().getAttribute("data-editor-adapter").catch(() => null);
    if (adapter && adapter !== before && page.url().includes(toId)) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(3000);
  await shot("mine-1-switched");
  const header = await page.locator("[data-advanced-workbench-header]").first().innerText().catch(() => "");
  const error = await page.locator("[data-inline-editor-mine-switch-error]").first().innerText().catch(() => "");
  log("after", JSON.stringify({ adapter, url: page.url(), titleShown: header.includes(toTitle) || (await page.locator("body").innerText()).includes(toTitle), error, saveState: await helpers.saveState(page) }));
}
