import assert from "node:assert/strict";

export default async function ({ page, helpers, log, shot, args }) {
  const title = args[0] || "[W07] sample.pptx";
  await helpers.gotoApp(page, "/library");
  // The server-rendered input exists before client hydration, which resets an
  // early fill. Wait for the live collection before entering the filter.
  await page.waitForTimeout(6000);
  const search = page.locator('input[type=search],input[placeholder*="search" i],input[placeholder*="搜索"]').first();
  await search.waitFor({ timeout: 60000 });
  await search.fill("W07");
  await page.waitForTimeout(1500);
  if (await search.inputValue() !== "W07") await search.fill("W07");
  log("library filter", await search.inputValue());
  const label = page.getByText(title, { exact: true }).first();
  await label.waitFor({ timeout: 60000 });
  await label.scrollIntoViewIfNeeded();
  const handle = await label.elementHandle();
  await page.waitForFunction((el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if ((node.textContent || "").length > 400) break;
      const img = node.querySelector("img");
      if (img) return img.complete && img.naturalWidth > 0;
    }
    return false;
  }, handle, { timeout: 60000 });
  const image = await label.evaluate((el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if ((node.textContent || "").length > 400) break;
      const img = node.querySelector("img");
      if (img) return { width: img.naturalWidth, height: img.naturalHeight };
    }
    return { width: 0, height: 0 };
  });
  assert.ok(image.width > 0 && image.height > 0);
  await shot("library-card");
  log("PASS saved deck library card title and loaded cover", title, JSON.stringify(image));
}
