// R2: download the open PDF through ··· → Download and save it to OUT_DIR/download.pdf. args: <artifactId>
import fs from "node:fs";
import path from "node:path";
import { openPdf } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args, outDir }) {
  await openPdf(page, helpers, log, args[0]);
  await page.locator("button[aria-label*='More'], button[aria-label*='更多']").first().click();
  await page.waitForTimeout(500);
  const item = page.getByRole("menuitem", { name: /^(Download|下载)/ }).first();
  await item.hover();
  await item.click().catch(() => {});
  await page.waitForTimeout(800);
  log("menu after download", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((el) => (el.textContent || "").trim().slice(0, 40)))));
  await shot("download-menu");
  const target = page.getByRole("menuitem", { name: /PDF/ }).last();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), target.click()]);
  const file = path.join(outDir, "download.pdf");
  await download.saveAs(file);
  log("downloaded", file, fs.statSync(file).size, "bytes", download.suggestedFilename());
}
