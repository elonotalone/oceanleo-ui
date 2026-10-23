// R2: signature stamp then save; report the editor's own error and the save menu text. args: <artifactId>
import { openPdf, tool, saveTrace, firstPage } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  page.on("response", async (response) => {
    if (response.status() < 400 || !/\/v1\//.test(response.url())) return;
    log("HTTP", response.status(), response.request().method(), response.url().replace(/\?.*$/, "").slice(0, 120), (await response.text().catch(() => "")).slice(0, 300));
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") log("console", message.type(), message.text().slice(0, 300));
  });
  await openPdf(page, helpers, log, args[0]);
  await firstPage(page);
  const flags = () => page.evaluate(() => {
    const el = document.querySelector("[data-pdf-revision]");
    return el ? { rev: el.getAttribute("data-pdf-revision"), dirty: el.getAttribute("data-pdf-dirty"), error: el.getAttribute("data-pdf-error") } : null;
  });
  await tool(page, "pdf-tool-signature");
  await page.getByRole("tab", { name: /^(打字|Type)$/ }).first().click();
  await page.getByPlaceholder(/Type your name|输入/).first().fill("Li Si");
  await page.getByRole("button", { name: /存下并放到页面|Save and place/ }).first().click();
  await page.waitForTimeout(1500);
  log("after place", JSON.stringify(await flags()));
  const result = await saveTrace(page, helpers, log, "signature", 60000);
  log("result", result, JSON.stringify(await flags()));
  if (result !== "saved") {
    await page.locator("[data-workspace-save-launcher]").first().click();
    await page.waitForTimeout(600);
    log("save menu", JSON.stringify(await page.locator("[data-workspace-save-menu]").first().innerText().catch(() => "")));
  }
  await shot("sig-save");
}
