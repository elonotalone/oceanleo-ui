// W08: after saving, do the [W08] document cards show title + first lines (text card, no spinner)?
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w08-cards THEME=light node harness/run.mjs evidence/W08/scenarios/library-cards.mjs
export default async function ({ page, log, shot, helpers }) {
  page.on("requestfailed", (request) => {
    if (!/_next|__nextjs/.test(request.url())) log("reqfail", new URL(request.url()).pathname.slice(0, 90), request.failure()?.errorText || "");
  });
  page.on("response", (response) => {
    if (response.status() >= 400) log("http", String(response.status()), new URL(response.url()).pathname.slice(0, 90));
  });
  await helpers.gotoApp(page, "/library");
  const search = page.locator("input[type=search], input[placeholder*='搜索'], input[placeholder*='Search']").first();
  if (await search.isVisible({ timeout: 15000 }).catch(() => false)) {
    await search.fill("[W08]");
    await page.keyboard.press("Enter");
  } else {
    log("warn", "no search box");
  }
  await page.waitForTimeout(Number(process.env.CARD_WAIT_MS || 20000));
  await shot("library-w08-cards");
  const cards = await page.evaluate(() => {
    const out = [];
    for (const cover of document.querySelectorAll("[data-document-cover]")) {
      const card = cover.closest("[data-library-item], [data-artifact-id], article, li, a, button") || cover.parentElement;
      const text = (card?.textContent || "").replace(/\s+/g, " ").trim();
      if (!text.includes("[W08]")) continue;
      out.push({
        cover: cover.getAttribute("data-document-cover"),
        source: cover.getAttribute("data-document-excerpt-source"),
        spinner: Boolean(card?.querySelector("[role=progressbar], .animate-spin")),
        img: Boolean(cover.querySelector("img")),
        text: text.slice(0, 160),
      });
    }
    return out;
  });
  for (const card of cards) log("card", JSON.stringify(card));
  log("count", String(cards.length));
}
