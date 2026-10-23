// W13: upload the given 3D fixture(s) into the acceptance account's library.
// args: <file> [file…]  (copy fixtures to /tmp/w13/"[W13] name.ext" first)
// The shared slot recompiles whenever any owner saves a file, so first wait for
// the library to finish loading (up to 4 min) before the helper's 60 s clock.
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("usage: upload.mjs <file> [file…]");
  await helpers.gotoApp(page, "/library");
  const started = Date.now();
  while (Date.now() - started < 240000) {
    const loading = await page
      .getByText(/Loading My Library…|正在加载我的库…|Compiling/)
      .first()
      .isVisible()
      .catch(() => false);
    const enabled = await page
      .locator("input[type=file]")
      .first()
      .isEnabled()
      .catch(() => false);
    if (!loading && enabled) break;
    await page.waitForTimeout(2000);
  }
  log("library ready after", Math.round((Date.now() - started) / 1000), "s");
  await helpers.uploadFiles(page, args);
  await page.waitForTimeout(3000);
  await shot("after-upload");
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("[data-library-item], [data-artifact-id]")]
      .slice(0, 8)
      .map((el) => ({
        id: el.getAttribute("data-artifact-id") || el.getAttribute("data-library-item"),
        text: (el.textContent || "").trim().slice(0, 80),
      })),
  );
  log("cards", JSON.stringify(cards));
}
