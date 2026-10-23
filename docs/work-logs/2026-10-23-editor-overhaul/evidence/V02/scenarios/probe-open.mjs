// V02 probe: open /library?item=<id>, list controls; then click the first visible
// "Edit"/"编辑" control and list controls again.  args: <artifactId> [clickLabelRegex]
const listControls = async (page) =>
  page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    return [...document.querySelectorAll("button, a, [role=button], [role=tab], [role=menuitem], [contenteditable=true], iframe, canvas")]
      .filter(visible)
      .map((el) => {
        const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
        const r = el.getBoundingClientRect();
        const data = el.getAttributeNames().filter((a) => a.startsWith("data-")).map((a) => `${a}=${(el.getAttribute(a) || "").slice(0, 40)}`).join(" ");
        return `${el.tagName.toLowerCase()} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] "${label}" ${data}`.slice(0, 260);
      });
  });

export default async function ({ page, log, shot, helpers, args }) {
  const [id, clickRe = "^(Edit|编辑)$"] = args;
  await helpers.gotoApp(page, `/library?item=${id}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const loading = await page.getByText(/Loading My Library|正在加载我的库|加载中/).first().isVisible().catch(() => false);
    if (!loading) break;
    await page.waitForTimeout(1000);
  }
  log("library loaded after", Math.round((Date.now() - t0) / 1000), "s");
  await page.waitForTimeout(6000);
  await shot("open-1");
  log("url", page.url());
  for (const c of await listControls(page)) log("ctl1", c);
  const re = new RegExp(clickRe);
  const byAttr = page.locator("[data-artifact-action=edit]").first();
  const target = (await byAttr.count()) ? byAttr : page.locator("button, a").filter({ hasText: re }).first();
  if (await target.count()) {
    await target.click();
    log("clicked", clickRe);
    await page.waitForTimeout(12000);
    await shot("open-2");
    log("url2", page.url());
    for (const c of await listControls(page)) log("ctl2", c);
  } else {
    log("no control matching", clickRe);
  }
}
