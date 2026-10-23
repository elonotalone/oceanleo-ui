// V01 shared probes (independent acceptance: shell + library).
// Read-only DOM readings. Never touches product code.
import { BASE } from "../../../harness/session.mjs";

// Red line 1: the browser must never reach production or the CN front end.
const PROD_HOST = /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i;

export async function guardProduction(context, log) {
  const blocked = [];
  await context.route(
    (url) => PROD_HOST.test(url.hostname),
    (route) => {
      const url = route.request().url();
      blocked.push(url);
      log("BLOCKED-PROD", route.request().method(), url.slice(0, 160));
      return route.abort();
    },
  );
  return blocked;
}

export async function setLocale(context, locale) {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: locale, url: BASE, sameSite: "Lax" },
  ]);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The [V01] uploads in the acceptance account (artifact root ids, 2026-10-23 05:26Z). */
export const V01_ITEMS = {
  "[V01] sample.txt": "2fab19a3-631b-4218-bb41-1377cfe196c1",
  "[V01] sample.md": "4df2e961-7458-4ce1-b3cc-2d228afb43b3",
  "[V01] sample.docx": "c28563ba-13c6-4b6e-91a1-c28a752c42df",
  "[V01] sample.pdf": "bfc6c630-d981-47b2-814d-8ca8ce791e02",
  "[V01] sample.xlsx": "746355d2-2a26-421a-b7c0-5c6e195b608f",
  "[V01] sample.pptx": "2feaad77-fe22-4aad-aa85-62f06dbcf695",
  "[V01] sample.png": "ee334f45-d53f-4288-abd0-3b8e89deeddf",
  "[V01] sample.mp3": "f913e0e4-1655-4367-863d-769219fdc8f1",
  "[V01] sample.mp4": "7def8144-70aa-4381-8e08-ddbac845c614",
  "[V01] sample.glb": "8ab73f0a-a2df-4fa8-9954-fe99ed1768e2",
};

export const EDITOR_HEADER = "[data-advanced-workbench-header], [data-plugin-chrome-header]";

/**
 * Carrier `/library?item=<id>`: open the detail, press its pencil (编辑「title」),
 * and wait for the editor's top bar. Re-presses once if a dev recompile ate the click.
 */
export async function openEditorByItem(page, helpers, title, log, { id } = {}) {
  const itemId = id || V01_ITEMS[title];
  if (!itemId) throw new Error(`no id for ${title}`);
  await helpers.gotoApp(page, `/library?item=${itemId}`);
  const pencil = page
    .locator(`button[aria-label^="编辑「"][aria-label*="${title}"], button[aria-label^="Edit"][aria-label*="${title}"]`)
    .first();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const retry = page.getByRole("button", { name: /^(重试|Retry)$/ }).first();
    if (await retry.isVisible().catch(() => false)) {
      log("library load failed; pressing 重试");
      await retry.click().catch(() => {});
    }
    const shown = await pencil.waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    if (!shown) {
      if (await page.locator(EDITOR_HEADER).first().isVisible().catch(() => false)) return true;
      log("pencil not visible (attempt", attempt, ")");
      continue;
    }
    await pencil.click().catch(() => {});
    if (await waitVisible(page, EDITOR_HEADER, 60000)) {
      await sleep(5000);
      return true;
    }
    log("editor header not up after pencil (attempt", attempt, ")");
  }
  return page.locator(EDITOR_HEADER).first().isVisible().catch(() => false);
}

/** Wait until something matching `selector` is visible, or time out quietly. */
export async function waitVisible(page, selector, timeout = 60000) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

/** Library card buttons whose accessible label contains `needle`. */
export async function cardTitles(page, needle = "[V01]") {
  return page.evaluate((n) => {
    return [...document.querySelectorAll("button[aria-label]")]
      .map((b) => b.getAttribute("aria-label") || "")
      .filter((l) => l.includes(n));
  }, needle);
}

/**
 * Shell top bar: rows, tabs, theme key, slots, save state, overflow.
 * Works for both chrome owners (host header and self header).
 */
