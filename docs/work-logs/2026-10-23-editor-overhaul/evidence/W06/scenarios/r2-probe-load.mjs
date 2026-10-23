// R2: open a PDF and report what the stage shows (alert text, viewer instance, network failures). args: <artifactId>
export default async function ({ page, log, shot, helpers, args }) {
  const failed = [];
  page.on("requestfailed", (request) => failed.push(`${request.failure()?.errorText} ${request.url().slice(0, 160)}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && /pdfium|wasm|embedpdf|_next\/static/.test(response.url())) failed.push(`${response.status()} ${response.url().slice(0, 160)}`);
  });
  await helpers.gotoApp(page, `/library?item=${args[0]}`);
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < 120000) {
    const info = await page.evaluate(() => ({
      stage: Boolean(document.querySelector("[data-pdf-stage]")),
      instance: document.querySelector("[data-pdf-viewer-instance]")?.getAttribute("data-pdf-viewer-instance") || "",
      alerts: [...document.querySelectorAll("[role=alert], [data-plugin-chrome-status], .text-\\[var\\(--awb-danger\\)\\]")].map((el) => el.textContent.trim().slice(0, 300)),
      status: [...document.querySelectorAll("[data-pdf-stage] [role=status]")].map((el) => el.textContent.trim()),
      shadow: Boolean([...document.querySelectorAll("[data-pdf-stage] *")].find((el) => el.shadowRoot)),
    }));
    const line = JSON.stringify(info);
    if (line !== last) log("state", line);
    last = line;
    if (!info.stage) {
      const edit = page.locator("[data-artifact-action=edit]").first();
      if (await edit.count().catch(() => 0)) await edit.click().catch(() => {});
    }
    if (info.shadow && !info.status.length) break;
    if (info.alerts.some((text) => /PDF|内核|wasm|PDFium/i.test(text))) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(3000);
  await shot("load");
  log("failed requests", JSON.stringify(failed.slice(0, 20)));
}
