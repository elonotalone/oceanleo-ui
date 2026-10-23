// W01 acceptance: one-row header, tabs in row 1, ··· menu, no theme key, editor follows site theme.
// args: <name>=<artifactId> ...   (view only; no writes)
export default async ({ page, log, shot, helpers, args }) => {
  for (const pair of args) {
    const [name, id] = pair.split("=");
    await helpers.gotoApp(page, `/library?item=${id}`);
    const header = page.locator("[data-advanced-workbench-header]").first();
    try {
      await header.waitFor({ timeout: 120000 });
    } catch {
      log(name, "NO HEADER");
      await shot(`${name}-noheader`);
      continue;
    }
    await page.waitForTimeout(5000);
    const info = await page.evaluate(() => {
      const row = document.querySelector("[data-advanced-workbench-header] [data-plugin-global-row]");
      const root = document.querySelector("[data-inline-editor]");
      return {
        htmlClass: document.documentElement.className,
        rows: document.querySelectorAll("[data-advanced-workbench-header] [data-advanced-action-row]").length,
        pageRow: Boolean(document.querySelector("[data-plugin-page-row]")),
        themeToggle: document.querySelectorAll("[data-plugin-theme-toggle]").length,
        slots: row ? [...row.querySelectorAll("[data-global-row-slot]")].map((n) => n.getAttribute("data-global-row-slot")) : null,
        tabs: [...document.querySelectorAll("[data-plugin-page]")].map((n) => `${n.getAttribute("data-plugin-page")}:${(n.textContent || "").trim()}${n.getAttribute("aria-selected") === "true" ? "*" : ""}`),
        editorTheme: root?.getAttribute("data-plugin-theme") || null,
        editorAdapter: root?.getAttribute("data-editor-adapter") || null,
        saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
        headerHeight: Math.round(document.querySelector("[data-advanced-workbench-header]")?.getBoundingClientRect().height || 0),
      };
    });
    log(name, JSON.stringify(info));
    await shot(`${name}-header`);
    const more = page.locator("[data-workspace-more-launcher]").first();
    if (await more.count()) {
      await more.click();
      await page.waitForTimeout(500);
      const entries = await page.evaluate(() =>
        [...document.querySelectorAll('[data-workspace-more-menu] [role="menuitem"]')].map(
          (n) => `${n.getAttribute("data-more-menu-entry")}:${(n.textContent || "").trim()}:${n.querySelector("svg") ? "icon" : "NOICON"}`,
        ),
      );
      log(name, "more", JSON.stringify(entries));
      await shot(`${name}-more`);
      const download = page.locator('[data-workspace-more-menu] [data-more-menu-entry="download"]').first();
      if (await download.count()) {
        await download.click();
        await page.waitForTimeout(400);
        const formats = await page.evaluate(() =>
          [...document.querySelectorAll("[data-workspace-download-menu] [data-workspace-export-action-id]")].map(
            (n) => (n.textContent || "").trim(),
          ),
        );
        log(name, "download", JSON.stringify(formats));
        await shot(`${name}-download`);
      }
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    } else {
      log(name, "NO MORE");
    }
  }
};
