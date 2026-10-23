// W15: open the acceptance account's own game in the editor and record what is on screen
// (header, edit bar, drawers, theme), on the Edit page and the Code page.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w15/open THEME=light node harness/run.mjs game-open.mjs [title] [label]
export const GAME_TITLE = "W15 星星收集";

export async function openGameEditor(page, helpers, log, title = GAME_TITLE) {
  await helpers.gotoApp(page, "/library");
  const card = page.locator("[data-library-item], [data-artifact-id], article, li, button").filter({ hasText: title }).first();
  await card.waitFor({ timeout: 90000 });
  await card.click();
  await page.waitForTimeout(2500);
  const editButton = page
    .locator("button, a")
    .filter({ hasText: /^(编辑|Edit|Open editor|打开编辑器)$/ })
    .first();
  if (await editButton.isVisible().catch(() => false)) {
    await editButton.click();
  } else {
    log("no explicit edit button; assuming the card opened the editor");
  }
  await page.locator("[data-editor-adapter='game']").first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);
}

export async function describeEditor(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const text = (el) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const root = document.querySelector("[data-editor-adapter='game']");
    const bar = document.querySelector("[data-workspace-edit-bar]");
    const header = document.querySelector("[data-plugin-global-row], [data-advanced-workspace-actions]")?.closest("header, div");
    return {
      url: location.pathname + location.search,
      htmlClass: document.documentElement.className,
      pluginTheme: root?.getAttribute("data-plugin-theme") || null,
      rootBg: root ? getComputedStyle(root).backgroundColor : null,
      editBar: bar
        ? {
            empty: bar.getAttribute("data-empty"),
            buttons: [...bar.querySelectorAll("button")].filter(visible).map(text),
            hint: bar.querySelector("[data-edit-bar-empty-hint]")?.textContent || null,
            bg: getComputedStyle(bar).backgroundColor,
          }
        : null,
      headerButtons: header ? [...header.querySelectorAll("button, [role=tab]")].filter(visible).map(text) : [],
      tabs: [...document.querySelectorAll("[role=tab], [data-plugin-page-id]")].filter(visible).map(text),
      leftPanel: document.querySelector("[data-left-panel]")?.getAttribute("data-left-panel") || null,
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      alerts: [...document.querySelectorAll("[role=alert], [role=status]")].filter(visible).map(text).slice(0, 6),
      iframes: [...document.querySelectorAll("iframe")].filter(visible).map((f) => ({ title: f.title, sandbox: f.getAttribute("sandbox") })),
    };
  });
}

export default async function ({ page, log, shot, helpers, args }) {
  const label = args[1] || "baseline";
  await openGameEditor(page, helpers, log, args[0] || GAME_TITLE);
  await shot(`${label}-edit-page`);
  log("edit page", JSON.stringify(await describeEditor(page)));
  const codeTab = page.locator("[role=tab], button").filter({ hasText: /^Code$/ }).first();
  if (await codeTab.isVisible().catch(() => false)) {
    await codeTab.click();
    await page.waitForTimeout(6000);
    await shot(`${label}-code-page`);
    log("code page", JSON.stringify(await describeEditor(page)));
  } else {
    log("no Code tab visible");
  }
}
