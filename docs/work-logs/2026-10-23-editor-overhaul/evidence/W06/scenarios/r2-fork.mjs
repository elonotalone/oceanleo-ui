// R2 §5.3: open a public material PDF → first change forks ONE copy into my library, editor + URL move to it;
// the second change saves into the same copy. args: <publicArtifactId>
import { openPdf, pageBox, tool, saveTrace, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/v1\/artifacts/.test(request.url())) log("REQ", request.method(), request.url().replace(/\?.*$/, "").slice(0, 130));
  });
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  log("url0", page.url());
  for (const [index, id, x, y] of [[1, "pdf-tool-check", 80, 300], [2, "pdf-tool-cross", 140, 300]]) {
    const box = await pageBox(page, 0);
    await tool(page, id);
    await page.mouse.click(box.x + x * box.scale, box.y + y * box.scale);
    await page.waitForTimeout(600);
    await tool(page, id);
    log(`save#${index}`, await saveTrace(page, helpers, log, `fork change ${index}`, 90000), "url", page.url());
  }
  await shot("fork-after");
}
