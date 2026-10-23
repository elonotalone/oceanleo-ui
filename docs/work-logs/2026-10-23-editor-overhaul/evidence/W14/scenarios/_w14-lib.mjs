// Shared helpers for W14 (website / Puck) scenarios.
export const PUBLIC_WEBSITE = "6b16c807-da26-4fe5-be93-ef3e4c9c60ee"; // platform 「鞋靴资讯内容站」

export async function settle(page, log, timeout = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const loading = await page
      .getByText(/Loading My Library…|正在加载我的库|Compiling/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!loading) return true;
    await page.waitForTimeout(1000);
  }
  log("settle", "still loading after", String(timeout));
  return false;
}

/** Open a website item through /library?item= and, if a detail view shows, its Edit button. */
export async function openWebsite(page, log, helpers, rootId = PUBLIC_WEBSITE) {
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  await settle(page, log);
  const stage = page.locator("[data-testid='website-puck-stage']").first();
  const edit = page.locator('button[aria-label^="编辑「"], button[aria-label^="Edit "]').first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await stage.isVisible().catch(() => false)) break;
    await Promise.race([
      stage.waitFor({ timeout: 60000 }),
      edit.waitFor({ state: "attached", timeout: 60000 }),
    ]).catch(() => {});
    if (await stage.isVisible().catch(() => false)) break;
    if (await edit.count()) {
      log("click", "edit button", String(attempt));
      await edit.click({ force: true, timeout: 10000 }).catch((error) => log("edit-click-failed", String(error).slice(0, 160)));
    }
    await stage.waitFor({ timeout: 60000 }).catch(() => {});
  }
  const ready = await stage.isVisible().catch(() => false);
  log("website-stage", String(ready), page.url());
  if (ready) await page.waitForTimeout(2500);
  return ready;
}

export async function websiteInfo(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const stage = q("[data-testid='website-puck-stage']");
    const sections = [...document.querySelectorAll("[data-testid^='website-section-']")];
    const bar = q("[data-selection-kind]");
    const root = q("[data-editor-adapter]");
    return {
      url: location.href,
      htmlClass: document.documentElement.className,
      adapter: root?.getAttribute("data-editor-adapter") || null,
      pluginTheme: root?.getAttribute("data-plugin-theme") || null,
      face: stage?.getAttribute("data-website-face") || null,
      sections: sections.length,
      imgs: stage ? stage.querySelectorAll("img").length : 0,
      saveState: q("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      selectionKind: bar?.getAttribute("data-selection-kind") || null,
      visibleControls: bar?.getAttribute("data-selection-visible-controls") || null,
      overflowControls: bar?.getAttribute("data-selection-overflow-controls") || null,
      editBar: (q("[data-workspace-edit-bar]")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
    };
  });
}

export async function visibleButtons(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, a[role=button], [role=tab]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 120),
  );
}
