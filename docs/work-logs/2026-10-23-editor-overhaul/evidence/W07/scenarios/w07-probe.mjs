// W07 probe: open a deck from My library, report edit-bar controls per selection and theme surfaces.
// args: <artifactId> [tag]
export default async function ({ page, log, shot, helpers, args }) {
  const [artifactId, tag = "probe"] = args;
  if (!artifactId) throw new Error("artifact id required");
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && /\/v1\/|\/api\//.test(url)) {
      log("http", response.status(), url.replace(/access\/[^/?]+/, "access/…").slice(0, 160));
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (/\/v1\/|\/api\//.test(url)) log("reqfail", request.failure()?.errorText || "", url.slice(0, 160));
  });
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);
  await shot(`${tag}-open`);

  const surfaces = () =>
    page.evaluate(() => {
      const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
      const pick = (selector) => document.querySelector(selector);
      const rail = pick("[data-deck-thumbnail-rail]");
      const stage = pick("[data-deck-preview-stage]");
      const layout = pick("[data-deck-preview-layout]");
      const bar = pick("[data-edit-bar-row]") || pick("[data-selection-kind]");
      const theme = pick("[data-plugin-theme]");
      return {
        html: document.documentElement.className,
        pluginTheme: theme?.getAttribute("data-plugin-theme") || null,
        rail: bg(rail),
        railParent: bg(rail?.parentElement),
        stage: bg(stage),
        layout: bg(layout),
        bar: bar ? getComputedStyle(bar).backgroundColor : null,
        canvas: bg(pick("[data-deck-canvas]")),
      };
    });
  log("surfaces", JSON.stringify(await surfaces()));

  const barInfo = () =>
    page.evaluate(() => {
      const kind = document.querySelector("[data-selection-kind]");
      const buttons = [...document.querySelectorAll("[data-selection-control-id]")].map((el) => {
        const button = el.querySelector("button, input, [role=combobox]");
        return `${el.getAttribute("data-selection-control-id")}=${
          button?.getAttribute("aria-label") || button?.getAttribute("title") || (el.textContent || "").trim().slice(0, 20)
        }`;
      });
      return {
        kind: kind?.getAttribute("data-selection-kind") || null,
        visible: kind?.getAttribute("data-selection-visible-controls") || "",
        overflow: kind?.getAttribute("data-selection-overflow-controls") || "",
        triggers: document.querySelectorAll("[data-editor-tools-trigger]").length,
        buttons,
      };
    });
  log("bar-empty", JSON.stringify(await barInfo()));

  const types = await page.evaluate(() =>
    [...document.querySelectorAll("[data-deck-canvas] [data-deck-element]")].map(
      (el) => `${el.getAttribute("data-element-type")}:${el.getAttribute("data-deck-element")}`,
    ),
  );
  log("elements", JSON.stringify(types));
  for (const type of ["text", "image", "shape"]) {
    const target = page.locator(`[data-deck-canvas] [data-deck-element][data-element-type=${type}]`).first();
    if (!(await target.count())) {
      log(`no ${type} element on slide 1`);
      continue;
    }
    await target.click({ force: true });
    await page.waitForTimeout(1200);
    await shot(`${tag}-select-${type}`);
    log(`bar-${type}`, JSON.stringify(await barInfo()));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
}
