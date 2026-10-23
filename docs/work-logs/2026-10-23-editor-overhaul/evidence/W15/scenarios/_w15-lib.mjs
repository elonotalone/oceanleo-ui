// W15 shared helpers: open the acceptance account's own game, describe the editor, read the DB-free state.
export const GAME_ID = "53931dfb-8ef2-4fb5-9db8-d88d98b990bf";
const PROD_HOST = /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i;
export const HEADER = "[data-advanced-workbench-header], [data-plugin-chrome-header]";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function guardProduction(context, log) {
  await context.route("**/*", (route) => {
    let host = "";
    try {
      host = new URL(route.request().url()).hostname;
    } catch {}
    if (PROD_HOST.test(host)) {
      log("BLOCKED production request", host);
      return route.abort();
    }
    return route.continue();
  });
}

export async function openGame(page, helpers, log, id = GAME_ID) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  log("opening-controls", JSON.stringify(await page.locator("button").evaluateAll(buttons => buttons.filter(button => button.getBoundingClientRect().width && button.getBoundingClientRect().height).map(button => ({ label: button.getAttribute("aria-label"), text: button.textContent?.trim().slice(0, 45) })).slice(-22))));
  const pencil = page
    .getByRole("button", { name: /^(编辑|Edit|打开编辑器|Open editor)(?:「| |$)/ })
    .first();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await page.locator("[data-editor-adapter='game']").first().isVisible().catch(() => false)) break;
    const retry = page.getByRole("button", { name: /^(重试|Retry)$/ }).first();
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
    const shown = await pencil.waitFor({ timeout: 60000 }).then(() => true, () => false);
    if (shown) await pencil.click({ timeout: 5000, force: true }).catch((e) => log("pencil-click", String(e).slice(0, 120)));
    const up = await page
      .locator("[data-editor-adapter='game']")
      .first()
      .waitFor({ timeout: 90000 })
      .then(() => true, () => false);
    if (up) break;
    log("game editor not up (attempt", attempt, ")");
  }
  await page.locator("[data-editor-adapter='game']").first().waitFor({ timeout: 30000 });
  await sleep(5000);
}

export async function clickTab(page, re) {
  const tab = page.locator("[role=tab], [data-plugin-page-id], button").filter({ hasText: re }).first();
  if (!(await tab.isVisible().catch(() => false))) return false;
  await tab.click();
  await sleep(5000);
  return true;
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
    const bg = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return {
      url: location.pathname + location.search,
      htmlClass: document.documentElement.className,
      pluginTheme: root?.getAttribute("data-plugin-theme") || null,
      rootBg: root ? getComputedStyle(root).backgroundColor : null,
      editBar: bar
        ? {
            buttons: [...bar.querySelectorAll("button")].filter(visible).map(text),
            drawers: [...bar.querySelectorAll("[data-edit-bar-drawer]")].filter(visible).map((b) => b.getAttribute("data-edit-bar-drawer")),
            bg: getComputedStyle(bar).backgroundColor,
          }
        : null,
      tabs: [...document.querySelectorAll("[role=tab], [data-plugin-page-id]")].filter(visible).map(text),
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      alerts: [...document.querySelectorAll("[role=alert], [role=status]")].filter(visible).map(text).slice(0, 6),
      codeBg: bg("[data-testid='game-code-editor']"),
      codeColor: (() => {
        const el = document.querySelector("[data-testid='game-code-editor']");
        return el ? getComputedStyle(el).color : null;
      })(),
      promptBg: bg("#game-prompt"),
      iframes: [...document.querySelectorAll("iframe")].filter(visible).map((f) => ({ title: f.title, sandbox: f.getAttribute("sandbox") })),
    };
  });
}
