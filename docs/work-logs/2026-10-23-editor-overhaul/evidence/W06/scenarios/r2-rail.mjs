// R2: page rail — rotate / reorder / delete / undo, logging the editor's own error and page count. args: <artifactId>
import { openPdf, saveTrace, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  page.on("pageerror", (error) => log("pageerror", String(error).slice(0, 300)));
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const flags = () => page.evaluate(() => {
    const el = document.querySelector("[data-pdf-revision]");
    return el ? { rev: el.getAttribute("data-pdf-revision"), busy: el.getAttribute("data-pdf-processing"), error: el.getAttribute("data-pdf-error"), pages: document.querySelectorAll("[data-pdf-page-thumb]").length } : "STAGE GONE";
  });
  const thumb = (n) => page.locator(`[data-pdf-page-thumb="${n}"]`);
  const run = async (label, fn) => {
    log(label, "before", JSON.stringify(await flags()));
    await fn();
    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(500);
      const f = await flags();
      if (f !== "STAGE GONE" && f.busy === "false") break;
    }
    log(label, "after", JSON.stringify(await flags()));
  };
  await run("rotate p2", async () => {
    await thumb(2).hover();
    await page.waitForTimeout(300);
    const button = page.locator('[data-pdf-page-rotate="2"]');
    log("rotate visible", await button.isVisible(), JSON.stringify(await button.boundingBox()));
    await button.click();
  });
  await shot("rail-rotate");
  await run("drag p3 onto p1", async () => {
    await thumb(3).dragTo(thumb(1));
  });
  await run("delete p2", async () => {
    await thumb(2).hover();
    await page.waitForTimeout(300);
    await page.locator('[data-pdf-page-delete="2"]').click();
  });
  await shot("rail-delete");
  await run("undo", async () => {
    await page.locator("[data-global-history-undo]").first().click();
  });
  await shot("rail-undo");
  log("save", await saveTrace(page, helpers, log, "after rail", 60000));
}
