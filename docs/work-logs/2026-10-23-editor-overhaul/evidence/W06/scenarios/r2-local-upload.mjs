// R2 D2: 素材库 → 从本地上传 an image → stamp on the current page (revision +1), undo removes it.
// args: <artifactId> <png path>
import { openPdf, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const rev = () => page.evaluate(() => document.querySelector("[data-pdf-revision]")?.getAttribute("data-pdf-revision"));
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  await page.waitForTimeout(2500);
  const before = await rev();
  const input = page.locator("[data-editor-fallback-pane] input[type=file], [data-workspace-local-upload] input[type=file]").first();
  log("file inputs", await input.count(), await input.getAttribute("accept").catch(() => ""));
  const chooser = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
  if (!(await input.count())) await page.getByRole("button", { name: /Upload from your computer|从本地上传/ }).first().click();
  const picked = await chooser;
  if (picked) await picked.setFiles(args[1]);
  else await input.setInputFiles(args[1]);
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(500);
    if ((await rev()) !== before) break;
  }
  log("revision", before, "→", await rev(), "feedback", JSON.stringify(await page.evaluate(() => document.querySelector("[data-material-insert-feedback]")?.textContent?.trim() || null)));
  await shot("local-upload-stamp");
  await page.locator("[data-global-history-undo]").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  log("after undo", await rev());
  await shot("local-upload-undo");
}
