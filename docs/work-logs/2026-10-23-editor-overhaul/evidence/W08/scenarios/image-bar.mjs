// W08: insert an image from 素材库 into the document (click = insert), then exercise the
// unified image bar on it (radius / opacity / border / duplicate / delete) and undo.
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w08-img THEME=light \
//     node harness/run.mjs evidence/W08/scenarios/image-bar.mjs <artifactId> <label>
const BODY = ".oleo-richdoc";
const BAR = "[data-selection-visible-controls]";

async function open(page, helpers, id) {
  const body = page.locator(BODY).first();
  // The dev slot's library list sometimes fails to load ("暂时无法加载我的库"); retry the route.
  for (let attempt = 1; ; attempt += 1) {
    await helpers.gotoApp(page, `/library?item=${encodeURIComponent(id)}`);
    if (await body.waitFor({ state: "visible", timeout: 25000 }).then(() => true, () => false)) break;
    const edit = page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ })
      .or(page.getByRole("button", { name: /^(编辑|Edit)/ })).first();
    if (await edit.click({ timeout: 30000 }).then(() => true, () => false)) {
      await body.waitFor({ state: "visible", timeout: 120000 });
      break;
    }
    if (attempt >= 3) throw new Error("document did not open after 3 attempts");
  }
  await page.locator("[role=region][aria-busy=false]").first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return body;
}

const images = (page) => page.locator(`${BODY} img`);
const control = (page, id) =>
  page.locator(`${BAR} [data-selection-control-id="${id}"], ${BAR} [data-edit-bar-canon="${id}"]`).first();

async function imageStyle(page, index = 0) {
  return images(page).nth(index).evaluate((img) => {
    const wrap = img.closest("[data-node-view-wrapper], figure, span, div") || img;
    return { img: img.getAttribute("style") || "", wrap: wrap === img ? "" : wrap.getAttribute("style") || "" };
  }).catch(() => null);
}

