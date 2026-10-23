// W14 probe: open a website-source@1 material in the website editor and record what is on screen.
// args[0] = artifact root id (default: platform 「鞋靴资讯内容站」).
import { openWebsite, websiteInfo, visibleButtons, PUBLIC_WEBSITE } from "./_w14-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  const rootId = args[0] || PUBLIC_WEBSITE;
  const ready = await openWebsite(page, log, helpers, rootId);
  await shot("01-open");
  log("open", JSON.stringify(await websiteInfo(page)));
  log("buttons", JSON.stringify(await visibleButtons(page)));
  if (!ready) return;
  const colors = await page.evaluate(() => {
    const first = document.querySelector("[data-testid^='website-section-']");
    const preview = document.querySelector("[data-testid='website-normal-preview']");
    const cs = (el) => (el ? { color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor } : null);
    return {
      section: cs(first),
      preview: cs(preview),
      figures: [...document.querySelectorAll("[data-testid^='website-section-'] figure")]
        .slice(0, 3)
        .map((el) => el.textContent?.trim().slice(0, 80)),
    };
  });
  log("colors", JSON.stringify(colors));
  const heading = page.locator("[data-testid^='website-section-'] h2").first();
  if (await heading.count()) {
    await heading.click({ timeout: 10000 }).catch((error) => log("heading-click-failed", String(error).slice(0, 200)));
    await page.waitForTimeout(1500);
    await shot("02-heading-clicked");
    log("after-heading-click", JSON.stringify(await websiteInfo(page)));
  }
}
