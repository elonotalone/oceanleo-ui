// R3: 加文字 like tools-basic (click → type → click elsewhere) → saved → download (pypdf check) → reopen.
// Logs every /pdfium-fonts request. args: <artifactId> [text]
import fs from "node:fs";
import path from "node:path";
import { openPdf, pageBox, tool, saveTrace, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args, outDir }) {
  const text = args[1] || "Zhang San 张三";
  page.on("request", (request) => {
    if (/pdfium-fonts|\.ttf|\.otf/.test(request.url())) log("FONT REQ", request.url().slice(0, 160));
  });
  page.on("console", (message) => {
    if (/font|Font|annotation|FreeText/.test(message.text())) log("console", message.type(), message.text().slice(0, 300));
  });
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const box = await pageBox(page, 0);
  const at = (x, y) => [box.x + x * box.scale, box.y + y * box.scale];
  await tool(page, "pdf-tool-text");
  await page.mouse.click(...at(120, Number(args[2] || 132)));
  await page.waitForTimeout(800);
  await page.keyboard.type(text);
  await page.waitForTimeout(500);
  log("editing dom", JSON.stringify(await page.evaluate(() => {
    const host = [...document.querySelectorAll("[data-pdf-stage] *")].find((el) => el.shadowRoot);
    const nodes = host ? [...host.shadowRoot.querySelectorAll("[contenteditable], textarea")] : [];
    return nodes.map((el) => (el.value ?? el.textContent ?? "").slice(0, 80));
  })));
  await shot("r3-editing");
  await page.mouse.click(...at(400, 500));
  await page.waitForTimeout(1500);
  await shot("r3-after-blur");
  log("save", await saveTrace(page, helpers, log, "text", 60000));
  await page.waitForTimeout(3000);
  await page.locator("button[aria-label*='More'], button[aria-label*='更多']").first().click();
  await page.waitForTimeout(500);
  const menu = page.getByRole("menuitem", { name: /^(Download|下载)/ }).first();
  await menu.hover();
  await menu.click().catch(() => {});
  await page.waitForTimeout(800);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("menuitem", { name: /PDF/ }).last().click()]);
  const file = path.join(outDir, "download.pdf");
  await download.saveAs(file);
  log("downloaded", fs.statSync(file).size);
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  await shot("r3-reopened");
}