export default async function ({ page, log, shot, helpers, args }) {
  const [id, label = "doc"] = args;
  const body = await open(page, helpers, id);
  page.setDefaultTimeout(10000);
  const before = await images(page).count();
  // Caret at the end so the insert lands there.
  await body.click();
  await page.keyboard.press("Control+End");
  await page.locator('[data-workspace-library-panel="materials"]').first().click();
  const pane = page.locator("[data-editor-fallback-pane], [data-workspace-pane='left'][data-left-panel='tool-detail']").first();
  await pane.waitFor({ state: "visible", timeout: 30000 });
  // The pane can reopen on a remembered detail view; go back to the shelf first.
  await page.waitForTimeout(2000);
  if (!(await pane.locator("[draggable='true']").count())) {
    await pane.getByRole("button", { name: /返回列表|Back to list|Back/i }).first().click().catch((e) => log("warn", "no back", String(e).slice(0, 80)));
    await page.waitForTimeout(1500);
  }
  const loadedBy = Date.now() + 40000;
  while (Date.now() < loadedBy) {
    const loading = await pane.locator("[data-material-shelf-state='loading']").count();
    const cards = await pane.locator("[draggable='true']").count();
    if (!loading && cards) break;
    await page.waitForTimeout(1000);
  }
  const titles = await pane.locator("[draggable='true']").evaluateAll((cards) =>
    cards.slice(0, 8).map((c) => (c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 50)));
  log("material-cards", JSON.stringify(titles));
  await shot(`${label}-img-0-materials`);
  let feedback = null;
  if (await pane.locator("[draggable='true']").count()) {
    await pane.locator("[draggable='true']").first().click();
    for (let i = 0; i < 20 && !feedback; i++) {
      await page.waitForTimeout(500);
      feedback = await page.evaluate(() => {
        const el = document.querySelector("[data-material-insert-feedback]");
        return el ? { kind: el.getAttribute("data-material-insert-feedback"), text: el.textContent } : null;
      });
    }
  } else {
    // No image on the material shelf: insert through the document's own Insert drawer (upload).
    feedback = { kind: "fallback-insert-drawer" };
    await page.locator("button").filter({ hasText: /^(插入|Insert)$/ }).first().click();
    await page.waitForTimeout(1200);
    await body.click();
    await page.keyboard.press("Control+End");
    const input = page.locator("input[type=file][accept='image/*']").first();
    await input.setInputFiles(args[2] || "/tmp/w08-r2-fx/[W08] 图.png");
    await images(page).nth(before).waitFor({ timeout: 60000 }).catch(() => log("warn", "upload insert timed out"));
  }
  await page.waitForTimeout(1500);
  const after = await images(page).count();
  log("insert", JSON.stringify({ feedback, before, after }));
  await shot(`${label}-img-1-inserted`);
  if (after <= before) return;

  // Undo removes the inserted image, redo brings it back (editor history).
  await body.click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  const undone = await images(page).count();
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(500);
  log("insert-undo-redo", JSON.stringify({ undone, redone: await images(page).count() }));

  const last = after - 1;
  await images(page).nth(last).click();
  await page.waitForTimeout(800);
  const bar = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el && { bar: el.getAttribute("data-edit-bar-bar"), kind: el.getAttribute("data-selection-kind"),
      visible: el.getAttribute("data-selection-visible-controls"), overflow: el.getAttribute("data-selection-overflow-controls") };
  }, BAR);
  log("image-bar", JSON.stringify(bar));
  await shot(`${label}-img-2-bar`);

  const results = {};
  const run = async (name, fn, check) => {
    try {
      await images(page).nth(last).click();
      await page.waitForTimeout(500);
      const pre = await imageStyle(page, last);
      await fn();
      await page.waitForTimeout(700);
      const post = await imageStyle(page, last);
      results[name] = { ok: check(pre, post), pre, post };
    } catch (error) {
      results[name] = { ok: false, error: String(error).slice(0, 200) };
    }
    log("click", name, JSON.stringify(results[name]));
  };
  const numberInput = async (id, value) => {
    const target = control(page, id);
    const input = target.locator("input").first();
    if (await input.count()) {
      await input.fill(String(value));
      await input.press("Enter");
    } else {
      await target.click();
      const panelInput = page.locator("[data-selection-inspector] input, [role=dialog] input").filter({ visible: true }).first();
      await panelInput.fill(String(value));
      await panelInput.press("Enter");
    }
  };
  const changed = (pre, post) => JSON.stringify(pre) !== JSON.stringify(post);
  await run("radius", () => numberInput("radius", 24), (pre, post) => changed(pre, post) && /radius/.test(JSON.stringify(post)));
  await run("opacity", async () => {
    const target = control(page, "opacity");
    const range = target.locator("input[type=range]").first();
    if (await range.count()) await range.fill("40");
    else {
      await target.click();
      await page.locator("[data-selection-inspector] input[type=range], [role=dialog] input[type=range]").filter({ visible: true }).first().fill("40");
    }
  }, (pre, post) => changed(pre, post) && /opacity/.test(JSON.stringify(post)));
  await run("border", async () => {
    await control(page, "border").click();
    await page.waitForTimeout(600);
    await shot(`${label}-img-3-border-panel`);
    const width = page.locator("[data-selection-inspector] input[type=number], [data-selection-inspector] input:not([type=color])").filter({ visible: true }).first();
    await width.fill("4");
    await width.press("Enter");
  }, (pre, post) => changed(pre, post) && /border/.test(JSON.stringify(post)));
  await page.keyboard.press("Escape");
  const count0 = await images(page).count();
  await run("duplicate", () => control(page, "duplicate").click(), () => true);
  const count1 = await images(page).count();
  results.duplicate.ok = count1 === count0 + 1;
  log("duplicate-count", count0, count1);
  await run("delete", () => control(page, "delete").click(), () => true);
  const count2 = await images(page).count();
  results.delete.ok = count2 === count1 - 1;
  log("delete-count", count1, count2);
  await shot(`${label}-img-4-after`);
  log("summary", JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.ok]))));
}
