import { openPdf, pageBox, tool, saveTrace } from "./_w06-lib.mjs";
const flags = (page) => page.evaluate(() => {
  const el = document.querySelector("[data-pdf-dirty]");
  return el ? Object.fromEntries(el.getAttributeNames().filter((n) => n.startsWith("data-pdf") || n.startsWith("data-collab")).map((n) => [n, el.getAttribute(n)])) : null;
});
// args: <artifactId>
export default async function ({ page, log, helpers, args }) {
  await openPdf(page, helpers, log, args[0]);
  log("flags0", JSON.stringify(await flags(page)), "save", await helpers.saveState(page));
  const box = await pageBox(page, 0);
  await tool(page, "pdf-tool-check");
  await page.mouse.click(box.x + 77 * box.scale, box.y + 191 * box.scale);
  await page.waitForTimeout(1500);
  log("flags1", JSON.stringify(await flags(page)), "save", await helpers.saveState(page));
  await page.keyboard.press("Escape");
  await saveTrace(page, helpers, log, "after check", 60000);
  log("flags2", JSON.stringify(await flags(page)));
}
