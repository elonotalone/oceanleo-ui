// R2 D6/D7: every PDF surface in the current THEME — basic, tool palette, find bar, signature dialog,
// selected annotation bar, pro. args: <artifactId> <prefix>
import { openPdf, pageBox, tool, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  const prefix = args[1] || "theme";
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const colors = () => page.evaluate(() => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return { rail: pick("[data-pdf-page-rail]"), stage: pick("[data-pdf-stage]"), bar: pick("[data-workspace-edit-bar]") };
  });
  log("colors", JSON.stringify(await colors()));
  await shot(`${prefix}-basic`);
  await tool(page, "pdf-tool-highlight");
  await shot(`${prefix}-tool-palette`);
  await tool(page, "pdf-tool-highlight");
  await tool(page, "pdf-tool-find");
  await page.getByRole("textbox", { name: /在文档里查找|Find in document/ }).fill("paragraph");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  await shot(`${prefix}-find`);
  await page.keyboard.press("Escape");
  await tool(page, "pdf-tool-signature");
  await page.waitForTimeout(600);
  await shot(`${prefix}-signature`);
  await page.getByRole("button", { name: /取消|Cancel/ }).first().click().catch(() => page.keyboard.press("Escape"));
  const box = await pageBox(page, 0);
  if (box) {
    await page.mouse.click(box.x + 77 * box.scale, box.y + 191 * box.scale);
    await page.waitForTimeout(800);
    await shot(`${prefix}-selected`);
    await page.keyboard.press("Escape");
  }
  await page.locator("button, [role=tab]").filter({ hasText: /^(专业编辑|Pro edit)$/ }).first().click();
  await page.waitForTimeout(2000);
  await shot(`${prefix}-pro`);
}
