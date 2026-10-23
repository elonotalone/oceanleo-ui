// W11 debug: save state timeline across two consecutive edits.
import { openVideoEditor, selectClip } from "./w11-lib.mjs";

async function trace(page, helpers, log, label, ms) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < ms) {
    const state = (await helpers.saveState(page)) || "";
    const text = await page.locator("[data-workspace-save-launcher]").first().getAttribute("aria-label").catch(() => "");
    const now = `${state}|${text}`;
    if (now !== last) log(label, `${Math.round((Date.now() - started) / 100) / 10}s`, now);
    last = now;
    await page.waitForTimeout(300);
  }
}

export default async function ({ page, log, helpers, args }) {
  page.on("request", (request) => {
    if (/\/v1\/artifacts\/[^/]+\/(revisions|staging)|database\/upload/.test(request.url())) log("req", request.method(), request.url().replace(/^.*\/v1\//, ""));
  });
  page.on("response", (response) => {
    if (/\/v1\/artifacts\/[^/]+\/(revisions|staging)/.test(response.url())) log("res", response.status(), response.url().replace(/^.*\/v1\//, ""));
  });
  await openVideoEditor(page, helpers, log, args[0]);
  await selectClip(page);
  await page.locator(`[data-selection-control-id="${args[1] || "flip-y"}"] button`).first().click();
  await trace(page, helpers, log, "A", 60000);
  await selectClip(page);
  await page.locator(`[data-selection-control-id="${args[2] || "muted"}"] button`).first().click();
  await trace(page, helpers, log, "B", 60000);
}
