// R0: upload the [V01] fixtures into the acceptance account's library.
// args: optional list of extensions (default: all ten).
// Waits until every uploaded title is listed (uploads run one after another).
import { guardProduction, cardTitles, setLocale, sleep } from "./_v01-lib.mjs";

const ALL = ["txt", "md", "docx", "pdf", "xlsx", "pptx", "png", "mp3", "mp4", "glb"];

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  await setLocale(context, "zh");
  const exts = args.length ? args : ALL;
  const names = exts.map((ext) => `[V01] sample.${ext}`);
  const files = names.map((name) => `/tmp/v01/${name}`);
  log("uploading", files.length, "files");
  await helpers.uploadFiles(page, files);
  const started = Date.now();
  let titles = [];
  while (Date.now() - started < 300000) {
    titles = await cardTitles(page, "[V01]");
    const busy = await page
      .getByText(/上传中|Uploading/)
      .first()
      .isVisible()
      .catch(() => false);
    const missing = names.filter((name) => !titles.some((t) => t.includes(name)));
    if (!busy && missing.length === 0) break;
    if (Date.now() - started > 30000 && !busy && missing.length) {
      // the list may not have refreshed yet; reload once in a while
      if (Math.round((Date.now() - started) / 1000) % 30 < 3) await page.reload({ waitUntil: "domcontentloaded" });
    }
    await sleep(3000);
  }
  await shot("upload-done");
  log("v01 cards", JSON.stringify(titles));
  const alerts = await page.evaluate(() =>
    [...document.querySelectorAll("[role=alert], [role=status]")]
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean)
      .slice(0, 8),
  );
  log("alerts/status", JSON.stringify(alerts));
}
