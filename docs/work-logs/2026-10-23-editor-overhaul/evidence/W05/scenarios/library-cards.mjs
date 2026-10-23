// W05: document cards (D8), Type menu (D5), card theme (D6).
// args: [upload|check] [zh|en] [tag]   — upload copies fixtures as "[W05] …" first.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../../../harness/fixtures");

export default async ({ page, context, log, shot, helpers, args }) => {
  const [mode = "check", locale = "zh", tag = "a"] = args;
  if (locale === "en") {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: new URL("/", page.url() === "about:blank" ? process.env.LEODEV_BASE || "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com" : page.url()).toString() }]);
  }
  if (mode === "upload") {
    const dir = `/tmp/w05/${tag}`;
    mkdirSync(dir, { recursive: true });
    const files = ["txt", "md", "docx"].map((ext) => {
      const target = `${dir}/[W05] 卡片${tag}.${ext}`;
      copyFileSync(`${FIXTURES}/sample.${ext}`, target);
      return target;
    });
    await helpers.uploadFiles(page, files);
    log("info", `uploaded ${files.length}`);
  }
  await helpers.gotoApp(page, "/library");
  const spinnerSeen = [];
  const started = Date.now();
  // Sample the first seconds: a document card must never show a spinner or an <img>.
  let first = null;
  while (Date.now() - started < 12000) {
    const probe = await page.evaluate(() => {
      const covers = [...document.querySelectorAll("[data-document-cover]")]
        .filter((node) => /\[W05\]/.test(node.getAttribute("aria-label") || ""));
      return covers.map((node) => {
        const host = node.closest("[data-cover-state]");
        return {
          title: node.getAttribute("aria-label"),
          state: node.getAttribute("data-document-cover"),
          source: node.getAttribute("data-document-excerpt-source"),
          coverState: host?.getAttribute("data-cover-state"),
          img: Boolean(host?.querySelector("img")),
          spinner: Boolean(host?.querySelector(".v-spinner,[role=status]")),
          reading: /正在读取|Loading content preview/.test(host?.textContent || ""),
          text: (node.textContent || "").slice(0, 160),
          bg: getComputedStyle(node).backgroundColor,
          fg: getComputedStyle(node.querySelector("p:nth-child(2)") || node).color,
        };
      });
    });
    if (probe.length && !first) first = { at: Date.now() - started, probe };
    for (const card of probe) if (card.spinner || card.img || card.reading) spinnerSeen.push(card);
    if (probe.length && probe.every((card) => card.state === "excerpt")) break;
    await page.waitForTimeout(400);
  }
  const final = await page.evaluate(() =>
    [...document.querySelectorAll("[data-document-cover]")]
      .filter((node) => /\[W05\]/.test(node.getAttribute("aria-label") || ""))
      .map((node) => ({
        title: node.getAttribute("aria-label"),
        state: node.getAttribute("data-document-cover"),
        source: node.getAttribute("data-document-excerpt-source"),
        text: (node.textContent || "").replace(/\s+/g, " ").slice(0, 200),
        bg: getComputedStyle(node).backgroundColor,
        html: document.documentElement.className,
      })),
  );
  log("info", JSON.stringify({ firstSeenMs: first?.at, first: first?.probe?.slice(0, 3), final, badFrames: spinnerSeen.slice(0, 3) }));
  await shot(`cards-${locale}`);
  const trigger = page.locator("[data-collection-filter='type']").first();
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(500);
    const options = await page
      .locator("[data-collection-filter-menu='type'] [role=option]")
      .allTextContents();
    log("info", JSON.stringify({ typeMenu: options.map((value) => value.trim()) }));
    await shot(`type-menu-${locale}`);
    await page.keyboard.press("Escape");
  } else {
    log("info", "type filter trigger not found");
  }
};
