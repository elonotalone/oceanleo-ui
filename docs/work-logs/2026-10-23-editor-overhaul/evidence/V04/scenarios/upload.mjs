// V04: upload the [V04] fixtures into the acceptance account's library.
// args: absolute file paths. Clicks the library's own Retry when the list failed to load
// (the slot is shared by the whole wave and occasionally drops a request).
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("no files");
  await helpers.gotoApp(page, "/library");
  const input = page.locator("input[type=file]").first();
  await input.waitFor({ state: "attached", timeout: 90000 });
  const started = Date.now();
  while (await input.isDisabled().catch(() => true)) {
    if (Date.now() - started > 180000) throw new Error("upload input never enabled");
    const retry = page.locator("[data-library-retry]").first();
    if (await retry.isVisible().catch(() => false)) {
      log("library load failed; clicking Retry");
      await retry.click().catch(() => {});
      await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(1000);
  }
  for (const file of args) {
    await input.setInputFiles([file]);
    await page.waitForTimeout(1500);
    const t0 = Date.now();
    while (Date.now() - t0 < 180000) {
      const busy = await page
        .getByText(/上传中…|Uploading…/)
        .first()
        .isVisible()
        .catch(() => false);
      if (!busy && !(await input.isDisabled().catch(() => true))) break;
      await page.waitForTimeout(1000);
    }
    log("uploaded", file.split("/").pop(), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await page.waitForTimeout(3000);
  await shot("library-after-upload");
}
