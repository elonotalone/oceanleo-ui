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
  const focus = () => page.evaluate(() => {
    const chain = [];
    let root = document;
    for (let i = 0; i < 5 && root; i += 1) {
      const el = root.activeElement;
      if (!el) break;
      chain.push(`${el.tagName.toLowerCase()}${el.isContentEditable ? "[ce]" : ""}`);
      root = el.shadowRoot;
    }
    return chain.join(" > ");
  });
  log("focus while typing", await focus());
  await page.mouse.click(...at(400, 500));
  await page.waitForTimeout(1500);
  await shot("r3-after-blur");
  log("focus after click elsewhere", await focus());
  const spans = () => page.evaluate(() => {
    const host = [...document.querySelectorAll("[data-pdf-stage] *")].find((el) => el.shadowRoot);
    return host ? [...host.shadowRoot.querySelectorAll("span[tabindex]")].map((el) => el.textContent.slice(0, 40)) : null;
  });
  log("before esc", JSON.stringify(await spans()), "rev", await page.evaluate(() => document.querySelector("[data-pdf-revision]")?.getAttribute("data-pdf-revision")));
  if (args[3] !== "no-esc") await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  log("after esc rev", await page.evaluate(() => document.querySelector("[data-pdf-revision]")?.getAttribute("data-pdf-revision")));
  log("contents in viewer", JSON.stringify(await page.evaluate(() => {
    const host = [...document.querySelectorAll("[data-pdf-stage] *")].find((el) => el.shadowRoot);
    return host ? [...host.shadowRoot.querySelectorAll("span[tabindex]")].map((el) => el.textContent.slice(0, 40)) : null;
  })));
  log("save", await saveTrace(page, helpers, log, "text", 60000));
  await page.waitForTimeout(3000);
  await shot("r3-after-save");
  const [cx, cy] = at(120, Number(args[2] || 132));
  await page.screenshot({ path: path.join(outDir, "r3-after-save-crop.png"), clip: { x: cx - 120, y: cy - 30, width: 360, height: 60 } });
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
  await page.waitForTimeout(5000);
  await shot("r3-reopened");
  const box2 = await pageBox(page, 0);
  if (box2) {
    const y = box2.y + Number(args[2] || 132) * box2.scale;
    const x = box2.x + 120 * box2.scale;
    await page.screenshot({ path: path.join(outDir, "r3-reopened-crop.png"), clip: { x: x - 120, y: y - 30, width: 360, height: 60 } });
  }
}
