import assert from "node:assert/strict";
import path from "node:path";
import { openPdf, firstPage, pageBox, tool } from "./_w06-lib.mjs";

// Single owner / single browser. Fail on missing focus, false save, or lost text.
export default async function ({ page, helpers, log, shot, args, outDir }) {
  const [id, text = "Chen 张三 2026"] = args;
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (/pdfium-fonts/.test(url.pathname)) log("font", response.status(), url.pathname);
    if (/\/revisions$|\/snapshot$/.test(url.pathname)) log("write", response.status(), response.request().method(), url.pathname);
  });
  const contents = () => page.evaluate(() => {
    const root = document.querySelector("[data-pdf-stage] embedpdf-container")?.shadowRoot;
    return [...(root?.querySelectorAll("span[tabindex]") || [])].map((e) => e.textContent);
  });
  const rendered = () => page.waitForFunction(() => {
    const root = document.querySelector("[data-pdf-stage] embedpdf-container")?.shadowRoot;
    return [...(root?.querySelectorAll("img") || [])].some((e) => e.complete && e.naturalWidth > 400);
  }, null, { timeout: 60000 });
  const waitText = () => page.waitForFunction((value) => {
    const root = document.querySelector("[data-pdf-stage] embedpdf-container")?.shadowRoot;
    return [...(root?.querySelectorAll("span[tabindex]") || [])].some((e) => e.textContent === value);
  }, text, { timeout: 60000 });
  const diagnostic = () => page.evaluate(() => {
    const root = document.querySelector("[data-pdf-stage] embedpdf-container")?.shadowRoot;
    return { images: [...(root?.querySelectorAll("img") || [])].map((e) => ({ complete: e.complete, width: e.naturalWidth, src: e.src.split(":")[0] })),
      canvases: [...(root?.querySelectorAll("canvas") || [])].map((e) => [e.width, e.height]),
      focus: root?.activeElement?.outerHTML.slice(0, 250) };
  });
  await openPdf(page, helpers, log, id);
  await firstPage(page);
  await rendered();
  log("initial", JSON.stringify(await diagnostic()));
  await shot("before");
  const box = await pageBox(page, 0);
  log("page", JSON.stringify(box));
  assert.ok(box);
  await tool(page, "pdf-tool-text");
  await page.mouse.click(box.x + 230 * box.scale, box.y + Number(args[2] || 350) * box.scale);
  await page.waitForFunction(() => document.querySelector("[data-pdf-stage] embedpdf-container")?.shadowRoot?.activeElement?.isContentEditable, null, { timeout: 10000 });
  await page.keyboard.insertText(text);
  log("typing", JSON.stringify(await contents()));
  await page.mouse.click(box.x + 430 * box.scale, box.y + 500 * box.scale);
  await page.waitForTimeout(1000);
  log("after-blur", JSON.stringify(await contents()), JSON.stringify(await diagnostic()));
  assert.ok((await contents()).includes(text), "clicking away lost the typed text");
  await helpers.waitSaved(page, { timeout: 90000 });
  assert.equal(await helpers.saveState(page), "saved");
  await shot("saved");
  await page.locator("button[aria-label*='More'],button[aria-label*='更多']").first().click();
  const menu = page.getByRole("menuitem", { name: /^(Download|下载)/ }).first();
  await menu.hover();
  await menu.click().catch(() => {});
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /PDF/ }).last().click()]);
  await download.saveAs(path.join(outDir, "download.pdf"));
  await page.keyboard.press("Escape");
  await helpers.gotoApp(page, "/library");
  await openPdf(page, helpers, log, id);
  await firstPage(page);
  await waitText();
  await rendered();
  log("reopen", JSON.stringify(await contents()), JSON.stringify(await diagnostic()));
  assert.ok((await contents()).includes(text), "close and reopen lost the typed text");
  await shot("reopened");
  await page.reload({ waitUntil: "domcontentloaded" });
  await openPdf(page, helpers, log, id);
  await firstPage(page);
  await waitText();
  await rendered();
  assert.ok((await contents()).includes(text), "reload lost the typed text");
  await shot("reloaded");
}
