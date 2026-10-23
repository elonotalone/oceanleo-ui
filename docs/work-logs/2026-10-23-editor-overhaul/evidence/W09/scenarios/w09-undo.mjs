// W09: does undo hold when it lands while the save of the undone edit is still in flight?
// Usage: mint.sh | OUT_DIR=/tmp/w09-u node harness/run.mjs evidence/W09/scenarios/w09-undo.mjs <rootId>
export default async function ({ page, context, log, helpers, args, shot }) {
  const [rootId] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.on("response", (r) => {
    if (r.request().method() !== "GET" && /revisions|snapshot/.test(r.url())) log("net", stamp(), r.request().method(), r.url().replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 80), r.status());
  });
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  for (let i = 0; i < 60 && !(await page.locator("[data-editor-loading='false']").count()); i += 1) {
    const retry = page.locator("[data-library-retry]").first();
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
    const edit = page.locator('button[aria-label*="Edit"], button[aria-label*="编辑"]').first();
    if (await edit.isVisible().catch(() => false)) await edit.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(4000);
  const probe = () => page.evaluate(() => {
    const root = document.querySelector("[data-editor-loading]");
    const canvas = root?.querySelector("canvas.lower-canvas");
    const url = canvas ? canvas.toDataURL("image/png") : "";
    let hash = 0;
    for (let i = 0; i < url.length; i += 97) hash = (hash * 31 + url.charCodeAt(i)) | 0;
    const launcher = document.querySelector("[data-workspace-save-launcher]");
    return `hash=${hash} state=${launcher?.getAttribute("data-save-state")} ${["dirty", "revision", "collab-tick", "remote-delta", "layer-count"].map((k) => `${k}=${root?.getAttribute(`data-editor-${k}`)}`).join(" ")}`;
  });
  const select = async () => {
    const box = await page.locator("[data-editor-loading] canvas").first().boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.waitForTimeout(600);
  };
  const undo = () => page.locator('[data-global-row-slot="history"] button').first().click();
  log("start", stamp(), await probe());
  for (const mode of ["after-save", "during-save"]) {
    await select();
    await page.locator('[data-selection-control-id="flip-x"] button').first().click();
    log(mode, "flipped", stamp(), await probe());
    if (mode === "after-save") await helpers.waitSaved(page, { timeout: 120000 }).catch(() => {});
    else await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    await undo();
    log(mode, "undone", stamp(), await probe());
    await page.waitForTimeout(1500);
    const started = Date.now();
    while (Date.now() - started < 120000 && (await helpers.saveState(page)) !== "saved") await page.waitForTimeout(500);
    await page.waitForTimeout(4000);
    log(mode, "settled", stamp(), await probe());
  }
  await shot("undo-end");
}
