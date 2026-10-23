// W01 R2 acceptance: one-row header, tabs in row 1, every ··· entry, no theme key,
// editor follows the site theme (also live: site "auto" + system flip).
// args: <name>=<artifactRootId>[:write] ...   ":write" = this item is W01's own (share/favorite/download allowed)
//       --live-theme   additionally flip the system scheme with site theme "auto" on the first item
// Only the LeoDev slot + acceptance account (harness). Production hosts are aborted.
const PROD_HOST = /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i;
const HEADER = "[data-advanced-workbench-header], [data-plugin-chrome-header]";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function visible(page, selector, timeout) {
  return page.locator(selector).first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
}

async function openEditor(page, helpers, id, log) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  const pencil = page.locator('button[aria-label^="编辑「"], button[aria-label^="Edit “"], button[aria-label^="Edit \\""], button[aria-label^="Edit "]').first();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (await page.locator(HEADER).first().isVisible().catch(() => false)) break;
    const retry = page.getByRole("button", { name: /^(重试|Retry)$/ }).first();
    if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
    const shown = await pencil.waitFor({ timeout: 60000 }).then(() => true, () => false);
    if (shown) await pencil.click().catch((e) => log("pencil-click", String(e).slice(0, 120)));
    if (await visible(page, HEADER, 90000)) break;
    log("header not up (attempt", attempt, ")");
  }
  const up = await page.locator(HEADER).first().isVisible().catch(() => false);
  if (up) await sleep(6000);
  return up;
}

function report(page) {
  return page.evaluate(() => {
    const header = document.querySelector("[data-advanced-workbench-header]");
    const row = header?.querySelector("[data-plugin-global-row]");
    const root = document.querySelector("[data-inline-editor]") || document.querySelector("[data-editor-adapter]");
    const rect = (el) => (el ? Math.round(el.getBoundingClientRect().height) : 0);
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
    return {
      htmlClass: document.documentElement.className,
      actionRows: header ? header.querySelectorAll("[data-advanced-action-row]").length : 0,
      pageRow: Boolean(document.querySelector("[data-plugin-page-row]")),
      themeToggle: document.querySelectorAll("[data-plugin-theme-toggle]").length,
      slots: row ? [...row.querySelectorAll("[data-global-row-slot]")].map((n) => n.getAttribute("data-global-row-slot")) : null,
      tabs: [...document.querySelectorAll("[data-plugin-page]")].map(
        (n) => `${n.getAttribute("data-plugin-page")}:${(n.textContent || "").trim()}${n.getAttribute("aria-selected") === "true" ? "*" : ""}`,
      ),
      editorTheme: root?.getAttribute("data-plugin-theme") || null,
      themedRoots: [...new Set([...document.querySelectorAll("[data-plugin-theme]")].map((n) => n.getAttribute("data-plugin-theme")))],
      adapter: document.querySelector("[data-editor-adapter]")?.getAttribute("data-editor-adapter") || null,
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      saveSlot: Boolean(document.querySelector('[data-global-row-slot="save-state"]')),
      headerHeight: rect(header),
      headerBg: bg(header),
      rootBg: bg(root),
    };
  });
}

const menuEntries = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-workspace-more-menu] [role="menuitem"]')].map(
      (n) => `${n.getAttribute("data-more-menu-entry")}:${(n.textContent || "").trim()}:${n.querySelector("svg") ? "icon" : "NOICON"}`,
    ),
  );

// Visible feedback: first-party toasts, or the line the ··· draws beside itself when no toast surface renders.
const feedback = (page) =>
  page.evaluate(() => [
    ...[...document.querySelectorAll("[data-leo-toast-id]")].map((n) => `toast-${n.getAttribute("data-leo-toast-kind")}:${(n.textContent || "").trim().slice(0, 60)}`),
    ...[...document.querySelectorAll("[data-more-menu-feedback]")].map((n) => `beside-more-${n.getAttribute("data-more-menu-feedback")}:${(n.textContent || "").trim()}`),
  ]);
async function waitFeedback(page, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const f = await feedback(page);
    if (f.length) return f;
    await sleep(150);
  }
  return [];
}

async function openMore(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(200);
  const more = page.locator("[data-workspace-more-launcher]").first();
  if (!(await more.count())) return false;
  await more.click();
  return visible(page, "[data-workspace-more-menu]", 5000);
}

