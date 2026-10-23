// W16 R0: open a public video-canvas template the way a user does and record what is on screen.
// args[0] = public workflow artifact id (default: 观点解说·四段反转).
const PUBLIC_ID = "9a864741-f446-49ba-8b8c-f33f69d776f1";

async function visibleButtons(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, a[role=button]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 100),
  );
}

async function settle(page, log, timeout = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const loading = await page
      .getByText(/Loading My Library…|正在加载我的库|Loading…/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!loading) return true;
    await page.waitForTimeout(1000);
  }
  log("settle", "library still loading after", String(timeout));
  return false;
}

export default async function ({ page, log, shot, helpers, args }) {
  const id = args[0] || PUBLIC_ID;
  await helpers.gotoApp(page, `/library?item=${id}`);
  await settle(page, log);
  await page.waitForTimeout(6000);
  await shot("r0-01-item-route");
  log("url", page.url());
  log("buttons", JSON.stringify(await visibleButtons(page)));
  const editor = page.locator("[data-editor-adapter=video-canvas]").first();
  if (!(await editor.isVisible().catch(() => false))) {
    const edit = page.locator('[aria-label^="编辑「"], [aria-label^="Edit “"]').first();
    const count = await edit.count();
    log("edit-candidates", String(count));
    if (count > 0) {
      log("click", "edit button", (await edit.evaluate((el) => el.outerHTML.slice(0, 200))) || "");
      await edit.click({ timeout: 10000 }).catch(async (error) => {
        log("click-failed", String(error).slice(0, 200));
        await edit.evaluate((el) => el.click());
      });
      await page.locator("[data-editor-adapter]").first().waitFor({ timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(8000);
    }
  }
  await shot("r0-02-editor");
  const info = await page.evaluate(() => {
    const root = document.querySelector("[data-editor-adapter]");
    const stage = document.querySelector("[data-testid=workflow-react-flow-stage]");
    return {
      url: location.href,
      adapter: root?.getAttribute("data-editor-adapter") || null,
      pluginTheme: root?.getAttribute("data-plugin-theme") || null,
      stageText: (stage?.textContent || "").trim().slice(0, 300),
      nodes: document.querySelectorAll(".react-flow__node").length,
      edges: document.querySelectorAll(".react-flow__edge").length,
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      editBar: (document.querySelector("[data-workspace-edit-bar]")?.textContent || "").trim().slice(0, 200),
      htmlClass: document.documentElement.className,
    };
  });
  log("editor", JSON.stringify(info));
  log("buttons", JSON.stringify(await visibleButtons(page)));
}
