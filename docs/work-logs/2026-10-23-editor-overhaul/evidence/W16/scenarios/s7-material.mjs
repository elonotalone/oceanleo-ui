// W16 §E: 素材库 panel lists image / video / audio; clicking one inserts a media node into the canvas.
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  await openCanvas(page, helpers, log, args[0] || OWN_FORK);
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  const pane = page.locator("[data-editor-fallback-pane], [data-workspace-pane='left'][data-left-panel='tool-detail']").first();
  await pane.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2000);
  // A remembered material detail may be open; go back to the list.
  const back = pane.locator('button[aria-label*="Back"], button[aria-label*="返回"]').first();
  if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(1500); }
  const loadedBy = Date.now() + 40000;
  while (Date.now() < loadedBy) {
    if (!(await pane.locator("[data-material-shelf-state='loading']").count()) && (await pane.locator("[draggable='true']").count())) break;
    await page.waitForTimeout(1000);
  }
  const summary = await pane.evaluate((root) => ({
    selects: [...root.querySelectorAll("select")].map((s) => [s.value, [...s.options].map((o) => o.value).slice(0, 12)]),
    buttons: [...root.querySelectorAll("button")].slice(0, 20).map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30)),
    cards: [...root.querySelectorAll("[draggable='true']")].slice(0, 8).map((c) => (c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 50)),
  }));
  log("pane", JSON.stringify(summary));
  await shot("s7-01-materials");
  const card = pane.locator("[draggable='true']").first();
  if (!(await card.count())) return;
  const before = (await canvasInfo(page)).nodes.length;
  await card.click();
  let feedback = null;
  for (let i = 0; i < 30 && !feedback; i++) {
    await page.waitForTimeout(500);
    feedback = await page.evaluate(() => {
      const el = document.querySelector("[data-material-insert-feedback]");
      return el ? { kind: el.getAttribute("data-material-insert-feedback"), text: el.textContent } : null;
    });
  }
  await page.waitForTimeout(1000);
  const info = await canvasInfo(page);
  log("material", JSON.stringify({ feedback, before, after: info.nodes.length, last: info.nodes[info.nodes.length - 1] }));
  await shot("s7-02-after-click");
}