async function entry(page, id) {
  const loc = page.locator(`[data-workspace-more-menu] [data-more-menu-entry="${id}"]`).first();
  return (await loc.count()) ? loc : null;
}

export default async ({ page, context, log, shot, helpers, args }) => {
  await context.route((url) => PROD_HOST.test(url.hostname), (route) => {
    log("BLOCKED-PROD", route.request().method(), route.request().url().slice(0, 140));
    return route.abort();
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  const liveTheme = args.includes("--live-theme");
  const items = args.filter((a) => !a.startsWith("--"));
  const summary = [];

  for (const [index, pair] of items.entries()) {
    const [name, rest] = pair.split("=");
    const [id, mode] = rest.split(":");
    const write = mode === "write";
    const result = { name, theme };
    if (!(await openEditor(page, helpers, id, log))) {
      log(name, "NO HEADER");
      await shot(`${theme}-${name}-noheader`);
      summary.push({ ...result, header: false });
      continue;
    }
    const info = await report(page);
    log(name, "report", JSON.stringify(info));
    Object.assign(result, {
      oneRow: info.actionRows === 1 && !info.pageRow,
      noThemeKey: info.themeToggle === 0,
      followsSite: info.editorTheme === theme && info.themedRoots.every((t) => t === theme),
      saveSlot: info.saveSlot,
      saveState: info.saveState,
      slots: info.slots,
      tabs: info.tabs,
    });
    await shot(`${theme}-${name}-01-header`);

    // Tabs: go to every other tab and back.
    if (info.tabs.length > 1) {
      const start = info.tabs.find((t) => t.endsWith("*"))?.split(":")[0];
      const tabResults = [];
      for (const t of info.tabs.map((s) => s.split(":")[0]).filter((t) => t !== start)) {
        await page.locator(`[data-plugin-page="${t}"]`).first().click().catch((e) => log("tab-click", String(e).slice(0, 120)));
        await sleep(5000);
        const sel = await page.locator(`[data-plugin-page="${t}"]`).first().getAttribute("aria-selected").catch(() => null);
        const after = await report(page);
        tabResults.push(`${t}:${sel === "true" ? "selected" : "NOT-selected"}:rows=${after.actionRows}:theme=${after.editorTheme}`);
        await shot(`${theme}-${name}-02-tab-${t}`);
      }
      if (start) {
        await page.locator(`[data-plugin-page="${start}"]`).first().click().catch(() => {});
        await sleep(4000);
        const back = await page.locator(`[data-plugin-page="${start}"]`).first().getAttribute("aria-selected").catch(() => null);
        tabResults.push(`back-${start}:${back === "true" ? "selected" : "NOT-selected"}`);
      }
      result.tabRoundtrip = tabResults;
      log(name, "tabs", JSON.stringify(tabResults));
    }

    // ··· menu.
    if (!(await openMore(page))) {
      log(name, "NO MORE MENU");
      result.more = null;
      summary.push(result);
      continue;
    }
    await sleep(500);
    result.more = await menuEntries(page);
    log(name, "more", JSON.stringify(result.more));
    await shot(`${theme}-${name}-03-more`);

    // Download submenu (reading formats is read-only; triggering one only on own items).
    const dl = await entry(page, "download");
    if (dl) {
      await dl.click();
      await visible(page, "[data-workspace-download-menu]", 5000);
      result.formats = await page.evaluate(() =>
        [...document.querySelectorAll("[data-workspace-download-menu] [data-workspace-export-action-id]")].map(
          (n) => `${n.getAttribute("data-workspace-export-action-id")}:${(n.textContent || "").trim()}${n.hasAttribute("disabled") ? ":disabled" : ""}`,
        ),
      );
      log(name, "formats", JSON.stringify(result.formats));
      await shot(`${theme}-${name}-04-download-menu`);
      if (write) {
        const first = page.locator("[data-workspace-download-menu] [data-workspace-export-action-id]:not([disabled])").first();
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 90000 }).catch(() => null),
          first.click(),
        ]);
        result.download = download ? download.suggestedFilename() : `NO-DOWNLOAD feedback=${JSON.stringify(await feedback(page))}`;
        log(name, "download", result.download);
      }
    }

    if (write) {
      // Share → link copied.
      if (await openMore(page)) {
        const share = await entry(page, "share");
        if (share) {
          await page.evaluate(() => navigator.clipboard.writeText("(empty)").catch(() => {}));
          await share.click();
          const seen = await waitFeedback(page, 5000);
          await shot(`${theme}-${name}-05-share`);
          const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => `ERR ${e}`));
          result.share = { feedback: seen, clipboard: String(clip).slice(0, 120) };
          log(name, "share", JSON.stringify(result.share));
          await sleep(2600);
        } else result.share = "absent";
      }
      // Favorite → state flips, toast, label flips.
      if (await openMore(page)) {
        const fav = await entry(page, "favorite");
        if (fav) {
          const before = await fav.getAttribute("data-favorite");
          await fav.click();
          const t = await waitFeedback(page, 25000);
          await shot(`${theme}-${name}-06-favorite-feedback`);
          await openMore(page);
          await sleep(400);
          const after = await (await entry(page, "favorite"))?.getAttribute("data-favorite");
          const label = await (await entry(page, "favorite"))?.textContent();
          result.favorite = { before, after, label: (label || "").trim(), feedback: t };
          log(name, "favorite", JSON.stringify(result.favorite));
          await shot(`${theme}-${name}-06-favorite`);
          await page.keyboard.press("Escape");
        } else result.favorite = "absent";
      }
    }

    // Invite / replay open the collab windows (open + close; nothing is sent or generated).
    for (const [key, panel] of [["invite", "[data-collab-invite-dialog]"], ["replay", "[data-generate-replay-panel]"]]) {
      if (!(await openMore(page))) break;
      const e = await entry(page, key);
      if (!e) {
        result[key] = "absent";
        continue;
      }
      await e.click();
      const ok = await visible(page, panel, 8000);
      await sleep(500);
      result[key] = ok ? "window-opened" : "NO-WINDOW";
      log(name, key, result[key]);
      await shot(`${theme}-${name}-07-${key}`);
      await page.keyboard.press("Escape");
      await sleep(600);
    }
    await page.keyboard.press("Escape").catch(() => {});

    // Live follow: site theme "auto", flip the system scheme, editor must follow without reload.
    if (liveTheme && index === 0) {
      await page.evaluate(() => {
        document.cookie = "oceanleo-theme=auto; path=/; domain=.oceanleo.com; secure; samesite=lax";
        localStorage.setItem("oceanleo-theme", "auto");
      });
      await openEditor(page, helpers, id, log);
      const flips = [];
      for (const scheme of theme === "dark" ? ["light", "dark"] : ["dark", "light"]) {
        await page.emulateMedia({ colorScheme: scheme });
        await sleep(1500);
        const r = await report(page);
        flips.push(`${scheme}:html=${r.htmlClass.match(/\b(dark|light)\b/)?.[0] || r.htmlClass}:editor=${r.editorTheme}:roots=${r.themedRoots.join("/")}:headerBg=${r.headerBg}`);
        await shot(`${theme}-${name}-08-auto-${scheme}`);
      }
      result.liveFollow = flips;
      log(name, "live-follow", JSON.stringify(flips));
      await page.evaluate((mode) => {
        document.cookie = `oceanleo-theme=${mode}; path=/; domain=.oceanleo.com; secure; samesite=lax`;
        localStorage.setItem("oceanleo-theme", mode);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
    }
    summary.push(result);
  }

  // Favorites show a filled star on the library detail.
  for (const pair of items) {
    const [name, rest] = pair.split("=");
    const [id] = rest.split(":");
    const r = summary.find((x) => x.name === name);
    if (!r || !r.favorite || typeof r.favorite !== "object") continue;
    await helpers.gotoApp(page, `/library?item=${id}`);
    await sleep(9000);
    r.libraryStar = await page.evaluate(() =>
      [...document.querySelectorAll("button[aria-label]")]
        .map((b) => `${b.getAttribute("aria-label")}${b.getAttribute("aria-pressed") ? `[pressed=${b.getAttribute("aria-pressed")}]` : ""}`)
        .filter((l) => /收藏|avorit/.test(l)),
    );
    log(name, "library-star", JSON.stringify(r.libraryStar));
    await shot(`${theme}-${name}-09-library-detail`);
  }
  log("SUMMARY", JSON.stringify(summary, null, 1));
};
