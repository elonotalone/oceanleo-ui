// W07 §5.2: the library card of a saved deck shows its title and a real first-slide thumbnail.
// args: <search text>
export default async function ({ page, log, shot, helpers, args }) {
  const [query = "W07"] = args;
  await helpers.gotoApp(page, "/library");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const retry = page.locator("[data-library-retry]:visible").first();
    if (!(await retry.count())) break;
    await retry.click().catch(() => {});
    await page.waitForTimeout(8000);
  }
  const search = page.locator('input[type=search], input[placeholder*="search" i], input[placeholder*="搜索"]').first();
  if (await search.count()) {
    await search.fill(query);
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(3000);
  const cards = await page.evaluate((needle) => {
    return [...document.querySelectorAll("article, [data-library-item], [data-artifact-id], li")]
      .filter((el) => (el.textContent || "").includes(needle))
      .slice(0, 6)
      .map((el) => {
        const img = el.querySelector("img");
        return {
          text: (el.textContent || "").replace(/\s+/g, " ").slice(0, 80),
          img: img ? { src: (img.currentSrc || img.src || "").slice(0, 100), w: img.naturalWidth, h: img.naturalHeight } : null,
        };
      });
  }, query);
  log("cards", JSON.stringify(cards));
  await shot("card");
}
