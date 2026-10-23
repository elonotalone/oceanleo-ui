// W09 §5.2: the library card of the edited image shows the latest revision.
// Usage: mint.sh | OUT_DIR=/tmp/w09-c THEME=light node harness/run.mjs evidence/W09/scenarios/w09-card.mjs "[W09] sample" <label>
export default async function ({ page, context, log, shot, helpers, args }) {
  const [needle = "[W09] sample", label = "card"] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  await helpers.gotoApp(page, "/library");
  for (let i = 0; i < 20; i += 1) {
    const retry = page.locator("[data-library-retry]").first();
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
    if (await page.locator("input[type=search], input[placeholder*='search' i], input[placeholder*='搜索']").first().isEnabled().catch(() => false)) break;
    await page.waitForTimeout(2000);
  }
  await page.locator("input[type=search], input[placeholder*='search' i], input[placeholder*='搜索']").first().fill(needle);
  for (let i = 0; i < 30; i += 1) {
    const loading = await page.getByText(/Loading My Library|正在加载/).first().isVisible().catch(() => false);
    const retry = page.locator("[data-library-retry]").first();
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
    if (!loading && (await page.locator("main img").count())) break;
    await page.waitForTimeout(2000);
  }
  await page.locator("input[type=search], input[placeholder*='search' i], input[placeholder*='搜索']").first().fill(needle);
  await page.waitForTimeout(6000);
  const imgs = await page.locator("main img").evaluateAll((list) => list.slice(0, 6).map((img) => `${img.alt}|${img.naturalWidth}x${img.naturalHeight}|${img.complete}`));
  log("card-images", JSON.stringify(imgs));
  await shot(`${label}-library-search`);
}
