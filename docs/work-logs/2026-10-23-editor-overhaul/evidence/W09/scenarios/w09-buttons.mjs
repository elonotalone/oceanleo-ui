// W09 _EDITOR.md A.4: click every top-level button of the image bar on the base image.
// For each: did the canvas pixels or layer count change, did a panel/menu open, does undo bring it back?
// Usage: mint.sh | OUT_DIR=/tmp/w09-b node harness/run.mjs evidence/W09/scenarios/w09-buttons.mjs <rootId>
export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  for (let i = 0; i < 60 && !(await page.locator("[data-editor-loading='false']").count()); i += 1) {
    const retry = page.locator("[data-library-retry]").first();
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
    const edit = page.locator('button[aria-label*="Edit"], button[aria-label*="编辑"]').first();
    if (await edit.isVisible().catch(() => false)) await edit.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  const state = () => page.evaluate(() => {
    const root = document.querySelector("[data-editor-loading]");
    const canvas = root?.querySelector("canvas.lower-canvas") || root?.querySelector("canvas");
    let hash = 0;
    try {
      const url = canvas.toDataURL("image/png");
      for (let i = 0; i < url.length; i += 97) hash = (hash * 31 + url.charCodeAt(i)) | 0;
    } catch {
      hash = -1;
    }
    return {
      hash,
      layers: root?.getAttribute("data-editor-layer-count"),
      kind: root?.getAttribute("data-editor-selected-kind"),
      locked: root?.getAttribute("data-editor-selected-locked"),
      popups: document.querySelectorAll("[role=menu], [role=listbox], [role=dialog], [data-selection-inspector-panel], aside[data-left-panel], [data-workspace-pane='left']").length,
    };
  });
  const selectBase = async () => {
    const box = await page.locator("[data-editor-loading] canvas").first().boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.waitForTimeout(700);
  };
  const undo = async () => {
    await page.locator('[data-global-row-slot="history"] button').first().click().catch(() => {});
    await page.waitForTimeout(1500);
  };
  await selectBase();
  const ids = await page.evaluate(() =>
    (document.querySelector("[data-selection-visible-controls]")?.getAttribute("data-selection-visible-controls") || "").split(" ").filter(Boolean),
  );
  log("controls", ids.join(" "));
  // replace: opens the material panel on the left (the stage shrinks, so pixels are not compared).
  if (ids.includes("replace")) {
    await page.locator('[data-selection-control-id="replace"] button').first().click();
    await page.waitForTimeout(2500);
    const pane = await page.getByText(/Upload from your computer|从本地上传/).first().isVisible().catch(() => false);
    log("control", "replace", JSON.stringify({ materialPanelOpen: pane }));
    await shot("btn-replace");
    await page.locator('[data-workspace-library-panel="materials"]').first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  // crop: enters crop mode (apply / ratio / cancel), cancel leaves it untouched.
  if (ids.includes("crop")) {
    await selectBase();
    const before = await state();
    await page.locator('[data-selection-control-id="crop"] button').first().click();
    await page.waitForTimeout(1500);
    const cropIds = await page.evaluate(() => document.querySelector("[data-selection-visible-controls]")?.getAttribute("data-selection-visible-controls") || "");
    await shot("btn-crop");
    await page.locator('[data-selection-control-id="crop-cancel"] button').first().click().catch(() => log("crop-cancel-missing"));
    await page.waitForTimeout(1500);
    const back = await state();
    log("control", "crop", JSON.stringify({ cropBar: cropIds, cancelRestored: back.hash === before.hash && back.layers === before.layers }));
  }
  for (const id of ids) {
    if (id === "delete" || id === "replace" || id === "crop") continue;
    await selectBase();
    const before = await state();
    const button = page.locator(`[data-selection-control-id="${id}"] button, [data-selection-control-id="${id}"] [role=combobox], [data-selection-control-id="${id}"] select`).first();
    if (!(await button.count())) {
      log("control", id, "no-button");
      continue;
    }
    await button.click().catch((e) => log("click-failed", id, String(e).slice(0, 80)));
    await page.waitForTimeout(1500);
    const after = await state();
    const changed = after.hash !== before.hash || after.layers !== before.layers || after.locked !== before.locked;
    const opened = after.popups > before.popups;
    await shot(`btn-${id}`);
    let restored = "n/a";
    if (changed) {
      await page.keyboard.press("Escape").catch(() => {});
      await undo();
      const back = await state();
      restored = String(back.hash === before.hash && back.layers === before.layers && back.locked === before.locked);
    } else if (opened) {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
    }
    log("control", id, JSON.stringify({ changed, opened, restored, before: [before.layers, before.locked], after: [after.layers, after.locked] }));
  }
  // duplicate → delete the duplicate → layer count back
  await selectBase();
  const start = await state();
  await page.locator('[data-selection-control-id="duplicate"] button').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const duplicated = await state();
  await page.locator('[data-selection-control-id="delete"] button').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const deleted = await state();
  log("duplicate-delete", JSON.stringify({ start: start.layers, duplicated: duplicated.layers, deleted: deleted.layers }));
  await helpers.waitSaved(page, { timeout: 120000 }).then(() => log("saved-end"), (e) => log("save-end", String(e)));
}
