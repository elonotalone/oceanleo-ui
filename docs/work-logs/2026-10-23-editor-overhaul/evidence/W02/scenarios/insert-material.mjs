// W02: 素材库 click = primary action (insert / replace); the shell reports the result in plain words.
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w02-insert THEME=light node harness/run.mjs \
//     evidence/W02/scenarios/insert-material.mjs "/library?item=<id>" <label>
export default async function ({ page, log, shot, helpers, args }) {
  const route = args[0];
  const label = args[1] || "insert";
  await helpers.gotoApp(page, route);
  const editor = page.locator("[data-inline-editor]").first();
  const pencil = page
    .locator('button[aria-label*="Edit"], button[aria-label*="编辑"], button[title*="Edit"], button[title*="编辑"]')
    .first();
  const openBy = Date.now() + 180000;
  while (Date.now() < openBy && !(await editor.isVisible().catch(() => false))) {
    if (await pencil.isVisible().catch(() => false)) await pencil.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(4000);
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  const pane = page.locator("[data-editor-fallback-pane], [data-workspace-pane='left'][data-left-panel='tool-detail']").first();
  await pane.waitFor({ state: "visible", timeout: 30000 });
  for (const at of [1500, 4000, 8000]) {
    await page.waitForTimeout(at === 1500 ? 1500 : 2500);
    log("pane-at", at, JSON.stringify(await pane.evaluate((root) => {
      const attrs = new Set();
      for (const el of root.querySelectorAll("*")) for (const a of el.getAttributeNames()) if (a.startsWith("data-")) attrs.add(a);
      return { attrs: [...attrs].slice(0, 60), buttons: [...root.querySelectorAll("button")].slice(0, 16).map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30)) };
    })));
    await shot(`${label}-pane-${at}`);
  }
  const loadedBy = Date.now() + 30000;
  while (Date.now() < loadedBy) {
    const loading = await pane.locator("[data-material-shelf-state='loading']").count();
    const cards = await pane.locator("[draggable='true']").count();
    if (!loading && cards) break;
    await page.waitForTimeout(1000);
  }
  const summary = await pane.evaluate((root) => ({
    filter: [...root.querySelectorAll("select")].map((s) => s.value),
    cards: root.querySelectorAll("[draggable='true']").length,
    firstTitles: [...root.querySelectorAll("[draggable='true']")].slice(0, 6).map((c) => (c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 60)),
    upload: Boolean(root.querySelector("[data-workspace-local-upload]")),
  }));
  log("panel", JSON.stringify(summary));
  await shot(`${label}-0-materials`);
  const card = pane.locator("[draggable='true']").first();
  if (!(await card.count())) { log("no-cards"); return; }
  const revisionBefore = await editor.getAttribute("data-editor-adapter");
  await card.click();
  let feedback = null;
  for (let i = 0; i < 20 && !feedback; i++) {
    await page.waitForTimeout(500);
    feedback = await page.evaluate(() => {
      const el = document.querySelector("[data-material-insert-feedback]");
      return el ? { kind: el.getAttribute("data-material-insert-feedback"), text: el.textContent } : null;
    });
  }
  log("feedback", JSON.stringify(feedback), "adapter", revisionBefore);
  await shot(`${label}-1-after-click`);
  await page.waitForTimeout(6000);
  log("save-state", JSON.stringify(await helpers.saveState(page)));
}
