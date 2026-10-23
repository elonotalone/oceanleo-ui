import assert from "node:assert/strict";
import { openPdf, firstPage } from "./_w06-lib.mjs";

export default async function ({ page, helpers, log, shot, args }) {
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  await page.waitForFunction((text) => {
    const root = document.querySelector("[data-pdf-stage] embedpdf-container")?.shadowRoot;
    return [...(root?.querySelectorAll("span[tabindex]") || [])].some((e) => e.textContent === text) &&
      [...(root?.querySelectorAll("img") || [])].some((e) => e.complete && e.naturalWidth > 400);
  }, args[1], { timeout: 60000 });
  await shot("reopen-basic");
  const instance = await page.locator("[data-pdf-viewer-instance]").getAttribute("data-pdf-viewer-instance");
  await page.locator("button,[role=tab]").filter({ hasText: /^(Pro edit|专业编辑)$/ }).first().click();
  await page.waitForTimeout(800);
  assert.equal(await page.locator("[data-pdf-viewer-instance]").getAttribute("data-pdf-viewer-instance"), instance);
  assert.equal(await page.locator("[data-mode-switch-pending]").count(), 0);
  await shot("reopen-pro");
  log("PASS same-instance mode switch and persisted text", args[1]);
}
