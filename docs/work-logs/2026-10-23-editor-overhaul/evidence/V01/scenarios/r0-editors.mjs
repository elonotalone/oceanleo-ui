// R0/R1: open editors from My library and read the shell (D1 top bar, D3 edit bar, D7 colours).
// args: title needles, e.g. "[V01] sample.pdf" "[V01] sample.pptx" (default: all [V01] uploads).
// Writes <OUT_DIR>/<slug>.json per editor with DOM readings + rects for pixel analysis.
import fs from "node:fs";
import path from "node:path";
import {
  guardProduction,
  setLocale,
  sleep,
  topBarReport,
  editBarReport,
  shellColors,
  waitVisible,
  openEditorByItem,
} from "./_v01-lib.mjs";

const DEFAULT = ["txt", "md", "docx", "pdf", "xlsx", "pptx", "png", "mp3", "mp4", "glb"].map(
  (ext) => `[V01] sample.${ext}`,
);
const HEADER = "[data-advanced-workbench-header], [data-plugin-chrome-header]";

export async function openFromLibrary(page, helpers, needle, log) {
  await helpers.gotoApp(page, "/library");
  const card = page.locator(`button[aria-label*="${needle}"]`).first();
  await card.waitFor({ timeout: 120000 });
  await card.click();
  // Library detail header: the pencil is labelled 编辑「<title>」 / Edit "<title>".
  const edit = page
    .locator(`button[aria-label^="编辑「${needle}"], button[aria-label^="Edit"][aria-label*="${needle}"]`)
    .first();
  if (await edit.waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) {
    await edit.click();
    log("clicked Edit for", needle, "url", page.url());
  } else {
    log("no Edit button for", needle, "(detail may already be the editor)");
  }
  const ok = await waitVisible(page, HEADER, 120000);
  await sleep(6000);
  return ok;
}

async function rects(page) {
  return page.evaluate(() => {
    const r = (sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 1 && b.height > 1;
      });
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    return {
      header: r("[data-advanced-workbench-header], [data-plugin-chrome-header]"),
      pageRow: r("[data-plugin-page-row]"),
      editBar: r("[data-workspace-edit-bar], [data-selection-kind]"),
      stage: r("[data-advanced-viewport-row], [data-plugin-chrome-stage]"),
      leftPane: r("aside[data-workspace-pane]"),
    };
  });
}

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  await setLocale(context, process.env.V01_LOCALE || "zh");
  const needles = args.length ? args : DEFAULT;
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  const vp = process.env.VIEWPORT || "1440x900";
  for (const needle of needles) {
    const slug = needle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() + `-${theme}-${vp}`;
    try {
      const ok = await openEditorByItem(page, helpers, needle, log);
      const report = {
        needle,
        theme,
        viewport: vp,
        url: page.url(),
        headerVisible: ok,
        adapter: await page.evaluate(() => document.querySelector("[data-editor-adapter]")?.getAttribute("data-editor-adapter") || document.querySelector("[data-plugin-chrome]")?.getAttribute("data-plugin-chrome") || null),
        topBar: await topBarReport(page),
        editBar: await editBarReport(page),
        colors: await shellColors(page),
        rects: await rects(page),
      };
      const file = await shot(slug);
      report.screenshot = file;
      fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(report, null, 2));
      log("REPORT", slug, JSON.stringify({
        adapter: report.adapter,
        rows: report.topBar.rows,
        pageRow: report.topBar.pageRow?.tabs || null,
        tabs: report.topBar.tabs.map((t) => t.text),
        selfViews: report.topBar.selfViews,
        theme: report.topBar.themeToggle,
        slots: report.topBar.slots,
        save: report.topBar.save,
        more: report.topBar.more,
        clipped: report.topBar.overflow?.clipped,
        toolsTrigger: report.editBar.toolsTrigger,
        ai: report.editBar.aiKeys,
        docSeg: report.editBar.documentSegment,
        pluginTheme: report.colors.pluginTheme,
        headerL: report.colors.header?.L,
        stageL: report.colors.stage?.L,
      }));
    } catch (error) {
      log("EDITOR-FAILED", needle, String(error?.message || error).slice(0, 300));
      await shot(`${slug}-failed`).catch(() => {});
    }
  }
}
