// W09 §5.3: open a public image → first edit makes ONE copy in my library, the editor and the
// address bar move to it, later saves land in the same copy.
// Usage: mint.sh | OUT_DIR=/tmp/w09-f node harness/run.mjs evidence/W09/scenarios/w09-fork.mjs <publicRootId>
export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.on("response", (response) => {
    const m = response.request().method();
    const url = response.url();
    if (m !== "GET" && /\/v1\/artifacts|\/v1\/database/.test(url)) log("net", stamp(), m, url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 100), response.status());
    else if (response.status() >= 400 && /\/v1\//.test(url)) log("http-error", stamp(), m, url.replace(/^https?:\/\/[^/]+/, "").slice(0, 80), response.status());
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) log("nav", stamp(), frame.url().replace(/^https?:\/\/[^/]+/, ""));
  });
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  for (let i = 0; i < 60 && !(await page.locator("[data-editor-loading='false']").count()); i += 1) {
    const edit = page.locator('button[aria-label*="Edit"], button[aria-label*="编辑"]').first();
    if (await edit.isVisible().catch(() => false)) await edit.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  log("opened", stamp(), new URL(page.url()).search);
  await shot("fork-open");
  for (const id of ["flip-x", "flip-y", "flip-x"]) {
    const box = await page.locator("[data-editor-loading] canvas").first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
    await page.locator(`[data-selection-control-id="${id}"] button`).first().click();
    log("edit", stamp(), id);
    const started = Date.now();
    while (Date.now() - started < 8000 && (await helpers.saveState(page)) === "saved") await page.waitForTimeout(200);
    await helpers.waitSaved(page, { timeout: 120000 }).then(
      () => log("saved", stamp(), new URL(page.url()).search),
      (e) => log("save-failed", stamp(), String(e)),
    );
  }
  await shot("fork-after");
}
