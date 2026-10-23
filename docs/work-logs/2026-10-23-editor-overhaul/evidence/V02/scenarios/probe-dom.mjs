// V02 probe: open a route, screenshot, list visible buttons/links and data-* attributes.
// args: [route] [waitMs] [shotName]
export default async function ({ page, log, shot, helpers, args }) {
  const route = args[0] || "/library";
  const waitMs = Number(args[1] || 6000);
  await helpers.gotoApp(page, route);
  await page.waitForTimeout(waitMs);
  await shot(args[2] || "probe");
  const info = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const attrs = new Set();
    for (const el of document.querySelectorAll("*")) {
      for (const a of el.getAttributeNames()) if (a.startsWith("data-")) attrs.add(a);
    }
    const controls = [...document.querySelectorAll("button, a, [role=button], [role=tab], [role=menuitem]")]
      .filter(visible)
      .map((el) => {
        const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
        const r = el.getBoundingClientRect();
        const data = el.getAttributeNames().filter((a) => a.startsWith("data-")).map((a) => `${a}=${el.getAttribute(a)}`).join(" ");
        return `${el.tagName.toLowerCase()} [${Math.round(r.x)},${Math.round(r.y)}] "${label}" ${data}`.slice(0, 220);
      });
    return { url: location.href, controls: controls.slice(0, 120), dataAttrs: [...attrs].sort() };
  });
  log("url", info.url);
  for (const c of info.controls) log("ctl", c);
  log("data-attrs", info.dataAttrs.join(" "));
}
