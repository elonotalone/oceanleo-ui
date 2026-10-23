// V02 probe: for each <name>=<artifactId>, open /library?item=<id>, press Edit, wait,
// screenshot and list visible controls (plus request hosts).  args: name=id …
const listControls = async (page) =>
  page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const rows = [...document.querySelectorAll("button, a, input, select, [role=button], [role=tab], [role=menuitem], [role=slider], [contenteditable=true], iframe, canvas, video, audio")]
      .filter(visible)
      .filter((el) => el.getBoundingClientRect().x > 260)
      .map((el) => {
        const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
        const r = el.getBoundingClientRect();
        const data = el.getAttributeNames().filter((a) => a.startsWith("data-") && !a.startsWith("data-leo-button")).map((a) => `${a}=${(el.getAttribute(a) || "").slice(0, 30)}`).join(" ");
        const extra = el.tagName === "IFRAME" ? ` src=${(el.getAttribute("src") || "").slice(0, 80)}` : "";
        return `${el.tagName.toLowerCase()} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] "${label}" ${data}${extra}`.slice(0, 240);
      });
    return rows;
  });

export default async function ({ page, log, shot, helpers, args }) {
  const hosts = new Set();
  page.on("request", (req) => {
    try { hosts.add(new URL(req.url()).host); } catch {}
  });
  for (const pair of args) {
    const [name, id] = pair.split("=");
    await helpers.gotoApp(page, `/library?item=${id}`);
    const t0 = Date.now();
    const edit = page.locator("[data-artifact-action=edit]").first();
    await edit.waitFor({ timeout: 90000 }).catch(() => {});
    log(name, "detail after", Math.round((Date.now() - t0) / 1000), "s");
    if (!(await edit.count())) {
      await shot(`${name}-nodetail`);
      continue;
    }
    await edit.click();
    await page.locator("[data-workspace-save-launcher]").first().waitFor({ timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(8000);
    await shot(`${name}-editor`);
    log(name, "url", page.url());
    for (const c of await listControls(page)) log(name, "ctl", c);
  }
  log("hosts", [...hosts].sort().join(" "));
}
