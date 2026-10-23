// W09 two themes + edit bars: library card, empty-state drawers, image bar + adjust panel,
// text layer bar, shape bar. Logs the visible/overflow control ids for every selection.
// Usage: mint.sh | OUT_DIR=/tmp/w09-t THEME=dark node harness/run.mjs evidence/W09/scenarios/w09-theme.mjs <rootId> <label>
export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId, label = "t"] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  const bar = async (tag) => {
    const info = await page.evaluate(() => {
      const el = document.querySelector("[data-selection-visible-controls]");
      return el
        ? { kind: el.getAttribute("data-selection-kind"), visible: el.getAttribute("data-selection-visible-controls"), overflow: el.getAttribute("data-selection-overflow-controls") }
        : { empty: [...document.querySelectorAll("button")].filter((b) => b.closest("[data-edit-bar-empty-state], [data-edit-bar-drawers]")).map((b) => b.textContent.trim()).slice(0, 12) };
    });
    log("bar", tag, JSON.stringify(info));
  };
  const surfaces = async (tag) => {
    // Light islands: big white surfaces in dark mode (the picture itself is allowed to keep its colours).
    const found = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("[data-inline-editor] *")) {
        if (el.closest("canvas") || el.tagName === "CANVAS" || el.tagName === "svg" || el.closest("svg")) continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 6000) continue;
        const bg = getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/);
        if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) continue;
        if (Number(m[1]) + Number(m[2]) + Number(m[3]) > 690) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} ${Math.round(r.width)}x${Math.round(r.height)} ${bg}`);
      }
      return out.slice(0, 8);
    });
    log("light-surfaces", tag, JSON.stringify(found));
  };
  await helpers.gotoApp(page, "/library");
  await page.waitForTimeout(9000);
  await shot(`${label}-library`);
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  for (let i = 0; i < 60 && !(await page.locator("[data-editor-loading='false']").count()); i += 1) {
    const edit = page.locator('button[aria-label*="Edit"], button[aria-label*="编辑"]').first();
    if (await edit.isVisible().catch(() => false)) await edit.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  const canvas = page.locator("[data-editor-loading] canvas").first();
  const box = await canvas.boundingBox();
  // Empty state: click the stage margin (outside the picture).
  const stage = await page.locator("[data-editor-loading]").first().boundingBox();
  await page.mouse.click(stage.x + 8, stage.y + stage.height - 60);
  await page.waitForTimeout(800);
  await bar("empty");
  await shot(`${label}-empty`);
  await surfaces("empty");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  await bar("image");
  await shot(`${label}-image-bar`);
  const adjust = page.locator('[data-selection-control-id="adjust"] button').first();
  if (await adjust.count()) {
    await adjust.click();
    await page.waitForTimeout(800);
    await shot(`${label}-adjust`);
    await surfaces("adjust");
    await page.keyboard.press("Escape");
  }
  const drawer = async (name) => {
    const button = page.locator("button").filter({ hasText: name }).first();
    if (!(await button.count())) return log("drawer-missing", String(name));
    await button.click();
    await page.waitForTimeout(1200);
    await shot(`${label}-drawer-${String(name).replace(/[^a-z]/gi, "").slice(0, 8) || "x"}`);
    await surfaces(`drawer ${name}`);
  };
  await page.mouse.click(stage.x + 8, stage.y + stage.height - 60);
  await drawer(/^(Text|文字)$/);
  log("drawer-text-buttons", JSON.stringify(await page.locator("[data-workspace-pane='left'] button, [data-editor-fallback-pane] button").allTextContents().then((t) => t.map((x) => x.trim()).filter(Boolean).slice(0, 12))));
  await page.mouse.click(stage.x + 8, stage.y + stage.height - 60);
  await drawer(/^(Shape|形状)$/);
  log("drawer-shape-buttons", JSON.stringify(await page.locator("[data-workspace-pane='left'] button, [data-editor-fallback-pane] button").allTextContents().then((t) => t.map((x) => x.trim()).filter(Boolean).slice(0, 12))));
}