export async function topBarReport(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const label = (el) =>
      (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().slice(0, 40);
    const headers = [
      ...document.querySelectorAll("[data-advanced-workbench-header], [data-plugin-chrome-header], [data-plugin-chrome-rows]"),
    ].filter(vis);
    const header =
      document.querySelector("[data-advanced-workbench-header]") ||
      document.querySelector("[data-plugin-chrome-rows]") ||
      document.querySelector("[data-plugin-chrome-header]");
    const out = { headerKind: null, headerRect: null, rows: 0, rowTops: [], pageRow: null, tabs: [], selfViews: [], themeToggle: 0, slots: [], buttons: [], save: null, more: [], overflow: null };
    if (!header || !vis(header)) return { ...out, headerFound: false, headersSeen: headers.length };
    out.headerFound = true;
    out.headerKind = header.hasAttribute("data-advanced-workbench-header") ? "host" : "self";
    out.headerRect = rect(header);
    const buttons = [...header.querySelectorAll("button, a[href], [role=tab]")].filter(vis);
    out.buttons = buttons.map((b) => ({ label: label(b), ...rect(b) }));
    const tops = [...new Set(buttons.map((b) => Math.round((b.getBoundingClientRect().top + b.getBoundingClientRect().bottom) / 2 / 8)))];
    out.rowTops = tops.map((t) => t * 8).sort((a, b) => a - b);
    out.rows = out.rowTops.length;
    const pageRow = document.querySelector("[data-plugin-page-row]");
    out.pageRow = pageRow && vis(pageRow) ? { ...rect(pageRow), tabs: [...pageRow.querySelectorAll("[data-plugin-page]")].map((t) => t.textContent.trim()) } : null;
    out.tabs = [...document.querySelectorAll("[data-plugin-page], [role=tab]")]
      .filter(vis)
      .filter((t) => header.contains(t) || (pageRow && pageRow.contains(t)))
      .map((t) => ({ id: t.getAttribute("data-plugin-page") || "", text: t.textContent.trim().slice(0, 20), selected: t.getAttribute("aria-selected") }));
    out.selfViews = [...document.querySelectorAll("[data-plugin-chrome-view]")].filter(vis).map((v) => v.textContent.trim().slice(0, 20));
    out.themeToggle = [...document.querySelectorAll("[data-plugin-theme-toggle]")].filter(vis).length;
    out.slots = [...document.querySelectorAll("[data-global-row-slot]")]
      .filter((s) => vis(s) && s.querySelector("button"))
      .map((s) => s.getAttribute("data-global-row-slot"));
    const save = document.querySelector("[data-workspace-save-launcher]");
    out.save = save ? { visible: vis(save), state: save.getAttribute("data-save-state"), title: save.getAttribute("title") } : null;
    out.more = buttons
      .filter((b) => /^(···|…|\.\.\.)$/.test((b.textContent || "").trim()) || /更多|More/i.test(b.getAttribute("aria-label") || ""))
      .map((b) => label(b));
    const hr = header.getBoundingClientRect();
    const clipped = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.right > hr.right + 1 || r.left < hr.left - 1 || r.right > window.innerWidth + 1;
    });
    const scrollers = [...header.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== "visible");
    out.overflow = {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      clipped: clipped.map(label),
      scrollers: scrollers.length,
      headerScroll: header.scrollWidth > header.clientWidth + 2,
    };
    return out;
  });
}

