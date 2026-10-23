// W07 layout probe: heights of the deck editor's ancestor chain (stage collapsing to rail height).
// args: <artifactId> [tag]
export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, tag = "layout"] = args;
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  await page.locator("[data-deck-thumbnail-rail], [data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
  await page.waitForTimeout(1500);
  if (!(await page.locator("[data-workspace-save-launcher]").count())) {
    const name = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => b.getAttribute("aria-label") || b.title || "")
        .find((label) => /^编辑「|^Edit /.test(label)),
    );
    if (name) await page.getByRole("button", { name, exact: true }).first().click();
  }
  await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 150000 });
  await page.getByText(/Loading presentation|正在载入演示文稿/).first().waitFor({ state: "hidden", timeout: 150000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const chain = await page.evaluate(() => {
    const out = [];
    let el = document.querySelector("[data-deck-preview-stage]") || document.querySelector("[data-deck-canvas]");
    while (el && el !== document.body && out.length < 22) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const attrs = [...el.attributes]
        .filter((a) => a.name.startsWith("data-"))
        .map((a) => a.name)
        .join(",");
      out.push(`${el.tagName.toLowerCase()} h=${Math.round(r.height)} top=${Math.round(r.top)} disp=${cs.display} flex=${cs.flex} hcss=${cs.height} minh=${cs.minHeight} [${attrs}] .${String(el.className).slice(0, 120)}`);
      el = el.parentElement;
    }
    return out;
  });
  for (const line of chain) log("chain", line);
  await shot(`${tag}-open`);
}
