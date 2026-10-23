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
  await editor.waitFor({ state: "visible", timeout: 180000 });
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