/** Edit bar: tools trigger, AI keys, drawer/document buttons, controls. */
export async function editBarReport(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const bars = [...document.querySelectorAll("[data-selection-kind]")].filter(vis);
    const trigger = [...document.querySelectorAll("[data-editor-tools-trigger]")].filter(vis);
    const agents = [...document.querySelectorAll("[data-edit-bar-agent]")].filter(vis);
    const docSeg = [...document.querySelectorAll("[data-edit-bar-document-segment]")]
      .filter(vis)
      .map((el) => [...el.querySelectorAll("button")].filter(vis).map((b) => (b.textContent || b.getAttribute("aria-label") || "").trim()));
    const controls = [...document.querySelectorAll("[data-selection-control-id]")].filter(vis).map((el) => el.getAttribute("data-selection-control-id"));
    const aiWords = [...document.querySelectorAll("[data-selection-kind] button, [data-workspace-edit-bar-dock] button")]
      .filter(vis)
      .filter((b) => /(^|\s)AI(\s|$)|AI 助手|助手/.test((b.textContent || b.getAttribute("aria-label") || "").trim()))
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30));
    return {
      bars: bars.map((b) => b.getAttribute("data-selection-kind")),
      toolsTrigger: trigger.map((t) => t.getAttribute("aria-label")),
      aiKeys: agents.length,
      aiLabels: aiWords,
      documentSegment: docSeg,
      controls,
    };
  });
}

/** Library side panel visibility (materials / mine). */
export async function panelReport(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 40 && r.height > 40 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const pressed = [...document.querySelectorAll("[data-workspace-library-panel]")].map((b) => ({
      id: b.getAttribute("data-workspace-library-panel"),
      pressed: b.getAttribute("aria-pressed"),
      visible: vis(b),
    }));
    const leftPane = [...document.querySelectorAll("aside[data-workspace-pane], [data-left-panel]")].find(vis);
    const localUpload = [...document.querySelectorAll("[data-workspace-local-upload]")].find(vis);
    const minePanel = [...document.querySelectorAll("[data-inline-editor-mine-panel]")].find(vis);
    const mineItems = [...document.querySelectorAll("[data-inline-editor-mine-item]")].filter(vis);
    const known = {
      leftPane: leftPane
        ? {
            attr: leftPane.getAttribute("data-left-panel") || leftPane.getAttribute("data-workspace-pane"),
            rect: (() => {
              const r = leftPane.getBoundingClientRect();
              return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
            })(),
            firstButton: (() => {
              const b = [...leftPane.querySelectorAll("button, label, [role=button]")].find(
                (el) => vis(el) && !/关闭详情|Close details/.test(el.getAttribute("aria-label") || ""),
              );
              return b ? (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 40) : null;
            })(),
          }
        : null,
      localUpload: localUpload ? (localUpload.textContent || "").trim() : null,
      minePanel: Boolean(minePanel),
      mineItems: mineItems.map((el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50)).slice(0, 12),
    };
    const panels = [
      ...document.querySelectorAll(
        "[data-plugin-chrome-panel], [data-inline-editor-mine-panel], [data-workspace-pane], [role=dialog], aside",
      ),
    ]
      .filter(vis)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const attrs = [...el.attributes].map((a) => a.name).filter((n) => n.startsWith("data-")).slice(0, 4);
        const firstButton = [...el.querySelectorAll("button, label, [role=button]")].find(vis);
        return {
          attrs,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          firstItem: firstButton ? (firstButton.textContent || firstButton.getAttribute("aria-label") || "").trim().slice(0, 40) : null,
          text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        };
      });
    return { url: location.href, pressed, known, panels };
  });
}

/** Effective background colour (walks up through transparent ancestors). */
export async function shellColors(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const effective = (el) => {
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0.5) return c;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const probe = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const c = effective(el);
      return { rgb: `${c.r},${c.g},${c.b}`, L: Number(lum(c).toFixed(3)) };
    };
    return {
      html: document.documentElement.className.slice(0, 80),
      dataTheme: document.documentElement.getAttribute("data-theme"),
      pluginTheme: [...document.querySelectorAll("[data-plugin-theme]")].map((e) => e.getAttribute("data-plugin-theme")).slice(0, 4),
      body: probe("body"),
      header: probe("[data-advanced-workbench-header], [data-plugin-chrome-header]"),
      editBar: probe("[data-selection-kind]"),
      frame: probe("[data-plugin-chrome]"),
      stage: probe("[data-plugin-chrome-stage]"),
    };
  });
}
