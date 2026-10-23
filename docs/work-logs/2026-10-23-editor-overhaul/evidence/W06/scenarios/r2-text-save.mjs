// R2: add text (latin, then CJK) and save; log API errors, page errors and the visible status. args: <artifactId>
import { openPdf, pageBox, tool, saveTrace, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  page.on("response", async (response) => {
    if (response.status() < 400 || !/\/v1\//.test(response.url())) return;
    log("HTTP", response.status(), response.request().method(), response.url().replace(/\?.*$/, "").slice(0, 140), (await response.text().catch(() => "")).slice(0, 400));
  });
  page.on("console", (message) => {
    if (/pdf|PDF|save|保存|annotation|engine|pdfium/i.test(message.text())) log("console", message.type(), message.text().slice(0, 400));
  });
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const box = await pageBox(page, 0);
  log("box", JSON.stringify(box));
  const at = (x, y) => [box.x + x * box.scale, box.y + y * box.scale];
  const status = () => page.evaluate(() => [...document.querySelectorAll("[data-plugin-chrome-status], [data-workspace-status], [role=status], [role=alert]")].map((el) => el.textContent.trim()).filter(Boolean).slice(0, 5));
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/v1\/(artifacts|database|creations)/.test(request.url())) log("REQ", request.method(), request.url().replace(/\?.*$/, "").slice(0, 120));
  });
  const texts = args[1] ? [args[1]] : ["Zhang San", "张三 签字"];
  for (const text of texts) {
    await tool(page, "pdf-tool-text");
    await page.mouse.click(...at(125, text === "Zhang San" ? 128 : 158));
    await page.waitForTimeout(800);
    await page.keyboard.type(text);
    await page.waitForTimeout(400);
    await page.mouse.click(...at(450, 420));
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    const result = await saveTrace(page, helpers, log, `text ${text}`, 60000);
    log("after", text, result, JSON.stringify(await status()));
    const title = await page.locator("[data-workspace-save-launcher]").first().getAttribute("title").catch(() => "");
    log("launcher title", title);
    if (result === "error") {
      await page.locator("[data-workspace-save-launcher]").first().click();
      await page.waitForTimeout(600);
      log("save menu", JSON.stringify(await page.locator("[data-workspace-save-menu]").first().innerText().catch(() => "")));
    }
    await shot(`text-${text === "Zhang San" ? "latin" : "cjk"}`);
  }
}
