// W02: open a file editor in a host, click 素材库 / 我的库 and record where the panel landed.
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w02-probe THEME=light node harness/run.mjs \
//     evidence/W02/scenarios/probe-left-panels.mjs <route> [label]
// <route> e.g. "/library?item=<artifactId>".
export default async function ({ page, log, shot, helpers, args }) {
  const route = args[0] || "/library";
  const label = args[1] || "host";
  await helpers.gotoApp(page, route);
  const editor = page.locator("[data-inline-editor]").first();
  // /library?item= lands on the read-only preview; its pencil opens the editor.
  const pencil = page
    .locator('button[aria-label*="Edit"], button[aria-label*="编辑"], button[title*="Edit"], button[title*="编辑"], a[aria-label*="Edit"], a[aria-label*="编辑"]')
    .first();
  await page.waitForTimeout(3000);
  log("header-buttons", JSON.stringify(await page.$$eval("button[aria-label], a[aria-label]", (els) => els.slice(0, 30).map((e) => e.getAttribute("aria-label")))));
  const openBy = Date.now() + 180000;
  while (Date.now() < openBy && !(await editor.isVisible().catch(() => false))) {
    if (await pencil.isVisible().catch(() => false)) await pencil.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await editor.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(4000);
  await shot(`${label}-0-open`);

  const probe = (step) =>
    page.evaluate((stepName) => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        let hiddenBy = "";
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const s = getComputedStyle(n);
          if (n.hasAttribute("inert")) { hiddenBy = hiddenBy || `inert:${n.tagName}${n.dataset.workspacePane ? `[pane=${n.dataset.workspacePane}]` : ""}`; }
          if (n.getAttribute("aria-hidden") === "true") { hiddenBy = hiddenBy || `aria-hidden:${n.tagName}`; }
          if (s.display === "none") { hiddenBy = hiddenBy || `display-none:${n.tagName}.${String(n.className).slice(0, 40)}`; }
          if (Number(s.opacity) === 0) { hiddenBy = hiddenBy || `opacity0:${n.tagName}${n.dataset.workspacePane ? `[pane=${n.dataset.workspacePane}]` : ""}`; }
        }
        return {
          w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x),
          opacity: cs.opacity, inert: el.hasAttribute("inert"),
          ariaHidden: el.getAttribute("aria-hidden"), hiddenBy,
        };
      };
      const panes = [...document.querySelectorAll("[data-workspace-pane]")].map((el) => ({
        pane: el.dataset.workspacePane, leftPanel: el.dataset.leftPanel || "",
        state: el.dataset.workspacePaneState || "", ...box(el),
      }));
      const buttons = [...document.querySelectorAll("[data-workspace-library-panel]")].map((el) => ({
        id: el.dataset.workspaceLibraryPanel, pressed: el.getAttribute("aria-pressed"),
      }));
      return {
        step: stepName,
        url: location.pathname + location.search,
        host: document.querySelector("[data-library-editor-host]")?.dataset.libraryEditorHost || "",
        split: Boolean(document.querySelector("[data-workspace-split]")),
        panes,
        buttons,
        materialsPanel: box(document.querySelector("[data-workspace-local-upload]") || document.querySelector("[data-material-shelf-state], [data-materials-panel]")),
        minePanel: box(document.querySelector("[data-inline-editor-mine-panel]")),
        fallbackPane: box(document.querySelector("[data-editor-fallback-pane]")),
        toolsTrigger: box(document.querySelector("[data-editor-tools-trigger]")),
        editBar: (document.querySelector("[data-workspace-edit-bar]")?.innerText || "").replace(/\s+/g, " ").slice(0, 200),
        documentSegment: [...document.querySelectorAll("[data-edit-bar-document-segment] button")].map((b) => b.innerText.trim()),
      };
    }, step);

  log("probe", JSON.stringify(await probe("before")));
  for (const id of ["materials", "mine"]) {
    const button = page.locator(`[data-workspace-library-panel="${id}"]`).first();
    if (!(await button.count())) { log("missing-button", id); continue; }
    await button.click();
    await page.waitForTimeout(1500);
    await shot(`${label}-1-${id}`);
    log("probe", JSON.stringify(await probe(`after-${id}`)));
  }
  // Second click on the open panel closes it (toggle).
  const mine = page.locator('[data-workspace-library-panel="mine"]').first();
  if (await mine.count()) {
    await mine.click();
    await page.waitForTimeout(1200);
    log("probe", JSON.stringify(await probe("after-mine-second-click")));
  }
  // Deselect: Escape, then click an empty corner of the stage.
  await page.keyboard.press("Escape").catch(() => {});
  const stage = await page.locator("[data-advanced-viewport-row]").first().boundingBox().catch(() => null);
  if (stage) await page.mouse.click(stage.x + 12, stage.y + stage.height - 12);
  // Decks keep a page rail on the left; the empty canvas to the right of the slide deselects there.
  if (stage) await page.mouse.click(stage.x + stage.width - 40, stage.y + stage.height / 2);
  // Optional args[2] = "fx,fy": an empty spot inside the page (fractions of the stage), e.g. a slide's blank area.
  if (stage && args[2]) {
    const [fx, fy] = args[2].split(",").map(Number);
    await page.mouse.click(stage.x + stage.width * fx, stage.y + stage.height * fy);
  }
  // Focus is on the stage now; Escape there leaves text editing, a second one drops the selection.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1200);
  await shot(`${label}-2-deselected`);
  log("selection-kind", await page.evaluate(() => [...document.querySelectorAll("[data-selection-kind]")].map((e) => e.getAttribute("data-selection-kind")).join(",")));
  log("edit-bar-after-deselect", (await page.locator("[data-workspace-edit-bar]").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
  // D3: labeled drawer buttons in the empty-state edit bar.
  const drawerIds = await page.$$eval("[data-edit-bar-drawer]", (els) => els.map((e) => `${e.dataset.editBarDrawer}:${e.innerText.trim()}`));
  log("edit-bar-drawers", JSON.stringify(drawerIds));
  const firstDrawer = page.locator("[data-edit-bar-drawer]").first();
  if (await firstDrawer.count()) {
    await firstDrawer.click();
    await page.waitForTimeout(1500);
    await shot(`${label}-3-drawer`);
    log("probe", JSON.stringify(await probe("after-drawer")));
    log("drawer-pressed", await firstDrawer.getAttribute("aria-pressed"));
  }
  const tools = page.locator("[data-editor-tools-trigger]").first();
  if (await tools.count()) {
    await tools.click().catch((e) => log("tools-click-failed", String(e).slice(0, 200)));
    await page.waitForTimeout(1500);
    await shot(`${label}-2-tools`);
    log("probe", JSON.stringify(await probe("after-tools")));
  } else {
    log("tools-trigger", "absent");
  }
}
