// R2 D2/E: 素材库 → click an image → it becomes a stamp on the current page (revision +1, undo removes it).
// args: <artifactId>
import { openPdf, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const rev = () => page.evaluate(() => document.querySelector("[data-pdf-revision]")?.getAttribute("data-pdf-revision"));
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  await page.waitForTimeout(2500);
  const back = page.getByRole("button", { name: /Back to list|返回列表/ }).first();
  if (await back.isVisible().catch(() => false)) await back.click();
  const pane = page.locator("[data-editor-fallback-pane]").first();
  const until = Date.now() + 40000;
  const cardSel = "[draggable='true'], [data-material-card], [data-artifact-card], button:has(img)";
  while (Date.now() < until && !(await pane.locator("[draggable='true']").count())) await page.waitForTimeout(1000);
  log("pane html sample", (await pane.innerHTML().catch(() => "")).replace(/\s+/g, " ").match(/<(button|div|article)[^>]*data-[^>]*>/g)?.slice(0, 12).join(" | ").slice(0, 1500));
  log("panel", JSON.stringify(await pane.evaluate((root) => ({
    filter: [...root.querySelectorAll("select, [aria-haspopup=listbox], button[aria-haspopup]")].map((el) => (el.value || el.textContent || "").trim().slice(0, 30)).slice(0, 4),
    cards: root.querySelectorAll("[draggable='true']").length,
    titles: [...root.querySelectorAll("[draggable='true']")].slice(0, 5).map((c) => (c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 50)),
  }))));
  await shot("material-list");
  const before = await rev();
  const card = pane.locator("[draggable='true']").first();
  if (!(await card.count())) return log("no cards");
  await card.click();
  let feedback = null;
  for (let i = 0; i < 30 && !feedback; i += 1) {
    await page.waitForTimeout(500);
    feedback = await page.evaluate(() => {
      const el = document.querySelector("[data-material-insert-feedback]");
      return el ? { kind: el.getAttribute("data-material-insert-feedback"), text: el.textContent.trim().slice(0, 120) } : null;
    });
  }
  // a click may open a detail view whose primary button is Insert
  if (!feedback) {
    const insert = page.getByRole("button", { name: /^(Insert|插入)$/ }).first();
    log("insert button", await insert.count(), await insert.isEnabled().catch(() => false));
    if (await insert.isEnabled().catch(() => false)) {
      await insert.click();
      for (let i = 0; i < 30 && !feedback; i += 1) {
        await page.waitForTimeout(500);
        feedback = await page.evaluate(() => {
          const el = document.querySelector("[data-material-insert-feedback]");
          return el ? { kind: el.getAttribute("data-material-insert-feedback"), text: el.textContent.trim().slice(0, 120) } : null;
        });
      }
    }
  }
  await page.waitForTimeout(1500);
  log("feedback", JSON.stringify(feedback), "revision", before, "→", await rev());
  await shot("material-inserted");
  await page.locator("[data-global-history-undo]").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  log("after undo revision", await rev());
  await shot("material-undo");
}
