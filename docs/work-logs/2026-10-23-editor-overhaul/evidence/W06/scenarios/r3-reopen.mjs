// R3: just open a PDF and screenshot page 1 (after the viewer settles). args: <artifactId>
import { openPdf, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  page.on("request", (request) => { if (/pdfium-fonts/.test(request.url())) log("FONT REQ", request.url().slice(-40)); });
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  await page.waitForTimeout(5000);
  await shot("reopen");
}
