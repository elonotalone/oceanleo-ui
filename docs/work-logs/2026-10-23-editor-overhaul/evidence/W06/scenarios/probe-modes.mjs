import { openPdf, viewerChrome, editBar } from "./_w06-lib.mjs";
// args: <artifactId>
export default async function ({ page, log, shot, helpers, args }) {
  await openPdf(page, helpers, log, args[0]);
  await shot("basic");
  log("basic chrome", JSON.stringify(await viewerChrome(page)));
  log("basic editbar", JSON.stringify(await editBar(page)));
  const inst1 = await page.locator("[data-pdf-viewer-instance]").getAttribute("data-pdf-viewer-instance");
  const pro = page.getByRole("tab", { name: /专业编辑|Pro/ }).first();
  const proAlt = page.locator("button, [role=tab]").filter({ hasText: /^专业编辑$/ }).first();
  const target = (await pro.count()) ? pro : proAlt;
  log("pro tab count", await target.count());
  await target.click();
  await page.waitForTimeout(300);
  log("pending after switch", await page.locator("[data-mode-switch-pending]").count());
  await page.waitForTimeout(2000);
  const inst2 = await page.locator("[data-pdf-viewer-instance]").getAttribute("data-pdf-viewer-instance");
  log("same instance", inst1 === inst2, inst1, inst2);
  await shot("pro");
  log("pro chrome", JSON.stringify(await viewerChrome(page)));
  const basic = page.locator("button, [role=tab]").filter({ hasText: /^编辑$/ }).first();
  await basic.click();
  await page.waitForTimeout(1500);
  log("back basic chrome", JSON.stringify(await viewerChrome(page)));
  log("instance after return", await page.locator("[data-pdf-viewer-instance]").getAttribute("data-pdf-viewer-instance"));
}
