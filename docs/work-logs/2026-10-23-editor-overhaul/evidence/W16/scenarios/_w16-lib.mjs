// Shared helpers for W16 scenarios (video canvas, acceptance account only).
export const OWN_FORK = "1d2dbe1f-4507-4c7a-91dd-8612baf10b5f"; // 验收账号自己的「观点解说·四段反转」副本

export async function openCanvas(page, helpers, log, id = OWN_FORK) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  const stage = page.locator("[data-video-project-stage=v2]").first();
  if (!(await stage.isVisible().catch(() => false))) {
    const edit = page.locator('[aria-label^="编辑「"], [aria-label^="Edit “"], [aria-label^="Edit \\""]').first();
    await edit.waitFor({ timeout: 90000 }).catch(() => {});
    if (await edit.count()) await edit.click({ timeout: 10000 }).catch(() => edit.evaluate((el) => el.click()));
  }
  await stage.waitFor({ timeout: 120000 });
  await page.locator(".react-flow__node").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  log("opened", page.url());
}

export async function canvasInfo(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-editor-adapter]");
    const canvas = document.querySelector("[data-canvas-theme]");
    return {
      url: location.href,
      adapter: root?.getAttribute("data-editor-adapter") || null,
      pluginTheme: root?.getAttribute("data-plugin-theme") || null,
      canvasTheme: canvas?.getAttribute("data-canvas-theme") || null,
      canvasBg: canvas ? getComputedStyle(canvas).backgroundColor : null,
      nodeBg: (() => {
        const n = document.querySelector("[data-testid=video-canvas-node]");
        return n ? getComputedStyle(n).backgroundColor : null;
      })(),
      nodes: [...document.querySelectorAll("[data-testid=video-canvas-node]")].map((n) => ({
        id: n.getAttribute("data-node-id"),
        text: (n.textContent || "").trim().slice(0, 60),
        rect: (() => { const r = n.closest(".react-flow__node").getAttribute("style") || ""; return r.match(/translate\(([^)]+)\)/)?.[1] || ""; })(),
      })),
      edges: document.querySelectorAll(".react-flow__edge").length,
      minimap: Boolean(document.querySelector(".react-flow__minimap")),
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      stageText: (document.querySelector("[data-testid=workflow-react-flow-stage]")?.textContent || "").trim().slice(0, 200),
    };
  });
}

export async function editBarButtons(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-workspace-edit-bar] button, [data-edit-bar] button, [role=toolbar] button")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)),
  );
}
