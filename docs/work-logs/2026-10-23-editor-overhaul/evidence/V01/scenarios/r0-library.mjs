// R0/R1: library page — D5 Type menu labels, D8 document cards, card colours.
// args[0]: locale "zh" | "en" (sets NEXT_LOCALE before the first navigation).
// args[1..]: card needles to inspect (default [V01] txt / md / docx).
import fs from "node:fs";
import path from "node:path";
import { guardProduction, setLocale, sleep } from "./_v01-lib.mjs";

const FORBIDDEN = /editing|Editing|编辑|设计画布|Design canvas|design canvas/;

async function cardReport(page, needle) {
  return page.evaluate((n) => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const effective = (el) => {
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0.5) return c;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const button = [...document.querySelectorAll("button[aria-label]")].find((b) => (b.getAttribute("aria-label") || "").includes(n));
    if (!button) return { needle: n, found: false };
    const card = button.parentElement;
    const cover = button.querySelector("[data-cover-state]");
    const doc = button.querySelector("[data-document-cover]");
    const spinner = [...button.querySelectorAll(".v-spinner, [role=status]")].filter((s) => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const img = button.querySelector("img");
    const cardBg = effective(card);
    const coverBg = doc ? effective(doc) : cover ? effective(cover) : null;
    const lines = [...button.querySelectorAll("p")].map((p) => (p.textContent || "").trim()).filter(Boolean);
    return {
      needle: n,
      found: true,
      coverState: cover?.getAttribute("data-cover-state") || null,
      coverEvidence: cover?.getAttribute("data-cover-evidence") || null,
      documentCover: doc?.getAttribute("data-document-cover") || null,
      spinner: spinner.map((s) => s.getAttribute("aria-label") || "spinner"),
      img: img ? { src: (img.getAttribute("src") || "").slice(0, 80), w: img.naturalWidth, h: img.naturalHeight } : null,
      lines: lines.slice(0, 6),
      cardBg: `${cardBg.r},${cardBg.g},${cardBg.b}`,
      cardL: Number(lum(cardBg).toFixed(3)),
      coverBg: coverBg ? `${coverBg.r},${coverBg.g},${coverBg.b}` : null,
      coverL: coverBg ? Number(lum(coverBg).toFixed(3)) : null,
    };
  }, needle);
}

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  const locale = args[0] || "zh";
  const needles = args.length > 1 ? args.slice(1) : ["[V01] sample.txt", "[V01] sample.md", "[V01] sample.docx"];
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  await setLocale(context, locale);
  const t0 = Date.now();
  await helpers.gotoApp(page, "/library");
  const timeline = [];
  // D8: sample the document cards from first paint; spinner must never appear.
  for (let i = 0; i < 16; i += 1) {
    const snap = [];
    for (const n of needles) snap.push(await cardReport(page, n));
    timeline.push({ t: Number(((Date.now() - t0) / 1000).toFixed(1)), cards: snap.map((c) => ({ n: c.needle, found: c.found, doc: c.documentCover, state: c.coverState, spinner: c.spinner?.length || 0, img: Boolean(c.img) })) });
    if (snap.every((c) => c.found) && i >= 6) break;
    await sleep(750);
  }
  await sleep(2500);
  const cards = [];
  for (const n of needles) cards.push(await cardReport(page, n));
  await shot(`library-${locale}-${theme}`);
  // D5: open the Type menu and read every option.
  let typeOptions = null;
  const trigger = page.locator("[data-collection-filter=type]").first();
  if (await trigger.isVisible().catch(() => false)) {
    const triggerText = (await trigger.textContent())?.trim();
    await trigger.click();
    await page.locator("[data-collection-filter-menu=type]").first().waitFor({ timeout: 10000 }).catch(() => {});
    typeOptions = await page.evaluate(() =>
      [...document.querySelectorAll("[data-collection-filter-menu=type] [role=option]")].map((o) => ({
        value: o.getAttribute("data-value"),
        label: (o.textContent || "").trim(),
      })),
    );
    await shot(`library-type-menu-${locale}-${theme}`);
    await page.keyboard.press("Escape");
    log("type trigger", triggerText);
  } else {
    log("type filter trigger not visible");
  }
  const forbidden = (typeOptions || []).filter((o) => FORBIDDEN.test(o.label));
  const report = { locale, theme, url: page.url(), htmlLang: await page.evaluate(() => document.documentElement.lang), typeOptions, forbidden, cards, timeline };
  fs.writeFileSync(path.join(outDir, `library-${locale}-${theme}.json`), JSON.stringify(report, null, 2));
  log("TYPE", JSON.stringify(typeOptions?.map((o) => o.label)));
  log("FORBIDDEN", JSON.stringify(forbidden.map((o) => o.label)));
  for (const c of cards) log("CARD", JSON.stringify(c));
  log("TIMELINE", JSON.stringify(timeline.slice(0, 6)));
}
